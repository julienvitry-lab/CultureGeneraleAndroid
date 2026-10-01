CGANDROID017 · MEGATHEME_SCREEN_REMOVE001 / ANALOG_EXCLUSION_GUARD001
====================================================================

MEGATHEME_SCREEN_REMOVE001
--------------------------
Le mégathème est choisi avant la partie et n'apparaît plus sur l'écran Question.

Affichage :
- question image : Thème -> Question -> Image ;
- question texte : Thème -> Question -> éventuel détail ;
- aucun bandeau mégathème ;
- aucun fallback thème -> mégathème ;
- aucun fallback vers selectedDomain.

Si q.theme est vide, aucun bandeau de substitution n'est affiché.

ANALOG_EXCLUSION_GUARD001
-------------------------
« Thème à exclure » signifie exclusion du GROUPE ANALOGUE.

Définition canonique :
- même thème après normalisation ;
- ET même question après normalisation.

Clé :
    comparisonKey(theme) + "\n" + comparisonKey(question)

Ne participent PAS à la clé :
- ID de question ;
- mégathème ;
- détail ;
- thème seul.

Donc :
- ce n'est PAS une exclusion de l'ID affiché uniquement ;
- ce n'est PAS une exclusion de toutes les questions du thème ;
- toutes les questions analogues sont exclues.

GARDE-FOU CI
------------
scripts/ci/validate_cgandroid017.py vérifie la règle à chaque build.

CGANDROID017 FIX2
-----------------
Le validateur a été réécrit avec un analyseur simple de commentaires Java
et une extraction de méthode par accolades. Il n'utilise plus la regex
sur-échappée de FIX1.

NON MODIFIE
-----------
- modèle pédagogique ;
- apprentissage SQLite ;
- historique ;
- cooldown ;
- cache images ;
- hors-ligne ;
- CGWEB.

VERSION
-------
versionCode 17
versionName CGANDROID017
CG_CHANNEL CGANDROID017
