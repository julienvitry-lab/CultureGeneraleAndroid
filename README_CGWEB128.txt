CGWEB128
========

QUIZYPEDIA_QR_MODE001
---------------------
L'onglet Quizypedia fonctionne désormais selon le modèle Question / Réponse.

Le pipeline reste identique :

URL Quizypedia
-> détection des questionnaires
-> capture
-> sélection
-> import.


ANSWER_ONLY_PAYLOAD001
----------------------
Le backend peut utiliser les quatre propositions Quizypedia uniquement pour
identifier avec certitude la bonne réponse.

Avant la réponse HTTP envoyée au navigateur :

- la bonne réponse est extraite ;
- le tableau des propositions est supprimé ;
- correct_index est supprimé de la réponse publique.

Le navigateur reçoit uniquement :

- question ;
- détail ;
- answer ;
- métadonnées source.


WRONG_OPTIONS_RETIRE001
-----------------------
CGWEB n'affiche plus :

- Proposition A ;
- Proposition B ;
- Proposition C ;
- Proposition D ;
- sélecteur A/B/C/D.

Firestore ne reçoit plus pour les nouveaux imports :

- proposition_b ;
- proposition_c ;
- proposition_d.


LEGACY_QR_COMPAT001
-------------------
Pendant la transition :

answer = bonne réponse canonique.

L'APK Android actuelle dépend encore de :

q.options[q.correctIndex - 1]

Donc les nouvelles fiches Quizypedia contiennent temporairement :

proposition_a = answer
correct_index = 1

Cette compatibilité pourra disparaître lorsque l'écosystème Android lira
directement le champ answer.


MIGRATION
---------
CGWEB128 ne modifie pas rétroactivement les anciennes questions QCM.

La migration globale sera traitée séparément pendant la refonte des autres
onglets CGWEB.
