#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(".")
JAVA = ROOT / "app/src/main/java/fr/culturegenerale/android/MainActivity.java"
BOOT = ROOT / "app/src/main/java/fr/culturegenerale/android/CgBoot001.java"
GRADLE = ROOT / "app/build.gradle"

for p in (JAVA, BOOT, GRADLE):
    if not p.exists():
        raise SystemExit(f"ERREUR: fichier introuvable: {p}")

def find_method_bounds(text, signature_regex):
    m = re.search(signature_regex, text)
    if not m:
        return None
    brace = text.find("{", m.end() - 1)
    if brace < 0:
        return None
    depth = 0
    in_str = None
    esc = False
    line_comment = False
    block_comment = False
    i = brace
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
        if ch in ("'", '"'):
            in_str = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return m.start(), brace, i + 1
        i += 1
    return None

java = JAVA.read_text(encoding="utf-8")

if "CGBOOT001_SYNC_HOOK_START" not in java:
    bounds = find_method_bounds(
        java,
        r'private\s+synchronized\s+void\s+startCgSync002QuestionSync\s*'
        r'\(\s*FirebaseUser\s+user\s*\)'
    )
    if not bounds:
        raise SystemExit(
            "ERREUR: startCgSync002QuestionSync(FirebaseUser user) introuvable."
        )
    _, brace, _ = bounds

    hook = '''
        // CGBOOT001_SYNC_HOOK_START
        if (user != null && hasAccess() && dbFile != null && !dbFile.exists()) {
            if (CgBoot001.maybeOffer(
                    this,
                    dbFile,
                    user,
                    () -> runOnUiThread(this::recreate))) {
                return;
            }
        }
        // CGBOOT001_SYNC_HOOK_END
'''
    java = java[:brace+1] + hook + java[brace+1:]
    print("OK: hook CGBOOT001 ajouté avant CGSYNC003")
else:
    print("INFO: hook CGBOOT001 principal déjà présent")

if "CGBOOT001_RESUME_HOOK_START" not in java:
    bounds = find_method_bounds(
        java,
        r'(?:protected|public)\s+void\s+onResume\s*\(\s*\)'
    )
    if bounds:
        _, brace, _ = bounds
        hook = '''
        // CGBOOT001_RESUME_HOOK_START
        if (hasAccess() && dbFile != null && !dbFile.exists()) {
            FirebaseUser cgBoot001User =
                    com.google.firebase.auth.FirebaseAuth.getInstance().getCurrentUser();
            if (cgBoot001User != null) {
                CgBoot001.maybeOffer(
                        this,
                        dbFile,
                        cgBoot001User,
                        () -> runOnUiThread(this::recreate));
            }
        }
        // CGBOOT001_RESUME_HOOK_END
'''
        java = java[:brace+1] + hook + java[brace+1:]
        print("OK: hook CGBOOT001 ajouté à onResume")
    else:
        print("INFO: onResume introuvable; hook principal suffisant")

JAVA.write_text(java, encoding="utf-8")

gradle = GRADLE.read_text(encoding="utf-8")
m = re.search(r'(\bversionCode\s+)(\d+)', gradle)
if not m:
    raise SystemExit("ERREUR: versionCode introuvable")
old_code = int(m.group(2))
new_code = max(old_code + 1, 954)
gradle = gradle[:m.start(2)] + str(new_code) + gradle[m.end(2):]

m2 = re.search(r'(\bversionName\s+)(["\'])([^"\']+)(["\'])', gradle)
if not m2:
    raise SystemExit("ERREUR: versionName introuvable")
replacement = m2.group(1) + m2.group(2) + "9.5.4-cgboot001" + m2.group(4)
gradle = gradle[:m2.start()] + replacement + gradle[m2.end():]
GRADLE.write_text(gradle, encoding="utf-8")

java = JAVA.read_text(encoding="utf-8")
boot = BOOT.read_text(encoding="utf-8")
gradle = GRADLE.read_text(encoding="utf-8")

checks = [
    ("hook principal", "CGBOOT001_SYNC_HOOK_START" in java),
    ("classe boot", "class CgBoot001" in boot),
    ("pagination Cloud", "orderBy(FieldPath.documentId())" in boot),
    ("reprise", 'readMeta(db, "last_doc_id")' in boot),
    ("base temporaire", 'TMP_SUFFIX = ".cgboot001.tmp"' in boot),
    ("version", "9.5.4-cgboot001" in gradle),
]
bad = [name for name, ok in checks if not ok]
if bad:
    raise SystemExit("ERREUR contrôles CGBOOT001: " + ", ".join(bad))

print(f"OK: versionCode {old_code} -> {new_code}")
print("OK: versionName -> 9.5.4-cgboot001")
print()
print("==================================================")
print(" CGBOOT001 PATCH OK")
print("==================================================")
print("Si questions_base.sqlite est absente :")
print("  Firebase -> téléchargement paginé -> SQLite temporaire -> base définitive")
print("Si elle existe déjà : aucun téléchargement initial n'est effectué.")
