CGWEB123 FIX3
=============

STANDALONE_QUESTION001
MIXED_DOMAIN_CONTEXT001
CONTEXT_ANCHOR001
AMBIGUITY_REWRITE001


OBJECTIF
--------
Toute question doit fonctionner lorsqu'elle apparaît seule
au milieu d'un quiz de culture générale totalement mélangé.

Aucune continuité thématique ne doit être supposée.


CAS DE RÉFÉRENCE
----------------
Insuffisant :

Quel personnage facétieux et cynique prend la forme
d'un cochon-tirelire ?

Réponse :
Bayonne


Attendu :

Dans la saga Toy Story, quel personnage facétieux et cynique
prend la forme d'un cochon-tirelire ?

Réponse :
Bayonne


STANDALONE_QUESTION001
----------------------
Chaque question est testée sans :

- thème ;
- catégorie ;
- titre de fiche ;
- question précédente.


MIXED_DOMAIN_CONTEXT001
-----------------------
Simulation éditoriale :

question précédente :
sport

question actuelle :
n'importe quel domaine

question suivante :
animaux

La question actuelle doit rester immédiatement compréhensible.


CONTEXT_ANCHOR001
-----------------
Ajout si nécessaire du contexte minimal :

- œuvre ;
- saga ;
- série ;
- compétition ;
- sport ;
- pays ;
- époque ;
- institution ;
- discipline ;
- univers fictionnel.

L'ancrage doit être :

- sourcé ;
- utile ;
- concis ;
- présent dans la question ;
- non révélateur de la réponse.


AMBIGUITY_REWRITE001
--------------------
Une question ambiguë hors de son thème doit être :

1. contextualisée ;
2. réécrite ;
3. ou supprimée.


STRUCTURED OUTPUT
-----------------
Chaque question transporte :

standalone_ok
context_anchor
ambiguity_note


DOUBLE CONTRÔLE
---------------
Le contrôle est effectué :

1. pendant la génération par fiche ;
2. pendant la relecture globale ;
3. par un garde-fou backend.


HÉRITAGE FIX2
-------------
FIX3 conserve :

- couverture de toutes les fiches ;
- quota maximum par fiche ;
- relecture globale ;
- rapport de couverture ;
- QCM annexes comme sources ;
- grounding ;
- anti-tautologie ;
- aucune limite globale ;
- aucune écriture Firestore.


MODÈLE
------
GPT-5.6 Sol
