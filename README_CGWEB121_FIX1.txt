CGWEB121 FIX1
=============

FIREBASE_AUTH_HEADER_ISOLATION001
---------------------------------
Le Firebase ID token utilisé par la recherche CGWEB032 n'est plus
envoyé dans le header HTTP Authorization.

Frontend :
  X-Firebase-Auth: <Firebase ID token>

Backend :
  X-Firebase-Auth est prioritaire.
  Authorization: Bearer reste accepté pour compatibilité.


JSON_RESPONSE_GUARD001
----------------------
Le frontend lit d'abord la réponse en texte et vérifie son Content-Type.

Une éventuelle page HTML 401/403 ne provoque donc plus :
  Unexpected token '<'

Le message devient explicitement :
  HTTP xxx : réponse non JSON reçue
