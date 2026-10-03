CGANDROID017
============

ANSWER_CANONICAL_READ001
------------------------
Android lit answer en priorité.

Tablette :
CgQuestion.answer devient la donnée canonique.

Téléphone :
les synchronisations Cloud adaptent answer vers l'ancien SQLite local
sans dépendre du bridge Web.

LEGACY_QCM_FALLBACK001
----------------------
Les anciennes questions sans answer restent lisibles via
correct_index + proposition historique.

Après résolution, la tablette normalise immédiatement le runtime vers
une seule réponse.

HISTORY_QR_SNAPSHOT001
----------------------
Les nouveaux événements Android écrivent :

answer
correct_answer
question_snapshot.answer

Ils n'écrivent plus les propositions A/B/C/D ni correct_index dans les
nouveaux événements de jeu.

BRIDGE_RETIRE_READY001
----------------------
Une question Cloud contenant seulement :

question
detail
answer

est désormais utilisable par Android.

Le bridge Web proposition_a=answer / correct_index=1 pourra donc être
retiré après validation fonctionnelle des APK.

Aucune migration massive Firestore.
Aucune migration SQLite destructive.
