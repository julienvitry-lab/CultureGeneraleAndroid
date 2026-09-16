CGWEB053-060 - TOTAL001
========================

CGWEB053 · QUESTION_HISTORY002
Historique détaillé par fiche, différences avant/après et préparation non enregistrée
dans l'éditeur CGWEB019.

CGWEB054 · DUPLICATE_REVIEW002
Workflow local de triage des paires CGWEB025 : à revoir / pas doublon / confirmé / note.

CGWEB055 · IMAGE_QUALITY001
Audit du catalogue : couverture image, incohérences de métadonnées, non_trouve,
sources image manquantes, HTTP et chemins image partagés. Export CSV.

CGWEB056 · SOURCE_AUDIT001
Couverture des sources, domaines, URL invalides/HTTP et questions sans source.

CGWEB057 · SMART_REVIEW_BRIDGE001
Le moteur CGPLAY001 « Session intelligente » existe déjà : CGWEB057 l'orchestre
avec la file locale CGWEB048 et les questions récentes au lieu de le dupliquer.

CGWEB058 · SIMILARITY_SEARCH001
Comparaison d'une question au catalogue avec score local mots + trigrammes.

CGWEB059 · COVERAGE_MAP001
Cartographie éditoriale Mégathème > Thème : volume, images, sources, faible couverture.

CGWEB060 · CONTROL_TOWER001
Tour de contrôle réunissant stats, santé, files locales et analyses 055/056/059.
Actualisation légère par défaut ; scan complet uniquement après confirmation.

Sécurité commune
----------------
- aucune primitive Firebase d'écriture dans CGWEB053-060 ;
- aucun nouvel endpoint backend ;
- aucune suppression automatique ;
- les actions destructives CGWEB025 restent uniquement dans CGWEB025 ;
- le catalogue complet est chargé par CGWEB032 et conservé en mémoire dans CGWEB055 ;
- seules de petites synthèses sont mémorisées localement ;
- tokens historiques CGWEB018_FIX5 et CGWEB032_1 intacts ;
- cache hors-ligne CGWEB050 étendu aux nouveaux fichiers statiques.
