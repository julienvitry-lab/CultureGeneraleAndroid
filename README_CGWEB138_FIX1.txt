CGWEB138 FIX1
=============

VISIBLE_SMOKE_PANEL001
----------------------
CGWEB138 était initialement ajouté dans l'ancien élément <main>.

Or l'interface moderne est rendue dans le shell dynamique CGWEB016,
situé après cet ancien <main>.

Le panneau existait donc dans le DOM mais se trouvait dans une zone
qui n'est plus l'espace de travail visible.


CREATE_TAB_MOUNT001
-------------------
Le panneau est désormais monté dans :

#cg16PageCreate

juste sous le formulaire :

#cg16CreateForm

Il apparaît donc dans l'onglet principal :

Création de questions


ORDRE DE CHARGEMENT
-------------------
CGWEB138 et CGWEB016 sont tous deux chargés dynamiquement.

Le panneau est d'abord créé sans dépendre de l'ordre d'exécution.

Si #cg16PageCreate n'existe pas encore, un MutationObserver attend
sa création puis déplace immédiatement le panneau dans l'onglet.

L'observateur est ensuite arrêté.


VISIBILITÉ
----------
Le panneau est ouvert par défaut.

Après déploiement :

1. ouvrir CGWEB ;
2. cliquer sur "Création de questions" ;
3. le bloc "CGWEB138 · Smoke test Q/R" doit apparaître sous le
   formulaire de création ;
4. cliquer sur "Lancer le smoke test Q/R".


Aucune logique du smoke test n'est modifiée.
Aucune migration Firestore.
