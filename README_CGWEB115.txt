CGWEB115 FIX2
=============

NAV_REMOVE002
-------------
- retrait réel de la roue dentée du DOM
- retrait du sous-menu Paramètres
- aucune entrée Paramètres visible
- les moteurs historiques restent dans le projet pour permettre
  un retour ultérieur sans migration

BACKUP_REHOME002
----------------
- suppression de l'ancien bouton Sauvegardes placé en haut du Répertoire
- nouveau bouton Sauvegardes dans la barre d'actions
- emplacement exact :
  juste après Exporter CSV
- ouverture du panneau Sauvegardes existant

CREATE_WIDTH_BALANCE003
-----------------------
- largeur Mégathème conservée
- largeur Image divisée par deux
- largeur retirée à Image transférée intégralement à Thème
- Statut reste à environ 3 cm

CUSTOM_SELECT001
----------------
- abandon du rendu visuel des SELECT natifs pour :
  - Mégathème
  - Statut
- SELECT techniques conservés pour compatibilité
- menus visibles entièrement personnalisés
- Comfortaa imposée au bouton et à toutes les options
- aucune modification du schéma de données

HISTORY
-------
- conservation des corrections FIX1 :
  - liseré 2 px
  - centrage vertical
  - séparation des colonnes
  - retrait File d'apprentissage / Plan de révision


CGWEB115 FIX3
=============

TABS_EQUAL001
-------------
- 4 onglets principaux strictement de même largeur

HISTORY_RESULT_COMPACT001
-------------------------
- temps de réponse déplacé après l'horodatage
- exemple :
  24/09/2026 05:58:51 (5,5 s)
- suppression des libellés gris de la colonne réponse
- réponse correcte :
  une seule ligne verte
- réponse incorrecte :
  réponse donnée rouge
  bonne réponse verte
- centrage vertical conservé

SELECT_TRIANGLE002
------------------
- triangle blanc plein
- fermé : pointe vers la droite
- ouvert : pointe vers le bas

CSV_ODS_FUSION001
-----------------
- CGIMPORT011 devient le bloc principal unique
- CGWEB040 est intégré au bloc CSV / ODS
- bouton Actualiser placé dans l'en-tête principal
- conservation :
  lot actuel
  progression
  questions ajoutées
  erreurs
  relance des erreurs
- suppression des commandes redondantes
- suppression de l'historique local détaillé de l'affichage
- moteurs existants conservés


CGWEB115 FIX4
=============

CSV_ODS_COMPACT002
------------------
- suppression du titre "Import de plusieurs thèmes"
- suppression du texte explicatif CSV / ODS
- suppression de la note "Traitement séquentiel..."
- suppression visuelle de "Aucun fichier chargé"
- suppression de la jauge de progression
- suppression du bouton Télécharger le rapport CSV

IMPORT_ACTION_ROW001
--------------------
- champ fichier réduit à environ 5 cm
- "Lire le fichier" devient "Lire"
- ligne unique :
  Choisir un fichier
  Lire
  Lancer l'import
  Pause
  Reprendre
  Arrêter
  Effacer la liste
  Actualiser
- aucune modification du moteur CGIMPORT011


CGWEB115 FIX5
=============

DETAIL_METRICS_DENSITY001
-------------------------
- 8 indicateurs généraux sur une seule ligne :
  Questions total
  Questions vues
  Jamais vues
  Réponses évaluées
  Réussite
  À réviser
  Points faibles
  Faiblesse moyenne

- fusion visuelle des blocs :
  Maîtrise
  Temps de réponse et difficulté

- 10 indicateurs sur une seule ligne :
  Découverte
  Fragile
  Connue
  Maîtrisée
  À réviser
  Temps médian
  Temps moyen
  Connues mais lentes
  Difficulté
  Questions évaluées pour la difficulté

- aucune modification des données ou calculs
- cartes plus compactes
- responsive conservé
