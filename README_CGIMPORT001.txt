CGIMPORT001 — MIGRATION COMPLETE SQLITE -> FIRESTORE
=======================================================

OBJECTIF
--------
Faire de Firestore la base centrale de contenu des questions, en important
l'intégralité de `questions_base.sqlite` dans :

    users/<uid>/questions/<original_id>

La source est volontairement SQLite, et non BASE.xlsx, car le SQLite contient
les corrections/modifications accumulées depuis la conversion initiale.

SECURITE
--------
- Le script ouvre SQLite en lecture seule.
- Le mot de passe Firebase est demandé de façon masquée et n'est jamais écrit.
- Le script est reprenable : le checkpoint n'avance qu'après un lot Firestore
  confirmé.
- Le débit est limité par défaut.
- La première étape recommandée est impérativement `--dry-run`.

STATUT / PROGRESSION
--------------------
Par défaut, CGIMPORT001 copie `status` comme photographie au moment de la
migration afin de conserver l'affichage actuel du Web.

Mais :
    SYNCLOUD001 reste l'unique source ACTIVE de progression/statuts.
    CGSYNC002 n'écrit jamais le statut dans SQLite.
Un pont Web dédié aux statusBuckets pourra être ajouté ensuite pour que les
filtres Web de statut restent temps réel.

QUOTA FIRESTORE
---------------
Le mode par défaut limite chaque lancement à 18 000 écritures pour laisser une
marge sous le quota gratuit quotidien Standard de Firestore.

Pour migrer tout en une fois avec facturation activée :
    --limit 0

Le checkpoint permet de reprendre exactement là où le précédent lancement
s'est arrêté.

ETAPE 1 — DRY-RUN
-----------------
Depuis la racine du dépôt :

    python tools/cgimport001.py --dry-run

Résultat attendu :
- environ 200 000 questions
- 0 ID manquant
- 0 ID dupliqué
- aucune écriture Cloud

ETAPE 2 — IMPORT PRUDENT (quota gratuit)
----------------------------------------
    python tools/cgimport001.py

Le script demande :
- l'e-mail Firebase
- le mot de passe Firebase (masqué)

Il importe au maximum 18 000 questions puis s'arrête proprement.
Relancer la même commande les jours suivants.

ETAPE 2 BIS — IMPORT COMPLET (Blaze / facturation active)
----------------------------------------------------------
    python tools/cgimport001.py --limit 0

ETAPE 3 — REPRISE
-----------------
Aucune option spéciale :
    python tools/cgimport001.py

Le fichier `CGIMPORT001_checkpoint.json` est lu automatiquement.

REPARTIR DE ZERO
----------------
Seulement si explicitement voulu :
    python tools/cgimport001.py --restart

ATTENTION :
Cela repart de la première question et réécrit les documents déjà présents.

VALIDATION FINALE
-----------------
Une fois la migration terminée :
- vérifier le compteur Cloud dans le site ;
- tester plusieurs IDs éloignés ;
- éditer une question avec CGWEB005 ;
- vérifier sa redescente Android avec CGSYNC002.

Aucune suppression de BASE.xlsx ou de SQLite n'est prévue dans CGIMPORT001.
Cette suppression/archivage ne devra intervenir qu'après validation complète.
