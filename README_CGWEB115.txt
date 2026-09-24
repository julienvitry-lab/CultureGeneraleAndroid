CGWEB115
========

CREATE_FORM_REWORK001
---------------------

Création de questions :

- champ ID supprimé visuellement ;
- contrôle technique ID conservé vide pour compatibilité moteur ;
- attribution automatique de l'ID inchangée ;
- Mégathème réduit ;
- Thème réduit ;
- Image déplacée sur la première ligne ;
- zone Image limitée à environ 5 cm ;
- suppression de la phrase :
  "Firebase Storage sera la source officielle ; Android conservera
   uniquement un cache automatique." ;
- Statut déplacé sur la première ligne ;
- largeur Statut environ 3 cm ;
- Statut converti en menu déroulant :
  A / R / P / T ;
- Bonne réponse convertie de SELECT en champ texte ;
- correct_index reste compatible avec le schéma historique :
  1=A, 2=B, 3=C, 4=D ;
- Comfortaa forcée dans les SELECT et OPTION.


HISTORY_CLEANUP001
------------------

Historique :

- liseré résultat 4 px -> 2 px ;
- ajout d'une séparation verticale entre :
  partie 1 / détail ;
- séparation existante détail / réponses conservée ;
- suppression visuelle des deux encarts principaux
  "Historique" et "Détail" ;
- moteur d'historique et données inchangés.


SECURITE
--------

CGWEB115 est une surcouche CSS/JS.
Aucune migration Firestore.
Aucune réécriture des questions existantes.
Aucune modification du moteur CGWEB035.
