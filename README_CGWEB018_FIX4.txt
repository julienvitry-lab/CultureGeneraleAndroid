CGWEB018 FIX4 · Vrai filtre « Thème contient »

CAUSE DU BUG
------------
CGWEB018 FIX2 utilisait question_search_delta comme préfiltre.
Or cet index delta n'est pas garanti complet pour toutes les questions
historiques. Un thème ancien comme « Capitales ... » pouvait donc ne jamais
être candidat, même si le contrôle final utilisait bien includes().

CORRECTION
----------
Le filtre ne dépend plus de question_search_delta.

Une Cloud Function dédiée :
1. construit un catalogue des valeurs réellement présentes dans le champ theme ;
2. normalise casse + accents ;
3. applique un vrai « contient » sur les intitulés de thèmes ;
4. relit ensuite toutes les questions appartenant aux thèmes correspondants ;
5. applique les autres filtres ;
6. trie et pagine le résultat.

Exemple :
« capitales » correspond à :
- « Capitales européennes »
- « Grandes capitales du monde »
- « Capitales - Afrique »
si ces thèmes existent réellement dans Firestore.

Le catalogue est mis en cache pendant 6 h et reconstruit automatiquement
si aucun thème ne correspond dans un cache existant.
