#!/usr/bin/env python3
from pathlib import Path
import re

APP = Path("web/public/app.js")
INDEX = Path("web/public/index.html")
JS = Path("web/public/cgsync005.js")
CSS = Path("web/public/cgsync005.css")

for p in (APP, INDEX, JS, CSS):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

app = APP.read_text(encoding="utf-8")

needed = ["getCountFromServer", "orderBy", "limit", "getDocs", "query", "collection"]
imports = list(re.finditer(
    r'import\s*\{(?P<body>.*?)\}\s*from\s*(?P<q>["\'])(?P<src>[^"\']*firebase-firestore[^"\']*)(?P=q)\s*;',
    app, re.S
))
if not imports:
    raise SystemExit("ERREUR : import Firestore introuvable dans app.js")

imp = imports[0]
body = imp.group("body")
present = set(re.findall(r'\b[A-Za-z_$][A-Za-z0-9_$]*\b', body))
missing = [name for name in needed if name not in present]

if missing:
    new_body = body.rstrip()
    if new_body and not new_body.endswith(","):
        new_body += ","
    new_body += "\n  " + ", ".join(missing) + "\n"
    app = app[:imp.start("body")] + new_body + app[imp.end("body"):]
    print("OK : imports CGSYNC005 ajoutés :", ", ".join(missing))

if "CGSYNC005_API_START" not in app:
    api = """

// CGSYNC005_API_START
window.CGSYNC005_API = {
  health: async () => {
    const u = auth.currentUser;
    if (!u) return { authenticated: false };

    const questionsRef = collection(db, "users", u.uid, "questions");
    const tombstonesRef = collection(db, "users", u.uid, "question_tombstones");
    const deltaRef = collection(db, "users", u.uid, "question_search_delta");

    const [
      questionsCount,
      tombstonesCount,
      deltaCount,
      latestQuestion,
      latestTombstone,
      latestDelta
    ] = await Promise.all([
      getCountFromServer(questionsRef),
      getCountFromServer(tombstonesRef),
      getCountFromServer(deltaRef),
      getDocs(query(questionsRef, orderBy("cg_updated_at", "desc"), limit(1))).catch(() => ({ docs: [] })),
      getDocs(query(tombstonesRef, orderBy("deleted_at", "desc"), limit(1))).catch(() => ({ docs: [] })),
      getDocs(query(deltaRef, orderBy("cgindex_updated_at", "desc"), limit(1))).catch(() => ({ docs: [] }))
    ]);

    const first = snap => snap?.docs?.[0]?.data?.() || {};

    return {
      authenticated: true,
      uid: u.uid,
      questions_count: questionsCount.data().count,
      tombstones_count: tombstonesCount.data().count,
      delta_count: deltaCount.data().count,
      latest_question_update: first(latestQuestion).cg_updated_at || null,
      latest_tombstone: first(latestTombstone).deleted_at || null,
      latest_delta_update: first(latestDelta).cgindex_updated_at || null
    };
  }
};
// CGSYNC005_API_END
"""
    pos = app.find("// CGINDEX001_HELPERS_START")
    if pos < 0:
        pos = len(app)
    app = app[:pos] + api + "\n" + app[pos:]
    print("OK : API CGSYNC005 ajoutée")

APP.write_text(app, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")

if "cgsync005.css" not in index:
    p = index.lower().rfind("</head>")
    if p < 0:
        raise SystemExit("ERREUR : </head> introuvable")
    index = index[:p] + '\n<link rel="stylesheet" href="./cgsync005.css?v=CGSYNC005_1">\n' + index[p:]

if "cgsync005.js" not in index:
    p = index.lower().rfind("</body>")
    if p < 0:
        raise SystemExit("ERREUR : </body> introuvable")
    index = index[:p] + '\n<script type="module" src="./cgsync005.js?v=CGSYNC005_1"></script>\n' + index[p:]

index, n = re.subn(
    r'src=(["\'])(?:\./)?app\.js(?:\?v=[^"\']*)?\1',
    'src="./app.js?v=CGSYNC005_1"',
    index, count=1
)
if not n:
    raise SystemExit("ERREUR : app.js introuvable dans index.html")

INDEX.write_text(index, encoding="utf-8")

checks = {
    "API": "CGSYNC005_API_START" in APP.read_text(encoding="utf-8"),
    "JS": "cgsync005.js?v=CGSYNC005_1" in INDEX.read_text(encoding="utf-8"),
    "CSS": "cgsync005.css?v=CGSYNC005_1" in INDEX.read_text(encoding="utf-8"),
}
bad = [k for k, v in checks.items() if not v]
if bad:
    raise SystemExit("ERREUR vérification CGSYNC005 : " + ", ".join(bad))

print()
print("==================================================")
print(" CGSYNC005 PATCH OK")
print("==================================================")
print("Tableau de santé Cloud/Web prêt.")
