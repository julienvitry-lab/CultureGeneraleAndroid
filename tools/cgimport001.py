#!/usr/bin/env python3
"""
CGIMPORT001
Migration one-shot de la table SQLite `questions` vers Cloud Firestore.

Source:
    questions_base.sqlite

Destination:
    users/<uid>/questions/<original_id>

Principes:
- aucune dépendance Python externe (stdlib uniquement)
- authentification Firebase Auth par e-mail / mot de passe
- API key + projectId lus automatiquement depuis web/public/*
- import par lots atomiques via Firestore REST Commit
- reprise automatique via checkpoint local
- débit limité
- limite quotidienne configurable
- le statut peut être importé comme "snapshot" initial, mais SYNCLOUD001
  reste l'unique source active de progression.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from typing import Any, Dict, Iterable, List, Tuple
from urllib import parse, request, error

DEFAULT_DB_ANDROID = "/storage/emulated/0/Culture Générale/questions_base.sqlite"
DEFAULT_CHECKPOINT = "CGIMPORT001_checkpoint.json"
DEFAULT_BATCH = 200
DEFAULT_FREE_LIMIT = 18000
DEFAULT_RATE = 180.0  # écritures/seconde, volontairement prudent

KNOWN_BOOL_FIELDS = {"non_trouve", "is_image"}


def die(msg: str, code: int = 1) -> None:
    print(f"\nERREUR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def human_int(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def read_text_best_effort(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def find_firebase_config(repo: Path) -> Tuple[str, str]:
    """Cherche apiKey et projectId dans les fichiers web publics."""
    candidates: List[Path] = []
    public = repo / "web" / "public"
    if public.exists():
        candidates.extend(sorted(public.rglob("*.js")))
        candidates.extend(sorted(public.rglob("*.html")))
        candidates.extend(sorted(public.rglob("*.json")))

    api_key = None
    project_id = None

    api_patterns = [
        r'apiKey\s*:\s*["\']([^"\']+)["\']',
        r'"apiKey"\s*:\s*"([^"]+)"',
    ]
    project_patterns = [
        r'projectId\s*:\s*["\']([^"\']+)["\']',
        r'"projectId"\s*:\s*"([^"]+)"',
    ]

    for p in candidates:
        txt = read_text_best_effort(p)
        if not api_key:
            for pat in api_patterns:
                m = re.search(pat, txt)
                if m:
                    api_key = m.group(1)
                    break
        if not project_id:
            for pat in project_patterns:
                m = re.search(pat, txt)
                if m:
                    project_id = m.group(1)
                    break
        if api_key and project_id:
            break

    if not api_key or not project_id:
        die(
            "Configuration Firebase introuvable dans web/public. "
            "Le site doit contenir apiKey et projectId."
        )

    return api_key, project_id


def http_json(
    url: str,
    *,
    method: str = "POST",
    payload: Any = None,
    headers: Dict[str, str] | None = None,
    form: Dict[str, str] | None = None,
    timeout: int = 60,
) -> Dict[str, Any]:
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)

    data = None
    if form is not None:
        data = parse.urlencode(form).encode("utf-8")
        hdrs["Content-Type"] = "application/x-www-form-urlencoded"
    elif payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        hdrs["Content-Type"] = "application/json; charset=utf-8"

    req = request.Request(url, data=data, headers=hdrs, method=method)

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except Exception:
            detail = raw
        raise RuntimeError(
            json.dumps(
                {"http_status": exc.code, "detail": detail},
                ensure_ascii=False,
            )
        ) from exc
    except error.URLError as exc:
        raise RuntimeError(f"Erreur réseau: {exc}") from exc


class FirebaseSession:
    def __init__(self, api_key: str, project_id: str, email: str, password: str):
        self.api_key = api_key
        self.project_id = project_id
        self.email = email
        self.uid = ""
        self.id_token = ""
        self.refresh_token = ""
        self.expires_at = 0.0
        self.sign_in(password)

    def sign_in(self, password: str) -> None:
        url = (
            "https://identitytoolkit.googleapis.com/v1/"
            f"accounts:signInWithPassword?key={parse.quote(self.api_key)}"
        )
        res = http_json(
            url,
            payload={
                "email": self.email,
                "password": password,
                "returnSecureToken": True,
            },
        )
        self.uid = str(res["localId"])
        self.id_token = str(res["idToken"])
        self.refresh_token = str(res["refreshToken"])
        self.expires_at = time.time() + int(res.get("expiresIn", "3600")) - 300

    def refresh_if_needed(self, force: bool = False) -> None:
        if not force and time.time() < self.expires_at:
            return

        url = (
            "https://securetoken.googleapis.com/v1/"
            f"token?key={parse.quote(self.api_key)}"
        )
        res = http_json(
            url,
            form={
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
            },
        )
        self.id_token = str(res["id_token"])
        self.refresh_token = str(res.get("refresh_token", self.refresh_token))
        self.uid = str(res.get("user_id", self.uid))
        self.expires_at = time.time() + int(res.get("expires_in", "3600")) - 300

    def commit(self, writes: List[Dict[str, Any]]) -> Dict[str, Any]:
        self.refresh_if_needed()
        url = (
            "https://firestore.googleapis.com/v1/"
            f"projects/{parse.quote(self.project_id)}/databases/(default)/documents:commit"
        )
        headers = {"Authorization": f"Bearer {self.id_token}"}

        try:
            return http_json(url, payload={"writes": writes}, headers=headers, timeout=120)
        except RuntimeError as exc:
            msg = str(exc)
            if '"http_status": 401' in msg:
                self.refresh_if_needed(force=True)
                headers = {"Authorization": f"Bearer {self.id_token}"}
                return http_json(
                    url,
                    payload={"writes": writes},
                    headers=headers,
                    timeout=120,
                )
            raise


def sqlite_uri(path: Path) -> str:
    # mode=ro pour garantir qu'aucune écriture locale ne soit faite
    return f"file:{parse.quote(str(path), safe='/:')}?mode=ro"


def open_db(path: Path) -> sqlite3.Connection:
    if not path.exists():
        die(f"Base SQLite introuvable: {path}")
    conn = sqlite3.connect(sqlite_uri(path), uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def table_columns(conn: sqlite3.Connection) -> List[str]:
    rows = conn.execute("PRAGMA table_info(questions)").fetchall()
    if not rows:
        die("Table `questions` introuvable dans la base.")
    return [str(r["name"]) for r in rows]


def doc_id_expr(columns: List[str]) -> str:
    if "original_id" in columns and "row_number" in columns:
        return (
            "COALESCE(NULLIF(TRIM(CAST(original_id AS TEXT)), ''), "
            "NULLIF(TRIM(CAST(row_number AS TEXT)), ''))"
        )
    if "original_id" in columns:
        return "NULLIF(TRIM(CAST(original_id AS TEXT)), '')"
    if "row_number" in columns:
        return "NULLIF(TRIM(CAST(row_number AS TEXT)), '')"
    die("Ni original_id ni row_number n'existe dans la table `questions`.")
    return ""


def validate_db(conn: sqlite3.Connection, columns: List[str]) -> Dict[str, Any]:
    expr = doc_id_expr(columns)
    total = int(conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0])
    missing = int(
        conn.execute(f"SELECT COUNT(*) FROM questions WHERE {expr} IS NULL").fetchone()[0]
    )
    duplicates = int(
        conn.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT {expr} AS doc_id, COUNT(*) AS c
                FROM questions
                WHERE {expr} IS NOT NULL
                GROUP BY doc_id
                HAVING c > 1
            )
            """
        ).fetchone()[0]
    )

    sample_dupes = []
    if duplicates:
        sample_dupes = [
            tuple(r)
            for r in conn.execute(
                f"""
                SELECT {expr} AS doc_id, COUNT(*) AS c
                FROM questions
                WHERE {expr} IS NOT NULL
                GROUP BY doc_id
                HAVING c > 1
                ORDER BY c DESC, doc_id
                LIMIT 10
                """
            ).fetchall()
        ]

    return {
        "total": total,
        "missing_ids": missing,
        "duplicate_ids": duplicates,
        "duplicate_samples": sample_dupes,
        "columns": columns,
    }


