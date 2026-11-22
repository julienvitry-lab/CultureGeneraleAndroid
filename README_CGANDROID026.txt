CGANDROID026 — Images hors ligne et anticipation
Version 9.7.3-cgandroid026-universal, versionCode 973.
Base : e7a935ff7ed1592b66902c9ad28fc14b784d72b5 (CGANDROID025).

Sur chaque appareil, Accueil > Bibliothèque d’images > Choisir.
Sélectionner le dossier Culture Générale, qui contient Images et questions_base.sqlite.
L’application demande seulement un accès en lecture. Elle indexe les photos et les liens
de l'ancienne base par original_id (row_number en secours), sans modifier cette base.
Les images restent sur place. L'index est conservé entre les lancements ; resélectionner
le dossier après modification de la bibliothèque. RAM puis fichiers locaux, cache privé,
puis réseau si disponible.
La révision prépare jusqu’à quatre images en avant et deux en arrière lors de la lecture,
sans modifier les statuts, le classement ou la navigation tactile.
Un saut vers un numéro non préparé charge l'image avant d'afficher la question.
Une image réellement absente reste signalée ; aucun réseau si Android est hors ligne.
Le jeu et l'historique utilisent également la bibliothèque locale.
Les réglages du transfert de progression ne changent pas.
