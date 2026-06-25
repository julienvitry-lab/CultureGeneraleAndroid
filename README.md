# Culture Générale Android V0.1

Version de validation technique.

Objectif : vérifier sur tablette Android que l'application peut :

- demander l'accès aux fichiers ;
- trouver le dossier `/storage/emulated/0/Culture Générale/` ;
- ouvrir `questions_base.sqlite` ;
- lire les tables et compter les questions ;
- vérifier la présence du dossier `Images`.

Cette V0.1 ne lance pas encore le jeu. Elle valide seulement les fondations.

## Dossier attendu sur la tablette

```text
Culture Générale/
├── questions_base.sqlite
├── Images/
└── Comfortaa-Bold.ttf
```

## Compilation

La compilation se fait automatiquement via GitHub Actions.

1. Téléverser tous les fichiers du projet dans le dépôt GitHub.
2. Aller dans l'onglet **Actions**.
3. Lancer ou attendre le workflow **Build APK**.
4. Télécharger l'artifact `CultureGeneraleAndroid-V0.1-debug-apk`.
5. Installer `app-debug.apk` sur la tablette.