def firestore_value(value: Any, field_name: str) -> Dict[str, Any]:
    if value is None:
        return {"nullValue": None}

    lower = field_name.lower()
    if lower in KNOWN_BOOL_FIELDS:
        if isinstance(value, str):
            v = value.strip().lower()
            b = v in {"1", "true", "yes", "oui", "y"}
        else:
            b = bool(value)
        return {"booleanValue": b}

    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, (bytes, bytearray)):
        return {"bytesValue": base64.b64encode(bytes(value)).decode("ascii")}

    return {"stringValue": str(value)}


def make_write(
    *,
    project_id: str,
    uid: str,
    doc_id: str,
    row: sqlite3.Row,
    columns: List[str],
    status_mode: str,
) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}

    for col in columns:
        if status_mode == "omit" and col.lower() == "status":
            continue
        fields[col] = firestore_value(row[col], col)

    # Champ technique non séquentiel : utile pour reconnaître la migration,
    # sans ajouter de timestamp indexé qui limiterait le débit.
    fields["cgimport001"] = {"booleanValue": True}

    name = (
        f"projects/{project_id}/databases/(default)/documents/"
        f"users/{uid}/questions/{parse.quote(doc_id, safe='')}"
    )

    return {
        "update": {
            "name": name,
            "fields": fields,
        }
    }


