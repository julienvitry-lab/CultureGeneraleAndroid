CGWEB035 · LEARNING_HUB001 · FIX1 GITHUB SAFE

Architecture :
- aucun workflow GitHub n'est modifié par GitHub Actions ;
- le frontend CGWEB035 appelle cgweb032Search, déjà présent dans le pipeline ;
- cgweb032Search délègue les requêtes cgweb035=true au helper web/functions/cgweb035.js ;
- le push déclenche le workflow Web existant, qui redéploie cgweb032Search et Firebase Hosting.

Fonctions transférées sur Web :
- Historique
- Maîtrise
- Jamais vues
- À réviser
- Points faibles
- Temps de réponse
- Difficulté
