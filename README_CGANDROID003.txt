CGANDROID003
============

SELF_ASSESSMENT_QR001
QCM_UI_RETIRE001
REVEAL_ANSWER001
BINARY_SELF_EVAL001


OBJECTIF
--------
Supprimer le QCM de l'interface tablette tout en conservant
strictement deux étapes.


ÉTAPE 1 — QUESTION
------------------
Affichage de la question.

Les quatre propositions A/B/C/D ne sont jamais affichées.

L'ancien bouton :

Propositions

devient :

Révéler


ÉTAPE 2 — RÉPONSE
-----------------
Affichage de la bonne réponse.

La bonne réponse est encore lue depuis la structure historique :

q.options[q.correctIndex - 1]

Les quatre propositions restent donc conservées dans les données
existantes mais elles deviennent invisibles.


AUTO-ÉVALUATION
---------------
Deux boutons centrés horizontalement et verticalement :

VERT
✓ J’avais bon

=> la réponse mentalement formulée était correcte.


ROUGE
✕ J’avais faux

=> la réponse mentalement formulée était incorrecte.


HISTORIQUE
----------
Le moteur historique réussite / échec est conservé.

is_correct reste renseigné.

Pour une réussite :
selected_index = correctIndex
selected_answer = bonne réponse

Pour un échec :
selected_index = 0
selected_answer = ""

Cela évite d'inventer une fausse réponse A/B/C/D
que l'utilisateur n'a jamais réellement sélectionnée.

Champ ajouté :

interaction_mode = self_assessment_qr


REDISTRIBUTION
--------------
AUCUNE modification du moteur de redistribution dans CGANDROID003.

Le nouveau modèle de réapparition des questions après réussite
ou échec fera l'objet d'un chantier séparé.


DONNÉES
-------
Aucune migration SQLite.

Aucune transformation des questions Firestore.

Les options QCM et correctIndex restent présents uniquement
comme structure de compatibilité et comme source de la réponse.


APK
---
versionCode : 3
versionName : CGANDROID003
CG_CHANNEL  : CGANDROID003

Artifact GitHub Actions :

CultureGenerale-Tablet-CGANDROID003
