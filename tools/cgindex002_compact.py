#!/usr/bin/env python3
# CGINDEX002 — compactage contrôlé de question_search_delta dans l'index statique.
#
# Sécurité :
# - snapshot Firestore du delta avant toute modification ;
# - vérification delta <-> SQLite local avant compactage ;
# - travail dans une copie temporaire de l'index ;
# - sauvegarde .tar.gz de l'index précédent dans Download ;
# - sauvegarde .json.gz du delta dans Download ;
# - push GitHub + déploiement Firebase AVANT purge ;
# - purge avec précondition updateTime : un delta modifié pendant l'opération
#   n'est jamais supprimé.
#
# Dépendances : Python stdlib + sqlite3. Aucun package pip.

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
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

PROJECT = "culturegeneralesync"
ROOT = Path.cwd()
INDEX_DIR = ROOT / "web" / "public" / "cgweb012_index"
DB = Path("/storage/emulated/0/Culture Générale/questions_base.sqlite")
DOWNLOAD = Path("/storage/emulated/0/Download")
STATE = ROOT / "tools" / ".cgindex002_state.json"

STOP = {
    "de","du","des","la","le","les","un","une","et","ou","a","au","aux","en",
    "dans","sur","sous","par","pour","avec","sans","ce","cet","cette","ces",
    "qui","que","quoi","quel","quelle","quels","quelles","est","sont","etre",
    "son","sa","ses","leur","leurs","il","elle","ils","elles","on","se","ne",
    "pas","plus","the","of","and","to","in","is","are","an"
}

FIELDS = (
    "megatheme", "theme", "question", "detail",
    "proposition_a", "proposition_b", "proposition_c", "proposition_d"
)


def now_stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def run(cmd, cwd=None, check=True):
    print("+", " ".join(map(str, cmd)))
    return subprocess.run(cmd, cwd=cwd, check=check)


def http_json(url, *, method="GET", headers=None, body=None, timeout=120):
    headers = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json; charset=utf-8")

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} sur {url}\n{raw[:1400]}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Erreur réseau : {e}") from None


def find_api_key():
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
                        value = item.get("current_key")
                        if value:
                            return value
            except Exception:
                pass

    return None


def authenticate(api_key):
    email = os.environ.get("CG_FIREBASE_EMAIL") or input("E-mail Firebase : ").strip()
    if not email:
        raise SystemExit("ERREUR : e-mail Firebase vide.")

    password = (
        os.environ.get("CG_FIREBASE_PASSWORD")
        or getpass.getpass("Mot de passe Firebase (non affiché) : ")
    )
    if not password:
        raise SystemExit("ERREUR : mot de passe Firebase vide.")

    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={urllib.parse.quote(api_key)}"
    )
    data = http_json(
        url,
        method="POST",
        body={"email": email, "password": password, "returnSecureToken": True},
    )

    token = data.get("idToken")
    uid = data.get("localId")
    if not token or not uid:
        raise RuntimeError("Authentification Firebase incomplète.")

    print(f"✅ Authentifié : {email}")
    return {"email": email, "uid": uid, "token": token}


def collection_url(uid):
    return (
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}"
        "/databases/(default)/documents"
        f"/users/{urllib.parse.quote(uid)}/question_search_delta"
    )


def list_delta(uid, token):
    docs = []
    page_token = None

    while True:
        params = {"pageSize": "1000", "orderBy": "__name__"}
        if page_token:
            params["pageToken"] = page_token

        url = collection_url(uid) + "?" + urllib.parse.urlencode(params)
        data = http_json(
            url,
            headers={"Authorization": f"Bearer {token}"},
        )

        page = data.get("documents", [])
        docs.extend(page)

        if len(docs) and len(docs) % 5000 == 0:
            print(f"  {len(docs)} delta(s) lus")

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return docs


