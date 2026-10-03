CGWEB133
========

ACTIVE_QCM_WRITER_RETIRE001
---------------------------
Les anciens writers actifs ne peuvent plus créer ou modifier
une question avec quatre propositions.

app.js centralise désormais la transition :

si un writer fournit answer :
- answer devient canonique ;
- proposition_a = answer ;
- correct_index = 1 ;
- proposition_b/c/d sont retirées du patch ;
- sur update, normalizeQr=true supprime B/C/D du document.

LEGACY_CREATE_QR001
-------------------
L'ancienne création CGWEB012 est convertie en :
Question / Détail / Réponse.

La recherche "Propositions" devient "Réponse".

CGWEB004005
-----------
L'ancien éditeur Firestore encore chargé est converti en Q/R.

QUESTION_HISTORY_QR001
----------------------
CGWEB053 normalise les snapshots historiques à la lecture.
Les propositions historiques incorrectes ne sont plus affichées,
injectées dans CGWEB019, copiées ou exportées.

QCM_UI_TEXT_CLEAN001
--------------------
Le dernier libellé visible "mode cible QCM" de CGWEB035 devient
"mode cible Q/R".
