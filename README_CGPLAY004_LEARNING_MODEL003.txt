CGPLAY004 · LEARNING_MODEL003
=============================

PRINCIPE CENTRAL
----------------
Une question correctement répondue une seule fois
sort définitivement du vivier pédagogique.

Elle ne peut revenir qu'après un HARD LEARNING RESET.


RÉUSSITE
--------
positive > 0

=> question exclue.


ÉCHEC
-----
Une question sans aucune réussite reste éligible.

Elle peut donc revenir dans une session ultérieure.


SESSION COURANTE
----------------
Une question déjà affichée n'est jamais répétée
à l'intérieur de la même session longue.

Ainsi un échec sur une question ne provoque pas
une répétition artificielle quelques minutes plus tard.

La question échouée redevient candidate au démarrage
d'une session suivante.


CHOIX DES QUESTIONS
-------------------
Le modèle abandonne les priorités :

- Due
- Weakness
- Unseen first
- Oldest played first

Le vivier est désormais :

catalogue
- X
- questions ayant au moins une réussite
- questions déjà servies dans la session courante

Puis tirage aléatoire.


ALÉATOIRE
---------
Le catalogue éligible complet est mélangé
par Fisher-Yates.

Aucune question restante n'est favorisée
en fonction de l'ancienneté ou du nombre d'échecs.


THÈMES
------
Cooldown initial :

8 questions.

Un thème présent dans les 8 dernières questions
est normalement indisponible.

Si le stock disponible ne permet pas de respecter
strictement la règle, le moteur choisit le thème
utilisé le moins récemment.

La séance n'est donc jamais bloquée.


LOTS 100
--------
Le cooldown traverse les frontières entre deux lots.

Le lot suivant reçoit les 8 derniers thèmes planifiés
du lot précédent.

Compatible avec le préchargement tablette à 70/100.


HARD RESET
----------
CGANDROID005 efface :

- play_history
- smart_sessions

Après ce reset, aucune question n'est considérée
comme déjà réussie.


X
-
Les questions X restent exclues comme auparavant.


P / T
-----
Le présent lot ne change pas leur fonctionnement.


VERSION
-------
CGPLAY004_LEARNING_MODEL003

SUCCESS_EXCLUSION001
RANDOM_REMAINING001
THEME_COOLDOWN_08Q001
SESSION_NO_DUPLICATE001
FAILED_RETRY_FUTURE_SESSION001
