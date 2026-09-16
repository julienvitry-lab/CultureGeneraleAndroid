CGWEB045-052 - TOTAL001
========================

CGWEB045 - COMMAND_PALETTE001
  Palette Ctrl/Commande+K pour la navigation rapide.

CGWEB046 - SAVED_VIEWS001
  Vues de filtres/champs enregistrées localement, sans clic automatique sur Appliquer.

CGWEB047 - QUESTION_RECENTS001
  Historique local des 50 dernières fiches question ouvertes + export CSV.

CGWEB048 - STUDY_QUEUE001
  File d'apprentissage locale ; ajout depuis une fiche ou la sélection CGWEB039.

CGWEB049 - LOCAL_BACKUP001
  Export/import JSON des états localStorage/sessionStorage CGWEB/CGIMPORT uniquement.

CGWEB050 - OFFLINE_SHELL001
  Manifest + service worker pour les ressources statiques same-origin.
  Les appels Firebase/Google/Quizypedia ne sont pas mis en cache par ce lot.

CGWEB051 - ACCESSIBILITY001
  Focus visible, lien d'évitement, aria-current, tableaux clavier, reduced-motion/contrast.

CGWEB052 - HEALTHCHECK001
  Auto-diagnostic local et export de rapport.

Principes de sécurité
---------------------
- aucun nouveau setDoc/updateDoc/deleteDoc/addDoc/writeBatch/runTransaction ;
- aucune écriture Firebase directe ;
- aucun moteur historique remplacé ;
- aucun clic automatique sur un bouton métier d'application/sauvegarde ;
- stockage ajouté limité à localStorage/sessionStorage/cache navigateur ;
- CGWEB018_FIX5 et CGWEB032_1 doivent rester intacts.
