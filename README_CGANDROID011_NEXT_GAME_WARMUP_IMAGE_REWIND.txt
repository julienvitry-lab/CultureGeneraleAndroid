CGANDROID011 · NEXT_GAME_WARMUP001 / IMAGE_VIEWPORT001 / REWIND001
==================================================================

PROCHAINE PARTIE
----------------
À la fin d'une partie, l'attente est déplacée vers un écran :
"Préparation de la prochaine partie…"

Le backend prépare le premier lot des 9 choix de mégathème.
La tablette charge aussi la première fiche de chacun de ces choix,
et son image éventuelle.

Le cache reste valable 30 minutes.

Le premier cold start peut encore être lent ; les parties suivantes
doivent bénéficier du travail effectué à la fin de la partie précédente.

QUESTIONS IMAGE
---------------
Ordre :
- thème vert ;
- mégathème rouge ;
- question jaune ;
- image.

L'image commence immédiatement sous le bandeau jaune
et utilise toute la hauteur restante jusqu'au bas du viewport.

MENU GAUCHE
-----------
Ordre :
1. Problème
2. Menu
3. Retour en arrière
4. Thème à exclure
5. Stats
6. Fin de la partie

RETOUR EN ARRIÈRE
-----------------
Retour en arrière ouvre la question immédiatement précédente.

La nouvelle auto-évaluation rectifie la réponse précédente,
sans avancer une deuxième fois dans la série.

Chaque passage possède un attempt_id.
Les corrections sont des révisions du même attempt_id.

Le moteur et l'historique tablette ne retiennent que la dernière
révision du passage.

VERSION
-------
versionCode 11
versionName CGANDROID011
CG_CHANNEL CGANDROID011

WORKFLOWS
---------
CGANDROID011 · CultureGenerale Tablette
Déployer Culture Générale Web

ARTIFACT
--------
CultureGenerale-Tablette-CGANDROID011

MARQUEURS
---------
NEXT_GAME_ALL_DOMAIN_WARMUP001
FIRST_QUESTION_WARM001
IMAGE_MEGATHEME_RESTORE001
IMAGE_VIEWPORT_FILL001
THEME_EXCLUDE_SHIFT_DOWN2_001
IN_GAME_PREVIOUS_QUESTION001
ANSWER_REVISION001
