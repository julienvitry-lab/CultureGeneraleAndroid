CGIMAGE002 — GESTION AVANCÉE DES IMAGES WEB
=============================================

PRÉREQUIS
---------
- CGIMAGE001 reste l’infrastructure de référence pour Firebase Storage.
- CGIMAGE002 ne remplace pas CGIMAGE001 : il l’utilise pour ajouter, remplacer et supprimer les images.
- CGWEB006_API reste le pont Firestore révisionné.

FONCTIONS
---------
- Recherche par ID exact ou début de question.
- Files « Images Cloud » et « Introuvables » (100 résultats max.).
- Prévisualisation de l’image Firebase Storage.
- Affichage des métadonnées : dimensions, poids, MIME, origine, date de MAJ, chemin Storage, SHA-256.
- Ajout/remplacement via la chaîne CGIMAGE001 (conversion WebP + miniature + Storage).
- Suppression via CGIMAGE001, avec nettoyage Storage.
- Gestion de image_source_url (provenance).
- Gestion du drapeau non_trouve sans modifier le champ status.
- Après upload, non_trouve est automatiquement remis à 0.

ARCHITECTURE
------------
CGIMAGE001 reste la couche technique Storage et Android.
CGIMAGE002 ajoute uniquement l’interface d’administration Web avancée.
Aucune nouvelle Cloud Function et aucune modification Android ne sont nécessaires.

CGIMPORT
--------
CGIMAGE002 est indépendant du numéro courant de CGIMPORT.
Il ne dépend donc ni de CGIMPORT008 ni de CGIMPORT009FIX4.

DÉPLOIEMENT
-----------
Le push sur main déclenche le workflow « Déployer Culture Générale Web ».
Le workflow valide également cgimage002.js et cgimage002.css avant déploiement.
