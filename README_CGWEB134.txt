CGWEB134
========

DEDUP_QR001
-----------
CGDEDUP001 compare désormais une seule Réponse.

Une ancienne question sans answer reste lisible via le schéma historique.
Lors d'une fusion Q/R :
- answer devient canonique ;
- proposition_a = answer ;
- correct_index = 1 ;
- proposition_b/c/d sont supprimées.

Les nouveaux snapshots de dédoublonnage ne transportent plus les
mauvaises propositions.

QUALITY_QR001
-------------
CGWEB020 contrôle :
- présence de la Question ;
- présence de la Réponse ;
- thèmes ;
- images ;
- HTML résiduel ;
- doublons de question.

Le contrôle "propositions dupliquées" disparaît.

CGWEB014 exporte désormais :
Question / Détail / Réponse
et non plus les quatre propositions.

ANDROID_PREVIEW_QR001
---------------------
CGWEB027 ne simule plus quatre boutons A/B/C/D.

La question est affichée seule.
Le bouton "Afficher la réponse" révèle ensuite la réponse et le détail.

BACKEND_QR_FIELDS001
--------------------
CGWEB021 :
- indexation fondée sur answer ;
- nouveaux snapshots bulk Q/R ;
- undo d'anciens snapshots QCM normalisé en Q/R.

CGWEB022 :
- snapshots historiques Q/R ;
- indexation Q/R ;
- restauration d'un ancien snapshot QCM sous forme Q/R.

Aucune migration massive du catalogue n'est lancée.
