CGWEB122
========

QUIZYPEDIA_FULL_FICHE_CAPTURE001
--------------------------------
À partir d'une URL Quizypedia de thème ou de questionnaire :

- récupération des fiches source ;
- titre/header de la fiche ;
- numéro et total ;
- toutes les lignes textuelles détectées ;
- tous les champs structurés ;
- liens et URL d'images ;
- aucune génération de QCM ;
- aucune écriture Firestore.

Une URL de thème est traitée directement.
Si sa page ne permet pas une reconstruction complète,
les pages de questionnaires sont utilisées comme secours.


RAW_SOURCE_ARCHIVE001
---------------------
Pour chaque page utilisée :

- URL effective ;
- texte intégral normalisé ;
- nombre de lignes ;
- nombre de fiches ;
- nombre de champs ;
- taille HTML ;
- SHA-256 du HTML ;
- SHA-256 du texte extrait.

Pour chaque fiche :

- rawLines ;
- rawText ;
- fields ;
- imageLinks.

L'objectif est de conserver la matière source avant toute
réécriture éditoriale.


STRUCTURED_KNOWLEDGE_EXTRACTION001
----------------------------------
Chaque fiche reçoit une structure "knowledge".

Elle comprend :

- target
- facts
- groups.identity
- groups.description
- groups.scientific_name
- groups.author
- groups.work
- groups.date
- groups.place
- groups.classification
- groups.alias
- groups.other
- imageUrls
- primaryImageUrl
- knowledgeText

La cible privilégie le champ d'identité explicite.

Exemple :
Header Quizypedia :
Dorothy (1900)

Champ :
Héroïne : Dorothy

=> target = Dorothy
=> headerYear = 1900

IMPORTANT
---------
CGWEB122 ne génère encore aucune question.

La prochaine étape pourra utiliser knowledge.facts
comme matière première d'une question principale longue,
sans perdre les informations de la fiche.
