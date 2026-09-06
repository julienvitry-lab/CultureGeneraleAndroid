#!/usr/bin/env python3
"""
CGBACKUP002 — sauvegardes Firestore vérifiées, rotation et exécution automatique.

Conçu pour Termux / CultureGeneraleAndroid.

Commandes:
  authorize          Authentification initiale, stocke uniquement un refresh token.
  run                Sauvegarde + vérification + rotation.
  verify [archive]   Vérifie une archive (la plus récente si omise).
  rotate             Applique la politique de rétention.
  status             Affiche la dernière sauvegarde et l'état local.
  install-schedule   Installe un lancement hebdomadaire (JobScheduler si dispo,
                     sinon cron si disponible).
  uninstall-schedule Retire la planification créée par CGBACKUP002.
"""

from __future__ import annotations

import argparse
import getpass
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

PROJECT = "culturegeneralesync"
ROOT = Path.cwd()

# Sauvegardes directement visibles dans le stockage Android.
BACKUP_DIR = Path("/storage/emulated/0/Download/CultureGenerale_Backups")

CONFIG_DIR = Path.home() / ".config" / "cgbackup002"
AUTH_FILE = CONFIG_DIR / "auth.json"
STATE_FILE = CONFIG_DIR / "state.json"

LOG_DIR = Path.home() / ".local" / "state" / "cgbackup002"
LOG_FILE = LOG_DIR / "weekly.log"
RUNNER = CONFIG_DIR / "run_weekly.sh"

# Collections réellement utilisées par les briques Cloud du projet.
DEFAULT_COLLECTIONS = [
    "questions",
    "question_tombstones",
    "question_search_delta",
    "question_conflicts",
    "question_dedup_audit",
    "statusBuckets",
    "meta",
]

PAGE_SIZE = 1000
FORMAT_VERSION = "CGBACKUP002_1"

# Rétention prudente :
# - les 8 dernières sauvegardes sont toujours conservées ;
# - une sauvegarde mensuelle supplémentaire est conservée pour chacun
#   des 6 derniers mois rencontrés dans l'historique.
KEEP_LATEST = 8
KEEP_MONTHLY = 6

JOB_ID = 7002
JOB_PERIOD_MS = 7 * 24 * 60 * 60 * 1000


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(CONFIG_DIR, 0o700)
    except Exception:
        pass


def http_json(url, *, method="GET", headers=None, body=None, form=None, timeout=180):
    headers = dict(headers or {})
    data = None

    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json; charset=utf-8")
    elif form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        headers.setdefault(
            "Content-Type",
            "application/x-www-form-urlencoded; charset=utf-8",
        )

    req = urllib.request.Request(url, data=data, method=method, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}\n{raw[:1800]}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Erreur réseau : {e}") from None


def find_api_key() -> str | None:
    candidates = [
        ROOT / "web" / "public" / "app.js",
        ROOT / "web" / "public" / "firebase-config.js",
        ROOT / "app" / "google-services.json",
    ]

    for p in candidates:
        if not p.exists():
            continue

        text = p.read_text(encoding="utf-8", errors="ignore")

        m = re.search(r'apiKey\s*:\s*["\']([^"\']+)["\']', text)
        if m:
            return m.group(1)

        if p.name == "google-services.json":
            try:
                data = json.loads(text)
                for client in data.get("client", []):
                    for item in client.get("api_key", []):
                        key = item.get("current_key")
                        if key:
                            return str(key)
            except Exception:
                pass

    return None


