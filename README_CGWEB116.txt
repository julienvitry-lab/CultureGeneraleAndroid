CGWEB116
========

QUIZYPEDIA_CATALOG001
---------------------
Nouvelle sous-rubrique dans Répertoire :

Questions | Thèmes Quizypedia

Le catalogue est classé par mégathème et affiche :
- thème ;
- nombre de questions Quizypedia ;
- nombre de questionnaires distincts ;
- date du dernier import ;
- lien vers le thème Quizypedia.

HISTORICAL_REBUILD001
---------------------
Au premier accès sans catalogue existant :
- lecture de l'historique des questions CGWEB ;
- détection des questions possédant url_quizypedia ;
- extraction du thème depuis /quiz/<theme>/... ;
- regroupement par mégathème ;
- comptage des questions ;
- dédoublonnage des URL de questionnaires.

La reconstruction est volontairement déclenchée une seule fois
et le catalogue condensé est ensuite mémorisé.

PERSISTENCE001
--------------
- cache local navigateur systématique ;
- tentative de synchronisation dans :
  users/<uid>/quizypedia_theme_catalog
- si les règles Firestore n'autorisent pas cette nouvelle
  sous-collection, le catalogue local reste fonctionnel.

CATALOG_LIVE_UPDATE001
----------------------
CGWEB010_API.create est enveloppé sans modifier son moteur :
après un futur import Quizypedia réussi, le catalogue est
mis à jour automatiquement.

IMPORT_DUP_GUARD001
-------------------
Dans l'importeur Quizypedia :
- reconnaissance de l'URL saisie ;
- comparaison au catalogue ;
- avertissement "Déjà intégré dans CGWEB" ;
- nombre de questions ;
- nombre de questionnaires ;
- détection d'un questionnaire exact déjà recensé ;
- bouton "Voir dans le catalogue".

Le garde n'interdit pas techniquement l'import :
l'utilisateur garde la possibilité de réimporter volontairement.

AUCUNE MODIFICATION
-------------------
- du contenu des questions ;
- du moteur de capture Quizypedia ;
- des classifications existantes ;
- du Répertoire de questions existant.


CGWEB116 FIX1
=============

SQLITE_HISTORY_MERGE001
-----------------------
Ajout du bouton "Intégrer SQLite".

Le fichier SQLite historique Android est lu localement
dans le navigateur.

Table :
questions

Colonnes :
- megatheme
- theme
- url_quizypedia
- url_internet en fallback

Fusion sans double comptage :
questions_count = MAX(Firestore, SQLite)

Le patrimoine SQLite est persisté :
- cache navigateur
- Firestore :
  users/<uid>/quizypedia_legacy_catalog

Le garde anti-doublon tient désormais compte
des anciens imports SQLite.
