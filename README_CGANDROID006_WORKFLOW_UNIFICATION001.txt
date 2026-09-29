CGANDROID006 · WORKFLOW_UNIFICATION001
======================================

PROBLÈME CORRIGÉ
----------------
Deux workflows Android coexistaient :

1. Construire CultureGenerale Android signé
   -> compilait l'ancien module app
   -> artifact CultureGenerale-Android-signed
   -> ancienne interface QCM à 4 propositions

2. CGANDROID005 Tablet APK
   -> compilait le module tablet
   -> nouvelle interface tablette Q/R

CONSÉQUENCE
-----------
Le workflow générique apparaissait à chaque push sur main
et pouvait être pris à tort pour la dernière APK tablette.

CORRECTION
----------
L'ancien workflow .github/workflows/android.yml est supprimé.
Il ne peut donc plus produire de nouvel artifact APK.

WORKFLOW ANDROID UNIQUE
-----------------------
.github/workflows/CGANDROID006_TABLET.yml

Nom GitHub Actions :
CGANDROID006 · CultureGenerale Tablette

MODULE UNIQUE
-------------
:tablet

APPLICATION ID
--------------
fr.culturegenerale.android.tablet

VERSION
-------
versionCode 6
versionName CGANDROID006
CG_CHANNEL CGANDROID006

ARTIFACT UNIQUE
---------------
CultureGenerale-Tablette-CGANDROID006

DÉCLENCHEMENT AUTOMATIQUE
-------------------------
Le workflow se déclenche seulement si une modification
concerne réellement la construction de l'application tablette.

CONSÉQUENCE POUR CGPLAY / CGWEB
-------------------------------
Une modification uniquement serveur ou Web ne génère plus
inutilement une nouvelle APK Android.

ANCIEN MODULE app
-----------------
Le code de l'ancien module app n'est PAS supprimé dans ce lot.
Il reste dans le dépôt, mais aucun workflow Android automatique
ne le compile.

INSTALLATION
------------
Pour la tablette, utiliser exclusivement l'artifact :
CultureGenerale-Tablette-CGANDROID006

Ne plus utiliser :
CultureGenerale-Android-signed
