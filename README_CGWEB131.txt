CGWEB131
========

DIRECTORY_QR_NORMALIZE001
-------------------------
Le Répertoire reste structurellement inchangé mais toute ouverture
de fiche utilise désormais une représentation Question / Réponse.

L'ancien CGWEB006, bien que masqué dans l'interface principale,
est lui aussi converti afin qu'aucun ancien formulaire A/B/C/D
ne puisse réapparaître.


QUESTION_DETAIL_ANSWER001
-------------------------
CGWEB019 affiche désormais :

- Question
- Détail
- Image éventuelle
- Réponse
- Métadonnées
- Sources

Les quatre propositions ne sont plus affichées.

L'aperçu latéral est lui aussi présenté en Q/R.


EDITOR_QR001
------------
L'éditeur CGWEB019 contient désormais un seul champ Réponse.

À l'enregistrement :

answer = réponse canonique
proposition_a = answer
correct_index = 1

proposition_b
proposition_c
proposition_d

sont supprimées physiquement du document Firestore grâce à
normalizeQr=true.


LEGACY_CATALOG_COMPAT001
------------------------
Aucune migration massive du catalogue historique n'est effectuée.

Une ancienne question qui ne possède pas encore answer reste lisible
grâce à :

correct_index + proposition_a/b/c/d.

Cette lecture de compatibilité est interne.

Les mauvaises propositions ne sont pas affichées.

Dès qu'une ancienne question est modifiée et enregistrée avec l'éditeur
CGWEB131, elle est normalisée vers le modèle Q/R et ses anciennes
propositions B/C/D sont supprimées.


SEARCH / HISTORY
----------------
answer devient également :

- champ éditable CGSYNC007 ;
- champ indexé par la recherche ;
- champ conservé dans question_history.

Les anciens champs QCM peuvent subsister dans les snapshots historiques
antérieurs mais ils ne sont plus exposés dans l'interface CGWEB019.
