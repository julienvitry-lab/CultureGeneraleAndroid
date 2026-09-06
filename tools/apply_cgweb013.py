#!/usr/bin/env python3
from pathlib import Path
import re

INDEX = Path("web/public/index.html")
JS = Path("web/public/cgweb013.js")
CSS = Path("web/public/cgweb013.css")
REPORT = Path("web/public/cgweb013_quality.json")

for p in (INDEX, JS, CSS, REPORT):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

index = INDEX.read_text(encoding="utf-8")

if "cgweb013.css" not in index:
    p = index.lower().rfind("</head>")
    if p < 0:
        raise SystemExit("ERREUR : </head> introuvable")
    index = (
        index[:p]
        + '\n<link rel="stylesheet" href="./cgweb013.css?v=CGWEB013_1">\n'
        + index[p:]
    )

if "cgweb013.js" not in index:
    p = index.lower().rfind("</body>")
    if p < 0:
        raise SystemExit("ERREUR : </body> introuvable")
    index = (
        index[:p]
        + '\n<script type="module" src="./cgweb013.js?v=CGWEB013_1"></script>\n'
        + index[p:]
    )

INDEX.write_text(index, encoding="utf-8")

checks = {
    "JS": "cgweb013.js?v=CGWEB013_1" in INDEX.read_text(encoding="utf-8"),
    "CSS": "cgweb013.css?v=CGWEB013_1" in INDEX.read_text(encoding="utf-8"),
    "REPORT": REPORT.stat().st_size > 100,
}
bad = [k for k,v in checks.items() if not v]

if bad:
    raise SystemExit("ERREUR vérification CGWEB013 : " + ", ".join(bad))

print()
print("==================================================")
print(" CGWEB013 PATCH OK")
print("==================================================")
print("Contrôle qualité Web prêt.")
