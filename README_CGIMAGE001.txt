CGIMAGE001 — INFRASTRUCTURE IMAGES
=================================

ARCHITECTURE FIGÉE
------------------
Firebase Storage est la source officielle des images.

Firestore ne contient pas le binaire. La question conserve notamment :
- image_file         : chemin Storage principal
- image_thumb_file   : chemin Storage vignette
- is_image           : 1 / 0
- image_mime         : image/webp
- image_width / image_height
- image_bytes
- image_sha256
- image_schema       : 1
- image_origin       : firebase_storage
- image_original_name
- image_source_url   : réservé à la provenance (utile pour CGIMAGE003 Quizypedia)

Chemin Storage :
users/<uid>/question-images/<questionId>/<sha>-main.webp
users/<uid>/question-images/<questionId>/<sha>-thumb.webp

WEB
---
- Création de question : sélection facultative d'une image.
- Modification CGWEB006 : ajouter / remplacer / supprimer l'image.
- Conversion automatique WebP avant upload.
- Image principale max 1600 x 1200.
- Vignette max 480 x 360.
- Répertoire : chargement paresseux de la vignette.
- Seul le chemin Storage est stocké dans Firestore, jamais l'URL de téléchargement.
- Les remplacements utilisent des chemins versionnés par SHA afin d'éviter les caches obsolètes.

ANDROID
-------
- Dépendance Firebase Storage ajoutée.
- Les anciens image_file locaux continuent de fonctionner sans migration forcée.
- Un image_file de forme users/.../question-images/... est reconnu comme image Cloud.
- Téléchargement automatique à la demande.
- Copie locale uniquement sous Context.getCacheDir()/cgimage001.
- Aucune bibliothèque Cloud n'est recopiée de façon permanente dans le dossier "Culture Générale/Images".
- Cache borné : nettoyage automatique au-delà d'environ 128 Mo.

SÉCURITÉ STORAGE
----------------
web/storage.rules limite question-images à l'utilisateur authentifié propriétaire du UID.
Écriture : image uniquement, objet < 10 Mo.

DÉPLOIEMENT
-----------
Le workflow Web déploie désormais :
- Hosting
- Function cgimport002Quizypedia
- règles Firebase Storage

IMPORTANT IAM
-------------
Le compte de service GitHub doit pouvoir déployer les règles Firebase Storage.
Si le premier workflow échoue avec une permission firebaserules.*, il faudra lui ajouter
le rôle "Administrateur Firebase Rules" / "Firebase Rules Admin", puis relancer le job.

NON INCLUS DANS CGIMAGE001
--------------------------
- migration automatique de l'ancien dossier Images ;
- récupération automatique des images Quizypedia (prévue pour CGIMAGE003) ;
- plusieurs images par question.

CGIMAGE001 prépare néanmoins les métadonnées nécessaires pour ces évolutions.

TEST MINIMAL
------------
1. Déployer CGIMAGE001.
2. Ouvrir Culture Générale Web > Création de question.
3. Créer une question test avec une image.
4. Vérifier la vignette dans Répertoire.
5. Modifier la question et remplacer l'image.
6. Sur Android synchronisé, ouvrir la question : la première ouverture télécharge l'image ; les suivantes utilisent le cache.

COMMIT CONSEILLÉ
----------------
CGIMAGE001 Firebase Storage image infrastructure
