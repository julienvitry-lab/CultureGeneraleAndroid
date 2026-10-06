CGANDROID018 BUILD2
===================

MODERN_APP_UNIFICATION001
-------------------------
Le module legacy :app n'est plus inclus dans settings.gradle.

Le seul produit Android actif est le module historique :tablet,
qui contient l'application moderne Question/Réponse.

Ses sources conservent leur namespace historique :
fr.culturegenerale.android.tablet

L'application installée utilise :
fr.culturegenerale.android


AUTO_DEVICE_PROFILE001
----------------------
Détection automatique :

smallestScreenWidthDp < 600
=> PHONE

smallestScreenWidthDp >= 600
=> TABLET


PHONE_RESPONSIVE_UI001
----------------------
PHONE :
- portrait ;
- marges réduites ;
- typographies adaptées ;
- espacements adaptés ;
- mégathèmes en une colonne ;
- Question / Réponse adaptées ;
- viewport image réduit.


TABLET_LAYOUT_PRESERVE001
-------------------------
TABLET :
- paysage ;
- tailles historiques préservées ;
- grille mégathèmes 2 colonnes ;
- marges historiques préservées.


LEGACY_APP_RETIRE001
--------------------
Le workflow BUILD2 ne compile jamais :app.

Les écrans historiques
DÉFI / RÉVISION / IMPORT QUIZYPEDIA
ne font pas partie de l'APK BUILD2.


UNIVERSAL_APK001
----------------
Artifact :

CultureGenerale-Universelle-CGANDROID018-BUILD2

Version :
964
9.6.4-cgandroid018-universal

Build :
release unsigned
-> zipalign
-> signature SIGN001
-> apksigner verify
-> aapt badging verify


CUSTOM QUESTION
---------------
question_origin custom_txt/custom_manual reste pris en charge.

Un seul bandeau Question.
Aucun thème.
Aucun détail.
Centrage vertical.
