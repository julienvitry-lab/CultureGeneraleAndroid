#!/usr/bin/env python3
from pathlib import Path
import re

JAVA = Path("app/src/main/java/fr/culturegenerale/android/MainActivity.java")
BOOT = Path("app/src/main/java/fr/culturegenerale/android/CgBoot001.java")
GRADLE = Path("app/build.gradle")

for p in (JAVA, BOOT, GRADLE):
    if not p.exists():
        raise SystemExit(f"ERREUR: fichier introuvable: {p}")

java = JAVA.read_text(encoding="utf-8")

MARKER = "Base SQLite introuvable"
if MARKER not in java:
    raise SystemExit("ERREUR: message 'Base SQLite introuvable' introuvable dans MainActivity.java")

if "CGBOOT001_MISSING_DB_GATE_START" not in java:
    marker_pos = java.index(MARKER)

    candidates = list(re.finditer(
        r'if\s*\(\s*!\s*dbFile\.exists\s*\(\s*\)\s*\)\s*\{',
        java[:marker_pos]
    ))
    if not candidates:
        raise SystemExit(
            "ERREUR: branche if (!dbFile.exists()) introuvable avant le message d'erreur."
        )

    target = candidates[-1]
    brace_pos = java.find("{", target.start(), target.end() + 2)
    if brace_pos < 0:
        raise SystemExit("ERREUR: accolade de la branche base absente introuvable.")

    hook = '''
            // CGBOOT001_MISSING_DB_GATE_START
            com.google.firebase.auth.FirebaseUser cgBoot001MissingDbUser =
                    com.google.firebase.auth.FirebaseAuth.getInstance().getCurrentUser();

            if (cgBoot001MissingDbUser != null && hasAccess()) {
                if (CgBoot001.maybeOffer(
                        this,
                        dbFile,
                        cgBoot001MissingDbUser,
                        () -> runOnUiThread(this::recreate))) {
                    return;
                }
            }
            // CGBOOT001_MISSING_DB_GATE_END
'''
    java = java[:brace_pos+1] + hook + java[brace_pos+1:]
    JAVA.write_text(java, encoding="utf-8")
    print("OK: CGBOOT001 branché directement sur la détection 'base absente'")
else:
    print("INFO: gate CGBOOT001 FIX1 déjà présent")

gradle = GRADLE.read_text(encoding="utf-8")

m = re.search(r'(\bversionCode\s+)(\d+)', gradle)
if not m:
    raise SystemExit("ERREUR: versionCode introuvable")
old_code = int(m.group(2))
new_code = max(old_code + 1, 955)
gradle = gradle[:m.start(2)] + str(new_code) + gradle[m.end(2):]

m2 = re.search(r'(\bversionName\s+)(["\'])([^"\']+)(["\'])', gradle)
if not m2:
    raise SystemExit("ERREUR: versionName introuvable")

new_name = "9.5.5-cgboot001-fix1"
replacement = m2.group(1) + m2.group(2) + new_name + m2.group(4)
gradle = gradle[:m2.start()] + replacement + gradle[m2.end():]
GRADLE.write_text(gradle, encoding="utf-8")

java2 = JAVA.read_text(encoding="utf-8")
boot2 = BOOT.read_text(encoding="utf-8")
gradle2 = GRADLE.read_text(encoding="utf-8")

checks = {
    "gate base absente": "CGBOOT001_MISSING_DB_GATE_START" in java2,
    "appel maybeOffer": "CgBoot001.maybeOffer" in java2,
    "classe CgBoot001": "class CgBoot001" in boot2,
    "version FIX1": new_name in gradle2,
}
bad = [k for k, v in checks.items() if not v]
if bad:
    raise SystemExit("ERREUR vérification: " + ", ".join(bad))

pos = java2.index("CGBOOT001_MISSING_DB_GATE_START")
before = java2.rfind("\n", 0, max(0, pos-400))
end_marker = java2.find("CGBOOT001_MISSING_DB_GATE_END", pos)
after = java2.find("\n", end_marker)
print()
print("=== EXTRAIT DU GATE CGBOOT001 ===")
print(java2[before+1:after].rstrip())

print()
print(f"OK: versionCode {old_code} -> {new_code}")
print(f"OK: versionName -> {new_name}")
print()
print("==================================================")
print(" CGBOOT001_FIX1 PATCH OK")
print("==================================================")
print("La détection de base absente lance maintenant CGBOOT001 AVANT l'écran rouge.")
