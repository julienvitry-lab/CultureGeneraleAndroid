#!/usr/bin/env python3
from pathlib import Path

p = Path(".gitignore")
text = p.read_text(encoding="utf-8") if p.exists() else ""
lines = text.splitlines()

wanted = [
    "tools/.cgindex002_state.json",
    "tools/.cgindex002_stage_*/",
    "tools/.cgindex002_old_*/",
]

changed = False
for item in wanted:
    if item not in lines:
        lines.append(item)
        changed = True

if changed:
    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print("OK : fichiers temporaires CGINDEX002 ajoutés à .gitignore")
else:
    print("INFO : .gitignore déjà prêt pour CGINDEX002")

print()
print("==================================================")
print(" CGINDEX002 PATCH OK")
print("==================================================")
print("• snapshot du delta avant compactage")
print("• vérification SQLite ↔ delta")
print("• sauvegarde index + delta dans Download")
print("• compactage seulement des postings concernées")
print("• validation de l'index avant publication")
print("• push + deploy avant purge")
print("• purge Firestore avec précondition updateTime")
