CGWEB044 - UX_POLISH001
=======================

Objectif
--------
Harmoniser l'interface CGWEB après la consolidation des écrans et l'ajout
des modules CGWEB037 à CGWEB043.

Modifications visuelles
-----------------------
- navigation principale : onglets de même largeur et même hauteur ;
- Plus : boutons homogènes, texte centré, groupes plus lisibles ;
- Apprentissage : sous-onglets de dimensions cohérentes ;
- boutons d'action des modules récents harmonisés ;
- rayons, espacements et hauteurs de cartes cohérents ;
- tableaux défilables horizontalement sur petits écrans ;
- responsive 900 / 620 / 420 px ;
- disparition visuelle des marqueurs techniques autonomes du type
  CGWEB031 · HOME002, CGWEB018 · DIRECTORY003, etc.

Sécurité de la suppression visuelle
-----------------------------------
Seuls les éléments texte autonomes correspondant strictement à un motif de
marqueur technique sont masqués. Les textes normaux, boutons, liens,
champs, code et messages de diagnostic ne sont jamais supprimés.

Confort de navigation
---------------------
L'onglet principal, le sous-onglet Plus et le sous-onglet Apprentissage
courants sont mémorisés uniquement pour la session navigateur afin de
retrouver plus facilement le contexte après un rechargement.

Données
-------
- aucune écriture Firebase ;
- aucun workflow modifié ;
- aucune donnée métier modifiée ;
- stockage UI limité à sessionStorage.
