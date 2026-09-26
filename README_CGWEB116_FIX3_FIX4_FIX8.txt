CGWEB116 FIX3 FIX4 FIX8
=======================

DIRECT_PAYLOAD_AUTHORITY001
---------------------------
Quand get_quiz_game renvoie N quiz_items et que les N sont
entièrement valides (question + 4 propositions + bonne réponse),
ce payload devient la source autoritaire.

La réussite ne dépend plus du nombre de fiches HTML reconstruites.


SOURCE_FICHE_OPTIONAL001
------------------------
Le rattachement à une fiche source HTML reste utilisé lorsqu'il
est disponible.

S'il est absent :
- la question reste valide ;
- correct_text provient de get_quiz_game ;
- source_fiche reprend correct_text ;
- source_number reste 0.

Aucune réponse n'est inventée.


DIRECT_COUNT_PRIORITY001
------------------------
En capture directe, les compteurs utilisent le nombre réel de
quiz_items valides.

Exemple :
10 quiz_items valides + seulement 8 fiches HTML reconnues
=> capture 10/10, et non 0/8 ou 10/8.

Le fallback DOM/fiches reste disponible uniquement lorsque le
payload get_quiz_game est absent ou incomplet.
