CGWEB123 FIX1 · AI_QUESTION_FACTORY001
======================================

OBJECTIF
--------
Remplacer intégralement le générateur mécanique de CGWEB123
par une véritable fabrique éditoriale IA pour le futur jeu Q/R.

PIPELINE
--------
CGWEB122
  -> corpus documentaire complet
  -> GPT-5.6 Sol / rédaction
  -> filtres déterministes
  -> GPT-5.6 Sol / relecture
  -> filtres déterministes finaux
  -> atelier humain
  -> export JSON

Aucune écriture Firestore.


FULL_FICHE_AI_CONTEXT001
------------------------
L'IA reçoit notamment :

- contexte du thème ;
- paragraphes de contexte ;
- fiches complètes ;
- cibles ;
- champs structurés ;
- texte brut ;
- questionnaires annexes ;
- bonnes réponses des questionnaires annexes ;
- détails documentaires utiles.


ANNEX_AS_SOURCE001
------------------
Les QCM Quizypedia ne sont jamais transformés mécaniquement.

Leurs mauvaises propositions ne sont pas envoyées à l'IA.

Question, bonne réponse et contexte peuvent servir de documentation
supplémentaire pour rédiger une nouvelle question Q/R.


AI_EDITORIAL_GENERATION001
--------------------------
Première passe :

- compréhension de la fiche complète ;
- sélection des faits réellement intéressants ;
- combinaison de plusieurs indices si utile ;
- rédaction naturelle ;
- réponse concise ;
- aucun quota obligatoire.


AI_REVIEW_PASS001
-----------------
Seconde passe indépendante :

- contrôle factuel par rapport au corpus ;
- intérêt culture générale ;
- autonomie de la question ;
- naturel du français ;
- caractère univoque de la réponse ;
- élimination des questions faibles ;
- réécriture si nécessaire.


SOURCE_GROUNDING001
--------------------
Mode source stricte.

Aucune connaissance externe n'est autorisée dans FIX1.

En complément de la relecture IA, le backend refuse
une réponse qui n'apparaît pas dans le corpus normalisé.


TAUTOLOGY_GUARD001
------------------
Le backend refuse une question lorsque sa réponse
apparaît déjà dans son énoncé.


GENERIC_QUESTION_BAN001
-----------------------
Les formulations mécaniques sont refusées, notamment :

- quelle information est indiquée...
- quel X est associé...
- selon la fiche...
- d'après Quizypedia...
- quelle valeur correspond...


QR_GAME_SEPARATION002
---------------------
Le nouveau jeu utilise :

game = "QR"

Il ne contient aucune logique A/B/C/D et aucun correct_index.


NO_FIRESTORE_WRITE002
---------------------
CGWEB123 FIX1 :

- ne crée aucune question Firestore ;
- ne modifie aucune question Firestore ;
- ne touche pas au QCM existant ;
- exporte uniquement un JSON après validation humaine.


SECRET
------
La clé API n'est jamais transmise au navigateur.

Secret Cloud :
OPENAI_API_KEY

Elle est accessible uniquement à la Cloud Function.


MODELE
------
gpt-5.6-sol
