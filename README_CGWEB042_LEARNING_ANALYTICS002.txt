CGWEB042 - LEARNING_ANALYTICS002
================================

Objectif
--------
Ajouter dans Apprentissage une vue "Analyse croisée" sans dupliquer le
backend analytique CGWEB035.

Principe
--------
CGWEB042 relit séquentiellement les vues déjà calculées par CGWEB035 :
- Historique ;
- Maîtrise ;
- Points faibles ;
- Temps de réponse ;
- Difficulté.

Il ne crée aucun nouveau calcul Firestore et n'écrit aucune donnée.

Analyse
-------
La vue agrège les mesures réellement exposées par les écrans existants :
- résumé global de maîtrise ;
- taille de l'historique visible ;
- réussite par domaine lorsque disponible ;
- difficulté par domaine ;
- nombre de réponses évaluées ;
- médiane et moyenne de temps de réponse ;
- nombre de chronos.

Repères visuels explicites
--------------------------
Les seuils sont affichés dans l'interface et servent uniquement de repères :
- difficulté élevée : >= 60 / 100 ;
- réussite fragile : < 60 % ;
- réponse lente : médiane >= 15 s ;
- peu de données : moins de 3 observations.

Une valeur non exposée par la vue source reste affichée "—".
Aucune donnée n'est inventée.

Sécurité
--------
- lecture seule ;
- aucune primitive d'écriture Firebase ;
- les boutons sources CGWEB035 restent les moteurs de calcul ;
- après analyse, l'utilisateur peut rouvrir directement Maitrise,
  Temps de réponse ou Difficulté.
