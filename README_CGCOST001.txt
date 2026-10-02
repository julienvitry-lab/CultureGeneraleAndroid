CGCOST001 / FIRESTORE_READ_OPTIMIZE001
========================================

Objectif
--------
Réduire drastiquement Cloud Firestore Read Ops sans modifier les données métier.

Constat
-------
Le manifeste CGWEB012 contient 217 576 questions.
Un balayage intégral représente donc environ 217 576 lectures Firestore.
Les points coûteux identifiés étaient notamment :
- CGWEB018 : reconstruction périodique du catalogue de thèmes ;
- CGWEB032 : balayage complet du catalogue pour chaque recherche plein texte hors cache ;
- CGWEB035 : chargement complet du catalogue pédagogique en mémoire, renouvelé après expiration/cold start.

Solution
--------
Nouveau module partagé web/functions/cgcost001.js.

Il construit une première fois un snapshot projeté du catalogue puis le stocke compressé
(GZIP) dans Firebase Storage :
  system/cgcost001/<uid>/questions-v1.json.gz

Les appels suivants :
- lisent le snapshot persistant ;
- appliquent uniquement les documents modifiés depuis les marqueurs cg_updated_at / updated_at ;
- appliquent les suppressions depuis question_tombstones ;
- utilisent un count() de contrôle pour détecter une anomalie de cardinalité ;
- ne refont un scan complet que si le snapshot est absent ou incohérent.

CGWEB032 et CGWEB035 utilisent désormais ce snapshot partagé.
CGWEB018 reconstruit son petit catalogue de thèmes depuis ce snapshot, et non plus depuis
une lecture intégrale de Firestore.

Sécurité
--------
Aucune suppression de question.
Aucune modification du schéma métier.
Aucune modification des règles Firestore.
Le snapshot Storage est dérivé et peut être supprimé sans perte de données : il sera reconstruit.

Coût attendu
------------
Le premier appel après déploiement peut volontairement effectuer un unique scan complet afin
de créer le snapshot. Ensuite, le coût de lecture suit principalement le nombre de questions
réellement modifiées, au lieu du nombre total de questions multiplié par le nombre d'appels.
