CGANDROID019
============

GLOBAL_HISTORY_STATS001
-----------------------
L'écran Historique garde au maximum les 1000 réponses
les plus récentes pour l'affichage détaillé.

Les quatre cartes utilisent désormais l'historique global :
- Questions vues
- Réussites
- Échecs
- Taux

Le total global est construit une fois puis entretenu localement.


SYNCED_EXCLUSIONS001
--------------------
Les groupes analogues exclus sont synchronisés entre
téléphone et tablette via analog_exclusions.

La définition reste :
thème normalisé + question normalisée.


EXCLUSION_DIRECTORY001
----------------------
L'écran Choix du mégathème dispose désormais de :
Thèmes exclus (N)

Il répertorie les groupes analogues exclus.


PROBLEM_PERSIST001
------------------
Une question marquée Problème devient immédiatement
non jouable localement.

Les problem_reports sont également relus lors de la
synchronisation entre appareils.


AVAILABLE_COUNTS001
-------------------
Le nombre affiché entre parenthèses correspond à :

jamais posée
+
posée mais non assimilée

Ne sont pas comptées :
- questions assimilées
- status X
- groupes analogues exclus
- questions Problème


SINGLE_STEP_BACK001
-------------------
Le retour arrière n'utilise plus la recherche du dernier
attempt SQLite.

Un clic correspond strictement à la question réellement
affichée juste avant.

Une question Problème ou exclue n'ayant aucun attempt
ne provoque donc plus un saut de plusieurs questions.


APK
---
applicationId : fr.culturegenerale.android
versionCode   : 965
versionName   : 9.6.5-cgandroid019-universal
channel       : CGANDROID019_UNIVERSAL

Téléphone : < 600dp, portrait
Tablette  : >= 600dp, paysage

Aucune migration destructive SQLite.
Aucune migration destructive Firestore.
