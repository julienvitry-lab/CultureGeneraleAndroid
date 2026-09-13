CGWEB018 FIX3

Cause réelle du problème
------------------------
CGWEB018 FIX2 était correctement présent dans le dépôt :
- « Thème contient »
- « Recherche image »
- menus sombres

Mais CGWEB016 continuait de déplacer DEUX panneaux dans le même onglet :
- cgweb018Panel : nouveau Répertoire avancé
- cgweb006Panel : ancien Répertoire complet

L'ancien CGWEB006 contient toujours « Thème exact » et ses propres menus.
Selon l'ordre/état CSS, c'est cet ancien écran qui restait visible.

Correction FIX3
---------------
- cgweb018Panel = unique interface visible de Répertoire de questions ;
- cgweb006Panel reste chargé pour compatibilité mais est masqué par CGWEB016 ;
- suppression du bouton « Vue classique » qui pouvait réafficher CGWEB006 ;
- renforcement des couleurs des select/options ;
- cache-bust simultané de CGWEB016 et CGWEB018.

Résultat attendu
----------------
Dans Répertoire de questions :
- titre « Répertoire de questions » ;
- filtre « Thème contient » avec exemple « capitales » ;
- filtre « Recherche image » ;
- menus déroulants bleu sombre / texte clair ;
- aucun ancien bloc « Répertoire complet des questions » / « Thème exact ».
