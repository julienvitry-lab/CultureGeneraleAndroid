CGWEB037 - DIRECTORY_SEARCH002
==============================

But
---
Faire du Repertoire le point unique de recherche dans la base sans recreer
un second moteur de recherche.

Architecture
------------
CGWEB037 reutilise les deux modules deja valides :
- CGWEB018 pour les filtres / tableau / pagination du Repertoire ;
- CGWEB032 pour la recherche plein texte sur question, detail, theme et megatheme.

Le panneau Search historique, retire de la navigation principale, est integre
dans la page Repertoire. Les vrais controles CGWEB032 "Mots recherches" et
"Rechercher" sont deplaces dans la barre du Repertoire : leurs listeners
existants sont donc conserves.

Fonctions
---------
- champ visible "La fiche contient" ;
- recherche question + detail + theme + megatheme via CGWEB032 ;
- synchronisation des filtres Megatheme / Theme / Image / limite quand possible ;
- filtres CGWEB018 toujours disponibles ;
- résultats classiques du Repertoire masques pendant une recherche plein texte ;
- bouton Effacer pour revenir aux resultats du Repertoire ;
- 10 recherches recentes en localStorage ;
- filtres nommes enregistres localement ;
- memorisation des valeurs de filtres ;
- memorisation de la position de defilement avant ouverture d'une fiche ;
- restauration du contexte au retour.

Donnees
-------
CGWEB037 n'ajoute aucune ecriture Firestore.
Les recherches recentes et filtres favoris sont uniquement stockes dans
localStorage du navigateur.

Important
---------
CGWEB037 ne remplace pas CGWEB032 et ne modifie pas son backend. Il l'emploie
comme moteur plein texte afin d'eviter deux implementations concurrentes.
