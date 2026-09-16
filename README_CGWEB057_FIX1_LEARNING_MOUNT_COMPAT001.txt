CGWEB057 FIX1 - LEARNING_MOUNT_COMPAT001
=========================================

Cause
-----
SMART_REVIEW_BRIDGE001 cherchait uniquement :
  [data-cg16-page-panel="learning"]

Or la navigation courante heberge Apprentissage dans :
  [data-cg16-plus-panel="learning"]

Symptome confirme dans DevTools :
- pagePanel: false
- plusPanel: true
- planRevision: false

Correction
----------
- le Plan de revision accepte les deux structures DOM ;
- le bouton Ouvrir Session intelligente accepte un bouton Apprentissage
  data-cg16-page OU data-cg16-plus ;
- si le panneau existe deja sous un ancien conteneur, il est rehberge dans le bon ;
- aucun calcul d'apprentissage n'est modifie ;
- aucune ecriture Firestore ;
- aucun Python.

Test attendu
------------
Apprentissage > un bloc "Plan de revision" doit apparaitre sous les onglets.
Console :
  !!document.getElementById("cgweb057Panel")
doit renvoyer true.
