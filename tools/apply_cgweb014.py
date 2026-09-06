#!/usr/bin/env python3
from pathlib import Path

INDEX = Path("web/public/index.html")
JS = Path("web/public/cgweb014.js")
CSS = Path("web/public/cgweb014.css")

for p in (INDEX, JS, CSS):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

index = INDEX.read_text(encoding="utf-8")

if "cgweb014.css" not in index:
    p = index.lower().rfind("</head>")
    if p < 0:
        raise SystemExit("ERREUR : </head> introuvable")
    index = (
        index[:p]
        + '\n<link rel="stylesheet" href="./cgweb014.css?v=CGWEB014_1">\n'
        + index[p:]
    )

if "cgweb014.js" not in index:
    p = index.lower().rfind("</body>")
    if p < 0:
        raise SystemExit("ERREUR : </body> introuvable")
    index = (
        index[:p]
        + '\n<script type="module" src="./cgweb014.js?v=CGWEB014_1"></script>\n'
        + index[p:]
    )

INDEX.write_text(index, encoding="utf-8")

checks = {
    "JS": "cgweb014.js?v=CGWEB014_1" in INDEX.read_text(encoding="utf-8"),
    "CSS": "cgweb014.css?v=CGWEB014_1" in INDEX.read_text(encoding="utf-8"),
}
bad = [k for k, v in checks.items() if not v]

if bad:
    raise SystemExit("ERREUR vérification CGWEB014 : " + ", ".join(bad))

print()
print("==================================================")
print(" CGWEB014 PATCH OK")
print("==================================================")
print("Sélection + modification en masse + export CSV prêts.")
