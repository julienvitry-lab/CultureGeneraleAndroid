CGWEB041 - QUALITY_DASHBOARD001
===============================

Objectif
--------
Créer sous Plus un point d'entrée lisible pour le contrôle qualité de la base,
sans dupliquer les moteurs existants.

Fonctions
---------
- nouveau sous-onglet Plus > Tableau qualité ;
- nombre de questions lorsque l'indicateur est disponible dans le DOM ;
- nombre de questions avec image ;
- nombre sans image, présenté explicitement comme indicateur de couverture ;
- couverture image en pourcentage ;
- images explicitement marquées "à rechercher" ;
- dernier nombre de paires affiché par le détecteur de doublons lorsqu'il est
  déjà présent dans l'interface ;
- accès direct vers :
  * Contrôle qualité ;
  * Doublons intelligents ;
  * Bibliothèque d'images ;
  * Répertoire ;
- bouton Actualiser ;
- aucune suppression, modification ou analyse lourde déclenchée depuis le
  tableau.

Important
---------
Un compteur absent ou non encore calculé est affiché comme indisponible /
non analysé. CGWEB041 n'invente jamais de valeur.

Sécurité
--------
CGWEB041 ne contient aucune primitive d'écriture Firebase.