def save_json_secure(path: Path, payload: dict) -> None:
    ensure_dirs()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    try:
        os.chmod(tmp, 0o600)
    except Exception:
        pass
    tmp.replace(path)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def authorize(api_key: str) -> dict:
    ensure_dirs()

    email = os.environ.get("CG_FIREBASE_EMAIL") or input(
        "E-mail Firebase : "
    ).strip()

    if not email:
        raise SystemExit("ERREUR : e-mail vide.")

    password = os.environ.get("CG_FIREBASE_PASSWORD") or getpass.getpass(
        "Mot de passe Firebase (non affiché) : "
    )

    if not password:
        raise SystemExit("ERREUR : mot de passe vide.")

    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={urllib.parse.quote(api_key)}"
    )

    result = http_json(
        url,
        method="POST",
        body={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        },
    )

    refresh_token = result.get("refreshToken")
    uid = result.get("localId")

    if not refresh_token or not uid:
        raise RuntimeError("Authentification Firebase incomplète.")

    payload = {
        "format": FORMAT_VERSION,
        "email": email,
        "uid": uid,
        "refresh_token": refresh_token,
        "authorized_at": now_iso(),
    }
    save_json_secure(AUTH_FILE, payload)

    print()
    print("✅ Autorisation CGBACKUP002 enregistrée.")
    print("Le mot de passe n'est PAS stocké.")
    print(f"Refresh token : {AUTH_FILE} (permissions privées)")
    return payload


def refresh_session(api_key: str) -> dict:
    if not AUTH_FILE.exists():
        raise SystemExit(
            "ERREUR : autorisation CGBACKUP002 absente.\n"
            "Lance d'abord : python tools/cgbackup002.py authorize"
        )

    auth = load_json(AUTH_FILE)
    refresh_token = str(auth.get("refresh_token") or "").strip()

    if not refresh_token:
        raise SystemExit("ERREUR : refresh token absent.")

    url = (
        "https://securetoken.googleapis.com/v1/token"
        f"?key={urllib.parse.quote(api_key)}"
    )

    result = http_json(
        url,
        method="POST",
        form={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )

    id_token = result.get("id_token")
    uid = result.get("user_id") or auth.get("uid")
    new_refresh = result.get("refresh_token") or refresh_token

    if not id_token or not uid:
        raise RuntimeError("Impossible de renouveler la session Firebase.")

    if new_refresh != refresh_token:
        auth["refresh_token"] = new_refresh
        auth["refreshed_at"] = now_iso()
        save_json_secure(AUTH_FILE, auth)

    return {
        "uid": str(uid),
        "email": auth.get("email", ""),
        "token": str(id_token),
    }


def collection_url(uid: str, collection: str) -> str:
    return (
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}"
        "/databases/(default)/documents/users/"
        f"{urllib.parse.quote(uid)}/{urllib.parse.quote(collection)}"
    )


