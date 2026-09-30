CGANDROID012 · LOCAL_GAME_ENGINE001 / PERSISTENT_POOL001
========================================================

PRINCIPE
--------
Après la première préparation locale :

Choix du mégathème
→ sélection SQLite
→ question.

Plus de Cloud Function pour choisir la question suivante.
Plus de relecture play_history à chaque démarrage.

PREMIÈRE PRÉPARATION
--------------------
Une seule préparation initiale est nécessaire pour remplir SQLite :
- catalogue complet ;
- exclusions X ;
- historique pédagogique actuel.

RÈGLES PÉDAGOGIQUES
-------------------
- réussite : question écartée jusqu'au RESET ;
- échec : fail_count + 1 ;
- jamais vues prioritaires ;
- plus petit fail_count prioritaire ;
- hasard dans la passe active ;
- aucun doublon dans une partie ;
- cooldown thème = 8 ;
- fallback = thème le moins récemment utilisé.

CLOUD
-----
play_history continue d'être synchronisé en arrière-plan.
Une panne réseau n'empêche plus l'enchaînement local.

CATALOGUE
---------
Refresh silencieux au maximum toutes les 6 heures.
Un refresh raté ne bloque jamais le jeu.

RESET
-----
Le hard RESET vide aussi l'apprentissage SQLite,
mais conserve le catalogue : toutes les questions redeviennent
immédiatement éligibles localement.

IMAGES
------
Le texte et les métadonnées sont locaux.
Le chargement des fichiers image reste inchangé.

VERSION
-------
versionCode 12
versionName CGANDROID012
CG_CHANNEL CGANDROID012

WORKFLOW
--------
CGANDROID012 · CultureGenerale Tablette

ARTIFACT
--------
CultureGenerale-Tablette-CGANDROID012

MARQUEURS
---------
LOCAL_GAME_ENGINE001
PERSISTENT_POOL001
SQLITE_QUESTION_CATALOG001
LOCAL_LEARNING_STATE001
LOCAL_RETRY_ROUNDS001
LOCAL_THEME_COOLDOWN_08Q001
CLOUD_OFF_CRITICAL_PATH001
BACKGROUND_CATALOG_REFRESH001
RESET_LOCAL_STATE001
