#!/usr/bin/env python3
# CGBACKUP001 — sauvegarde/restauration Firestore sécurisée
#
# Objectif :
#   - sauvegarder les collections principales Culture Générale dans un .jsonl.gz
#   - produire un manifeste + SHA-256
#   - restauration possible uniquement avec --restore + confirmation explicite
#   - --dry-run disponible pour valider un fichier sans écrire
#
# Dépendances : Python stdlib uniquement.

from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

PROJECT_DEFAULT = "culturegeneralesync"
COLLECTIONS_DEFAULT = [
    "questions",
    "question_tombstones",
    "question_search_delta",
]

ROOT = Path.cwd()
BACKUP_DIR = ROOT / "backups" / "CGBACKUP001"

def http_json(url, *, method="GET", headers=None, body=None, timeout=60):
    headers = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json; charset=utf-8")

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} sur {url}\n{raw[:1000]}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Erreur réseau : {e}") from None

def find_web_api_key():
    candidates = [
        ROOT / "web" / "public" / "app.js",
        ROOT / "web" / "public" / "firebase-config.js",
        ROOT / "app" / "google-services.json",
    ]

    for p in candidates:
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")

        # app.js / config JS
        m = re.search(r'apiKey\s*:\s*["\']([^"\']+)["\']', text)
        if m:
            return m.group(1)

        # google-services.json
        if p.name == "google-services.json":
            try:
                data = json.loads(text)
                for client in data.get("client", []):
                    for key in client.get("api_key", []):
                        value = key.get("current_key")
                        if value:
                            return value
            except Exception:
                pass

    return None

def ask_credentials(api_key):
    email = os.environ.get("CGBACKUP_FIREBASE_EMAIL") or input("E-mail Firebase : ").strip()
    if not email:
        raise SystemExit("ERREUR : e-mail Firebase vide.")

    import getpass
    password = os.environ.get("CGBACKUP_FIREBASE_PASSWORD") or getpass.getpass(
        "Mot de passe Firebase (non affiché) : "
    )
    if not password:
        raise SystemExit("ERREUR : mot de passe Firebase vide.")

    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={urllib.parse.quote(api_key)}"
    )
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True,
    }

    data = http_json(url, method="POST", body=payload)
    token = data.get("idToken")
    uid = data.get("localId")

    if not token or not uid:
        raise RuntimeError("Authentification Firebase incomplète.")

    return email, uid, token

def doc_url(project, uid, collection, doc_id=None):
    base = (
        f"https://firestore.googleapis.com/v1/projects/{project}"
        "/databases/(default)/documents"
        f"/users/{urllib.parse.quote(uid)}/{urllib.parse.quote(collection)}"
    )
    if doc_id is not None:
        return base + "/" + urllib.parse.quote(str(doc_id), safe="")
    return base

def list_collection(project, uid, token, collection, page_size=1000):
    page_token = None
    count = 0

    while True:
        params = {
            "pageSize": str(page_size),
            "orderBy": "__name__",
        }
        if page_token:
            params["pageToken"] = page_token

        url = doc_url(project, uid, collection) + "?" + urllib.parse.urlencode(params)
        data = http_json(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=120,
        )

        docs = data.get("documents", [])
        for d in docs:
            count += 1
            yield d

        page_token = data.get("nextPageToken")
        if not page_token:
            break

def firestore_value_to_python(v):
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
    if "timestampValue" in v:
        return {"__firestore_timestamp__": v["timestampValue"]}
    if "stringValue" in v:
        return v["stringValue"]
    if "bytesValue" in v:
        return {"__firestore_bytes__": v["bytesValue"]}
    if "referenceValue" in v:
        return {"__firestore_reference__": v["referenceValue"]}
    if "geoPointValue" in v:
        return {"__firestore_geo__": v["geoPointValue"]}
    if "arrayValue" in v:
        return [
            firestore_value_to_python(x)
            for x in v.get("arrayValue", {}).get("values", [])
        ]
    if "mapValue" in v:
        return {
            k: firestore_value_to_python(x)
            for k, x in v.get("mapValue", {}).get("fields", {}).items()
        }
    return v

