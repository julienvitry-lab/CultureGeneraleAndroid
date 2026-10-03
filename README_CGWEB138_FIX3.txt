CGWEB138 FIX3
=============

SMOKE_PANEL_RETIRE001
---------------------
Le smoke test CGWEB138 a été validé avec succès sur Firebase réel.

Le panneau visible est retiré de l'interface de production.

Sont supprimés :
- le panneau automatique ;
- le bouton de lancement ;
- le montage dans Création de questions ;
- le MutationObserver ;
- l'ouverture automatique.


TEST_HARNESS_PRESERVE001
------------------------
Le moteur reste disponible sans interface visible.

Diagnostic futur depuis la console navigateur :

await window.CGWEB138_API.run()

Le scénario conservé reste :

CREATE
→ UPDATE
→ HISTORY
→ RESTORE
→ DELETE.


PRODUCTION_UI_CLEANUP001
------------------------
CGWEB138 n'ajoute plus aucun élément visuel à l'interface.

Aucune exécution automatique.
Aucune migration Firestore.
Aucune modification du catalogue.


LITERAL_NEWLINE_REPAIR001
-------------------------
FIX3 FIX1 corrige également une séquence backslash+n littérale
ajoutée par erreur à la fin de cgweb138.js lors du premier passage FIX3.
