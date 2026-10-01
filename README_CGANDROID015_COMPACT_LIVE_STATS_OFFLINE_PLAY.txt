CGANDROID015 · COMPACT_LIVE_STATS001 / OFFLINE_PLAY001
=======================================================

COMPACT_LIVE_STATS001
---------------------
Pendant le jeu, un bandeau supérieur fin de 34 dp affiche :
- numéro de la question courante ;
- nombre de bonnes réponses ;
- nombre d'erreurs ;
- taux de réussite ;
- mention HORS LIGNE lorsqu'Android ne voit plus de connexion.

Le bouton "Stats" est supprimé du tiroir gauche.


OFFLINE_PLAY001
---------------
Si le catalogue SQLite a déjà été initialisé :
- les questions texte restent jouables sans réseau ;
- les questions image déjà présentes dans le cache disque restent jouables ;
- aucun accès Cloud n'est requis pour sélectionner la prochaine question ;
- les réponses sont écrites immédiatement dans SQLite.


DEFER_MISSING_IMAGES001
-----------------------
Une question nécessitant une image absente du cache disque :
- n'est pas affichée hors ligne ;
- est rendue au pool SQLite ;
- n'est pas comptée comme vue ;
- n'est pas comptée comme bonne ou mauvaise ;
- est exclue temporairement de la sélection de la partie offline.

Si seules des questions image non disponibles restent, l'app affiche
"Partie hors ligne" au lieu de déclarer le parcours terminé.


OUTBOX_RESUME001
----------------
Les événements play_history continuent d'être placés dans l'outbox
persistante existante.

Lorsque le réseau revient :
- tentative de synchronisation au onResume ;
- nouvelle tentative silencieuse toutes les 15 secondes si des réponses
  restent en attente ;
- les réponses locales ne sont jamais supprimées en cas d'échec réseau ;
- le pool des questions image différées est rouvert automatiquement.


LIMITATION VOLONTAIRE
---------------------
CGANDROID015 ne télécharge pas l'intégralité des images à l'avance.

Un futur OFFLINE_IMAGE_PACK001 pourra préparer toutes les images pour
un fonctionnement intégralement hors connexion.


CGPLAY
------
Aucune règle pédagogique n'est modifiée :
- réussite exclue jusqu'au RESET ;
- jamais-vues prioritaires ;
- passes strictes par nombre d'échecs ;
- hasard intra-passe ;
- cooldown thème 8 ;
- pas de doublon dans une partie.


VERSION
-------
versionCode 15
versionName CGANDROID015
CG_CHANNEL CGANDROID015


WORKFLOW
--------
CGANDROID015 · CultureGenerale Tablette


ARTIFACT
--------
CultureGenerale-Tablette-CGANDROID015


MARQUEURS
---------
COMPACT_LIVE_STATS001
OFFLINE_PLAY001
DEFER_MISSING_IMAGES001
OUTBOX_RESUME001
