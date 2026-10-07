CGWEB142
========

CREATE_QR_SYMMETRY001
---------------------
Dans Création de questions :

Question | Réponse

occupent désormais deux colonnes strictement identiques
sur les écrans larges.

Sous 820 px :
Question puis Réponse sur une seule colonne.


EQUAL_TEXTAREA_HEIGHT001
------------------------
Les deux textareas ont la même configuration :

- largeur : 100 %
- hauteur initiale : 112 px
- hauteur minimale : 112 px
- line-height : 1.4
- resize : vertical

L'ancienne règle Réponse = 74 px est neutralisée
par une règle plus récente et de même spécificité.


QUIZYPEDIA_AUDIT_PANEL_RETIRE001
--------------------------------
Le panneau :

Contrôle des imports Quizypedia récents

n'est plus chargé en production.

cgweb141.js reste dans Git comme archive technique,
mais n'est plus inclus dans index.html et n'est plus
un composant du workflow de production.


THEME_GUARD_PRESERVE001
-----------------------
Le correctif structurel reste actif dans :

web/public/cgimport009fix4.js

Sont notamment conservés :

- themeFromQuizypediaUrl()
- resetQuizypediaStateForUrl()
- URL Quizypedia comme source de vérité du thème
- remise à zéro du contexte entre deux imports

Le retrait du panneau d'audit ne réintroduit donc pas
le défaut de persistance corrigé par CGWEB141.


DONNEES
-------
Aucune lecture Firestore supplémentaire.
Aucune écriture Firestore.
Aucune migration.
Aucune suppression de données.
