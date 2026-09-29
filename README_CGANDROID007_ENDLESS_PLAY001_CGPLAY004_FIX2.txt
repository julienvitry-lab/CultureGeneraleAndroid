CGANDROID007 · ENDLESS_PLAY001 / CGPLAY004 FIX2
================================================

OBJECTIF
--------
Jeu continu en question / réponse, sans limite de session.

PARCOURS
--------
Accueil -> Démarrer -> mégathème -> question -> Révéler
-> J'avais bon / J'avais faux -> question suivante.

Aucune taille de session.

AFFICHAGE
---------
Question N, et jamais N / 500.

LOTS TECHNIQUES
---------------
Lots invisibles de 100 questions.
Préchargement vers 70/100 si possible.

MOTEUR
------
Nouveau mode backend stateless : learningBatch.

Le moteur conserve :
- priorité absolue à la passe la plus basse ;
- jamais vues avant les questions déjà ratées ;
- aléatoire dans la passe ;
- cooldown thème = 8 ;
- réussite = question écartée du vivier actif jusqu'au RESET.

La question elle-même reste toujours dans le catalogue.

SYNCHRONISATION
---------------
Une réponse entre d'abord dans l'outbox locale.
Aucun nouveau lot n'est calculé tant qu'un play_history
reste non synchronisé.

TIMEOUT
-------
- timeout lecture : 90 s ;
- retry automatique x1 sur timeout / 429 / 5xx ;
- catalogue Firestore lu par pages de 1000 ;
- plus d'écriture smart_sessions pour le jeu continu.

FIN
---
"Parcours terminé" signifie uniquement :
plus aucune question dans le vivier actif du périmètre.

VERSION
-------
versionCode 7
versionName CGANDROID007
CG_CHANNEL CGANDROID007

WORKFLOW
--------
CGANDROID007 · CultureGenerale Tablette

ARTIFACT
--------
CultureGenerale-Tablette-CGANDROID007

MARQUEURS
---------
SMART_SESSION_UI_RETIRE001
FIXED_500_RETIRE001
ENDLESS_LEARNING_STREAM001
STATELESS_BATCH_100001
ROUND_AUTO_CONTINUE001
COLD_START_GUARD001
TIMEOUT_AUTO_RETRY001
DURABLE_ANSWER_QUEUE001
