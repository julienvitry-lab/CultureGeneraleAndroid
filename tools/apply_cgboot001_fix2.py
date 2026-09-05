#!/usr/bin/env python3
from pathlib import Path
import re

BOOT = Path("app/src/main/java/fr/culturegenerale/android/CgBoot001.java")
GRADLE = Path("app/build.gradle")

for p in (BOOT, GRADLE):
    if not p.exists():
        raise SystemExit(f"ERREUR: fichier introuvable: {p}")

boot = BOOT.read_text(encoding="utf-8")

old = (
    '        db.execSQL("PRAGMA journal_mode=DELETE");\n'
    '        db.execSQL("PRAGMA synchronous=NORMAL");\n\n'
    '        db.execSQL(\n'
    '                "CREATE TABLE IF NOT EXISTS questions (" +'
)

new = (
    '        // CGBOOT001_FIX2_SCHEMA_START\n'
    '        // Ne pas executer PRAGMA journal_mode via execSQL() :\n'
    '        // sur Android cette commande renvoie une valeur et peut interrompre\n'
    '        // l initialisation AVANT la creation des tables.\n'
    '        db.execSQL(\n'
    '                "CREATE TABLE IF NOT EXISTS questions (" +'
)

if "CGBOOT001_FIX2_SCHEMA_START" not in boot:
    if old not in boot:
        raise SystemExit(
            "ERREUR: bloc PRAGMA attendu introuvable dans CgBoot001.java. "
            "Aucune modification effectuee."
        )
    boot = boot.replace(old, new, 1)
    BOOT.write_text(boot, encoding="utf-8")
    print("OK: PRAGMA bloquant supprime avant creation du schema SQLite")
else:
    print("INFO: CGBOOT001_FIX2 deja present")

gradle = GRADLE.read_text(encoding="utf-8")

m = re.search(r'(\bversionCode\s+)(\d+)', gradle)
if not m:
    raise SystemExit("ERREUR: versionCode introuvable")
old_code = int(m.group(2))
new_code = max(old_code + 1, 956)
gradle = gradle[:m.start(2)] + str(new_code) + gradle[m.end(2):]

m2 = re.search(r'(\bversionName\s+)(["\'])([^"\']+)(["\'])', gradle)
if not m2:
    raise SystemExit("ERREUR: versionName introuvable")
new_name = "9.5.6-cgboot001-fix2"
replacement = m2.group(1) + m2.group(2) + new_name + m2.group(4)
gradle = gradle[:m2.start()] + replacement + gradle[m2.end():]
GRADLE.write_text(gradle, encoding="utf-8")

boot2 = BOOT.read_text(encoding="utf-8")
gradle2 = GRADLE.read_text(encoding="utf-8")

checks = {
    "marker FIX2": "CGBOOT001_FIX2_SCHEMA_START" in boot2,
    "table questions": "CREATE TABLE IF NOT EXISTS questions" in boot2,
    "table checkpoint": "CREATE TABLE IF NOT EXISTS cgboot_meta" in boot2,
    "ancien PRAGMA journal_mode": 'db.execSQL("PRAGMA journal_mode=DELETE")' not in boot2,
    "version": new_name in gradle2,
}
bad = [k for k, ok in checks.items() if not ok]
if bad:
    raise SystemExit("ERREUR verification FIX2: " + ", ".join(bad))

print(f"OK: versionCode {old_code} -> {new_code}")
print(f"OK: versionName -> {new_name}")
print()
print("==================================================")
print(" CGBOOT001_FIX2 PATCH OK")
print("==================================================")
print("Cause corrigee : initialisation SQLite arretee avant CREATE TABLE.")
