#!/usr/bin/env python3
from pathlib import Path
import re

INDEX=Path("web/public/index.html")
CG6=Path("web/public/cgweb006.js")
CG8=Path("web/public/cgweb008.js")
CSS=Path("web/public/cgweb008.css")
CAT=Path("web/public/cgweb008_catalog.json")

for p in (INDEX,CG6,CG8,CSS,CAT):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

cg6=CG6.read_text(encoding="utf-8")

if "CGWEB008_RELOAD_BRIDGE_START" not in cg6:
    cg6 += "\n// CGWEB008_RELOAD_BRIDGE_START\n"
    cg6 += "window.CGWEB006_reload = async (reset = true) => {\n"
    cg6 += "  await load(Boolean(reset));\n"
    cg6 += "};\n"
    cg6 += "// CGWEB008_RELOAD_BRIDGE_END\n"
    CG6.write_text(cg6,encoding="utf-8")
    print("OK : bridge de rechargement ajouté")

index=INDEX.read_text(encoding="utf-8")
index,n=re.subn(
    r'src=([\"\'])(?:\./)?cgweb006\.js(?:\?v=[^\"\']*)?\1',
    'src="./cgweb006.js?v=CGWEB008_1"',
    index,
    count=1
)
if not n:
    raise SystemExit("ERREUR : cgweb006.js introuvable dans index.html")

if "cgweb008.css" not in index:
    p=index.lower().rfind("</head>")
    if p<0:
        raise SystemExit("ERREUR : </head> introuvable")
    index=index[:p]+'\n<link rel="stylesheet" href="./cgweb008.css?v=CGWEB008_1">\n'+index[p:]

if "cgweb008.js" not in index:
    p=index.lower().rfind("</body>")
    if p<0:
        raise SystemExit("ERREUR : </body> introuvable")
    index=index[:p]+'\n<script type="module" src="./cgweb008.js?v=CGWEB008_1"></script>\n'+index[p:]

INDEX.write_text(index,encoding="utf-8")

checks={
    "bridge":"CGWEB008_RELOAD_BRIDGE_START" in CG6.read_text(encoding="utf-8"),
    "cgweb006 cache":"cgweb006.js?v=CGWEB008_1" in INDEX.read_text(encoding="utf-8"),
    "cgweb008 js":"cgweb008.js?v=CGWEB008_1" in INDEX.read_text(encoding="utf-8"),
    "cgweb008 css":"cgweb008.css?v=CGWEB008_1" in INDEX.read_text(encoding="utf-8"),
}
bad=[k for k,v in checks.items() if not v]
if bad:
    raise SystemExit("ERREUR vérification : "+", ".join(bad))

print("CGWEB008 PATCH OK")
print("Mégathème -> thèmes dynamiques prêt.")
