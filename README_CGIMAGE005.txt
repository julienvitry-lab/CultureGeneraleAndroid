CGIMAGE005 · Migration massive des images historiques

Objectif
--------
Migrer par lots les anciennes images référencées dans la base :
- priorité à url_internet ;
- secours par url_quizypedia ;
- téléchargement côté serveur ;
- upload vers Firebase Storage dans users/<uid>/question-images/<questionId>/... ;
- mise à jour Firestore de image_file et des métadonnées image ;
- conservation des URL d'origine.

Composants
----------
1. web/functions/cgimage005.js
   - HTTPS function protégée par token Firebase utilisateur.
   - Traitement par lots, dry-run, curseur, reprise.

2. web/public/cgimage005.js
   - Panneau d'administration Web pour lancer dry-run / migration.

3. workflow Web
   - vérifie et déploie aussi functions:cgimage005MigrateBatch.

Conseil d'exploitation
----------------------
- commencer par un dry-run (100 à 500) ;
- lancer ensuite un pilote réel de 500 ;
- surveiller le curseur retourné ;
- reprendre lot après lot.

Aucune modification du statut métier des questions.
Le marquage non_trouve est optionnel et désactivé par défaut.
