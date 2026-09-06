#!/usr/bin/env python3
from pathlib import Path

print("==================================================")
print(" CGTEST001 — INSTALLATION")
print("==================================================")

required = [
    Path("tools/cgtest001.py"),
    Path("app/build.gradle"),
    Path("web/public/app.js"),
    Path("web/public/index.html"),
]

missing = [str(p) for p in required if not p.exists()]
if missing:
    raise SystemExit("ERREUR : fichier(s) absent(s) : " + ", ".join(missing))

gitignore = Path(".gitignore")
text = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
lines = text.splitlines()

for item in [
    "CGTEST001_REPORT_*.txt",
    "tools/__pycache__/",
]:
    if item not in lines:
        lines.append(item)

gitignore.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

print("✅ Outil CGTEST001 présent")
print("✅ .gitignore prêt")
print()
print("CGTEST001 ne modifie ni SQLite, ni Firestore, ni Firebase Hosting.")
