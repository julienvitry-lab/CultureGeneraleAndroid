CGWEB141 FIX2
=============

THEME_COMPARE_NORMALIZE001
--------------------------
La comparaison des thèmes passe désormais par une clé normalisée :

- Unicode NFKC
- espaces Unicode / insécables -> espace normal
- espaces multiples -> espace unique
- suppression des caractères invisibles :
  U+200B..U+200D
  U+2060
  U+FEFF
- trim

Les mots, nombres et ponctuations réellement différents
restent différents.


FALSE_POSITIVE_GUARD001
-----------------------
Une différence de chaîne brute ne suffit plus à produire
une anomalie.

Exemple :

Races de chiens (5)
Races de chiens (5)

peut être classé OK normalisé si la différence provient
uniquement d'un caractère d'espacement Unicode.


INVISIBLE_DIFF_DIAGNOSTIC001
----------------------------
Les concordances obtenues après normalisation sont affichées :

OK normalisé

Le diagnostic indique notamment :
- normalisation Unicode
- code d'un caractère invisible
- espacement multiple


REPAIR_SCOPE_GUARD001
---------------------
Avant réparation, chaque ligne est revérifiée.

Elle n'est réparable que si :

1. url_quizypedia permet toujours de retrouver un thème ;
2. ce thème appartient toujours au groupe audité ;
3. le thème Firestore reste réellement différent après
   normalisation.

Les différences Unicode / espaces invisibles ne peuvent pas
être écrites par le réparateur.


SECURITE
--------
Aucune donnée n'est modifiée par l'audit.

La réparation reste :
- manuelle
- après sélection
- après confirmation
- avec expectedRevision
- historisée via CGSYNC007

Aucune migration massive Firestore.
