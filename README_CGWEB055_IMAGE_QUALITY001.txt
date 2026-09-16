CGWEB055 - IMAGE_QUALITY001
==============================
Audit en lecture seule des métadonnées image du catalogue.
Le catalogue est lu par pages via CGWEB032_API.query (300 lignes/appel), puis analysé
dans le navigateur. Détections : sans image, non_trouve, incohérence indicateur/fichier,
source image absente, URL HTTP, chemin d'image partagé par plusieurs questions.
Les lignes complètes restent uniquement en mémoire ; seul un petit résumé est conservé
dans localStorage. Export CSV des anomalies. Aucune suppression ni écriture Firestore.
