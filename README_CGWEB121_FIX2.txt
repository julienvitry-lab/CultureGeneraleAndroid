CGWEB121 FIX2
=============

STREAMING_DIRECTORY_SCAN001
---------------------------
Suppression du chargement intégral de la collection questions.

Firestore est lu par blocs de 1000 documents.
Chaque bloc est traité puis libéré.


PROJECTED_FIELDS001
-------------------
Seuls les champs nécessaires sont lus :
- question
- detail
- megatheme
- theme
- status
- is_image
- non_trouve

Les versions normalisées ne sont plus conservées en mémoire.


DIRECT_FUNCTION_ENDPOINT002
---------------------------
La recherche appelle directement cgweb032Search via cloudfunctions.net.

Le Firebase ID token reste transmis dans X-Firebase-Auth,
et non dans Authorization.

Cela évite le passage par Firebase Hosting pour les recherches
qui peuvent dépasser sa fenêtre de requête dynamique.


BOUNDED_RESULT_CACHE001
-----------------------
Suppression totale du cache du catalogue complet.

Le nouveau cache :
- contient uniquement des réponses finales ;
- maximum 16 recherches ;
- maximum 300 lignes par réponse ;
- durée maximale 5 minutes.

Aucune modification des données Firestore.
Aucune migration.
