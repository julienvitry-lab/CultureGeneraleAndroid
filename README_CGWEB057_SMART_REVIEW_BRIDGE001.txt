CGWEB057 - SMART_REVIEW_BRIDGE001
===================================
Le projet possède déjà CGPLAY001 « Session intelligente » (révisions échues,
points faibles, jamais vues). CGWEB057 ne duplique donc PAS ce moteur.
Il ajoute un Plan de révision qui :
- ouvre directement Session intelligente ;
- importe les fiches récemment ouvertes CGWEB047 vers la file locale CGWEB048 ;
- importe les questions récemment modifiées exposées par CGWEB017 ;
- affiche les compteurs locaux.
Aucune nouvelle donnée analytique n'est inventée et aucune écriture Firestore n'est faite.
