#!/usr/bin/env python3
from pathlib import Path
import re

PUBLIC=Path("web/public")
APP=PUBLIC/"app.js"
INDEX=PUBLIC/"index.html"
CG6=PUBLIC/"cgweb006.js"
CSS=PUBLIC/"cgweb006.css"
FRAG=Path("tools/.cgweb006_fragment.tmp")
BRIDGE=Path("tools/.cgweb006_bridge.tmp")

for p in (APP,INDEX,CG6,CSS,FRAG,BRIDGE):
    if not p.exists():
        raise SystemExit(f"ERREUR: fichier introuvable: {p}")

app=APP.read_text(encoding="utf-8")
needed=["collection","query","where","orderBy","documentId","limit","startAfter","startAt","endAt","getDocs","getDoc","doc","getCountFromServer","updateDoc","serverTimestamp"]
imports=list(re.finditer(r'import\s*\{(?P<body>.*?)\}\s*from\s*(?P<q>["\'])(?P<src>[^"\']*firebase-firestore[^"\']*)(?P=q)\s*;',app,re.S))
if not imports:
    raise SystemExit("ERREUR: import Firebase Firestore introuvable dans app.js")
imp=imports[0]
body=imp.group("body")
present=set(re.findall(r'\b[A-Za-z_$][A-Za-z0-9_$]*\b',body))
missing=[x for x in needed if x not in present]
if missing:
    nb=body.rstrip()
    if nb and not nb.endswith(","): nb+=","
    nb+="\n  "+", ".join(missing)+"\n"
    app=app[:imp.start("body")]+nb+app[imp.end("body"):]
    print("OK: imports Firestore ajoutés :",", ".join(missing))

if "CGWEB006_BRIDGE_START" not in app:
    app += "\n" + BRIDGE.read_text(encoding="utf-8") + "\n"
    print("OK: bridge CGWEB006 ajouté")
APP.write_text(app,encoding="utf-8")

index=INDEX.read_text(encoding="utf-8")
if 'id="cgweb006Panel"' not in index:
    p=index.lower().rfind("</body>")
    if p<0: raise SystemExit("ERREUR: </body> introuvable")
    index=index[:p]+"\n"+FRAG.read_text(encoding="utf-8")+"\n"+index[p:]
    print("OK: interface CGWEB006 ajoutée")
if "cgweb006.css" not in index:
    p=index.lower().rfind("</head>")
    if p<0: raise SystemExit("ERREUR: </head> introuvable")
    index=index[:p]+'\n<link rel="stylesheet" href="./cgweb006.css?v=CGWEB006_1">\n'+index[p:]
if "cgweb006.js" not in index:
    p=index.lower().rfind("</body>")
    index=index[:p]+'\n<script type="module" src="./cgweb006.js?v=CGWEB006_1"></script>\n'+index[p:]
index,n=re.subn(r'src=(["\'])(?:\./)?app\.js(?:\?v=[^"\']*)?\1','src="./app.js?v=CGWEB006_1"',index,count=1)
if not n: raise SystemExit("ERREUR: balise app.js introuvable")
INDEX.write_text(index,encoding="utf-8")

checks={
"bridge":"CGWEB006_BRIDGE_START" in APP.read_text(encoding="utf-8"),
"panel":'id="cgweb006Panel"' in INDEX.read_text(encoding="utf-8"),
"script":"cgweb006.js?v=CGWEB006_1" in INDEX.read_text(encoding="utf-8"),
"css":"cgweb006.css?v=CGWEB006_1" in INDEX.read_text(encoding="utf-8"),
"count":"getCountFromServer" in APP.read_text(encoding="utf-8"),
"stamp":"cg_updated_at:serverTimestamp()" in APP.read_text(encoding="utf-8"),
}
bad=[k for k,v in checks.items() if not v]
if bad: raise SystemExit("ERREUR contrôles CGWEB006: "+", ".join(bad))
print()
print("==================================================")
print(" CGWEB006 PATCH OK")
print("==================================================")
print("Répertoire complet Firestore prêt.")
