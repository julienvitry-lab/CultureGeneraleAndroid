CGWEB127 FIX1
=============

LOWER_KPI_HEIGHT_PLUS_1MM001

OBJECTIF
--------
Ajouter exactement 1 mm de hauteur aux 10 tuiles KPI inférieures du panneau
Historique > Détail afin d'éviter le chevauchement du libellé long :

« Questions évaluées pour la difficulté »

PORTÉE
------
Uniquement :
- 5 tuiles Maîtrise ;
- 5 tuiles Temps de réponse et difficulté.

NON MODIFIÉ
-----------
- 8 KPI supérieurs ;
- largeur des tuiles ;
- taille de police ;
- contenu ;
- calculs ;
- backend ;
- données Firestore.

IMPLEMENTATION
--------------
Hauteur précédente :
54px

Nouvelle hauteur :
calc(54px + 1mm)
