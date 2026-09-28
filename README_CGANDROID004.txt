CGANDROID004 · HISTORY_QR001
============================

OBJECTIF
--------
Adapter l'historique au nouveau modèle Question / Réponse
avec auto-évaluation binaire.

CGANDROID004 conserve intégralement le fonctionnement
CGANDROID003 :

Question
→ Révéler
→ Réponse
→ J'avais bon / J'avais faux


ACCUEIL
-------
Ajout d'un bouton :

Historique


RÉSUMÉ GLOBAL
-------------
4 indicateurs :

- Questions vues
- Réussites
- Échecs
- Taux de réussite


FILTRES
-------
- Tout
- Réussites
- Échecs


LISTE CHRONOLOGIQUE
-------------------
Classement du plus récent au plus ancien.

Chaque entrée affiche :

- date / heure
- mégathème
- thème
- question
- bonne réponse
- J'avais bon / J'avais faux


DÉTAIL D'UNE QUESTION
---------------------
Un appui sur une entrée ouvre :

- question
- réponse
- nombre de passages
- réussites
- échecs
- dernier résultat
- chronologie des passages


SOURCE
------
Firestore :

users/<uid>/play_history


COMPATIBILITÉ
-------------
Les événements possédant is_correct sont considérés
comme évaluables.

Les nouveaux événements CGANDROID003 / 004 utilisent :

interaction_mode = self_assessment_qr


LIMITE
------
Les 1000 événements évaluables les plus récents
sont chargés.

Une pagination Firestore de 100 documents par page
est utilisée.


RESET
-----
AUCUNE remise à zéro dans CGANDROID004.

Le futur LEARNING_RESET001 fera l'objet d'un lot séparé.


VERSION
-------
versionCode : 4
versionName : CGANDROID004
CG_CHANNEL  : CGANDROID004

Artifact :

CultureGenerale-Tablet-CGANDROID004
