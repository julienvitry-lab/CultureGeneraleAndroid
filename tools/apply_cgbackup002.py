#!/usr/bin/env python3
from pathlib import Path

p = Path(".gitignore")
text = p.read_text(encoding="utf-8") if p.exists() else ""
lines = text.splitlines()

wanted = [
    "tools/.cgbackup002_*",
    "backups/CGBACKUP002/",
]

changed = False
for item in wanted:
    if item not in lines:
        lines.append(item)
        changed = True

if changed:
    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print("OK : .gitignore complété pour CGBACKUP002")
else:
    print("INFO : .gitignore déjà prêt")

print()
print("==================================================")
print(" CGBACKUP002 PATCH OK")
print("==================================================")
print("• refresh token local, mot de passe non stocké")
print("• sauvegarde Firestore multi-collections")
print("• JSONL gzip par collection")
print("• SHA-256 + relecture JSON avant validation")
print("• archive finale relue après création")
print("• rotation prudente 8 dernières + 6 mensuelles")
print("• planification hebdomadaire optionnelle")
