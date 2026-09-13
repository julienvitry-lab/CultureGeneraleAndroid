CGWEB018 FIX2

Correctifs :
1. menus déroulants dans la charte sombre du site ;
2. filtre « Thème exact » remplacé par « Thème contient » ;
3. exemple : « capitales » retrouve tous les documents dont le champ theme
   contient ce terme, sans tenir compte de la casse ni des accents ;
4. filtre « Introuvable » renommé « Recherche image » ;
5. libellés explicites :
   - Tous les états
   - Image signalée introuvable
   - Non signalée introuvable
6. aide affichée sous les filtres.

Important :
non_trouve = 1 concerne l'échec d'une recherche/récupération d'image.
Cela ne signifie pas que la question est introuvable.

La recherche « thème contient » utilise question_search_delta comme préfiltre,
puis vérifie réellement le champ theme avant d'afficher un résultat.
