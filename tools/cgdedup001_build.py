#!/usr/bin/env python3
# CGDEDUP001 — construction du catalogue de doublons exacts depuis SQLite.
#
# Aucun accès Firestore et aucune écriture SQLite.
# Le rapport Web ne contient que les groupes/IDs et quelques indicateurs,
# jamais la base complète.

from pathlib import Path
import sqlite3
import json
import re
import unicodedata
import hashlib
from datetime import datetime, timezone
from collections import defaultdict

BASE = Path("/storage/emulated/0/Culture Générale")
CANDIDATES = [
    BASE / "questions_base.sqlite",
    BASE / "questions_base.sqlite.HOLD_FIX2_TEST",
    BASE / "questions_base.sqlite.BACKUP_CGBOOT001",
]
OUT = Path("web/public/cgdedup001_pairs.json")

FIELDS = (
    "megatheme", "theme", "question", "detail",
    "proposition_a", "proposition_b", "proposition_c", "proposition_d",
    "correct_index", "url_quizypedia", "url_internet",
    "image_file", "non_trouve", "status", "is_image"
)

def inspect(path):
    if not path.exists():
        return None
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='questions'")
        if cur.fetchone() is None:
            con.close()
            return None
        cur.execute("SELECT COUNT(*) FROM questions")
        count = int(cur.fetchone()[0])
        cur.execute("PRAGMA integrity_check")
        integrity = str(cur.fetchone()[0]).lower()
        con.close()
        return count if integrity == "ok" else None
    except Exception:
        return None

def norm(value):
    text = unicodedata.normalize("NFD", str(value or "").strip())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"\s+", " ", text.casefold()).strip()
    return text

def clean_id(value):
    s = str(value if value is not None else "").strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        s = s[1:-1].strip()
    return s

valid = []
for p in CANDIDATES:
    n = inspect(p)
    if n is not None:
        valid.append((n, p))

if not valid:
    raise SystemExit("ERREUR : aucune base SQLite exploitable trouvée.")

valid.sort(reverse=True, key=lambda item: item[0])
question_count, db = valid[0]

if question_count < 200000:
    raise SystemExit(f"ERREUR : base incomplète ({question_count} questions).")

print("==================================================")
print(" CGDEDUP001 — CATALOGUE DES DOUBLONS")
print("==================================================")
print(f"Base      : {db}")
print(f"Questions : {question_count}")

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
cur = con.cursor()

cur.execute("""
SELECT original_id, megatheme, theme, question, detail,
       proposition_a, proposition_b, proposition_c, proposition_d,
       correct_index, url_quizypedia, url_internet,
       image_file, non_trouve, status, is_image
FROM questions
ORDER BY row_number
""")

groups = defaultdict(list)
snapshots = {}

for index, row in enumerate(cur, start=1):
    qid = clean_id(row[0])
    qtext = str(row[3] or "").strip()
    signature = norm(qtext)

    if qid and signature:
        groups[signature].append(qid)

        content = {FIELDS[i]: row[i + 1] for i in range(len(FIELDS))}
        content_signature = json.dumps(
            {k: norm(v) for k, v in content.items()},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":")
        )
        snapshots[qid] = {
            "content_hash": hashlib.sha1(
                content_signature.encode("utf-8")
            ).hexdigest()[:12],
            "filled_fields": sum(
                1 for key, value in content.items()
                if key != "question" and str(value or "").strip()
            ),
        }

    if index % 25000 == 0:
        print(f"Analyse   : {index} / {question_count}")

con.close()

result = []
question_in_groups = 0
exact_content_groups = 0

for signature, ids in groups.items():
    if len(ids) < 2:
        continue

    unique_ids = list(dict.fromkeys(ids))
    if len(unique_ids) < 2:
        continue

    hashes = {snapshots[qid]["content_hash"] for qid in unique_ids}
    exact_content = len(hashes) == 1
    if exact_content:
        exact_content_groups += 1

    group_id = hashlib.sha1(
        (signature + "\x1f" + "\x1f".join(unique_ids)).encode("utf-8")
    ).hexdigest()[:16]

    result.append({
        "group_id": group_id,
        "question": signature,
        "ids": unique_ids,
        "size": len(unique_ids),
        "exact_content": exact_content,
        "filled_fields": {
            qid: snapshots[qid]["filled_fields"]
            for qid in unique_ids
        },
    })
    question_in_groups += len(unique_ids)

result.sort(
    key=lambda g: (
        0 if g["exact_content"] else 1,
        -g["size"],
        g["question"],
    )
)

payload = {
    "version": "CGDEDUP001_1",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "source_db": db.name,
    "question_count": question_count,
    "duplicate_group_count": len(result),
    "duplicate_question_count": question_in_groups,
    "exact_content_group_count": exact_content_groups,
    "definition": "Même texte de question après trim, casefold et normalisation des accents.",
    "groups": result,
}

OUT.write_text(
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8"
)

print()
print(f"Groupes doublons       : {len(result)}")
print(f"Questions concernées   : {question_in_groups}")
print(f"Groupes contenu identique : {exact_content_groups}")
print(f"Rapport                : {OUT}")
print("✅ CGDEDUP001 catalogue généré.")
