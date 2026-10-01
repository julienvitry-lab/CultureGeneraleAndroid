CGWEB126
========

HISTORY_RESULT_TRUTH001
ANDROID_MENTAL_COMPAT001
HISTORY_RETRO_READ001

PROBLEME
--------
Les événements Android récents sont enregistrés avec :
- play_type = challenge_mental
- result = correct / wrong
- is_correct = true / false

CGWEB utilisait encore l'ancien contrat :
- challenge_mental positif uniquement si result = assimilated
- tout autre résultat mental affiché comme « À revoir »

Conséquence :
une réponse Android correcte pouvait être correctement enregistrée dans
Firestore mais être relue comme une erreur par CGWEB.

CORRECTION BACKEND
------------------
Pour challenge_choice et challenge_mental :
1. si is_correct est booléen, il constitue la vérité prioritaire ;
2. sinon, compatibilité de lecture :
   - correct / assimilated => positif
   - wrong / review => négatif

La correction est faite à la lecture. Aucun document play_history n'est
réécrit et aucune migration Firestore n'est nécessaire.

CORRECTION FRONTEND
-------------------
cg35HistoryResult() n'interprète plus directement result === assimilated.
Pour les événements évaluables, l'affichage s'appuie sur e.positive fourni
par le backend.

Ainsi :
- e.positive === true  => Assimilée / Juste
- e.positive === false => À revoir / Faux

RETROACTIVITE
-------------
Les événements historiques Android déjà stockés avec is_correct=true/false
et correct/wrong sont corrigés dès la prochaine lecture après déploiement.

NON MODIFIE
-----------
- données Firestore ;
- historique Android local ;
- modèle pédagogique ;
- calcul d'analogie T ;
- CGANDROID017 ;
- catalogue de questions.