def load_checkpoint(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"last_rowid": 0, "written": 0}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        die(f"Checkpoint illisible: {path}")
    return {}


def save_checkpoint(
    path: Path,
    *,
    db_path: Path,
    project_id: str,
    uid: str,
    last_rowid: int,
    written: int,
    total: int,
) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    data = {
        "format": "CGIMPORT001",
        "db_path": str(db_path),
        "project_id": project_id,
        "uid": uid,
        "last_rowid": int(last_rowid),
        "written": int(written),
        "total": int(total),
        "updated_unix": int(time.time()),
    }
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def print_validation(info: Dict[str, Any], db_path: Path) -> None:
    print("\n=== CGIMPORT001 / VALIDATION SQLITE ===")
    print(f"Base         : {db_path}")
    print(f"Questions    : {human_int(info['total'])}")
    print(f"Colonnes     : {len(info['columns'])}")
    print(f"ID manquants : {human_int(info['missing_ids'])}")
    print(f"ID dupliqués : {human_int(info['duplicate_ids'])}")
    print("Champs       : " + ", ".join(info["columns"]))
    if info["duplicate_samples"]:
        print("\nExemples de doublons:")
        for doc_id, count in info["duplicate_samples"]:
            print(f"  {doc_id} -> {count} lignes")


def is_quota_error(message: str) -> bool:
    m = message.lower()
    return (
        "resource_exhausted" in m
        or "quota" in m
        or '"http_status": 429' in m
    )


