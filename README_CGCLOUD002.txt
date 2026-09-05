CGCLOUD002 — 100 QUESTIONS TEST

Objectif
- Extraire 100 vraies questions depuis questions_base.sqlite sur le téléphone.
- Ne publier AUCUN JSON de questions sur Firebase Hosting/GitHub.
- Importer ces 100 questions depuis le navigateur authentifié vers :
  users/<uid>/questions/<original_id>

Contenu
- tools/cgcloud002_export_100.py : export SQLite -> JSON local Downloads.
- web/public/cloud002.js : panneau Web d'import sécurisé après connexion Firebase.

Le JSON reste uniquement dans Downloads sur le téléphone.
L'import Firestore est idempotent : relancer avec les mêmes original_id met à jour les mêmes documents.
