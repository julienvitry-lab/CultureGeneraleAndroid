CGWEB116 FIX3 FIX1
==================

QUIZYPEDIA_STACK_SOURCE001
--------------------------
Correction du FIX3 précédent.

Cause :
cgweb109.js recréait lui-même les boutons :
- URL unique
- Plusieurs URL · CSV / ODS

et wireQuizMode() continuait à masquer l'un des deux panneaux.

Correction :
- les deux boutons ne sont plus générés ;
- URL unique reste visible en permanence ;
- l'import CSV / ODS reste visible en permanence ;
- URL unique est placé au-dessus ;
- CSV / ODS est placé juste en dessous ;
- aucun sous-onglet n'est conservé.


SPORT_AUTH_EXACT001
-------------------
Correction du ciblage précédent.

#cloudBadge est un SPAN et non un BUTTON.

Le style est donc appliqué directement à :
- #cloudBadge
- #logoutBtn

Les deux ont désormais :
- hauteur identique 42 px ;
- police Comfortaa 16 px / 700 ;
- forme pilule ;
- texte blanc ;
- Connecté : fond vert ;
- Déconnexion : fond rouge ;
- padding horizontal identique.