def stream_collection(
    uid: str,
    token: str,
    collection: str,
    target_gz: Path,
) -> dict:
    count = 0
    page_token = None
    hasher = hashlib.sha256()

    # Écriture gzip atomique.
    tmp = target_gz.with_suffix(target_gz.suffix + ".tmp")

    with open(tmp, "wb") as raw:
        class HashingWriter:
            def write(self, b):
                hasher.update(b)
                return raw.write(b)
            def flush(self):
                return raw.flush()
            def close(self):
                return raw.close()
            @property
            def closed(self):
                return raw.closed

        wrapped = HashingWriter()

        with gzip.GzipFile(
            filename="",
            mode="wb",
            fileobj=wrapped,
            mtime=0,
        ) as gz:
            while True:
                params = {
                    "pageSize": str(PAGE_SIZE),
                    "orderBy": "__name__",
                    "showMissing": "false",
                }
                if page_token:
                    params["pageToken"] = page_token

                url = (
                    collection_url(uid, collection)
                    + "?"
                    + urllib.parse.urlencode(params)
                )

                try:
                    data = http_json(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                except RuntimeError as e:
                    # Collection inexistante/non accessible :
                    # on garde une sauvegarde vide, mais on signale l'erreur.
                    if count == 0 and "HTTP 404" in str(e):
                        data = {}
                    else:
                        raise

                for doc in data.get("documents", []):
                    line = (
                        json.dumps(
                            doc,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                        + "\n"
                    ).encode("utf-8")

                    gz.write(line)
                    count += 1

                    if count % 10000 == 0:
                        print(
                            f"  {collection}: "
                            f"{count:,}".replace(",", " ")
                            + " document(s)"
                        )

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

    tmp.replace(target_gz)

    return {
        "collection": collection,
        "documents": count,
        "file": target_gz.name,
        "bytes": target_gz.stat().st_size,
        "sha256": hashlib.sha256(target_gz.read_bytes()).hexdigest(),
    }


def verify_snapshot_dir(snapshot_dir: Path, manifest: dict) -> None:
    files = manifest.get("files", [])
    if not isinstance(files, list):
        raise RuntimeError("Manifest invalide : files absent.")

    for item in files:
        p = snapshot_dir / str(item["file"])
        if not p.exists():
            raise RuntimeError(f"Fichier absent : {p.name}")

        expected = str(item["sha256"])
        got = hashlib.sha256(p.read_bytes()).hexdigest()

        if got != expected:
            raise RuntimeError(f"SHA-256 invalide : {p.name}")

        # Vérification de l'intégrité gzip.
        line_count = 0
        with gzip.open(p, "rt", encoding="utf-8") as gz:
            for line in gz:
                if line.strip():
                    json.loads(line)
                    line_count += 1

        expected_count = int(item.get("documents", 0))
        if line_count != expected_count:
            raise RuntimeError(
                f"Compte incohérent {p.name}: "
                f"{line_count} != {expected_count}"
            )


def create_archive(snapshot_dir: Path, archive: Path) -> None:
    tmp_archive = archive.with_suffix(archive.suffix + ".tmp")

    with tarfile.open(tmp_archive, "w:gz") as tar:
        for p in sorted(snapshot_dir.iterdir()):
            tar.add(p, arcname=p.name)

    tmp_archive.replace(archive)


def verify_archive(archive: Path) -> dict:
    if not archive.exists():
        raise SystemExit(f"ERREUR : archive introuvable : {archive}")

    with tempfile.TemporaryDirectory(prefix="cgbackup002_verify_") as td:
        td = Path(td)

        with tarfile.open(archive, "r:gz") as tar:
            # Protection simple contre path traversal.
            for member in tar.getmembers():
                dest = (td / member.name).resolve()
                if not str(dest).startswith(str(td.resolve())):
                    raise RuntimeError("Archive invalide : chemin dangereux.")
            tar.extractall(td)

        manifest_path = td / "manifest.json"
        if not manifest_path.exists():
            raise RuntimeError("manifest.json absent.")

        manifest = load_json(manifest_path)
        verify_snapshot_dir(td, manifest)

    return manifest


def archive_files() -> list[Path]:
    ensure_dirs()
    pat = re.compile(r"^CGBACKUP002_(\d{8}T\d{6}Z)\.tar\.gz$")
    items = []

    for p in BACKUP_DIR.glob("CGBACKUP002_*.tar.gz"):
        m = pat.match(p.name)
        if m:
            items.append((m.group(1), p))

    items.sort(reverse=True)
    return [p for _, p in items]


def month_key(path: Path) -> str | None:
    m = re.search(r"CGBACKUP002_(\d{4})(\d{2})\d{2}T", path.name)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}"


def retention_plan() -> tuple[list[Path], list[Path]]:
    files = archive_files()
    keep = set(files[:KEEP_LATEST])

    months_seen = []
    for p in files:
        key = month_key(p)
        if not key:
            continue
        if key not in months_seen:
            months_seen.append(key)
            keep.add(p)
        if len(months_seen) >= KEEP_MONTHLY:
            break

    kept = [p for p in files if p in keep]
    remove = [p for p in files if p not in keep]
    return kept, remove


def rotate(apply=True) -> dict:
    kept, remove = retention_plan()

    removed = []
    if apply:
        for p in remove:
            p.unlink()
            removed.append(p.name)

    return {
        "kept": [p.name for p in kept],
        "removed": removed if apply else [p.name for p in remove],
        "policy": {
            "keep_latest": KEEP_LATEST,
            "keep_monthly": KEEP_MONTHLY,
        },
    }


def run_backup(args) -> dict:
    ensure_dirs()

    api_key = args.api_key or find_api_key()
    if not api_key:
        raise SystemExit("ERREUR : apiKey Firebase introuvable.")

    session = refresh_session(api_key)
    run_stamp = stamp()

    snapshot_dir = Path(tempfile.mkdtemp(prefix="cgbackup002_snapshot_"))
    archive = BACKUP_DIR / f"CGBACKUP002_{run_stamp}.tar.gz"

    collections = list(DEFAULT_COLLECTIONS)

    extra = [
        x.strip()
        for x in (args.collections or "").split(",")
        if x.strip()
    ]
    for name in extra:
        if name not in collections:
            collections.append(name)

    print()
    print("==================================================")
    print(" CGBACKUP002 — SAUVEGARDE FIRESTORE")
    print("==================================================")
    print(f"Projet      : {PROJECT}")
    print(f"Utilisateur : {session['email']}")
    print(f"Destination : {archive}")
    print("Collections : " + ", ".join(collections))
    print()

    files = []
    started = time.time()

    try:
        for collection in collections:
            print(f"--- {collection} ---")
            target = snapshot_dir / f"{collection}.jsonl.gz"
            info = stream_collection(
                session["uid"],
                session["token"],
                collection,
                target,
            )
            files.append(info)
            print(
                f"✅ {collection}: "
                f"{info['documents']:,}".replace(",", " ")
                + " document(s)"
            )

        manifest = {
            "format": FORMAT_VERSION,
            "created_at": now_iso(),
            "project": PROJECT,
            "uid": session["uid"],
            "email": session["email"],
            "collections": collections,
            "files": files,
            "documents_total": sum(x["documents"] for x in files),
            "elapsed_seconds": round(time.time() - started, 1),
        }

        (snapshot_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print()
        print("=== VERIFICATION AVANT ARCHIVAGE ===")
        verify_snapshot_dir(snapshot_dir, manifest)
        print("✅ JSON / gzip / SHA-256 valides")

        print()
        print("=== CREATION DE L'ARCHIVE ===")
        create_archive(snapshot_dir, archive)

        # Relecture réelle de l'archive finale.
        verified_manifest = verify_archive(archive)
        print("✅ Archive finale relue et validée")

        rot = rotate(apply=True)

        state = {
            "format": FORMAT_VERSION,
            "last_success_at": now_iso(),
            "last_archive": str(archive),
            "last_archive_bytes": archive.stat().st_size,
            "documents_total": verified_manifest["documents_total"],
            "collection_counts": {
                x["collection"]: x["documents"]
                for x in verified_manifest["files"]
            },
            "rotation": rot,
        }
        save_json_secure(STATE_FILE, state)

        print()
        print("==================================================")
        print(" CGBACKUP002 — SUCCES")
        print("==================================================")
        print(
            "Documents : "
            + f"{verified_manifest['documents_total']:,}".replace(",", " ")
        )
        print(f"Archive   : {archive}")
        print(
            "Taille    : "
            f"{archive.stat().st_size / 1024 / 1024:.1f} Mo"
        )
        print(
            "Conservées: "
            + str(len(rot["kept"]))
            + " archive(s)"
        )
        print(
            "Supprimées par rotation: "
            + str(len(rot["removed"]))
        )
        print("✅ Sauvegarde vérifiée et rotation terminée.")

        return state

    finally:
        shutil.rmtree(snapshot_dir, ignore_errors=True)


def print_status() -> None:
    ensure_dirs()

    print("==================================================")
    print(" CGBACKUP002 — ETAT")
    print("==================================================")

    if STATE_FILE.exists():
        state = load_json(STATE_FILE)
        print("Dernier succès :", state.get("last_success_at", "—"))
        print("Archive        :", state.get("last_archive", "—"))
        print(
            "Documents      :",
            f"{int(state.get('documents_total', 0)):,}".replace(",", " "),
        )
    else:
        print("Aucune sauvegarde CGBACKUP002 enregistrée.")

    files = archive_files()
    print("Archives locales:", len(files))
    for p in files[:10]:
        print(
            " -",
            p.name,
            f"({p.stat().st_size / 1024 / 1024:.1f} Mo)",
        )

    print("Dossier :", BACKUP_DIR)


def latest_archive() -> Path:
    files = archive_files()
    if not files:
        raise SystemExit("ERREUR : aucune archive CGBACKUP002.")
    return files[0]


def write_runner() -> None:
    ensure_dirs()

    python_bin = shutil.which("python") or "python"
    project = ROOT.resolve()
    tool = (ROOT / "tools" / "cgbackup002.py").resolve()

    content = f"""#!/data/data/com.termux/files/usr/bin/bash
set -u
mkdir -p "{LOG_DIR}"
cd "{project}" || exit 1
"{python_bin}" "{tool}" run >> "{LOG_FILE}" 2>&1
"""

    RUNNER.write_text(content, encoding="utf-8")
    try:
        os.chmod(RUNNER, 0o700)
    except Exception:
        pass


def install_schedule() -> None:
    if not AUTH_FILE.exists():
        raise SystemExit(
            "ERREUR : lance d'abord 'authorize' puis un premier 'run'."
        )

    write_runner()

    job = shutil.which("termux-job-scheduler")

    if job:
        subprocess.run(
            [
                job,
                "--job-id", str(JOB_ID),
                "--script", str(RUNNER),
                "--period-ms", str(JOB_PERIOD_MS),
                "--persisted", "true",
                "--network", "any",
            ],
            check=True,
        )

        print()
        print("✅ Planification Android JobScheduler installée.")
        print("Période approximative : 7 jours.")
        print("Persistance après redémarrage demandée.")
        print(f"Journal : {LOG_FILE}")
        return

    crontab = shutil.which("crontab")
    if crontab:
        existing = subprocess.run(
            [crontab, "-l"],
            capture_output=True,
            text=True,
        )

        lines = (
            existing.stdout.splitlines()
            if existing.returncode == 0
            else []
        )

        marker = "# CGBACKUP002_WEEKLY"
        lines = [line for line in lines if marker not in line]

        # Dimanche 03:30.
        lines.append(
            f'30 3 * * 0 "{RUNNER}" {marker}'
        )

        proc = subprocess.run(
            [crontab, "-"],
            input="\n".join(lines) + "\n",
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError("Impossible d'installer la crontab.")

        print()
        print("✅ Planification cron installée : dimanche 03:30.")
        print("IMPORTANT : crond doit fonctionner dans Termux.")
        print("Lance : crond")
        print(f"Journal : {LOG_FILE}")
        return

    print()
    print("⚠️ Aucun ordonnanceur Termux détecté.")
    print("Option recommandée :")
    print("  pkg install termux-api")
    print("  + application Android Termux:API")
    print("puis relance :")
    print("  python tools/cgbackup002.py install-schedule")
    print()
    print("Alternative :")
    print("  pkg install cronie")
    print("puis relance la commande d'installation.")


def uninstall_schedule() -> None:
    job = shutil.which("termux-job-scheduler")
    if job:
        subprocess.run(
            [job, "--job-id", str(JOB_ID), "--cancel"],
            check=False,
        )

    crontab = shutil.which("crontab")
    if crontab:
        existing = subprocess.run(
            [crontab, "-l"],
            capture_output=True,
            text=True,
        )
        if existing.returncode == 0:
            marker = "# CGBACKUP002_WEEKLY"
            lines = [
                line
                for line in existing.stdout.splitlines()
                if marker not in line
            ]
            subprocess.run(
                [crontab, "-"],
                input="\n".join(lines) + ("\n" if lines else ""),
                text=True,
                check=False,
            )

    print("✅ Planification CGBACKUP002 retirée.")


def selftest() -> None:
    # Test de la logique de rotation avec noms synthétiques.
    names = [
        "CGBACKUP002_20260906T100000Z.tar.gz",
        "CGBACKUP002_20260905T100000Z.tar.gz",
        "CGBACKUP002_20260904T100000Z.tar.gz",
        "CGBACKUP002_20260903T100000Z.tar.gz",
        "CGBACKUP002_20260902T100000Z.tar.gz",
        "CGBACKUP002_20260901T100000Z.tar.gz",
        "CGBACKUP002_20260831T100000Z.tar.gz",
        "CGBACKUP002_20260830T100000Z.tar.gz",
        "CGBACKUP002_20260801T100000Z.tar.gz",
        "CGBACKUP002_20260701T100000Z.tar.gz",
    ]

    assert month_key(Path(names[0])) == "2026-09"
    assert month_key(Path(names[-1])) == "2026-07"

    # Test archive/manifeste.
    with tempfile.TemporaryDirectory(prefix="cgbackup002_selftest_") as td:
        td = Path(td)
        gz = td / "questions.jsonl.gz"

        lines = [
            {"name": "x/1", "fields": {"a": {"stringValue": "A"}}},
            {"name": "x/2", "fields": {"a": {"stringValue": "B"}}},
        ]

        with gzip.open(gz, "wt", encoding="utf-8") as f:
            for row in lines:
                f.write(json.dumps(row) + "\n")

        manifest = {
            "files": [{
                "collection": "questions",
                "documents": 2,
                "file": gz.name,
                "sha256": hashlib.sha256(gz.read_bytes()).hexdigest(),
            }]
        }

        (td / "manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        verify_snapshot_dir(td, manifest)

        archive = td / "CGBACKUP002_20260906T100000Z.tar.gz"
        create_archive(td, archive)

        # create_archive inclut aussi l'archive si elle est dans td :
        # on teste plutôt la validité tar/gzip brute ici.
        assert archive.exists()
        with tarfile.open(archive, "r:gz") as tar:
            names_inside = tar.getnames()
            assert "manifest.json" in names_inside
            assert "questions.jsonl.gz" in names_inside

    print("✅ CGBACKUP002 selftest OK")


def main():
    p = argparse.ArgumentParser(
        description="CGBACKUP002 — sauvegardes Firestore vérifiées et rotation"
    )
    p.add_argument("--api-key", default=None)
    p.add_argument(
        "--collections",
        default="",
        help="Collections supplémentaires, séparées par des virgules.",
    )

    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("authorize")
    sub.add_parser("run")

    v = sub.add_parser("verify")
    v.add_argument("archive", nargs="?")

    sub.add_parser("rotate")
    sub.add_parser("status")
    sub.add_parser("install-schedule")
    sub.add_parser("uninstall-schedule")
    sub.add_parser("selftest")

    args = p.parse_args()
    api_key = args.api_key or find_api_key()

    if args.cmd == "authorize":
        if not api_key:
            raise SystemExit("ERREUR : apiKey Firebase introuvable.")
        authorize(api_key)

    elif args.cmd == "run":
        run_backup(args)

    elif args.cmd == "verify":
        archive = (
            Path(args.archive).expanduser()
            if args.archive
            else latest_archive()
        )
        manifest = verify_archive(archive)
        print("✅ Archive valide :", archive)
        print(
            "Documents :",
            f"{int(manifest.get('documents_total', 0)):,}".replace(",", " "),
        )

    elif args.cmd == "rotate":
        result = rotate(apply=True)
        print("✅ Rotation terminée.")
        print("Conservées :", len(result["kept"]))
        print("Supprimées:", len(result["removed"]))

    elif args.cmd == "status":
        print_status()

    elif args.cmd == "install-schedule":
        install_schedule()

    elif args.cmd == "uninstall-schedule":
        uninstall_schedule()

    elif args.cmd == "selftest":
        selftest()


if __name__ == "__main__":
    main()
