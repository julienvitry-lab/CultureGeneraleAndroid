CGWEB123 FIX2
=============

FULL_FICHE_COVERAGE001
PER_FICHE_AI_GENERATION001
PER_FICHE_QUOTA001
GLOBAL_AI_REVIEW001
COVERAGE_REPORT001


CHANGEMENT D'ARCHITECTURE
-------------------------
FIX1 utilisait un quota global de questions.

Exemple :
nombre cible = 5

Cela permettait à l'IA de produire seulement les cinq questions
qu'elle jugeait les meilleures dans l'ensemble du corpus,
sans garantir la représentation de chaque fiche.

FIX2 supprime entièrement cette logique.


FULL_FICHE_COVERAGE001
----------------------
Toutes les fiches extraites par CGWEB122 doivent être traitées.

Chaque fiche possède un identifiant stable de traitement.

Les appels IA sont regroupés en petits lots pour éviter :

- un appel API par fiche ;
- un coût excessif ;
- une latence excessive.

Mais le Structured Output impose un résultat distinct par fiche.

Si une fiche est omise par l'IA dans un lot, elle est automatiquement
relancée individuellement.


PER_FICHE_AI_GENERATION001
--------------------------
Chaque fiche constitue une unité éditoriale autonome.

L'IA reçoit :

- la fiche complète ;
- ses champs ;
- son texte brut ;
- les QCM annexes détectés comme pertinents.

Elle produit de zéro à N questions.


PER_FICHE_QUOTA001
------------------
Le réglage n'est plus :

"Nombre cible total"

mais :

"Questions max. par fiche"

Valeurs possibles :
1 à 5.

Valeur par défaut :
3.

Ce nombre est un maximum et non une obligation.


GLOBAL_AI_REVIEW001
-------------------
Après génération fiche par fiche :

- toutes les questions candidates sont rassemblées ;
- une seconde passe IA réalise une relecture globale ;
- les doublons et questions faibles peuvent être supprimés ;
- les formulations peuvent être améliorées ;
- aucun quota global n'est imposé.


COVERAGE_REPORT001
------------------
CGWEB affiche pour chaque fiche :

- nombre de questions proposées par l'IA ;
- nombre restant après contrôles déterministes ;
- nombre final après relecture globale ;
- éventuelle raison d'une absence de question.

Le résumé indique également :

- X / Y fiches analysées ;
- nombre de fiches représentées ;
- nombre de candidats ;
- nombre de questions finales.


QUALITÉ
-------
Les garde-fous FIX1 sont conservés :

- source stricte ;
- aucune connaissance externe ;
- anti-tautologie ;
- rejet des questions mécaniques ;
- réponse présente dans les sources ;
- QCM annexes = sources uniquement.


QR_GAME_SEPARATION003
---------------------
Le jeu Q/R reste distinct du QCM.

Aucune proposition A/B/C/D.
Aucun correct_index.


NO_FIRESTORE_WRITE003
---------------------
Aucune écriture Firestore.

Les questions retenues sont uniquement exportables en JSON.


MODÈLE
------
GPT-5.6 Sol


SECRET
------
OPENAI_API_KEY
