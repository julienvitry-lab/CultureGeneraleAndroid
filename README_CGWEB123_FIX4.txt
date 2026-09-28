CGWEB123 FIX4 · TOKEN_COST_METER001
===================================

OBJECTIF
--------
Mesurer le coût réel de la génération IA de questions Q/R
avant d'envisager le traitement massif de Quizypedia.

Hypothèse projet :

- environ 6 000 thèmes ;
- environ 10 fiches / thème ;
- environ 60 000 fiches.


NO_EXTRA_AI_CALL001
-------------------
Le compteur ne lance AUCUN appel IA supplémentaire.

Il utilise exclusivement l'objet "usage" déjà renvoyé
par chaque réponse OpenAI utilisée par :

- la génération par fiche ;
- les éventuelles relances ;
- la relecture globale.


TOKENS MESURÉS
--------------
Pour chaque traitement :

- input_tokens ;
- cached_tokens ;
- cache_write_tokens ;
- output_tokens ;
- reasoning_tokens ;
- total_tokens ;
- nombre d'appels API.

IMPORTANT :

reasoning_tokens est inclus dans output_tokens.
Il ne doit donc pas être facturé deux fois.


TARIFICATION SNAPSHOT
---------------------
Date du snapshot :

28 septembre 2026

Modèle :

GPT-5.6 Sol


STANDARD — CONTEXTE COURT
-------------------------
Par million de tokens :

input            : 4.00 USD
cached input     : 0.40 USD
cache write      : 5.00 USD
output           : 20.00 USD


STANDARD — CONTEXTE LONG
------------------------
Au-delà de 272 000 tokens d'entrée sur UN appel :

input            : 8.00 USD
cached input     : 0.80 USD
cache write      : 10.00 USD
output           : 30.00 USD


BATCH — CONTEXTE COURT
----------------------
Projection seulement :

input            : 2.00 USD
cached input     : 0.20 USD
cache write      : 2.50 USD
output           : 10.00 USD


BATCH — CONTEXTE LONG
---------------------
Projection seulement :

input            : 4.00 USD
cached input     : 0.40 USD
cache write      : 5.00 USD
output           : 15.00 USD


IMPORTANT
---------
CGWEB123 continue actuellement à utiliser l'API Standard.

La valeur "Batch" affichée est seulement une projection
du coût que produirait la même consommation de tokens
avec Batch API.


SAMPLE_COST_HISTORY001
----------------------
Après chaque thème traité, le navigateur mémorise localement :

- URL du thème ;
- titre ;
- nombre de fiches ;
- tokens ;
- coût Standard ;
- coût Batch équivalent.

Le stockage utilise localStorage.

Aucune écriture Firestore.

Si un thème déjà mesuré est retraité,
sa mesure précédente est REMPLACÉE.

Ainsi, tester cinq fois le même thème
ne le compte pas cinq fois dans la moyenne.


PROJECTIONS
-----------
Le compteur affiche :

- coût du thème courant ;
- coût par fiche ;
- moyenne par thème observé ;
- projection pour 6 000 thèmes ;
- projection pour 60 000 fiches ;
- projection Standard ;
- projection Batch.


MÉTHODE CONSEILLÉE
------------------
Traiter d'abord un échantillon représentatif :

20 à 50 thèmes minimum.

Mélanger si possible :

- thèmes courts ;
- thèmes moyens ;
- thèmes riches ;
- domaines différents.

La projection deviendra progressivement beaucoup plus fiable.


LIMITES
-------
Le compteur est une estimation calculée à partir
des métriques usage retournées par OpenAI.

Il ne remplace pas la facture OpenAI définitive.

Les tarifs peuvent changer après la date du snapshot.


HÉRITAGE
--------
FIX4 conserve intégralement :

CGWEB123 FIX3
- autonomie hors thème ;
- ancrage contextuel ;
- réécriture des ambiguïtés.

CGWEB123 FIX2
- couverture de toutes les fiches ;
- quota maximal par fiche ;
- relecture globale ;
- rapport de couverture.

Aucune écriture Firestore.
