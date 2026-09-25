CGWEB116 FIX2
=============

CATALOG_REMOVE001
-----------------
Suppression complète de la rubrique
Répertoire > Thèmes Quizypedia.

Suppression des fichiers :
- cgweb116.css
- cgweb116.js

Les éventuelles petites données historiques déjà créées
dans Firestore ne sont pas supprimées : elles ne sont
simplement plus lues ni affichées.


CLASSIFICATION_AUTO001
----------------------
Le moteur Quizypedia lit déjà le mégathème sélectionné
au moment de la capture.

Le bouton :
"Appliquer mégathème/thème"

est donc supprimé.

Si Mégathème ou Thème est modifié après une capture,
la nouvelle valeur est répercutée automatiquement
sur les questions déjà capturées.


QUIZYPEDIA_COMPACT_LAYOUT001
----------------------------
Ligne supérieure :
- Adresse Quizypedia
- Mégathème avec largeur réduite de moitié
- Thème
- Analyser

Modifications :
- "Analyser l’URL" devient "Analyser"
- bouton Analyser placé à droite du champ Thème
- suppression du texte explicatif initial


SUMMARY_ACTION_ROW001
---------------------
Une seule ligne :

moitié gauche :
- Fiches extraites
- QCM capturés
- QCM stricts
- Sélectionnées

moitié droite :
- Tout sélectionner
- Tout désélectionner
- Importer

"Importer les questions sélectionnées"
devient :
"Importer"
