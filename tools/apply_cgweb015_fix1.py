#!/usr/bin/env python3
from pathlib import Path
import re

INDEX = Path("web/public/index.html")
ENGINE = Path("web/public/cgweb012.js")
JS = Path("web/public/cgweb015.js")
CSS = Path("web/public/cgweb015.css")

for p in (INDEX, ENGINE, JS, CSS):
    if not p.exists():
        raise SystemExit(f"ERREUR : fichier introuvable : {p}")

engine = ENGINE.read_text(encoding="utf-8")

m_filter = re.search(
    r'(?:const|let)\s+filtered\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)ApplyFilters\s*\(\s*rows\s*\)\s*;',
    engine
)
if not m_filter:
    raise SystemExit("ERREUR : filtre plein texte introuvable dans cgweb012.js")

prefix = m_filter.group(1)
filter_name = prefix + "ApplyFilters"

print(f"OK : filtre détecté : {filter_name}")

if "CGWEB015_FILTER_EXPORT" not in engine:
    fdef = re.search(
        rf'function\s+{re.escape(filter_name)}\s*\([^)]*\)\s*\{{',
        engine
    )

    export = f'\n// CGWEB015_FILTER_EXPORT\nwindow.CGWEB015_FILTER = {filter_name};\n'

    if fdef:
        i = engine.find("{", fdef.start())
        depth = 0
        end = None

        for j in range(i, len(engine)):
            ch = engine[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break

        if end is None:
            raise SystemExit("ERREUR : fin de la fonction filtre introuvable")

        engine = engine[:end] + export + engine[end:]
    else:
        engine = engine[:m_filter.start()] + export + engine[m_filter.start():]

    print("OK : filtre exporté pour CGWEB015")

# CGINDEX001 a ajouté une revalidation entre ApplyFilters(rows) et render(filtered).
# On l'expose pour que la pagination continue exactement le même contrôle.
if "CGWEB015_REVALIDATE_EXPORT" not in engine:
    if "cgindex001RowMatches" in engine:
        anchor = "// CGINDEX001_CURRENT_CONTENT_FILTER"
        pos = engine.find(anchor)

        if pos >= 0:
            export = (
                "\n// CGWEB015_REVALIDATE_EXPORT\n"
                "window.CGWEB015_REVALIDATE = (rows, tokens) => "
                "rows.filter(row => cgindex001RowMatches(row, tokens));\n"
            )
            engine = engine[:pos] + export + engine[pos:]
            print("OK : revalidation CGINDEX001 exportée")
        else:
            print("INFO : cgindex001RowMatches présent, mais marqueur de revalidation absent")
    else:
        print("INFO : aucune revalidation CGINDEX001 à exporter")

if "CGWEB015_PAGED_SEARCH_START" not in engine:
    # Recherche volontairement large : CGINDEX001 a inséré des lignes entre
    # la récupération des rows et le render. On remplace donc tout le bloc.
    pattern = re.compile(
        r'const\s+rows\s*=\s*\(\s*await\s+Promise\.all\(\s*'
        r'ids\.slice\s*\(\s*0\s*,\s*100\s*\).*?'
        r'api\.byId\s*\(\s*String\s*\(\s*id\s*\)\s*\)\s*'
        r'.*?\)\s*\)\.filter\s*\(\s*Boolean\s*\)\s*;'
        r'.*?'
        r'window\.CGWEB006_render\?\.\(\s*filtered\s*\)\s*;',
        re.S
    )

    m = pattern.search(engine)

    if not m:
        # Diagnostic précis, sans modification disque.
        rows_line = None
        for idx, line in enumerate(engine.splitlines(), start=1):
            if "Promise.all" in line and "rows" in line:
                rows_line = idx
                break

        suffix = f" vers la ligne {rows_line}" if rows_line else ""
        raise SystemExit(
            "ERREUR : bloc de chargement plein texte introuvable"
            + suffix
            + ". Aucune modification du moteur n'a été enregistrée."
        )

    fallback_revalidate = ""
    if "cgindex001RowMatches" in engine:
        fallback_revalidate = """
    // Revalidation CGINDEX001 conservée.
    filtered = filtered.filter(row =>
      cgindex001RowMatches(row, tokens));"""

    replacement = """// CGWEB015_PAGED_SEARCH_START
    if (window.CGWEB015_API?.setSearch) {
      window.CGWEB015_API.setSearch({
        ids,
        tokens,
        page: 0
      });
      await window.CGWEB015_API.renderPage();
      return;
    }

    // Fallback si CGWEB015 n'est pas chargé.
    const rows = (await Promise.all(
      ids.slice(0,100).map(id => api.byId(String(id)))
    )).filter(Boolean);

    let filtered = __FILTER__(rows);
__REVALIDATE__
    window.CGWEB006_render?.(filtered);
    // CGWEB015_PAGED_SEARCH_END"""

    replacement = replacement.replace("__FILTER__", filter_name)
    replacement = replacement.replace("__REVALIDATE__", fallback_revalidate)

    engine = engine[:m.start()] + replacement + engine[m.end():]

    print("OK : limitation ids.slice(0,100) remplacée par pagination")
else:
    print("INFO : pagination CGWEB015 déjà raccordée")

ENGINE.write_text(engine, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")

if "cgweb015.css" not in index:
    p = index.lower().rfind("</head>")
    if p < 0:
        raise SystemExit("ERREUR : </head> introuvable")

    index = (
        index[:p]
        + '\n<link rel="stylesheet" href="./cgweb015.css?v=CGWEB015_FIX1">\n'
        + index[p:]
    )

if "cgweb015.js" not in index:
    m = re.search(
        r'<script[^>]+src=["\'](?:\./)?cgweb012\.js[^"\']*["\'][^>]*></script>',
        index,
        re.I
    )

    if not m:
        raise SystemExit("ERREUR : script cgweb012.js introuvable dans index.html")

    tag = '\n<script type="module" src="./cgweb015.js?v=CGWEB015_FIX1"></script>\n'
    index = index[:m.start()] + tag + index[m.start():]

# Remplace une éventuelle référence de l'essai précédent.
index = re.sub(
    r'src=(["\'])(?:\./)?cgweb015\.js(?:\?v=[^"\']*)?\1',
    'src="./cgweb015.js?v=CGWEB015_FIX1"',
    index,
    count=1
)

index = re.sub(
    r'href=(["\'])(?:\./)?cgweb015\.css(?:\?v=[^"\']*)?\1',
    'href="./cgweb015.css?v=CGWEB015_FIX1"',
    index,
    count=1
)

index, n = re.subn(
    r'src=(["\'])(?:\./)?cgweb012\.js(?:\?v=[^"\']*)?\1',
    'src="./cgweb012.js?v=CGWEB015_FIX1"',
    index,
    count=1
)

if not n:
    raise SystemExit("ERREUR : cgweb012.js introuvable dans index.html")

INDEX.write_text(index, encoding="utf-8")

final_engine = ENGINE.read_text(encoding="utf-8")
final_index = INDEX.read_text(encoding="utf-8")

checks = {
    "filter export": "CGWEB015_FILTER_EXPORT" in final_engine,
    "paged search": "CGWEB015_PAGED_SEARCH_START" in final_engine,
    "js": "cgweb015.js?v=CGWEB015_FIX1" in final_index,
    "css": "cgweb015.css?v=CGWEB015_FIX1" in final_index,
}

bad = [k for k, v in checks.items() if not v]

if bad:
    raise SystemExit("ERREUR vérification CGWEB015 FIX1 : " + ", ".join(bad))

print()
print("==================================================")
print(" CGWEB015 FIX1 PATCH OK")
print("==================================================")
print("Pagination plein texte + surlignage prêts.")
