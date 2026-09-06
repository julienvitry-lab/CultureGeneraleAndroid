#!/usr/bin/env python3
from pathlib import Path
import sqlite3, json
from datetime import datetime, timezone

BASE = Path("/storage/emulated/0/Culture Générale")
CANDIDATES = [
    BASE / "questions_base.sqlite",
    BASE / "questions_base.sqlite.HOLD_FIX2_TEST",
    BASE / "questions_base.sqlite.BACKUP_CGBOOT001",
]
OUT = Path("web/public/cgweb008_catalog.json")

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
count, db = valid[0]

if count < 200000:
    raise SystemExit(f"ERREUR : base incomplète ({count} questions).")

print(f"Base retenue : {db}")
print(f"Questions    : {count}")

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
cur = con.cursor()
cur.execute("""
SELECT megatheme, theme, COUNT(*)
FROM questions
WHERE megatheme IS NOT NULL AND megatheme <> ''
  AND theme IS NOT NULL AND theme <> ''
GROUP BY megatheme, theme
ORDER BY megatheme COLLATE NOCASE, theme COLLATE NOCASE
""")

megas, counts = {}, {}
for mega, theme, n in cur.fetchall():
    mega, theme = str(mega), str(theme)
    megas.setdefault(mega, []).append(theme)
    counts.setdefault(mega, {})[theme] = int(n)
con.close()

payload = {
    "version": "CGWEB008_1",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "question_count": count,
    "theme_count": sum(len(v) for v in megas.values()),
    "megathemes": megas,
    "counts": counts,
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"Mégathèmes   : {len(megas)}")
print(f"Thèmes       : {payload['theme_count']}")
print(f"Sortie       : {OUT}")
print("OK : catalogue CGWEB008 généré.")
