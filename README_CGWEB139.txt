CGWEB139
========

CUSTOM_TXT_IMPORT001
--------------------
L'onglet Création de questions accepte un fichier texte UTF-8.

Une ligne = une question.

Format strict :
Mégathème<TAB>Question<TAB>Réponse

Les lignes vides sont ignorées.
Toute ligne non vide doit contenir exactement 3 colonnes.


THREE_COLUMN_TSV001
-------------------
Contrôles avant import :
- mégathème obligatoire et reconnu ;
- question obligatoire ;
- réponse obligatoire ;
- exactement deux tabulations.

Une seule ligne invalide bloque l'import complet.


CREATE_TAB_SIMPLIFY001
----------------------
Création manuelle :
- Mégathème
- Question
- Réponse

Les champs Thème et Détail sont retirés.

Les questions personnelles ont toujours :
theme=""
detail=""


CUSTOM_ORIGIN001
----------------
Création manuelle :
question_origin="custom_manual"

Import TXT :
question_origin="custom_txt"

Cette propriété permet à Android d'appliquer un rendu spécifique
sans confondre ces questions avec une ancienne fiche Quizypedia
incomplète.
