CGANDROID027 — Assimilation directe en révision
Version 9.7.4, versionCode 974.
Base : 786411fed0bbd74efa00b9a68a59261579b5066a (CGANDROID026).

Le bouton Assimiler reste fixé tout en bas, hors de la zone défilante.
Il apparaît uniquement à la deuxième étape lorsque la réponse est visible.
Son espace est réservé à la première étape pour garder l'image stable.
Un clic sur ce bouton ne déclenche jamais une navigation gauche/droite.
L'assimilation écrit le même indicateur SQLite mastered que le jeu classique.
Elle conserve le nombre d'échecs et ne crée aucune tentative ou score artificiel.
La question est immédiatement retirée de la session et de toutes les futures
sessions locales de jeu et de révision ; elle reste dans le catalogue.
La question suivante apparaît avec réponse masquée. À la fin de la liste,
le sélecteur de départ affiche le nombre de questions restant.
Le transfert de progression existant transporte également cette assimilation.
L'intégration de la bibliothèque d'images et le préchargement sont inchangés.
