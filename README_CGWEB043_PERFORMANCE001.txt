CGWEB043 - PERFORMANCE001
=========================

But
---
Réduire le travail permanent du navigateur après l'ajout des modules
CGWEB037 à CGWEB042, sans modifier leur comportement fonctionnel.

Optimisations
-------------
CGWEB038
- suppression du risque de boucle MutationObserver -> render -> mutation ;
- les mutations internes au bandeau Fiche question sont ignorées ;
- rafraîchissement de la synthèse temporisé à 120 ms ;
- les changements des champs de l'éditeur sont suivis par input/change.

CGWEB039
- l'observer DOM n'exécute plus sa logique à chaque mutation de toute la page ;
- filtrage sur les ajouts pertinents (table / panneau Plus / bouton) ;
- traitement temporisé à 120 ms.

CGWEB040
- le polling ne sérialise plus l'intégralité de toutes les URL/messages ;
- signature compacte basée sur l'état et les agrégats ;
- intervalle porté à 2 s ;
- polling suspendu lorsque l'onglet navigateur est masqué ;
- resynchronisation immédiate au retour.

CGWEB041
- suppression du rescannage automatique de tout document.body toutes les 15 s ;
- le tableau qualité reste actualisé à l'ouverture et via son bouton Actualiser.

Rendu
-----
Les cartes longues d'historique/import et d'analyse d'apprentissage utilisent
content-visibility:auto afin de différer le rendu des éléments hors écran.

Sécurité
--------
- aucune écriture Firebase ajoutée ;
- aucune suppression de fonction ;
- aucun changement des workflows ;
- les tokens historiques CGWEB018_FIX5 et CGWEB032_1 restent intacts.
