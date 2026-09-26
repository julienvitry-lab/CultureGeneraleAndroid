CGWEB121
========

DIRECTORY_SEARCH_SAME_ORIGIN001

Objectif
--------
Fiabiliser la recherche plein texte du Répertoire.

Avant :
CGWEB -> cloudfunctions.net/cgweb032Search

Après :
CGWEB -> /api/cgweb032
      -> Firebase Hosting rewrite
      -> cgweb032Search

Aucune modification :
- des données Firestore ;
- de la logique de recherche ;
- de l'index des questions ;
- de l'authentification Firebase ;
- de la Cloud Function cgweb032Search.

Le changement supprime la dépendance frontend à l'appel
cross-origin direct vers cloudfunctions.net.
