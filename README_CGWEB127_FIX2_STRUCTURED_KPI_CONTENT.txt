CGWEB127 FIX2
=============

LOWER_KPI_UNIFORM_HEIGHT002
KPI_TWO_ROW_LAYOUT001

PROBLEME
--------
Le simple ajout de hauteur du FIX1 ne supprimait pas le chevauchement
du dernier indicateur :

Questions évaluées pour la difficulté
1286

CAUSE
-----
La disposition interne restait fondée sur un empilement flex compact.
Ajouter quelques pixels ne garantissait pas une séparation structurelle
entre le libellé et la valeur.

CORRECTION
----------
Les 10 KPI inférieurs utilisent désormais exactement la même structure :

- hauteur identique : calc(54px + 4mm) ;
- grille interne à deux lignes :
  1. libellé
  2. valeur
- row-gap : 4px ;
- line-height du libellé : 1.18 ;
- line-height de la valeur : 1.08.

REGLE D'UNIFORMITE
------------------
Le dernier bloc n'a AUCUNE hauteur spécifique.
S'il faut de la hauteur, les 10 blocs l'obtiennent ensemble.

NON MODIFIE
-----------
- KPI supérieurs ;
- largeur des blocs ;
- taille des polices ;
- valeurs ;
- calculs ;
- backend ;
- données Firestore.
