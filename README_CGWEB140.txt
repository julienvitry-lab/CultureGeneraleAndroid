CGWEB140
========

FULL_QR_EXPORT001
-----------------
Ajoute au Répertoire :

Exporter tout Q/R

L'ancien export de sélection reste disponible sous le libellé :

Exporter sélection (résumé)


SERVER_PAGINATION001
--------------------
Endpoint :

/api/cgweb140

Cloud Function :

cgweb140ExportPage

Chaque appel lit au maximum 1000 questions Firestore.

Pagination stable :
FieldPath.documentId()

Le catalogue complet n'est jamais renvoyé par une seule requête.


ANSWER_CANONICAL001
-------------------
Réponse exportée :

1. answer
2. correct_answer legacy
3. ancien correct_index + proposition correspondante
4. ancien index 0 + proposition_a

Les champs QCM historiques restent confinés au backend.

Ils ne sont jamais présents dans le CSV produit.


COLONNES
--------
ID
Original_ID
Megatheme
Theme
Question
Detail
Reponse
Origine
URL_Quizypedia
URL_Internet
Image
Statut
Non_trouve
Is_image


PROGRESS_UI001
--------------
Affichage :
questions exportées / total
numéro de page

Bouton :
Annuler export


NON_BLOCKING_EXPORT001
----------------------
Navigateurs compatibles File System Access :
écriture page par page directement dans le fichier choisi.

Le catalogue complet n'est pas conservé en RAM.

Fallback navigateur :
Blob composé de chunks.

Une respiration UI est effectuée entre chaque page.


LECTURES FIRESTORE
------------------
Un export complet lit le catalogue une fois.

Pour N questions :
environ N lectures de documents
+ une opération count() initiale.

Aucune écriture Firestore.
Aucune mutation.
Aucune suppression.
