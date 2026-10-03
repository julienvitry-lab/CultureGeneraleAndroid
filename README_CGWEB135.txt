CGWEB135
========

POST_QR_AUDIT001
----------------
Audit post-conversion du runtime CGWEB.

L'objectif n'est pas de supprimer toute occurrence textuelle des anciens
champs, car ils restent nécessaires pour lire les documents historiques.

L'objectif est de garantir qu'aucun écran Web actif :
- n'affiche les mauvaises propositions ;
- ne les écrit ;
- ne les indexe ;
- ne les ajoute aux nouveaux snapshots Web.


ACTIVE_RESIDUAL_ZEROING001
--------------------------
Les writers frontend envoient désormais uniquement :

answer

pour la réponse.

Les champs proposition_a / correct_index ne sont plus construits dans :
- CGWEB006 ;
- CGWEB019 ;
- Création manuelle CGWEB016 FIX2 ;
- Import actif Quizypedia CGIMPORT009 FIX4.

L'index de recherche Web utilise :
Question + Détail + Réponse.

Les mauvaises propositions ne sont plus indexées.

Les nouveaux snapshots CGSYNC007 ne stockent plus les mauvaises
propositions.


ANDROID_BRIDGE_BOUNDARY001
--------------------------
Android consomme encore le schéma historique.

Le pont temporaire est donc limité au noyau :

answer
  -> proposition_a = answer
  -> correct_index = 1

proposition_b/c/d ne sont jamais créées.

Lorsqu'une ancienne question est enregistrée en Q/R :
proposition_b/c/d sont supprimées.

Les écrans frontend ne sont plus autorisés à fournir eux-mêmes
proposition_a / correct_index.

La suppression définitive du pont proposition_a / correct_index devra
avoir lieu uniquement après migration de l'application Android vers
le champ canonique answer.


LEGACY READERS
--------------
Certaines références proposition_[a-d] / correct_index subsistent
volontairement dans les résolveurs de lecture.

Elles servent exclusivement à calculer answer pour les anciennes
questions qui n'ont pas encore été normalisées.

Aucune migration massive Firestore n'est effectuée par CGWEB135.
