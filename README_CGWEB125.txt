CGWEB125
========

QUIZYPEDIA_MINIMAL001
SINGLE_URL_ONLY001
AUXILIARY_UI_RETIRE001
DUPLICATE_ACTION_REMOVE001
THEME_AUTO_ONLY001


OBJECTIF
--------
Réduire Quizypedia à sa fonction utile :

IMPORT PAR URL UNIQUE.


SUPPRIMÉ DU RUNTIME
-------------------
- CGWEB122 :
  Extraction intégrale Quizypedia

- CGWEB123 :
  Fabrique IA de questions Q/R

- CGIMPORT011 :
  import CSV / ODS de plusieurs URL

- CGWEB040 :
  centre de contrôle du lot multi-URL


SUPPRIMÉ DE L'INTERFACE
-----------------------
- champ Thème
- Tout sélectionner
- Tout désélectionner
- second bouton Importer


CONSERVÉ
--------
- Adresse Quizypedia
- choix du mégathème
- détection automatique du thème
- import URL unique
- bouton principal Importer
- moteur Quizypedia strict existant


COMPATIBILITÉ
-------------
cgimp2Theme reste présent sous forme hidden.

cgimp2Import reste présent sous forme de hook DOM invisible.

Ces deux ID techniques sont utilisés par le moteur existant
et ne doivent pas apparaître visuellement.


CGWEB124
--------
CGWEB124 RAW_TEXT_EXTRACTOR001 est conservé.

Il est indépendant de CGWEB123 et de la fabrique IA.


ROLLBACK
--------
Les anciens fichiers restent présents dans Git.

Ils ne sont simplement plus chargés dans index.html.
