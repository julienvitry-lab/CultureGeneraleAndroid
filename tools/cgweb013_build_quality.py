#!/usr/bin/env python3
from pathlib import Path
import sqlite3, json, re
from datetime import datetime, timezone
from collections import Counter

BASE = Path("/storage/emulated/0/Culture Générale")
CANDIDATES = [
    BASE / "questions_base.sqlite",
    BASE / "questions_base.sqlite.HOLD_FIX2_TEST",
    BASE / "questions_base.sqlite.BACKUP_CGBOOT001",
]
OUT = Path("web/public/cgweb013_quality.json")
MAX_IDS = 500

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
        n = int(cur.fetchone()[0])
        con.close()
        return n
    except Exception:
        return None

valid = []
for p in CANDIDATES:
    n = inspect(p)
    if n is not None:
        valid.append((n, p))

if not valid:
    raise SystemExit("ERREUR : aucune base SQLite exploitable trouvée.")

valid.sort(reverse=True, key=lambda x: x[0])
question_count, db = valid[0]

if question_count < 200000:
    raise SystemExit(f"ERREUR : base incomplète ({question_count} questions).")

print("==================================================")
print(" CGWEB013 - CONTROLE QUALITE")
print("==================================================")
print(f"Base       : {db}")
print(f"Questions  : {question_count}")

issues = {
    "missing_question": {
        "label": "Question vide",
        "severity": "error",
        "description": "Le texte de la question est absent.",
        "count": 0, "ids": []
    },
    "missing_id": {
        "label": "ID manquant",
        "severity": "error",
        "description": "original_id est vide ou NULL.",
        "count": 0, "ids": []
    },
    "invalid_correct_index": {
        "label": "Réponse correcte invalide",
        "severity": "error",
        "description": "correct_index n'est pas compris entre 1 et 4.",
        "count": 0, "ids": []
    },
    "correct_answer_missing": {
        "label": "Bonne proposition absente",
        "severity": "error",
        "description": "La proposition désignée par correct_index est vide.",
        "count": 0, "ids": []
    },
    "incomplete_propositions": {
        "label": "Propositions incomplètes",
        "severity": "warn",
        "description": "Au moins une proposition A/B/C/D est vide.",
        "count": 0, "ids": []
    },
    "duplicate_propositions": {
        "label": "Propositions identiques",
        "severity": "warn",
        "description": "Deux propositions non vides sont exactement identiques dans la même question.",
        "count": 0, "ids": []
    },
    "missing_megatheme": {
        "label": "Mégathème absent",
        "severity": "warn",
        "description": "Le mégathème est vide.",
        "count": 0, "ids": []
    },
    "missing_theme": {
        "label": "Thème absent",
        "severity": "warn",
        "description": "Le thème est vide.",
        "count": 0, "ids": []
    },
    "image_flag_without_file": {
        "label": "Image déclarée sans fichier",
        "severity": "warn",
        "description": "is_image est actif mais image_file est vide.",
        "count": 0, "ids": []
    },
    "file_without_image_flag": {
        "label": "Fichier image non déclaré",
        "severity": "warn",
        "description": "image_file est renseigné alors que is_image n'est pas actif.",
        "count": 0, "ids": []
    },
    "exact_duplicate_question": {
        "label": "Doublons exacts potentiels",
        "severity": "warn",
        "description": "Même texte de question après trim et passage en minuscules.",
        "count": 0, "ids": []
    },
}

def add_issue(key, qid, problem_ids):
    item = issues[key]
    item["count"] += 1
    if len(item["ids"]) < MAX_IDS:
        item["ids"].append(str(qid))
    if qid not in (None, ""):
        problem_ids.add(str(qid))

def sval(v):
    return "" if v is None else str(v)

def blank(v):
    return not sval(v).strip()

def truthy(v):
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return v != 0
    return sval(v).strip().lower() in {"1","true","yes","oui","y"}

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
cur = con.cursor()

