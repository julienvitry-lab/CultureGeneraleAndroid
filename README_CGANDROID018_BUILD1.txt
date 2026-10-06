CGANDROID018 BUILD1
===================

PHONE_APK_BUILD001
------------------
Module :
:app

Application ID :
fr.culturegenerale.android

Version :
963
9.6.3-cgandroid018

L'APK téléphone utilise la clé permanente SIGN001 historique.
Il est destiné à pouvoir mettre à jour une installation téléphone
signée avec cette même clé sans suppression préalable de l'application.

Artifact :
CultureGenerale-Telephone-CGANDROID018-BUILD1


TABLET_APK_BUILD001
-------------------
Module :
:tablet

Application ID :
fr.culturegenerale.android.tablet

Version :
18
CGANDROID018

La tablette conserve le cache de clé debug historique :
cgandroid-tablet-debug-keystore-v1

Artifact :
CultureGenerale-Tablette-CGANDROID018-BUILD1


COMPILE_VERIFY001
-----------------
Les deux modules sont compilés explicitement avant assemblage :

:app:compileDebugJavaWithJavac
:tablet:compileDebugJavaWithJavac


INSTALL_READY001
----------------
Chaque artifact contient :
- l'APK ;
- son SHA-256 ;
- le rapport apksigner ;
- les informations de build.

Les artifacts sont conservés 14 jours.
