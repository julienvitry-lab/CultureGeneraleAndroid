CGWEB038 - QUESTION_WORKSPACE001
================================

Objectif
--------
Quand une question est ouverte depuis Repertoire ou depuis les resultats
plein texte CGWEB037/CGWEB032, ajouter un espace de contexte unifie.

Fonctionnement
--------------
- le clic original sur "Ouvrir" n'est jamais bloque ;
- CGWEB038 capture le contexte de la ligne : ID, megatheme, theme, question ;
- apres ouverture de la fiche existante, CGWEB038 detecte son panneau ;
- un bandeau "Fiche question" est insere au-dessus de l'editeur existant ;
- la synthese reprend, quand ils sont exposes par la fiche :
  question, reponses, detail, source et image ;
- bouton Copier ID ;
- bouton Retour au Repertoire ;
- le contexte CGWEB037 (filtres / position) reste exploitable au retour.

Choix de securite
-----------------
QUESTION_WORKSPACE001 est volontairement non destructif :
- pas de nouvel editeur ;
- pas de copie de la logique de sauvegarde ;
- pas d'ecriture Firebase ;
- aucune interception du comportement natif du bouton Ouvrir.

Cette premiere version sert de socle avant des extensions ulterieures
(historique de modifications, apprentissage, image, qualite) dans le meme
workspace.
