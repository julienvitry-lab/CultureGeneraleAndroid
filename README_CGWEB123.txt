CGWEB123 · QUESTION_FACTORY001
==============================

OBJECTIF
--------
Créer un atelier de préparation du futur jeu Question / Réponse.

CGWEB123 ne remplace pas le QCM actuel.


QR_GAME_SEPARATION001
---------------------
Le projet Q/R utilise une structure distincte :

- game = "QR"
- question
- answer
- source
- decision

Il ne contient pas :

- options A/B/C/D
- correct_index
- logique de QCM


FACT_TO_QR_DRAFT001
-------------------
Les candidats sont générés depuis les champs des fiches
extraites par CGWEB122 FIX3.

Une formulation spécifique est utilisée lorsque le champ
est reconnu :

- auteur
- réalisateur
- pays
- ville
- date
- année
- profession
- nationalité
- altitude
- population
- superficie
- etc.

Les autres champs utilisent une formulation générique.


AUXILIARY SOURCE
----------------
Les questions issues des questionnaires Quizypedia restent dans :

auxiliarySource

Elles ne sont PAS transformées automatiquement en questions Q/R.

Elles pourront servir ultérieurement :

- au contrôle de pertinence ;
- à l'identification de faits intéressants ;
- à l'analyse de formulations ;
- à l'enrichissement éditorial.

Mais elles restent séparées.


BATCH_DEDUP001
--------------
Deux couples question/réponse identiques dans un même lot
ne produisent qu'un seul candidat.


HUMAN_REVIEW_WORKSHOP001
------------------------
Chaque candidat possède l'un des trois états :

- pending : à examiner
- keep : retenu
- reject : écarté

Question et réponse restent modifiables manuellement.


SOURCE_TRACEABILITY001
----------------------
Chaque candidat conserve notamment :

- provider
- URL Quizypedia
- fiche
- cible
- libellé du champ
- valeur brute du champ
- position du champ
- version d'extraction
- factFingerprint


NO_FIRESTORE_WRITE001
---------------------
CGWEB123 QUESTION_FACTORY001 :

- ne crée aucune question Firestore ;
- ne modifie aucune question existante ;
- ne touche pas au catalogue QCM ;
- ne crée pas encore de catalogue Q/R.

L'export des questions retenues est uniquement un JSON
copié dans le presse-papiers ou téléchargé localement.
