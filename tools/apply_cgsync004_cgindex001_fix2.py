#!/usr/bin/env python3
from pathlib import Path
import re

ENGINE = Path("web/public/cgweb012.js")
APP = Path("web/public/app.js")
INDEX = Path("web/public/index.html")
JAVA = Path("app/src/main/java/fr/culturegenerale/android/MainActivity.java")
GRADLE = Path("app/build.gradle")
INDEX_JS = Path("web/public/cgindex001.js")
INDEX_CSS = Path("web/public/cgindex001.css")

for p in (ENGINE, APP, INDEX, JAVA, GRADLE, INDEX_JS, INDEX_CSS):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

engine = ENGINE.read_text(encoding="utf-8")

print("=== CGINDEX001 FIX2 / MOTEUR REEL ===")

apply_match = re.search(
    r'const\s+filtered\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)ApplyFilters\s*\(\s*rows\s*\)\s*;',
    engine
)
if not apply_match:
    apply_match = re.search(
        r'let\s+filtered\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)ApplyFilters\s*\(\s*rows\s*\)\s*;',
        engine
    )

if not apply_match:
    raise SystemExit(
        "ERREUR : ligne de filtrage plein texte introuvable "
        "(attendu : const filtered = ...ApplyFilters(rows);)"
    )

prefix = apply_match.group(1)
apply_name = prefix + "ApplyFilters"
normalize_name = prefix + "Normalize"

print(f"OK : préfixe moteur détecté : {prefix}")
print(f"OK : fonction filtre détectée : {apply_name}")

if "CGINDEX001_ROW_MATCH_START" not in engine:
    func_pos = engine.find(f"function {apply_name}")
    if func_pos < 0:
        func_pos = apply_match.start()

    helper = f'''
// CGINDEX001_ROW_MATCH_START
function cgindex001RowMatches(row, tokens) {{
  const text = {normalize_name}([
    row?.megatheme,
    row?.theme,
    row?.question,
    row?.detail,
    row?.proposition_a,
    row?.proposition_b,
    row?.proposition_c,
    row?.proposition_d
  ].filter(Boolean).join(" "));

  return (tokens || []).every(token => text.includes(token));
}}
// CGINDEX001_ROW_MATCH_END

'''
    engine = engine[:func_pos] + helper + engine[func_pos:]
    print("OK : validateur anti-index-périmé ajouté")
else:
    print("INFO : validateur anti-index-périmé déjà présent")

if "CGINDEX001_DELTA_SEARCH_START" not in engine:
    inter = re.search(
        r'const\s+ids\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)Intersect\s*\(\s*postings\s*\)\s*;',
        engine
    )
    if not inter:
        inter = re.search(
            r'let\s+ids\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)Intersect\s*\(\s*postings\s*\)\s*;',
            engine
        )

    if not inter:
        raise SystemExit(
            "ERREUR : intersection de l'index introuvable "
            "(attendu : const ids = ...Intersect(postings);)"
        )

    intersect_name = inter.group(1) + "Intersect"
    replacement = f'''let ids = {intersect_name}(postings);

    // CGINDEX001_DELTA_SEARCH_START
    try {{
      if (window.CGINDEX001_API?.searchDelta) {{
        const liveIds = await window.CGINDEX001_API.searchDelta(tokens);
        ids = [...new Set([
          ...ids.map(String),
          ...liveIds.map(String)
        ])];
      }}
    }} catch (deltaError) {{
      console.warn("CGINDEX001 searchDelta", deltaError);
    }}
    // CGINDEX001_DELTA_SEARCH_END'''

    engine = engine[:inter.start()] + replacement + engine[inter.end():]
    print(f"OK : delta live fusionné via {intersect_name}")
else:
    print("INFO : fusion delta live déjà présente")

