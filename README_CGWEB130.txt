CGWEB130
========

HISTORY_QR_NORMALIZE001
-----------------------
L'onglet Historique adopte le modèle Question / Réponse.

Aucune migration de play_history n'est effectuée.

Les anciens événements continuent d'être interprétés à la lecture.


ANSWER_RESOLUTION001
--------------------
La réponse correcte est résolue dans cet ordre :

1. play_history.correct_answer
2. play_history.answer
3. question_snapshot.answer
4. question_snapshot.correct_answer
5. proposition_[A-D] + correct_index historique

Le dernier cas sert uniquement de compatibilité avec les anciens QCM.


QCM_SNAPSHOT_HIDE001
--------------------
Les données historiques suivantes ne sont plus exposées au navigateur :

- selected_index
- correct_index
- proposition_a
- proposition_b
- proposition_c
- proposition_d
- snapshotOptions

Elles peuvent être lues temporairement côté serveur pour reconstruire
la réponse correcte d'un ancien événement.


LEGACY_HISTORY_COMPAT001
------------------------
Les anciens play_type restent intacts dans Firestore afin de préserver
les statistiques historiques.

challenge_choice et challenge_mental sont tous les deux présentés dans
CGWEB comme Question / Réponse.

Aucune donnée historique n'est supprimée ou réécrite.


AFFICHAGE
---------
Chaque carte Historique présente désormais :

- date ;
- mégathème / thème ;
- question ;
- détail ;
- réponse ;
- résultat ;
- temps de réponse ;
- numéro de tentative éventuel.

Ne sont plus affichés :

- QCM ;
- A / B / C / D ;
- réponse donnée parmi quatre propositions ;
- lettre de bonne réponse ;
- correct_index.
