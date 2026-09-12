CGIMAGE008 · Récupération sémantique des images restantes

Objectif
--------
Aider à traiter les IDs encore présents dans le journal d'échec CGIMAGE006
après CGIMAGE007.

Principe
--------
1. Le panneau Web lit les IDs échoués depuis localStorage.
2. Il appelle une Cloud Function qui :
   - relit chaque question Firestore ;
   - construit plusieurs requêtes sémantiques à partir de la question,
     de la réponse, de la catégorie et de l'indice d'URL historique ;
   - cherche des candidats visuels sur Wikimedia Commons et Wikipedia.
3. L'utilisateur choisit visuellement la bonne image.
4. Une deuxième Cloud Function télécharge cette image, l'enregistre dans
   Firebase Storage puis met à jour Firestore.

Sécurité
--------
- aucune écriture n'est faite pendant l'analyse ;
- l'écriture n'a lieu qu'après clic sur « Utiliser cette image » ;
- l'ID est retiré du journal d'échec uniquement après succès d'écriture.
