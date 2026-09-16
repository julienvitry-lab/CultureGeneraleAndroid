CGWEB040 - IMPORT_CONTROL_CENTER001
===================================

Objectif
--------
Industrialiser le suivi des imports Quizypedia sans creer de second moteur
d'import et sans ecriture Firestore directe.

Fonctions
---------
- synthese du lot CGIMPORT011 en cours ;
- progression themes termines / erreurs / attente ;
- total de questions ajoutees ;
- bouton Lancer / reprendre ;
- bouton Relancer uniquement les erreurs ;
- reutilisation de CGIMPORT011.parseFile() pour creer une nouvelle file
  ne contenant que les URL en echec ;
- telechargement du rapport actuel via CGIMPORT011.downloadReport() ;
- archivage local automatique d'un lot lorsque toutes ses lignes sont
  terminees ou en erreur ;
- historique local de 30 lots maximum ;
- rapport CSV d'un ancien lot ;
- relance des erreurs depuis un ancien lot ;
- effacement manuel de l'historique local.

Stockage
--------
L'historique de CGWEB040 reste dans localStorage du navigateur.
Il n'est pas envoye vers Firebase.

Securite
--------
CGWEB040 ne clique jamais sur un bouton d'ecriture Firebase et ne duplique
pas le moteur CGIMPORT011. Il ne fait que piloter son API publique.