def python_to_firestore_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int) and not isinstance(v, bool):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [python_to_firestore_value(x) for x in v]}}
    if isinstance(v, dict):
        if set(v.keys()) == {"__firestore_timestamp__"}:
            return {"timestampValue": v["__firestore_timestamp__"]}
        if set(v.keys()) == {"__firestore_bytes__"}:
            return {"bytesValue": v["__firestore_bytes__"]}
        if set(v.keys()) == {"__firestore_reference__"}:
            return {"referenceValue": v["__firestore_reference__"]}
        if set(v.keys()) == {"__firestore_geo__"}:
            return {"geoPointValue": v["__firestore_geo__"]}
        return {
            "mapValue": {
                "fields": {k: python_to_firestore_value(x) for k, x in v.items()}
            }
        }
    return {"stringValue": str(v)}

def document_to_record(doc, collection):
    name = doc.get("name", "")
    doc_id = name.rsplit("/", 1)[-1]
    fields = {
        k: firestore_value_to_python(v)
        for k, v in doc.get("fields", {}).items()
    }

    return {
        "collection": collection,
        "id": doc_id,
        "createTime": doc.get("createTime"),
        "updateTime": doc.get("updateTime"),
        "fields": fields,
    }

def record_to_document(record):
    return {
        "fields": {
            k: python_to_firestore_value(v)
            for k, v in (record.get("fields") or {}).items()
        }
    }

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def backup(args):
    api_key = args.api_key or find_web_api_key()
    if not api_key:
        raise SystemExit(
            "ERREUR : apiKey Firebase introuvable. "
            "Utilise --api-key <clé>."
        )

    email, uid, token = ask_credentials(api_key)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    out = BACKUP_DIR / f"culturegeneralesync_{uid}_{ts}.jsonl.gz"
    manifest = BACKUP_DIR / f"culturegeneralesync_{uid}_{ts}.manifest.json"

    counts = {}
    total = 0

    print()
    print("==================================================")
    print(" CGBACKUP001 — SAUVEGARDE FIRESTORE")
    print("==================================================")
    print(f"Projet      : {args.project}")
    print(f"Utilisateur : {email}")
    print(f"UID         : {uid}")
    print(f"Collections : {', '.join(args.collections)}")
    print(f"Destination : {out}")
    print()

    with gzip.open(out, "wt", encoding="utf-8") as gz:
        for collection in args.collections:
            n = 0

            for doc in list_collection(
                args.project,
                uid,
                token,
                collection,
                page_size=args.page_size,
            ):
                rec = document_to_record(doc, collection)
                gz.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
                gz.write("\n")

                n += 1
                total += 1

                if n % 5000 == 0:
                    print(f"  {collection:<24} {n:>8} documents")

            counts[collection] = n
            print(f"✅ {collection:<24} {n:>8} documents")

    digest = sha256_file(out)

    manifest_data = {
        "format": "CGBACKUP001",
        "version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "project": args.project,
        "uid": uid,
        "email": email,
        "collections": counts,
        "total_documents": total,
        "backup_file": out.name,
        "sha256": digest,
    }

    manifest.write_text(
        json.dumps(manifest_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("==================================================")
    print(" SAUVEGARDE TERMINEE")
    print("==================================================")
    print(f"Documents : {total}")
    print(f"Archive   : {out}")
    print(f"Manifeste : {manifest}")
    print(f"SHA-256   : {digest}")
    print()
    print("✅ CGBACKUP001 sauvegarde valide.")

def read_backup(path):
    path = Path(path)
    if not path.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {path}")

    records = []
    counts = {}

    with gzip.open(path, "rt", encoding="utf-8") as gz:
        for line_no, line in enumerate(gz, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                rec = json.loads(line)
            except Exception as e:
                raise SystemExit(
                    f"ERREUR JSON ligne {line_no} : {e}"
                )

            collection = rec.get("collection")
            doc_id = rec.get("id")
            fields = rec.get("fields")

            if not collection or not doc_id or not isinstance(fields, dict):
                raise SystemExit(
                    f"ERREUR format ligne {line_no} : record incomplet"
                )

            counts[collection] = counts.get(collection, 0) + 1
            records.append(rec)

    return records, counts

def validate_backup(args):
    records, counts = read_backup(args.file)

    print("==================================================")
    print(" CGBACKUP001 — VALIDATION")
    print("==================================================")
    print(f"Fichier    : {args.file}")
    print(f"Documents  : {len(records)}")
    for c, n in sorted(counts.items()):
        print(f"  {c:<24} {n:>8}")

    print(f"SHA-256    : {sha256_file(args.file)}")
    print("✅ Archive lisible et structure valide.")

def restore(args):
    api_key = args.api_key or find_web_api_key()
    if not api_key:
        raise SystemExit("ERREUR : apiKey Firebase introuvable.")

    records, counts = read_backup(args.file)

    print("==================================================")
    print(" CGBACKUP001 — RESTAURATION")
    print("==================================================")
    print(f"Archive    : {args.file}")
    print(f"Documents  : {len(records)}")
    for c, n in sorted(counts.items()):
        print(f"  {c:<24} {n:>8}")

    if args.dry_run:
        print()
        print("✅ DRY-RUN : aucune écriture Firestore effectuée.")
        return

    email, uid, token = ask_credentials(api_key)

    print()
    print(f"Projet cible : {args.project}")
    print(f"Utilisateur  : {email}")
    print(f"UID cible    : {uid}")
    print()
    print("ATTENTION : cette restauration fait des UPSERT.")
    print("Elle n'efface pas les documents absents de la sauvegarde.")
    print()

    phrase = input('Tape exactement "RESTAURER" pour continuer : ').strip()
    if phrase != "RESTAURER":
        raise SystemExit("Restauration annulée.")

    restored = 0
    failures = 0

    for rec in records:
        collection = rec["collection"]
        doc_id = rec["id"]
        body = record_to_document(rec)

        url = doc_url(args.project, uid, collection, doc_id)

        try:
            http_json(
                url,
                method="PATCH",
                headers={"Authorization": f"Bearer {token}"},
                body=body,
                timeout=120,
            )
            restored += 1
        except Exception as e:
            failures += 1
            print(f"⚠️ {collection}/{doc_id} : {e}", file=sys.stderr)

        if restored and restored % 1000 == 0:
            print(f"✅ {restored} restaurés")

        if args.rate_limit > 0:
            time.sleep(args.rate_limit)

    print()
    print("==================================================")
    print(" RESTAURATION TERMINEE")
    print("==================================================")
    print(f"Réussites : {restored}")
    print(f"Échecs    : {failures}")

    if failures:
        raise SystemExit(2)

    print("✅ CGBACKUP001 restauration terminée sans échec.")

def main():
    p = argparse.ArgumentParser(
        description="CGBACKUP001 — backup/restore Firestore Culture Générale"
    )

    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--project", default=PROJECT_DEFAULT)
    common.add_argument("--api-key", default=None)

    b = sub.add_parser("backup", parents=[common])
    b.add_argument(
        "--collections",
        nargs="+",
        default=COLLECTIONS_DEFAULT,
    )
    b.add_argument("--page-size", type=int, default=1000)
    b.set_defaults(func=backup)

    v = sub.add_parser("validate")
    v.add_argument("file")
    v.set_defaults(func=validate_backup)

    r = sub.add_parser("restore", parents=[common])
    r.add_argument("file")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument(
        "--rate-limit",
        type=float,
        default=0.0,
        help="Pause en secondes entre écritures REST",
    )
    r.set_defaults(func=restore)

    args = p.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
