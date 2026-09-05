#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

DOMAINS = [
    "Animaux et Plantes", "Culture Classique", "Culture Générale", "Culture Moderne",
    "Géographie", "Histoire", "Sciences et Techniques", "Sport"
]
WANTED = [
    "row_number", "original_id", "megatheme", "theme", "question", "detail",
    "proposition_a", "proposition_b", "proposition_c", "proposition_d",
    "correct_index", "url_quizypedia", "url_internet", "image_file",
    "non_trouve", "status", "is_image"
]

def find_db():
    home = Path.home()
    candidates = [
        home / "storage/shared/Culture Générale/questions_base.sqlite",
        home / "storage/shared/Culture Generale/questions_base.sqlite",
        Path("/storage/emulated/0/Culture Générale/questions_base.sqlite"),
        Path("/storage/emulated/0/Culture Generale/questions_base.sqlite"),
    ]
    for p in candidates:
        if p.exists():
            return p
    shared = home / "storage/shared"
    if shared.exists():
        hits = list(shared.glob("**/questions_base.sqlite"))
        if hits:
            return hits[0]
    raise SystemExit("ERREUR: questions_base.sqlite introuvable dans le stockage partagé Android.")

def clean_value(v):
    if v is None:
        return ""
    return v

def main():
    db_path = find_db()
    out_path = Path.home() / "storage/downloads/CGCLOUD002_100_QUESTIONS.json"

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cols = {r[1] for r in conn.execute("PRAGMA table_info(questions)")}
    if not cols:
        raise SystemExit("ERREUR: table 'questions' introuvable dans SQLite.")

    select_parts = []
    for name in WANTED:
        if name in cols:
            select_parts.append(name)
        else:
            select_parts.append(f"NULL AS {name}")
    select_sql = ", ".join(select_parts)

    oid_filter = "AND TRIM(COALESCE(CAST(original_id AS TEXT),''))<>''" if "original_id" in cols else ""
    picked = []
    seen = set()

    def add_rows(rows):
        for r in rows:
            q = {k: clean_value(r[k]) for k in WANTED}
            row_no = q.get("row_number")
            oid = str(q.get("original_id") or "").strip()
            key = oid if oid else f"row_{row_no}"
            if not key or key in seen:
                continue
            seen.add(key)
            q["document_id"] = key.replace("/", "_")
            # Normalisations de types utiles à Firestore.
            for k in ("row_number", "correct_index", "is_image"):
                try:
                    if q[k] != "":
                        q[k] = int(q[k])
                except Exception:
                    pass
            picked.append(q)
            if len(picked) >= 100:
                return True
        return False

    # Échantillon volontairement réparti entre les 8 mégathèmes.
    if "megatheme" in cols:
        for domain in DOMAINS:
            rows = conn.execute(
                f"SELECT {select_sql} FROM questions WHERE TRIM(COALESCE(megatheme,''))=? {oid_filter} ORDER BY row_number LIMIT 13",
                (domain,)
            ).fetchall()
            if add_rows(rows):
                break

    # Complément jusqu'à 100 si un mégathème a moins de 13 lignes.
    if len(picked) < 100:
        rows = conn.execute(
            f"SELECT {select_sql} FROM questions WHERE 1=1 {oid_filter} ORDER BY row_number"
        ).fetchall()
        add_rows(rows)

    conn.close()

    if len(picked) < 100:
        raise SystemExit(f"ERREUR: seulement {len(picked)} questions exploitables trouvées.")

    payload = {
        "schema": "CGCLOUD002.questions.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(picked),
        "questions": picked,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = {}
    for q in picked:
        d = str(q.get("megatheme") or "")
        counts[d] = counts.get(d, 0) + 1

    print("=== CGCLOUD002 EXPORT OK ===")
    print(f"SQLite : {db_path}")
    print(f"JSON   : {out_path}")
    print(f"Questions : {len(picked)}")
    for d in DOMAINS:
        if counts.get(d):
            print(f"  - {d}: {counts[d]}")

if __name__ == "__main__":
    main()
