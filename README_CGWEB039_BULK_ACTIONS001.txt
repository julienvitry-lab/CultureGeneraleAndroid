CGWEB039 - BULK_ACTIONS001
==========================

Objectif
--------
Relier la selection du Repertoire a l'outil Web existant
"Modifications massives", sans creer un deuxieme moteur d'ecriture.

Fonctions
---------
- miroir de selection par ID en sessionStorage ;
- conservation des ID lors de la navigation/pagination ;
- compteur "selection massive" dans Repertoire ;
- export CSV de la selection ;
- previsualisation obligatoire avant de quitter Repertoire ;
- affichage des ID et repartition par theme quand disponible ;
- bouton "Continuer vers Modifications massives" ;
- ouverture de l'outil existant situe sous Plus ;
- panneau de transfert dans Modifications massives ;
- Copier les ID ;
- Inserer les ID uniquement si un champ clairement identifie ID /
  identifiants / questions est reconnu ;
- aucun bouton d'application ou d'ecriture n'est declenche par CGWEB039.

Securite
--------
CGWEB039 n'effectue aucune ecriture Firestore et ne modifie pas CGWEB021.
L'outil historique de modifications massives reste l'unique moteur
d'ecriture et conserve ses propres validations.
