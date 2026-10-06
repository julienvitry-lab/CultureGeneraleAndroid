CGANDROID018
============

CUSTOM_ORIGIN_SYNC001
---------------------
Synchronisation de question_origin :
- custom_txt
- custom_manual

Téléphone :
- migration SQLite non destructive ;
- bootstrap Cloud ;
- live sync ;
- 5 chemins SELECT Question couverts.

Tablette :
- DB_VERSION 2 -> 3 ;
- migration non destructive ;
- catalogue local ;
- sélection locale ;
- lecture Cloud directe.


CUSTOM_QUESTION_LAYOUT001
-------------------------
Une question custom_* n'affiche ni mégathème,
ni thème ni détail.

Elle affiche un unique bandeau Question.


VERTICAL_CENTER001
------------------
Le bandeau Question est centré verticalement
dans toute la zone disponible.


QUIZYPEDIA_LAYOUT_PRESERVE001
-----------------------------
Le chemin d'affichage des questions non custom_*
reste inchangé.
