CGWEB129
========

MANUAL_CREATE_QR001
-------------------
L'onglet Création de questions abandonne le modèle QCM.

Le formulaire contient désormais :

- ID
- Mégathème
- Thème
- Question
- Détail
- Réponse
- Image
- Statut


SINGLE_ANSWER_FIELD001
----------------------
Une seule réponse pédagogique est saisie.

Les champs :

- Proposition A
- Proposition B
- Proposition C
- Proposition D
- sélecteur A/B/C/D

sont retirés du formulaire.


WRONG_OPTIONS_RETIRE002
-----------------------
Une création manuelle ne génère plus :

proposition_b
proposition_c
proposition_d


LEGACY_QR_COMPAT002
-------------------
Pendant la transition Android :

answer = réponse canonique

proposition_a = answer
correct_index = 1

Ces deux derniers champs sont uniquement conservés pour permettre
à l'APK actuelle de continuer à lire :

q.options[q.correctIndex - 1]

Ils seront retirés lors de la migration Android vers answer.
