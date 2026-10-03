CGWEB138
========

PURE_QR_SMOKE_TEST001
---------------------
CGWEB138 installe un smoke test authentifié dans CGWEB.

Le test n'est PAS lancé automatiquement.

L'utilisateur doit ouvrir CGWEB après déploiement puis développer :

CGWEB138 · Smoke test Q/R

et cliquer :

Lancer le smoke test Q/R.


NEW_QUESTION_LIFECYCLE001
-------------------------
Le scénario réel est :

1. création d'une question temporaire via CGWEB010 ;
2. lecture via CGWEB006 ;
3. modification via CGWEB006 / CGSYNC007 ;
4. relecture ;
5. restauration ;
6. suppression via CGWEB010 ;
7. vérification que la question n'existe plus.

Des propriétés QCM volontairement invalides sont injectées lors de
CREATE et UPDATE.

Le test échoue si l'une d'elles réapparaît réellement dans le document :

proposition_a
proposition_b
proposition_c
proposition_d
correct_index.


HISTORY_ROUNDTRIP001
--------------------
Après UPDATE :

before_snapshot.answer doit contenir la première réponse ;
after_snapshot.answer doit contenir la nouvelle réponse.

Le test appelle ensuite réellement CGWEB022 pour restaurer
before_snapshot.

Après RESTORE :

la question doit retrouver la première réponse ;
aucun champ QCM ne doit exister ;
une entrée historique restore doit être retrouvée.

Enfin DELETE est également contrôlé dans l'historique.


LEGACY_FALLBACK_PROBE001
------------------------
Le fallback CGQR001 est contrôlé sans écrire d'ancien document dans
Firestore.

Trois situations sont testées :

- correct_index + proposition historique ;
- answer prioritaire sur le legacy ;
- ancien cas correct_index=0 + proposition_a.


NETTOYAGE
---------
La question temporaire est supprimée à la fin du scénario.

En cas d'erreur intermédiaire, CGWEB138 tente une suppression de secours.

Le tombstone et quelques événements d'historique sont volontairement
conservés : ils constituent la trace du smoke test.


COÛT / PÉRIMÈTRE
----------------
Une exécution concerne une seule question temporaire.

Aucun scan massif des questions.
Aucune migration Firestore.
Aucune modification des questions réelles.


IMPORTANT
---------
Les contrôles Cloud Shell valident le code du harness.

Le smoke test end-to-end réel n'est validé qu'après clic dans CGWEB
avec un utilisateur Firebase connecté.