cur.execute("""
SELECT original_id, megatheme, theme, question, detail,
       proposition_a, proposition_b, proposition_c, proposition_d,
       correct_index, image_file, non_trouve, status, is_image
FROM questions
ORDER BY row_number
""")

problem_ids = set()
status_counts = Counter()
non_trouve_count = 0
empty_detail_count = 0

# Hash normalisé simple pour repérer les doublons exacts sans stocker tout le texte.
# On conserve la première occurrence puis on signale les suivantes.
seen_questions = {}
duplicate_first_ids = set()

for idx, row in enumerate(cur, start=1):
    (
        qid, megatheme, theme, question, detail,
        pa, pb, pc, pd,
        correct_index, image_file, non_trouve, status, is_image
    ) = row

    qid_display = sval(qid).strip() or f"ROW#{idx}"

    if blank(qid):
        add_issue("missing_id", qid_display, problem_ids)

    if blank(question):
        add_issue("missing_question", qid_display, problem_ids)

    if blank(megatheme):
        add_issue("missing_megatheme", qid_display, problem_ids)

    if blank(theme):
        add_issue("missing_theme", qid_display, problem_ids)

    props = [sval(pa).strip(), sval(pb).strip(), sval(pc).strip(), sval(pd).strip()]

    if any(not p for p in props):
        add_issue("incomplete_propositions", qid_display, problem_ids)

    nonempty_props = [p.casefold() for p in props if p]
    if len(nonempty_props) != len(set(nonempty_props)):
        add_issue("duplicate_propositions", qid_display, problem_ids)

    try:
        ci = int(correct_index)
    except Exception:
        ci = -1

    if ci < 1 or ci > 4:
        add_issue("invalid_correct_index", qid_display, problem_ids)
    elif not props[ci - 1]:
        add_issue("correct_answer_missing", qid_display, problem_ids)

    has_image_file = not blank(image_file)
    image_flag = truthy(is_image)

    if image_flag and not has_image_file:
        add_issue("image_flag_without_file", qid_display, problem_ids)
    if has_image_file and not image_flag:
        add_issue("file_without_image_flag", qid_display, problem_ids)

    if blank(detail):
        empty_detail_count += 1

    if truthy(non_trouve):
        non_trouve_count += 1

    status_counts[sval(status).strip() or "(vide)"] += 1

    qnorm = re.sub(r"\s+", " ", sval(question).strip().casefold())
    if qnorm:
        if qnorm in seen_questions:
            if qnorm not in duplicate_first_ids:
                first_id = seen_questions[qnorm]
                add_issue("exact_duplicate_question", first_id, problem_ids)
                duplicate_first_ids.add(qnorm)
            add_issue("exact_duplicate_question", qid_display, problem_ids)
        else:
            seen_questions[qnorm] = qid_display

    if idx % 25000 == 0:
        print(f"Analyse      : {idx} / {question_count}")

con.close()

problem_count = len(problem_ids)
clean_count = max(question_count - problem_count, 0)
quality_score = round((clean_count / question_count) * 100, 2) if question_count else 0.0

error_rows = sum(v["count"] for v in issues.values() if v["severity"] == "error")
warn_rows = sum(v["count"] for v in issues.values() if v["severity"] == "warn")

payload = {
    "version": "CGWEB013_1",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "source_db": db.name,
    "question_count": question_count,
    "clean_question_count": clean_count,
    "problem_question_count": problem_count,
    "quality_score": quality_score,
    "error_occurrences": error_rows,
    "warning_occurrences": warn_rows,
    "max_ids_per_issue": MAX_IDS,
    "issues": issues,
    "info": {
        "empty_detail_count": empty_detail_count,
        "non_trouve_count": non_trouve_count,
        "status_distribution": dict(status_counts.most_common())
    }
}

OUT.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print()
print(f"Questions OK : {clean_count}")
print(f"À vérifier   : {problem_count}")
print(f"Score qualité: {quality_score:.2f} %")
print(f"Erreurs      : {error_rows}")
print(f"Avertissements: {warn_rows}")
print(f"Rapport      : {OUT}")
print("✅ CGWEB013 rapport qualité généré.")
