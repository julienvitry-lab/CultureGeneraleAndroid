CGANDROID016 · LEGACY_IMAGE_NORMALIZE001 / DETAIL_TO_IMAGE001 / LOCAL_CATALOG_REPAIR001
=======================================================================================

LEGACY_IMAGE_NORMALIZE001
-------------------------
Le module tablette normalise désormais les références image historiques avant stockage
et avant lecture du catalogue local :
- espaces insécables / guillemets parasites ;
- séparateurs Windows ;
- chemin Storage users/.../question-images/... ;
- gs://... ;
- URL HTTP(S) ;
- image_thumb_file et image_source_url utilisés comme repli lorsque image_file est ancien.

Une référence Cloud ou HTTP exploitable prime sur un ancien nom de fichier local.
Aucune donnée CGWEB / Firestore n'est réécrite par cette normalisation Android.

DETAIL_TO_IMAGE001
------------------
Si le champ detail contient en réalité une référence image reconnaissable :
- cette référence devient l'image de la question lorsque c'est le meilleur candidat ;
- detail est vidé localement ;
- la fiche est rendue comme une question image : bandeaux puis image dans le viewport,
  au lieu d'afficher le chemin comme un détail texte rouge.

LOCAL_CATALOG_REPAIR001
-----------------------
Une base SQLite déjà créée avant CGANDROID016 n'est ni supprimée ni réinitialisée.
Au premier lancement 016 :
- réparation in-place de questions.detail / image_file / is_image ;
- learning, attempts, historique et règles CGPLAY inchangés ;
- si le réseau est disponible, reconstruction immédiate du catalogue questions depuis
  Firestore afin de récupérer aussi image_thumb_file et image_source_url ;
- si le réseau est absent, la partie locale reste possible et le rattrapage Cloud sera
  retenté ultérieurement depuis l'accueil.

Le marqueur meta cgandroid016_catalog_repair=1 n'est posé qu'après une reconstruction
complète depuis le catalogue Cloud.

INCHANGÉ
--------
- sélection pédagogique locale CGPLAY ;
- réussite exclue jusqu'au RESET ;
- jamais-vues prioritaires ;
- passes strictes par nombre d'échecs ;
- hasard intra-passe ;
- cooldown thème 8 ;
- pas de doublon dans une partie ;
- cache disque privé CGANDROID013 ;
- mode hors ligne et outbox CGANDROID015.

VERSION
-------
versionCode 16
versionName CGANDROID016
CG_CHANNEL CGANDROID016

WORKFLOW
--------
CGANDROID016 · CultureGenerale Tablette

ARTIFACT
--------
CultureGenerale-Tablette-CGANDROID016

AUCUNE MODIFICATION NI DÉPLOIEMENT WEB.
