#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(".")
JAVA = ROOT / "app/src/main/java/fr/culturegenerale/android/MainActivity.java"
GRADLE = ROOT / "app/build.gradle"
PUBLIC = ROOT / "web/public"
INDEX = PUBLIC / "index.html"

for p in (JAVA, GRADLE, PUBLIC, INDEX):
    if not p.exists():
        raise SystemExit(f"ERREUR: élément introuvable: {p}")

def find_matching(text, start, open_ch="{", close_ch="}"):
    depth = 0
    in_str = None
    esc = False
    line_comment = False
    block_comment = False
    i = start
    while i < len(text):
        ch = text[i]
        nx = text[i+1] if i + 1 < len(text) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nx == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue

        if ch == "/" and nx == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nx == "*":
            block_comment = True
            i += 2
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
            i += 1
            continue

        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1

def split_top_level_args(s):
    args = []
    last = 0
    depths = {"(": 0, "{": 0, "[": 0}
    pairs = {")": "(", "}": "{", "]": "["}
    in_str = None
    esc = False
    i = 0
    while i < len(s):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
        elif ch in depths:
            depths[ch] += 1
        elif ch in pairs:
            depths[pairs[ch]] -= 1
        elif ch == "," and all(v == 0 for v in depths.values()):
            args.append(s[last:i].strip())
            last = i + 1
        i += 1
    args.append(s[last:].strip())
    return args

def ensure_server_timestamp_import(path, txt):
    if re.search(r'\bserverTimestamp\b', txt) and "CGSYNC003_WEB_STAMP" not in txt:
        # Le symbole peut déjà être utilisé ailleurs ; dans ce cas ne rien toucher.
        return txt

    # Imports Firebase Firestore : format multi-ligne ou une-ligne.
    imports = list(re.finditer(
        r'import\s*\{(?P<body>.*?)\}\s*from\s*(?P<q>["\'])(?P<src>[^"\']*firebase-firestore[^"\']*)(?P=q)\s*;',
        txt,
        re.S
    ))
    if not imports:
        raise SystemExit(f"ERREUR: import Firebase Firestore introuvable dans {path}")

    imp = imports[0]
    body = imp.group("body")
    if re.search(r'(^|[,\s])serverTimestamp([,\s]|$)', body):
        return txt

    new_body = body.rstrip()
    if new_body and not new_body.endswith(","):
        new_body += ","
    new_body += "\n  serverTimestamp\n"
    return txt[:imp.start("body")] + new_body + txt[imp.end("body"):]

