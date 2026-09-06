#!/usr/bin/env python3
from pathlib import Path
import re

APP = Path("web/public/app.js")
INDEX = Path("web/public/index.html")
JS = Path("web/public/cgdedup001.js")
CSS = Path("web/public/cgdedup001.css")
REPORT = Path("web/public/cgdedup001_pairs.json")

for p in (APP, INDEX, JS, CSS, REPORT):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

app = APP.read_text(encoding="utf-8")
index = INDEX.read_text(encoding="utf-8")

print("==================================================")
print(" CGDEDUP001 - DEDUPLICATION ASSISTEE")
print("==================================================")

if "// CGSYNC007_CONFLICT_ENGINE_END" not in app:
    raise SystemExit(
        "ERREUR : CGSYNC007 introuvable. CGDEDUP001 exige la protection de conflits."
    )

if "// CGINDEX001_HELPERS_START" not in app:
    raise SystemExit(
        "ERREUR : CGINDEX001 introuvable. L'index live doit être disponible."
    )

engine_path = Path("tools/cgdedup001_api.jsfrag")
if not engine_path.exists():
    raise SystemExit("ERREUR : tools/cgdedup001_api.jsfrag introuvable.")

engine = engine_path.read_text(encoding="utf-8").rstrip() + "\n"

if "// CGDEDUP001_API_START" not in app:
    anchor = "// CGSYNC007_CONFLICT_ENGINE_END\n"
    app = app.replace(anchor, anchor + "\n" + engine, 1)
    print("OK : API transactionnelle CGDEDUP001 ajoutée")
else:
    print("INFO : API CGDEDUP001 déjà présente")

if "cgdedup001.css" not in index:
    pos = index.lower().rfind("</head>")
    if pos < 0:
        raise SystemExit("ERREUR : </head> introuvable")
    index = (
        index[:pos]
        + '\n<link rel="stylesheet" href="./cgdedup001.css?v=CGDEDUP001_1">\n'
        + index[pos:]
    )
    print("OK : CSS CGDEDUP001 raccordée")

if "cgdedup001.js" not in index:
    pos = index.lower().rfind("</body>")
    if pos < 0:
        raise SystemExit("ERREUR : </body> introuvable")
    index = (
        index[:pos]
        + '\n<script type="module" src="./cgdedup001.js?v=CGDEDUP001_1"></script>\n'
        + index[pos:]
    )
    print("OK : JS CGDEDUP001 raccordé")

APP.write_text(app, encoding="utf-8")
INDEX.write_text(index, encoding="utf-8")

checks = {
    "api": "// CGDEDUP001_API_START" in APP.read_text(encoding="utf-8"),
    "css": "cgdedup001.css?v=CGDEDUP001_1" in INDEX.read_text(encoding="utf-8"),
    "js": "cgdedup001.js?v=CGDEDUP001_1" in INDEX.read_text(encoding="utf-8"),
    "report": REPORT.stat().st_size > 50,
}

bad = [key for key, ok in checks.items() if not ok]
if bad:
    raise SystemExit("ERREUR vérification CGDEDUP001 : " + ", ".join(bad))

print()
print("==================================================")
print(" CGDEDUP001 PATCH OK")
print("==================================================")
print("• catalogue des doublons exacts")
print("• comparaison A / B côte à côte")
print("• conserver A ou B")
print("• fusion champ par champ vers A ou B")
print("• fusion + suppression atomiques")
print("• révisions CGSYNC007 vérifiées avant écriture")
print("• tombstone CGSYNC006")
print("• audit question_dedup_audit")
print("• delta CGINDEX001 mis à jour")