def run_import(args: argparse.Namespace) -> None:
    repo = Path(args.repo).expanduser().resolve()
    db_path = Path(args.db).expanduser()
    checkpoint_path = Path(args.checkpoint).expanduser()

    conn = open_db(db_path)
    columns = table_columns(conn)
    info = validate_db(conn, columns)
    print_validation(info, db_path)

    if info["missing_ids"] or info["duplicate_ids"]:
        die(
            "Import annulé : les identifiants doivent être complets et uniques "
            "avant toute écriture Firestore."
        )

    if args.dry_run:
        print("\n✅ DRY-RUN OK : aucune écriture Firestore effectuée.")
        return

    api_key, project_id = find_firebase_config(repo)
    print(f"\nProjet Firebase détecté : {project_id}")

    email = args.email or input("E-mail Firebase : ").strip()
    if not email:
        die("Adresse e-mail vide.")

    password = getpass.getpass("Mot de passe Firebase (non affiché) : ")
    if not password:
        die("Mot de passe vide.")

    print("\nConnexion Firebase...")
    session = FirebaseSession(api_key, project_id, email, password)
    print(f"✅ Authentifié. UID : {session.uid}")

    if args.restart and checkpoint_path.exists():
        checkpoint_path.unlink()

    cp = load_checkpoint(checkpoint_path)
    last_rowid = int(cp.get("last_rowid", 0))
    already_written = int(cp.get("written", 0))

    if cp.get("project_id") and cp.get("project_id") != project_id:
        die("Le checkpoint appartient à un autre projet Firebase.")
    if cp.get("uid") and cp.get("uid") != session.uid:
        die("Le checkpoint appartient à un autre utilisateur Firebase.")

    remaining_local = int(
        conn.execute(
            "SELECT COUNT(*) FROM questions WHERE rowid > ?", (last_rowid,)
        ).fetchone()[0]
    )

    limit = int(args.limit)
    if limit < 0:
        die("--limit doit être >= 0")
    this_run_target = remaining_local if limit == 0 else min(limit, remaining_local)

    print("\n=== PLAN D'IMPORT ===")
    print(f"Reprise après rowid : {last_rowid}")
    print(f"Déjà validés        : {human_int(already_written)}")
    print(f"Restant local       : {human_int(remaining_local)}")
    print(f"Maximum ce run      : {human_int(this_run_target)}")
    print(f"Taille des lots     : {args.batch_size}")
    print(f"Débit cible         : {args.rate:.0f} écritures/s")
    print(f"Statut              : {args.status_mode}")
    print(f"Checkpoint          : {checkpoint_path}")

    if args.limit == DEFAULT_FREE_LIMIT:
        print(
            "\nMode prudent gratuit : maximum 18 000 écritures sur ce lancement."
        )

    expr = doc_id_expr(columns)
    query = (
        f"SELECT rowid AS __cg_rowid__, *, {expr} AS __cg_doc_id__ "
        "FROM questions WHERE rowid > ? ORDER BY rowid"
    )

    cursor = conn.execute(query, (last_rowid,))
    start_time = time.time()
    run_written = 0
    batch_rows: List[sqlite3.Row] = []

    def flush(rows: List[sqlite3.Row]) -> bool:
        nonlocal run_written, last_rowid, already_written

        if not rows:
            return True

        writes = [
            make_write(
                project_id=project_id,
                uid=session.uid,
                doc_id=str(r["__cg_doc_id__"]),
                row=r,
                columns=columns,
                status_mode=args.status_mode,
            )
            for r in rows
        ]

        t0 = time.time()
        try:
            session.commit(writes)
        except RuntimeError as exc:
            message = str(exc)
            if is_quota_error(message):
                print(
                    "\n⚠️ Quota Firestore atteint. "
                    "Checkpoint conservé : relance le même outil plus tard."
                )
                return False
            print("\nÉchec du lot Firestore:")
            print(message)
            return False

        last_rowid = int(rows[-1]["__cg_rowid__"])
        run_written += len(rows)
        already_written += len(rows)

        save_checkpoint(
            checkpoint_path,
            db_path=db_path,
            project_id=project_id,
            uid=session.uid,
            last_rowid=last_rowid,
            written=already_written,
            total=info["total"],
        )

        # Limiteur de débit.
        elapsed = max(time.time() - t0, 0.001)
        desired = len(rows) / max(args.rate, 1.0)
        if elapsed < desired:
            time.sleep(desired - elapsed)

        total_elapsed = max(time.time() - start_time, 0.001)
        speed = run_written / total_elapsed
        pct = (already_written / info["total"] * 100.0) if info["total"] else 100.0
        print(
            f"\r✅ {human_int(already_written)} / {human_int(info['total'])} "
            f"({pct:5.2f} %) | {speed:6.1f} écr./s | rowid {last_rowid}",
            end="",
            flush=True,
        )
        return True

    for row in cursor:
        if run_written >= this_run_target:
            break
        batch_rows.append(row)

        slots_left = this_run_target - run_written
        if len(batch_rows) >= args.batch_size or len(batch_rows) >= slots_left:
            if not flush(batch_rows):
                print()
                return
            batch_rows = []

    if batch_rows and run_written < this_run_target:
        flush(batch_rows)

    print()
    remaining_after = int(
        conn.execute(
            "SELECT COUNT(*) FROM questions WHERE rowid > ?", (last_rowid,)
        ).fetchone()[0]
    )

    print("\n=== CGIMPORT001 / FIN DU RUN ===")
    print(f"Écrits ce run : {human_int(run_written)}")
    print(f"Total validé  : {human_int(already_written)}")
    print(f"Restant       : {human_int(remaining_after)}")

    if remaining_after == 0:
        print("\n🎯 MIGRATION COMPLETE : toutes les questions locales ont été envoyées.")
        print("Conserve le checkpoint jusqu'à la validation du compteur Cloud.")
    elif limit:
        print(
            "\nMigration partielle volontaire. "
            "Relance exactement la même commande pour reprendre."
        )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="CGIMPORT001 — SQLite questions -> Cloud Firestore"
    )
    p.add_argument(
        "--db",
        default=DEFAULT_DB_ANDROID,
        help=f"Chemin SQLite (défaut: {DEFAULT_DB_ANDROID})",
    )
    p.add_argument(
        "--repo",
        default=".",
        help="Racine du dépôt CultureGeneraleAndroid (défaut: .)",
    )
    p.add_argument(
        "--checkpoint",
        default=DEFAULT_CHECKPOINT,
        help=f"Checkpoint local (défaut: {DEFAULT_CHECKPOINT})",
    )
    p.add_argument("--email", default="", help="E-mail Firebase (sinon demandé)")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Validation complète, zéro écriture Firestore",
    )
    p.add_argument(
        "--restart",
        action="store_true",
        help="Repartir de zéro en supprimant le checkpoint local",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_FREE_LIMIT,
        help=(
            "Maximum d'écritures pour ce lancement. "
            "0 = migration complète sans plafond. "
            f"Défaut prudent = {DEFAULT_FREE_LIMIT}."
        ),
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH,
        choices=range(1, 401),
        metavar="1..400",
        help=f"Taille de lot (défaut: {DEFAULT_BATCH})",
    )
    p.add_argument(
        "--rate",
        type=float,
        default=DEFAULT_RATE,
        help=f"Débit cible écr./s (défaut: {DEFAULT_RATE:.0f})",
    )
    p.add_argument(
        "--status-mode",
        choices=["snapshot", "omit"],
        default="snapshot",
        help=(
            "snapshot = copie le statut SQLite dans le document question au moment "
            "de la migration; omit = ne l'écrit pas. "
            "SYNCLOUD001 reste la source active de progression."
        ),
    )
    return p.parse_args()


if __name__ == "__main__":
    run_import(parse_args())