def patch_web():
    js_files = sorted(PUBLIC.rglob("*.js"))
    candidates = []
    for p in js_files:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if "updateQuestion" in txt and "updateDoc" in txt:
            candidates.append((p, txt))

    if not candidates:
        details = []
        for p in js_files:
            txt = p.read_text(encoding="utf-8", errors="ignore")
            if "updateQuestion" in txt:
                details.append(str(p))
        raise SystemExit(
            "ERREUR: aucun fichier JS contenant à la fois updateQuestion et updateDoc. "
            f"Fichiers contenant updateQuestion: {details}"
        )

    chosen = None

    for path, txt in candidates:
        # Chercher une occurrence updateQuestion dont le bloc qui suit contient updateDoc.
        for m in re.finditer(r'\bupdateQuestion\b', txt):
            search_end = min(len(txt), m.start() + 8000)
            frag = txt[m.start():search_end]
            u = frag.find("updateDoc")
            if u >= 0:
                chosen = (path, txt, m.start(), m.start() + u)
                break
        if chosen:
            break

    if not chosen:
        raise SystemExit("ERREUR: impossible d'associer updateQuestion à son updateDoc.")

    path, txt, fn_pos, upd_pos = chosen

    if "CGSYNC003_WEB_STAMP" in txt:
        print(f"INFO: horodatage Web déjà présent dans {path}")
        return path

    # Trouver l'appel updateDoc(...) situé après updateQuestion.
    call = re.search(r'\bupdateDoc\s*\(', txt[upd_pos:])
    if not call:
        raise SystemExit(f"ERREUR: appel updateDoc introuvable dans {path}")
    call_start = upd_pos + call.start()
    paren = txt.find("(", call_start)
    if paren < 0:
        raise SystemExit("ERREUR: parenthèse updateDoc introuvable")

    # Trouver la parenthèse fermante de l'appel.
    depth = 0
    in_str = None
    esc = False
    end = -1
    i = paren
    while i < len(txt):
        ch = txt[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', "`"):
                in_str = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        i += 1
    if end < 0:
        raise SystemExit("ERREUR: fin de l'appel updateDoc introuvable")

    inside = txt[paren+1:end]
    args = split_top_level_args(inside)
    if len(args) < 2:
        raise SystemExit(f"ERREUR: updateDoc n'a pas 2 arguments dans {path}")

    original_payload = args[1]
    stamped_payload = (
        "{ ...(" + original_payload + "), "
        "cg_updated_at: serverTimestamp() /* CGSYNC003_WEB_STAMP */ }"
    )
    args[1] = stamped_payload
    new_inside = ", ".join(args)

    txt = txt[:paren+1] + new_inside + txt[end:]
    txt = ensure_server_timestamp_import(path, txt)
    path.write_text(txt, encoding="utf-8")

    print(f"OK: future édition Web horodatée dans {path}")
    return path

def patch_android():
    txt = JAVA.read_text(encoding="utf-8")
    if "CGSYNC003_DELTA_ONLY" in txt:
        print("INFO: filtre Android CGSYNC003 déjà présent")
        return

    # Isoler la méthode CGSYNC002.
    m = re.search(
        r'private\s+synchronized\s+void\s+startCgSync002QuestionSync\s*'
        r'\(\s*FirebaseUser\s+user\s*\)\s*\{',
        txt
    )
    if not m:
        raise SystemExit("ERREUR: startCgSync002QuestionSync(FirebaseUser user) introuvable")

    brace = txt.find("{", m.start())
    method_end = find_matching(txt, brace)
    if method_end < 0:
        raise SystemExit("ERREUR: fin de startCgSync002QuestionSync introuvable")

    method = txt[m.start():method_end+1]

    # Ne toucher qu'à la collection questions de cette méthode, immédiatement
    # avant addSnapshotListener.
    pattern = re.compile(
        r'(\.collection\(\s*["\']questions["\']\s*\)\s*)'
        r'(\.addSnapshotListener\s*\()',
        re.S
    )
    mm = pattern.search(method)
    if not mm:
        # Variante avec éléments intermédiaires / mise en forme différente :
        qpos = method.find('.collection("questions")')
        if qpos < 0:
            qpos = method.find(".collection('questions')")
        apos = method.find(".addSnapshotListener", max(qpos, 0))
        if qpos < 0 or apos < 0:
            raise SystemExit(
                "ERREUR: chaîne Firestore questions -> addSnapshotListener introuvable "
                "dans startCgSync002QuestionSync"
            )
        insert = (
            '\n                // CGSYNC003_DELTA_ONLY\n'
            '                .whereGreaterThan("cg_updated_at", '
            'new com.google.firebase.Timestamp(0L, 0))'
        )
        method = method[:apos] + insert + method[apos:]
    else:
        replacement = (
            mm.group(1)
            + '// CGSYNC003_DELTA_ONLY\n'
            + '                .whereGreaterThan("cg_updated_at", '
              'new com.google.firebase.Timestamp(0L, 0))\n'
            + '                '
            + mm.group(2)
        )
        method = method[:mm.start()] + replacement + method[mm.end():]

    txt = txt[:m.start()] + method + txt[method_end+1:]

    if 'whereGreaterThan("cg_updated_at"' not in txt:
        raise SystemExit("ERREUR: filtre cg_updated_at absent après patch Android")

    JAVA.write_text(txt, encoding="utf-8")
    print("OK: Android exclut les 217 576 documents CGIMPORT001 du snapshot")

def bump_version():
    txt = GRADLE.read_text(encoding="utf-8")

    m = re.search(r'(\bversionCode\s+)(\d+)', txt)
    if not m:
        raise SystemExit("ERREUR: versionCode introuvable")
    old = int(m.group(2))
    new = old + 1
    txt = txt[:m.start(2)] + str(new) + txt[m.end(2):]

    m2 = re.search(r'(\bversionName\s+)(["\'])([^"\']+)(["\'])', txt)
    if not m2:
        raise SystemExit("ERREUR: versionName introuvable")
    replacement = m2.group(1) + m2.group(2) + "9.5.3-cgsync003" + m2.group(4)
    txt = txt[:m2.start()] + replacement + txt[m2.end():]

    GRADLE.write_text(txt, encoding="utf-8")
    print(f"OK: versionCode {old} -> {new}")
    print("OK: versionName -> 9.5.3-cgsync003")

def cache_bust(changed_js):
    txt = INDEX.read_text(encoding="utf-8")
    name = changed_js.name
    # Modifier uniquement la balise du fichier réellement changé.
    pat = re.compile(
        rf'src=(["\'])(?:\./)?{re.escape(name)}(?:\?v=[^"\']*)?\1'
    )
    m = pat.search(txt)
    if m:
        quote = m.group(1)
        repl = f'src={quote}./{name}?v=CGSYNC003_1{quote}'
        txt = txt[:m.start()] + repl + txt[m.end():]
        INDEX.write_text(txt, encoding="utf-8")
        print(f"OK: cache-bust {name} -> CGSYNC003_1")
    else:
        # Le fichier peut être importé par app.js plutôt que directement par index.html.
        print(f"INFO: {name} n'est pas chargé directement par index.html; pas de cache-bust nécessaire")

changed_js = patch_web()
patch_android()
bump_version()
cache_bust(changed_js)

# Contrôles finaux stricts.
java = JAVA.read_text(encoding="utf-8")
web = changed_js.read_text(encoding="utf-8")
gradle = GRADLE.read_text(encoding="utf-8")

required = [
    ('Android delta', 'CGSYNC003_DELTA_ONLY' in java),
    ('Android query', 'whereGreaterThan("cg_updated_at"' in java),
    ('Web stamp', 'CGSYNC003_WEB_STAMP' in web),
    ('Web serverTimestamp', 'serverTimestamp' in web),
    ('Version', '9.5.3-cgsync003' in gradle),
]
bad = [name for name, ok in required if not ok]
if bad:
    raise SystemExit("ERREUR contrôles finaux: " + ", ".join(bad))

print()
print("==================================================")
print(" CGSYNC003_FIX1 PATCH OK")
print("==================================================")
print(f"JS modifié : {changed_js}")
print("Android : seuls les documents possédant cg_updated_at sont écoutés.")
print("Les 217 576 documents migrés par CGIMPORT001 n'ont pas ce champ.")
