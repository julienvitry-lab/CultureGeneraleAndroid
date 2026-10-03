CGWEB137
========

PURE_QR_END_TO_END_AUDIT001
---------------------------
Chaîne auditée :

Quizypedia
→ création / édition Web
→ Firestore
→ Android téléphone / tablette
→ play_history.

La réponse canonique est answer.


LEGACY_READER_MINIMIZE001
-------------------------
Le vieux schéma QCM n'est plus connu directement des écrans métier.

Sa lecture navigateur est centralisée dans :

web/public/cgqr001.js

Les anciens documents restent donc lisibles.


NEW_WRITE_ZERO_QCM001
---------------------
Les nouveaux writers Web n'écrivent plus :

proposition_a
proposition_b
proposition_c
proposition_d
correct_index

Les opérations de restauration backend produisent également du Q/R pur.


ANDROID_SYNC_VERIFY001
----------------------
CGANDROID017 est vérifié :

- tablette Firestore : answer ;
- tablette catalogue : answer ;
- téléphone synchro : answer ;
- téléphone bootstrap : answer ;
- writer Android Cloud : answer ;
- nouveaux historiques : Q/R.

Aucune migration massive Firestore.
