#!/usr/bin/env python3
from pathlib import Path

p = Path(".gitignore")
existing = p.read_text(encoding="utf-8") if p.exists() else ""

lines = existing.splitlines()

wanted = [
    "backups/CGBACKUP001/",
]

changed = False
for item in wanted:
    if item not in lines:
        lines.append(item)
        changed = True

if changed:
    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print("OK : backups/CGBACKUP001/ ajouté à .gitignore")
else:
    print("INFO : .gitignore déjà prêt")

print()
print("==================================================")
print(" CGBACKUP001 PATCH OK")
print("==================================================")
print("Outil de sauvegarde/restauration installé.")
