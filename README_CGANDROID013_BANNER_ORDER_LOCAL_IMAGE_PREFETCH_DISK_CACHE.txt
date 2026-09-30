CGANDROID013 · BANNER_ORDER001 / LOCAL_IMAGE_PREFETCH001 / IMAGE_DISK_CACHE001
=============================================================================

AFFICHAGE DES QUESTIONS IMAGE
- bandeau rouge mégathème TOUT EN HAUT ;
- bandeau vert thème immédiatement en dessous ;
- bandeau jaune question ;
- image dans toute la hauteur disponible restante (CGANDROID011 inchangé).
Les questions sans image conservent leurs dispositions précédentes.

IMAGE_READY_BEFORE_SHOW001
Un sélecteur unique réserve les quatre questions suivantes au moyen
DU MÊME moteur local CGPLAY004 que CGANDROID012. La réponse et la sélection
restent locales ; les règles de passes, succès, hasard, anti-doublons
et cooldown de 8 thèmes ne sont pas modifiées.
Les quatre images éventuelles sont préparées AVANT affichage de leur fiche.
En cas de jeu exceptionnellement plus rapide que le préchargement,
un écran de préparation temporaire apparaît plutôt qu'une question
avec son image chargée en direct.
Si la source réseau est indisponible, la fiche garde un texte explicite :
« Image indisponible · vérifier la connexion ».

CACHE D'IMAGES
- dossier privé persistant dans getFilesDir() (pas le cache système) ;
- namespace isolé par UID ;
- clés SHA-256, écriture temporaire puis renommage ;
- réduction des images à 1600 pixels max sur le grand axe ;
- limite 180 Mio ou 600 images, éviction des anciennes ;
- cache mémoire LRU limité à huit images ;
- le cache survit aux fermetures et mises à jour APK ;
- la désinstallation / effacement de données Android le supprime.

DÉMARRAGE
La première préparation du catalogue CGANDROID012 reste inchangée.
La toute première image non cachée peut retarder l'affichage de la première
question, mais le chargement de son image ne sera plus visible SUR la fiche.
Les questions suivantes profitent de la file anticipée.

WORKFLOW : CGANDROID013 · CultureGenerale Tablette
ARTIFACT : CultureGenerale-Tablette-CGANDROID013
AUCUNE MODIFICATION NI DÉPLOIEMENT WEB.
