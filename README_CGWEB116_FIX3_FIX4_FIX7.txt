CGWEB116 FIX3 FIX4 FIX7
=======================

UNRESOLVED_QUESTION_SKIP001
---------------------------
Une question impossible à identifier ne termine plus immédiatement
la session. Une proposition est cliquée uniquement pour permettre
à Quizypedia d'afficher la question suivante.

La question ignorée n'est jamais importée et aucune bonne réponse
n'est inventée.


PHOTO_EXPECTED_IMAGE_COUNT001
-----------------------------
Sur un questionnaire explicitement photo/image/portrait/vignette,
les fiches sans aucune image recensée ne font pas partie de la cible
de capture photo.

Exemple :
9 fiches dont 8 avec image => objectif photo = 8.


SAFE_PARTIAL_IMPORT001
----------------------
Ce mécanisme n'autorise PAS l'import général de captures partielles.

Un questionnaire est déclaré complet uniquement si toutes les fiches
de la cible exploitable ont été capturées.

Pour un questionnaire non-photo, la cible reste strictement toutes
les fiches comme auparavant.
