CGWEB036 FIX3D - NAVIGATION_IMPORT_RESTORE004
=============================================

Correctif du FIX3 interrompu :
- supprime le probleme d'encodage PowerShell via stdin ;
- n'utilise plus la variable automatique PowerShell HOME ;
- ne suppose plus l'existence d'une fonction renderImport.

Navigation principale :
1. Repertoire
2. Import Quizypedia
3. Creation de questions
4. Plus

Plus :
- Accueil
- Apprentissage
- outils deja ranges par categories

Import Quizypedia :
- 6 sous-onglets conserves ;
- 6 panneaux internes conserves ;
- le clic top-level appelle navigateImport(currentImport).

Les marqueurs stricts CGWEB018_FIX5 et CGWEB032_1 du workflow sont preserves.