if "CGINDEX001_CURRENT_CONTENT_FILTER" not in engine:
    apply_match = re.search(
        r'const\s+filtered\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)ApplyFilters\s*\(\s*rows\s*\)\s*;',
        engine
    )
    if not apply_match:
        apply_match = re.search(
            r'let\s+filtered\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)ApplyFilters\s*\(\s*rows\s*\)\s*;',
            engine
        )

    if not apply_match:
        raise SystemExit("ERREUR : seconde localisation du filtre impossible.")

    apply_name = apply_match.group(1) + "ApplyFilters"
    replacement = f'''let filtered = {apply_name}(rows);

    // CGINDEX001_CURRENT_CONTENT_FILTER
    filtered = filtered.filter(row =>
      cgindex001RowMatches(row, tokens));'''

    engine = engine[:apply_match.start()] + replacement + engine[apply_match.end():]
    print("OK : résultats statiques revalidés sur Firestore courant")
else:
    print("INFO : revalidation Firestore déjà présente")

ENGINE.write_text(engine, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")

if "cgindex001.css" not in index:
    p = index.lower().rfind("</head>")
    if p < 0:
        raise SystemExit("ERREUR : </head> introuvable.")
    index = (
        index[:p]
        + '\n<link rel="stylesheet" href="./cgindex001.css?v=CGINDEX001_FIX2">\n'
        + index[p:]
    )
    print("OK : cgindex001.css relié")

if "cgindex001.js" not in index:
    p = index.lower().rfind("</body>")
    if p < 0:
        raise SystemExit("ERREUR : </body> introuvable.")
    index = (
        index[:p]
        + '\n<script type="module" src="./cgindex001.js?v=CGINDEX001_FIX2"></script>\n'
        + index[p:]
    )
    print("OK : cgindex001.js relié")

index, n = re.subn(
    r'src=(["\'])(?:\./)?app\.js(?:\?v=[^"\']*)?\1',
    'src="./app.js?v=CGINDEX001_FIX2"',
    index,
    count=1
)
if not n:
    raise SystemExit("ERREUR : app.js introuvable dans index.html.")

index, n = re.subn(
    r'src=(["\'])(?:\./)?cgweb012\.js(?:\?v=[^"\']*)?\1',
    'src="./cgweb012.js?v=CGINDEX001_FIX2"',
    index,
    count=1
)
if not n:
    raise SystemExit("ERREUR : cgweb012.js introuvable dans index.html.")

INDEX.write_text(index, encoding="utf-8")

checks = {
    "CGSYNC004 hook":
        "CGSYNC004_TOMBSTONE_SYNC_START"
        in JAVA.read_text(encoding="utf-8"),
    "CGSYNC004 moteur":
        "CGSYNC004_METHODS_START"
        in JAVA.read_text(encoding="utf-8"),
    "version Android":
        "9.5.7-cgsync004-cgindex001"
        in GRADLE.read_text(encoding="utf-8"),
    "CGINDEX helpers":
        "CGINDEX001_HELPERS_START"
        in APP.read_text(encoding="utf-8"),
    "édition -> delta":
        "CGINDEX001_AFTER_UPDATE"
        in APP.read_text(encoding="utf-8"),
    "création -> delta":
        "CGINDEX001_AFTER_CREATE"
        in APP.read_text(encoding="utf-8"),
    "suppression -> delta":
        "CGINDEX001_AFTER_DELETE"
        in APP.read_text(encoding="utf-8"),
    "fusion delta":
        "CGINDEX001_DELTA_SEARCH_START"
        in ENGINE.read_text(encoding="utf-8"),
    "revalidation":
        "CGINDEX001_CURRENT_CONTENT_FILTER"
        in ENGINE.read_text(encoding="utf-8"),
    "indicateur JS":
        "cgindex001.js?v=CGINDEX001_FIX2"
        in INDEX.read_text(encoding="utf-8"),
    "indicateur CSS":
        "cgindex001.css?v=CGINDEX001_FIX2"
        in INDEX.read_text(encoding="utf-8"),
}

bad = [name for name, ok in checks.items() if not ok]

if bad:
    raise SystemExit(
        "ERREUR vérification FIX2 : " + ", ".join(bad)
    )

print()
print("==================================================")
print(" CGSYNC004 + CGINDEX001 FIX2 OK")
print("==================================================")
print("CGSYNC004 : suppressions Cloud -> SQLite Android")
print("CGINDEX001: index statique + delta Web live")
