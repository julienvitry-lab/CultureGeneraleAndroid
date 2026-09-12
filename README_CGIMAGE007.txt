CGIMAGE007 · Récupération ciblée des IDs 404

Source :
journal local CGIMAGE006_FAILED_IDS.

Stratégie de récupération :
1. url_internet
2. image_source_url
3. image_file historique
4. url_quizypedia
5. variantes de chemin/hôte Quizypedia
6. Wayback Machine pour les URL Quizypedia disparues

En cas de succès :
- upload Firebase Storage
- image_file mis à jour
- is_image = 1
- non_trouve = 0
- révision Firestore incrémentée
- l'ID est retiré du journal local CGIMAGE006

En cas d'échec :
- l'ID reste journalisé
- aucun status métier n'est modifié
