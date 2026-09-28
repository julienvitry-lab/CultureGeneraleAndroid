CGPLAY004 · LEARNING_MODEL003 FIX1
==================================

OBJECTIF
--------
Implémenter des passes pédagogiques strictes.


RÈGLE N° 1
-----------
Une bonne réponse exclut définitivement la question.

Elle ne revient plus avant un hard reset.


RÈGLE N° 2
-----------
Une mauvaise réponse est mémorisée.

Elle ne devient PAS immédiatement candidate.


PASSE 1
-------
Uniquement les questions jamais posées.

attempts = 0


PASSE 2
-------
Uniquement les questions ratées lors de la passe 1.

attempts = 1


PASSE 3
-------
Uniquement les questions encore ratées.

attempts = 2


ETC.
----
La passe active correspond toujours au plus petit
nombre d'échecs encore présent parmi les questions
non maîtrisées.


CONSÉQUENCE MAJEURE
-------------------
S'il reste UNE SEULE question jamais posée,
AUCUNE question déjà ratée ne peut être reproposée.


ALÉATOIRE
---------
À l'intérieur de la passe active,
le choix reste aléatoire.


THÈMES
------
Cooldown de 8 questions conservé.

Le même thème est évité dans les 8 questions suivantes,
sauf impossibilité liée au stock disponible.


SESSION
-------
Une question n'est jamais servie deux fois
dans la même session.

Les questions déjà servies ne font cependant PAS
avancer artificiellement la passe.

Si toutes les questions restantes de la passe active
ont déjà été servies dans la session courante,
la session s'arrête plutôt que de commencer
prématurément la passe suivante.


EXEMPLE
-------
Q1 : jamais vue
Q2 : jamais vue
Q3 : 1 échec
Q4 : 3 échecs

Passe active = passe 1.

Q3 et Q4 sont interdites.

Après traitement de Q1 et Q2 :

si elles sont toutes maîtrisées,
la passe 2 peut commencer.

Q3 devient alors candidate.

Q4 attend toujours.


PÉRIMÈTRE
---------
La règle s'applique dans le périmètre sélectionné :

- Toutes les questions
ou
- un mégathème particulier.


VERSION
-------
CGPLAY004_LEARNING_MODEL003_FIX1

UNSEEN_ABSOLUTE_PRIORITY001
RETRY_ROUNDS001
ONE_ATTEMPT_PER_ROUND001
SUCCESS_EXCLUSION002
RANDOM_WITHIN_ROUND001
THEME_COOLDOWN_08Q002
