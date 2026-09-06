#!/usr/bin/env python3
from pathlib import Path
import re

MAIN = Path("app/src/main/java/fr/culturegenerale/android/MainActivity.java")
GRADLE = Path("app/build.gradle")
HERE = Path(__file__).resolve().parent

if not MAIN.exists() or not GRADLE.exists():
    raise SystemExit("ERREUR : exécuter depuis la racine de CultureGeneraleAndroid.")

def frag(name):
    p = HERE / name
    if not p.exists():
        raise SystemExit(f"ERREUR : fragment introuvable : {p}")
    return p.read_text(encoding="utf-8")

def find_method(text, signature_fragment):
    pos = text.find(signature_fragment)
    if pos < 0:
        raise SystemExit(f"ERREUR : méthode introuvable : {signature_fragment}")
    brace = text.find("{", pos)
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return pos, i + 1
    raise SystemExit(f"ERREUR : fin de méthode introuvable : {signature_fragment}")

src = MAIN.read_text(encoding="utf-8")
gradle = GRADLE.read_text(encoding="utf-8")

print("==================================================")
print(" CGSYNC006 - JOURNAL / CHECKPOINTS / REPRISE")
print("==================================================")

if "// CGSYNC006_FIELDS_START" not in src:
    anchor = "    // CGSYNC002_QUESTIONS_SYNC_END\n"
    if anchor not in src:
        raise SystemExit("ERREUR : ancre CGSYNC002_QUESTIONS_SYNC_END introuvable.")
    src = src.replace(anchor, anchor + frag("cgsync006_fields.javafrag"), 1)
    print("OK : champs CGSYNC006 ajoutés")

a, b = find_method(src, "    private synchronized void startCgSync002QuestionSync(FirebaseUser user)")
src = src[:a] + frag("cgsync006_start.javafrag") + src[b:]
print("OK : démarrage redirigé vers CGSYNC006")

a, b = find_method(src, "    private synchronized void stopCgSync002QuestionSync()")
src = src[:a] + frag("cgsync006_stop.javafrag") + src[b:]
print("OK : arrêt CGSYNC006 sécurisé")

a, b = find_method(src, "    private int applyCgSync002QuestionToSqlite(")
method = src[a:b]
if "// CGSYNC006_INSERT_NEW_QUESTION" not in method:
    needle = "        return changed;\n"
    if needle not in method:
        raise SystemExit("ERREUR : return changed introuvable.")
    method = method.replace(needle, frag("cgsync006_insert.javafrag") + needle, 1)
    src = src[:a] + method + src[b:]
    print("OK : créations Web -> insertion SQLite Android")

if "// CGSYNC006_HOME_BUTTON_START" not in src:
    a, b = find_method(src, "    private void showHome()")
    home = src[a:b]
    needle = "        Space bottomSpace = new Space(this);\n        root.addView(bottomSpace, new LinearLayout.LayoutParams(-1, 0, 1));"
    if needle not in home:
        raise SystemExit("ERREUR : bas de showHome introuvable.")
    home = home.replace(needle, frag("cgsync006_home.javafrag") + needle, 1)
    src = src[:a] + home + src[b:]
    print("OK : accès état synchronisation ajouté à l'accueil")

if "// CGSYNC006_METHODS_START" not in src:
    anchor = "    // CGSYNC004_METHODS_START\n"
    if anchor not in src:
        raise SystemExit("ERREUR : ancre CGSYNC004_METHODS_START introuvable.")
    src = src.replace(anchor, frag("cgsync006_methods.javafrag") + "\n" + anchor, 1)
    print("OK : moteur CGSYNC006 ajouté")

gradle, n1 = re.subn(r"versionCode\s+\d+", "versionCode 958", gradle, count=1)
gradle, n2 = re.subn(
    r"versionName\s+['\"][^'\"]+['\"]",
    "versionName '9.5.8-cgsync006'",
    gradle,
    count=1
)
if not n1 or not n2:
    raise SystemExit("ERREUR : version Android introuvable.")

checks = {
    "fields": "// CGSYNC006_FIELDS_START" in src,
    "start": "startCgSync006ReliableSync(user);" in src,
    "methods": "// CGSYNC006_METHODS_START" in src,
    "home": "// CGSYNC006_HOME_BUTTON_START" in src,
    "insert": "// CGSYNC006_INSERT_NEW_QUESTION" in src,
    "version": "versionCode 958" in gradle and "9.5.8-cgsync006" in gradle,
}
bad = [k for k, v in checks.items() if not v]
if bad:
    raise SystemExit("ERREUR vérification CGSYNC006 : " + ", ".join(bad))

MAIN.write_text(src, encoding="utf-8")
GRADLE.write_text(gradle, encoding="utf-8")

print("OK : versionCode 958")
print("OK : versionName 9.5.8-cgsync006")
print()
print("==================================================")
print(" CGSYNC006 PATCH OK")
print("==================================================")
print("Journal + checkpoints + reprise + progression prêts.")
