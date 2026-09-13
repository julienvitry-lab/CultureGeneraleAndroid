CGWEB018 FIX5 · vrai « Thème contient »

Cause identifiée dans FIX4
---------------------------
La Cloud Function possédait un paramètre interne forceCatalog, mais son endpoint
appelait systématiquement search(..., false). Un catalogue déjà présent pouvait
donc être réutilisé même lorsqu'il était incomplet.

Correction
----------
1. Nouveau cache Firestore :
   meta/cgweb018_theme_catalog_v5
   Les anciens caches ne peuvent plus être réutilisés.

2. Première recherche « Thème contient » de chaque session :
   forceCatalog = true.
   La Function relit le champ theme de toute la collection questions.

3. Le endpoint prend réellement en compte req.body.forceCatalog.

4. Diagnostic visible :
   - nombre de thèmes distincts dans le catalogue ;
   - nombre de questions parcourues ;
   - nombre de thèmes correspondant au terme ;
   - liste des intitulés de thèmes trouvés.

Test attendu
------------
Saisir : capitales

L'écran doit indiquer explicitement :
« Thèmes détectés : ... »

Si seul « Capitales » apparaît après une reconstruction couvrant toute la base,
cela prouvera alors que les autres intitulés attendus ne sont pas présents dans
le champ Firestore theme, et non que le filtre fait encore une égalité stricte.