def firestore_value(v):
    if "nullValue" in v:
        return None
    if "booleanValue" in v:
        return bool(v["booleanValue"])
    if "integerValue" in v:
        try:
            return int(v["integerValue"])
        except Exception:
            return v["integerValue"]
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "stringValue" in v:
        return v["stringValue"]
    if "timestampValue" in v:
        return v["timestampValue"]
    if "arrayValue" in v:
        return [firestore_value(x) for x in v.get("arrayValue", {}).get("values", [])]
    if "mapValue" in v:
        return {
            k: firestore_value(x)
            for k, x in v.get("mapValue", {}).get("fields", {}).items()
        }
    return v


def decode_delta(doc):
    fields = {
        k: firestore_value(v)
        for k, v in doc.get("fields", {}).items()
    }
    doc_id = doc.get("name", "").rsplit("/", 1)[-1]
    qid = str(fields.get("question_id") or doc_id).strip()

    return {
        "doc_id": doc_id,
        "question_id": qid,
        "deleted": bool(fields.get("deleted", False)),
        "tokens": sorted({str(x) for x in (fields.get("tokens") or []) if str(x)}),
        "updateTime": doc.get("updateTime"),
        "createTime": doc.get("createTime"),
        "fields": fields,
        "raw": doc,
    }


def normalize_text(text):
    text = unicodedata.normalize("NFD", str(text or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens_from_values(values):
    text = " ".join(str(v or "") for v in values)
    return sorted({
        t
        for t in normalize_text(text).split()
        if len(t) >= 2 and t not in STOP
    })


def normalize_id(value):
    s = str(value if value is not None else "").strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        s = s[1:-1].strip()
    return s


def inspect_local_sqlite(delta_rows):
    if not DB.exists():
        raise SystemExit(f"ERREUR : SQLite principal introuvable : {DB}")

    wanted = {row["question_id"] for row in delta_rows}
    found = {}

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        cur.execute("PRAGMA integrity_check")
        integrity = cur.fetchone()
        if not integrity or str(integrity[0]).lower() != "ok":
            raise SystemExit("ERREUR : integrity_check SQLite != ok")

        cur.execute("SELECT COUNT(*) FROM questions")
        total = int(cur.fetchone()[0])

        cur.execute("""
            SELECT original_id, megatheme, theme, question, detail,
                   proposition_a, proposition_b, proposition_c, proposition_d
            FROM questions
        """)

        scanned = 0
        for row in cur:
            scanned += 1
            qid = normalize_id(row[0])
            if qid in wanted:
                found[qid] = {
                    "tokens": tokens_from_values(row[1:]),
                }
            if scanned % 50000 == 0:
                print(f"  SQLite : {scanned} lignes vérifiées")
    finally:
        con.close()

    mismatches = []
    for delta in delta_rows:
        qid = delta["question_id"]
        local = found.get(qid)

        if delta["deleted"]:
            if local is not None:
                mismatches.append(
                    f"{qid}: delta=SUPPRIMÉ mais question encore présente dans SQLite"
                )
        else:
            if local is None:
                mismatches.append(
                    f"{qid}: delta=ACTIVE mais question absente du SQLite"
                )
            elif sorted(local["tokens"]) != sorted(delta["tokens"]):
                mismatches.append(
                    f"{qid}: tokens SQLite != tokens delta "
                    f"({len(local['tokens'])} != {len(delta['tokens'])})"
                )

    if mismatches:
        print()
        print("⚠️ Incohérences SQLite / delta :")
        for msg in mismatches[:20]:
            print(" -", msg)
        if len(mismatches) > 20:
            print(f" ... et {len(mismatches) - 20} autre(s)")
        raise SystemExit(
            "ERREUR : le téléphone n'a pas encore absorbé tout le delta. "
            "Laisse CGSYNC006 en LIVE quelques secondes puis relance."
        )

    return total


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def backup_index_and_delta(raw_docs, stamp):
    DOWNLOAD.mkdir(parents=True, exist_ok=True)

    index_backup = DOWNLOAD / f"CGINDEX002_INDEX_BEFORE_{stamp}.tar.gz"
    delta_backup = DOWNLOAD / f"CGINDEX002_DELTA_BEFORE_{stamp}.json.gz"

    with tarfile.open(index_backup, "w:gz") as tar:
        tar.add(INDEX_DIR, arcname="cgweb012_index")

    with gzip.open(delta_backup, "wt", encoding="utf-8") as gz:
        json.dump(
            {
                "format": "CGINDEX002_DELTA_BACKUP",
                "created_at": now_iso(),
                "project": PROJECT,
                "documents": raw_docs,
            },
            gz,
            ensure_ascii=False,
        )

    return index_backup, delta_backup


def shard_prefix(token):
    token = str(token or "")
    return token[:2] if len(token) >= 2 else "__"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_compact(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def compact_index(delta_rows, local_question_count, stamp):
    if not INDEX_DIR.exists():
        raise SystemExit(f"ERREUR : index statique introuvable : {INDEX_DIR}")

    manifest_path = INDEX_DIR / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("ERREUR : manifest.json de CGWEB012 introuvable.")

    previous_manifest = load_json(manifest_path)

    stage = ROOT / "tools" / f".cgindex002_stage_{stamp}"
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(INDEX_DIR, stage)

    delta_ids = {row["question_id"] for row in delta_rows}
    found_before = set()
    changed_files = set()

    shard_files = sorted(
        p for p in stage.glob("*.json")
        if p.name != "manifest.json"
    )

    print()
    print("=== RETRAIT DES ANCIENNES POSTINGS ===")

    for idx, path in enumerate(shard_files, start=1):
        data = load_json(path)
        changed = False
        empty_tokens = []

        for token, ids in list(data.items()):
            old = [str(x) for x in (ids or [])]
            hit = delta_ids.intersection(old)
            if hit:
                found_before.update(hit)
                new_ids = [x for x in old if x not in delta_ids]
                if new_ids:
                    data[token] = new_ids
                else:
                    empty_tokens.append(token)
                changed = True

        for token in empty_tokens:
            data.pop(token, None)

        if changed:
            if data:
                write_json_compact(path, data)
                changed_files.add(path.name)
            else:
                path.unlink()
                changed_files.add(path.name)

        if idx % 150 == 0:
            print(f"  {idx} shard(s) parcourus")

    print("=== AJOUT DES POSTINGS COURANTES ===")

    by_prefix = {}
    for row in delta_rows:
        if row["deleted"]:
            continue
        qid = row["question_id"]
        for token in row["tokens"]:
            by_prefix.setdefault(shard_prefix(token), {}).setdefault(token, []).append(qid)

    for prefix, additions in by_prefix.items():
        path = stage / f"{prefix}.json"
        data = load_json(path) if path.exists() else {}

        for token, ids_to_add in additions.items():
            ids = [str(x) for x in data.get(token, [])]
            seen = set(ids)
            for qid in ids_to_add:
                if qid not in seen:
                    ids.append(qid)
                    seen.add(qid)
            data[token] = ids

        write_json_compact(path, data)
        changed_files.add(path.name)

    print("=== VALIDATION DE L'INDEX COMPACTÉ ===")

    expected = {
        row["question_id"]: set() if row["deleted"] else set(row["tokens"])
        for row in delta_rows
    }
    seen_tokens = {qid: set() for qid in expected}

    token_count = 0
    posting_count = 0
    shards = []

    for idx, path in enumerate(sorted(stage.glob("*.json")), start=1):
        if path.name == "manifest.json":
            continue

        data = load_json(path)
        shards.append(path.stem)
        token_count += len(data)

        for token, ids in data.items():
            posting_count += len(ids or [])
            for qid in ids or []:
                qid = str(qid)
                if qid in seen_tokens:
                    seen_tokens[qid].add(token)

        if idx % 150 == 0:
            print(f"  {idx} shard(s) validés")

    bad = []
    for qid, wanted_tokens in expected.items():
        got = seen_tokens.get(qid, set())
        if got != wanted_tokens:
            bad.append((qid, len(wanted_tokens), len(got)))

    if bad:
        for item in bad[:20]:
            print(" - mismatch index", item)
        raise SystemExit(
            f"ERREUR : validation index échouée sur {len(bad)} question(s)."
        )

    live_count = sum(1 for r in delta_rows if not r["deleted"])
    deleted_count = len(delta_rows) - live_count

    manifest = dict(previous_manifest)
    manifest.update({
        "version": "CGINDEX002_1",
        "generated_at": now_iso(),
        "compacted_at": now_iso(),
        "compacted_delta_count": len(delta_rows),
        "compacted_delta_live": live_count,
        "compacted_delta_deleted": deleted_count,
        "previous_index_version": previous_manifest.get("version"),
        "question_count": int(local_question_count),
        "token_count": int(token_count),
        "posting_count": int(posting_count),
        "shards": sorted(set(shards)),
    })

    (stage / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    old = ROOT / "tools" / f".cgindex002_old_{stamp}"
    if old.exists():
        shutil.rmtree(old)

    INDEX_DIR.rename(old)
    try:
        stage.rename(INDEX_DIR)
    except Exception:
        if INDEX_DIR.exists():
            shutil.rmtree(INDEX_DIR, ignore_errors=True)
        old.rename(INDEX_DIR)
        raise

    shutil.rmtree(old, ignore_errors=True)

    return {
        "changed_shards": sorted(changed_files),
        "found_before_count": len(found_before),
        "manifest": manifest,
    }


def save_state(state):
    STATE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_state():
    if not STATE.exists():
        raise SystemExit("ERREUR : aucun état CGINDEX002 en attente.")
    return json.loads(STATE.read_text(encoding="utf-8"))


def prepare(session):
    stamp = now_stamp()

    print()
    print("==================================================")
    print(" CGINDEX002 — SNAPSHOT DU DELTA")
    print("==================================================")

    raw_docs = list_delta(session["uid"], session["token"])
    delta_rows = [decode_delta(d) for d in raw_docs]

    print(f"Delta Firestore : {len(delta_rows)} document(s)")

    if not delta_rows:
        print("✅ Delta déjà vide : aucun compactage nécessaire.")
        return None

    live_count = sum(1 for r in delta_rows if not r["deleted"])
    deleted_count = len(delta_rows) - live_count
    print(f"  actifs     : {live_count}")
    print(f"  suppressions : {deleted_count}")

    print()
    print("==================================================")
    print(" VALIDATION SQLITE LOCAL")
    print("==================================================")

    local_count = inspect_local_sqlite(delta_rows)
    print(f"✅ SQLite cohérent · {local_count} question(s)")

    index_backup, delta_backup = backup_index_and_delta(raw_docs, stamp)
    print()
    print("Sauvegarde index :", index_backup)
    print("Sauvegarde delta :", delta_backup)

    print()
    print("==================================================")
    print(" COMPACTAGE DANS L'INDEX STATIQUE")
    print("==================================================")

    result = compact_index(delta_rows, local_count, stamp)

    snapshot = [
        {
            "doc_id": r["doc_id"],
            "question_id": r["question_id"],
            "updateTime": r["updateTime"],
        }
        for r in delta_rows
    ]

    state = {
        "format": "CGINDEX002_STATE",
        "phase": "prepared",
        "created_at": now_iso(),
        "stamp": stamp,
        "project": PROJECT,
        "uid": session["uid"],
        "delta_count": len(delta_rows),
        "live_count": live_count,
        "deleted_count": deleted_count,
        "index_backup": str(index_backup),
        "delta_backup": str(delta_backup),
        "snapshot": snapshot,
        "manifest": result["manifest"],
        "changed_shards": result["changed_shards"],
    }
    save_state(state)

    print()
    print("==================================================")
    print(" PREPARATION CGINDEX002 VALIDEE")
    print("==================================================")
    print(f"Delta intégré : {len(delta_rows)}")
    print(f"Shards touchés : {len(result['changed_shards'])}")
    print(f"Index précédent sauvegardé : {index_backup}")
    print(f"Snapshot delta sauvegardé   : {delta_backup}")

    return state


def git_push_and_deploy():
    print()
    print("==================================================")
    print(" GIT + DEPLOIEMENT FIREBASE")
    print("==================================================")

    run(["git", "add",
         ".gitignore",
         "tools/cgindex002_compact.py",
         "tools/apply_cgindex002.py",
         "web/public/cgweb012_index"])

    staged = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=ROOT,
    )

    if staged.returncode != 0:
        run(["git", "commit", "-m", "CGINDEX002 compact and purge search delta"])
    else:
        print("INFO : aucun nouveau changement Git à committer.")

    run(["git", "push", "origin", "main"])

    run(
        ["firebase", "deploy", "--only", "hosting", "--project", PROJECT],
        cwd=ROOT / "web",
    )


def delete_delta_doc(uid, token, doc_id, update_time):
    base = collection_url(uid) + "/" + urllib.parse.quote(str(doc_id), safe="")
    params = {}
    if update_time:
        params["currentDocument.updateTime"] = update_time
    url = base + ("?" + urllib.parse.urlencode(params) if params else "")

    req = urllib.request.Request(
        url,
        method="DELETE",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp.read()
        return "deleted"
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        # 409/FAILED_PRECONDITION : document modifié après le snapshot.
        if e.code in (400, 409, 412) and (
            "FAILED_PRECONDITION" in raw
            or "precondition" in raw.lower()
            or "condition" in raw.lower()
        ):
            return "preserved"
        if e.code == 404:
            return "already_absent"
        raise RuntimeError(
            f"HTTP {e.code} suppression {doc_id}\n{raw[:1000]}"
        ) from None


def purge(session, state):
    if state.get("uid") != session["uid"]:
        raise SystemExit("ERREUR : l'UID connecté diffère de celui du snapshot.")

    print()
    print("==================================================")
    print(" PURGE CONTROLEE DU DELTA")
    print("==================================================")
    print(
        "Précondition active : un document modifié depuis le snapshot "
        "sera conservé."
    )

    deleted = 0
    preserved = 0
    absent = 0
    failures = []

    snapshot = state.get("snapshot", [])

    for i, item in enumerate(snapshot, start=1):
        try:
            result = delete_delta_doc(
                session["uid"],
                session["token"],
                item["doc_id"],
                item.get("updateTime"),
            )
            if result == "deleted":
                deleted += 1
            elif result == "preserved":
                preserved += 1
            else:
                absent += 1
        except Exception as e:
            failures.append((item["doc_id"], str(e)))

        if i % 500 == 0:
            print(
                f"  {i}/{len(snapshot)} · supprimés {deleted} · "
                f"conservés {preserved} · échecs {len(failures)}"
            )

    remaining = list_delta(session["uid"], session["token"])

    state["phase"] = "purged" if not failures else "purge_partial"
    state["finished_at"] = now_iso()
    state["purged_count"] = deleted
    state["preserved_changed_count"] = preserved
    state["already_absent_count"] = absent
    state["failure_count"] = len(failures)
    state["remaining_delta_count"] = len(remaining)
    state["failures"] = failures[:50]
    save_state(state)

    print()
    print("==================================================")
    print(" PURGE TERMINEE")
    print("==================================================")
    print(f"Supprimés              : {deleted}")
    print(f"Modifiés donc conservés: {preserved}")
    print(f"Déjà absents            : {absent}")
    print(f"Échecs                  : {len(failures)}")
    print(f"Delta restant           : {len(remaining)}")

    if failures:
        raise SystemExit(
            "ERREUR : purge partielle. Aucun document en échec n'a été masqué."
        )

    return state


def cmd_all(args):
    if subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    ).stdout.strip() != "main":
        raise SystemExit("ERREUR : CGINDEX002 doit être lancé sur la branche main.")

    api_key = args.api_key or find_api_key()
    if not api_key:
        raise SystemExit("ERREUR : apiKey Firebase introuvable.")

    session = authenticate(api_key)
    state = prepare(session)

    if state is None:
        # Même si le delta est déjà vide, on publie/committe l'outil CGINDEX002
        # afin que la capacité de maintenance fasse bien partie du projet.
        git_push_and_deploy()
        print()
        print("==================================================")
        print(" CGINDEX002 TERMINE")
        print("==================================================")
        print("✅ Delta déjà vide.")
        print("✅ Outil CGINDEX002 poussé sur GitHub.")
        print("✅ Hosting vérifié/déployé.")
        return

    git_push_and_deploy()

    print()
    print("✅ GitHub et Firebase Hosting validés.")
    print("La purge peut maintenant commencer sans risque pour l'index publié.")

    purge(session, state)

    print()
    print("==================================================")
    print(" CGINDEX002 TERMINE")
    print("==================================================")
    print("✅ Delta compacté dans l'index statique.")
    print("✅ Index poussé sur GitHub.")
    print("✅ Hosting déployé.")
    print("✅ Purge contrôlée terminée.")
    print(f"✅ Sauvegardes conservées dans : {DOWNLOAD}")


def cmd_resume(args):
    state = load_state()
    api_key = args.api_key or find_api_key()
    if not api_key:
        raise SystemExit("ERREUR : apiKey Firebase introuvable.")

    session = authenticate(api_key)

    if state.get("phase") == "prepared":
        git_push_and_deploy()
        purge(session, state)
    elif state.get("phase") in ("purge_partial",):
        purge(session, state)
    else:
        print("INFO : aucun travail CGINDEX002 à reprendre.")


def cmd_status(_args):
    if not STATE.exists():
        print("Aucun état CGINDEX002 enregistré.")
        return

    state = load_state()
    print(json.dumps(
        {
            "phase": state.get("phase"),
            "created_at": state.get("created_at"),
            "finished_at": state.get("finished_at"),
            "delta_count": state.get("delta_count"),
            "purged_count": state.get("purged_count"),
            "preserved_changed_count": state.get("preserved_changed_count"),
            "remaining_delta_count": state.get("remaining_delta_count"),
            "index_backup": state.get("index_backup"),
            "delta_backup": state.get("delta_backup"),
        },
        ensure_ascii=False,
        indent=2,
    ))


def cmd_selftest(_args):
    with tempfile.TemporaryDirectory(prefix="cgindex002_selftest_") as td:
        td = Path(td)
        idx = td / "idx"
        idx.mkdir()

        write_json_compact(idx / "ab.json", {
            "abc": ["1", "2"],
            "abeille": ["2"],
        })
        write_json_compact(idx / "xy.json", {
            "xyz": ["3"],
        })

        # Test logique locale de retrait + ajout, sans réseau.
        delta_ids = {"2", "3"}
        additions = {"ab": {"abc": ["2"]}, "no": {"nouveau": ["2"]}}

        for path in list(idx.glob("*.json")):
            data = load_json(path)
            for token in list(data):
                data[token] = [x for x in data[token] if x not in delta_ids]
                if not data[token]:
                    del data[token]
            if data:
                write_json_compact(path, data)
            else:
                path.unlink()

        for prefix, rows in additions.items():
            path = idx / f"{prefix}.json"
            data = load_json(path) if path.exists() else {}
            for token, ids in rows.items():
                data[token] = list(dict.fromkeys(data.get(token, []) + ids))
            write_json_compact(path, data)

        assert load_json(idx / "ab.json") == {"abc": ["1", "2"]}
        assert load_json(idx / "no.json") == {"nouveau": ["2"]}
        assert not (idx / "xy.json").exists()

    print("✅ CGINDEX002 selftest OK")


def main():
    p = argparse.ArgumentParser(
        description="CGINDEX002 — compactage/purge contrôlée de question_search_delta"
    )
    p.add_argument("--api-key", default=None)

    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("all")
    sub.add_parser("resume")
    sub.add_parser("status")
    sub.add_parser("selftest")

    args = p.parse_args()

    if args.cmd == "all":
        cmd_all(args)
    elif args.cmd == "resume":
        cmd_resume(args)
    elif args.cmd == "status":
        cmd_status(args)
    elif args.cmd == "selftest":
        cmd_selftest(args)


if __name__ == "__main__":
    main()
