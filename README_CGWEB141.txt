CGWEB141
========

QUIZYPEDIA_THEME_STATE_RESET001
-------------------------------
Chaque nouvelle URL Quizypedia réinitialise :
- extracted
- drafts
- questionnaires
- état batch
- thème caché

Le mégathème choisi est conservé.


URL_THEME_SOURCE_OF_TRUTH001
----------------------------
Le thème provient désormais de :

/quiz/<THEME>/...

cgimp2Theme devient uniquement un miroir.

Il ne peut plus imposer le thème de l'import précédent.


RECENT_IMPORT_AUDIT001
----------------------
L'onglet Quizypedia contient :

Contrôle des imports Quizypedia récents

Bouton :

Vérifier les 30 derniers thèmes

Lecture :
- cg_created_at décroissant
- 100 documents par page
- maximum de sécurité 50 pages
- aucune lecture automatique au chargement


CREATED_AT_SORT001
------------------
Le Répertoire ajoute :
- colonne Création
- tri Date de création
- date + heure


THEME_MISMATCH_DETECT001
------------------------
Pour chaque fiche récente :

thème attendu =
segment <THEME> de url_quizypedia

comparé à :

champ theme enregistré.


SAFE_THEME_REPAIR001
--------------------
Aucune correction automatique.

L'utilisateur :
1. lance le contrôle ;
2. sélectionne les anomalies ;
3. visualise Avant -> Après ;
4. confirme.

Seul le champ theme est modifié.

La modification passe par CGWEB006 / CGSYNC007 :
- expectedRevision
- historique
- protection contre conflit

Aucune migration massive Firestore.
