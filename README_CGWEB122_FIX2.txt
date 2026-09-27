CGWEB122 FIX2
=============

IMAGE_CREDIT_CAPTURE001
-----------------------
Les lignes de crédits d'image sont capturées comme métadonnées source.

Exemples reconnus :
- Crédits image
- Crédit image
- Crédits photo
- Auteur image
- Photographe image
- Source image
- Licence image
- Copyright image

Exemple :

Crédits image : Jürg Ahel - CC BY 4.0

devient :

sourceMetadata.image.entries[]
  kind  : image_credit
  label : Crédits image
  value : Jürg Ahel - CC BY 4.0


SOURCE_METADATA_SEPARATION001
-----------------------------
Les métadonnées techniques ne font PAS partie des connaissances.

Elles sont séparées de :
- fields pédagogiques
- knowledge.facts
- knowledge.groups
- knowledge.knowledgeText

Elles restent néanmoins intégralement archivées dans :
- sourceMetadata.image.entries
- sourceMetadata.image.credits
- sourceMetadata.image.urls
- sourceMetadata.image.primaryUrl

Les URL d'image historiques restent aussi disponibles dans :
- imageUrls
- primaryImageUrl
- imageLinks


RAW_FIDELITY_COMPLETE001
------------------------
Une ligne brute est considérée comme couverte si elle est présente :

- soit dans les champs pédagogiques ;
- soit dans les métadonnées source.

Ainsi une fiche comportant :

Animal
Ascidie rouge
Description
...
Nom scientifique
Halocynthia papillosa
Crédits image : Jürg Ahel - CC BY 4.0

peut atteindre :

Couverture texte brut : 7 / 7
✓ couverture complète

sans injecter les crédits image dans les connaissances.


IMPORTANT
---------
Aucune génération de question.
Aucune écriture Firestore.
