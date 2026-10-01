CGANDROID014 · LOCAL_HISTORY001 / MULTI_STEP_REWIND001
======================================================

- Historique local-first dans SQLite.
- Chaque réponse est écrite localement avant le Cloud.
- Import Cloud unique lors de la première ouverture de l'historique.
- Nouvelle table attempts (DB_VERSION 2).
- Retour en arrière multi-step : N-1, N-2, N-3...
- Correction = même attempt_id, revision + 1.
- Retour automatique à la question courante après rectification.
- Hard RESET vide aussi attempts.
- Règles CGPLAY inchangées.

versionCode 14
versionName CGANDROID014
CG_CHANNEL CGANDROID014

Artifact :
CultureGenerale-Tablette-CGANDROID014
