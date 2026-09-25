CGWEB116 FIX3 FIX2
==================

MULTI_URL_PIPELINE_REPAIR001
----------------------------
Cause de la panne :

CGIMPORT011 recherchait le bouton à partir
du texte exact :
"Analyser l’URL"

CGWEB116 FIX2 avait volontairement renommé
ce bouton :
"Analyser"

Les fichiers CSV / ODS étaient donc lus,
mais chaque URL échouait avant même l'analyse.


STABLE_CONTROL_IDS001
---------------------
Les automatismes utilisent désormais les ID :

- #cgimp2Analyze
- #cgimp2Import

et ne dépendent plus des libellés visibles.


FULL_MULTI_URL_PIPELINE001
--------------------------
Pour chaque URL :

1. insertion de l'URL ;
2. Analyser ;
3. attente de fin de capture ;
4. attente de disponibilité d'Importer ;
5. Importer ;
6. attente de fin d'écriture ;
7. récupération des statistiques ;
8. passage à l'URL suivante.


QUEUE_PRESERVED001
------------------
La file existante dans localStorage reste intacte.

Après déploiement :
il n'est pas nécessaire de recharger le CSV / ODS.

Cliquer simplement sur :
"Lancer l'import"

Les lignes actuellement en erreur seront retraitées.
