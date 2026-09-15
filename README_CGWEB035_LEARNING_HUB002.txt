CGWEB035 FIX2B · LEARNING_HUB002
================================

NO_DATA_DIFFICULTY001
- une question avec 0 réponse évaluée n'a plus de score de difficulté ;
- difficulté = null côté backend ;
- affichage Web = « Difficulté — · données insuffisantes » ;
- ces questions sont exclues de la difficulté moyenne du thème/domaine/global ;
- le classement Difficulté place les éléments sans données après les éléments évalués.

UX
- pluriels principaux corrigés ;
- « 0 % réussite » n'est plus affiché lorsqu'il n'existe aucune réponse évaluée ;
- navigation principale légèrement compactée pour éviter le collage des libellés.

Architecture
- aucun accès SQLite ;
- aucune écriture Firestore ;
- aucune modification de workflow GitHub par le job ;
- routage CGWEB035 via cgweb032Search conservé.
