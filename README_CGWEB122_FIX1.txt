CGWEB122 FIX1
=============

DOM_FIELD_PAIR_CAPTURE001
-------------------------
L'extraction documentaire CGWEB122 lit désormais en priorité
les couples champ / valeur réellement structurés dans le DOM.

Structures reconnues :
- lignes de tableau TH/TD ou TD/TD ;
- listes de définition DT/DD ;
- attribut data-label explicite.

Le parseur texte historique reste disponible uniquement comme fallback.


COMPOUND_LABEL_PRESERVE001
--------------------------
Un libellé fourni explicitement par Quizypedia n'est plus découpé.

Exemple attendu :

Nom scientifique
Chimaera monstrosa

devient :

Nom scientifique : Chimaera monstrosa

et non plus :

Nom : scientifique
Info 1 : Chimaera monstrosa


RAW_FIELD_FIDELITY001
----------------------
Chaque fiche expose :

- fieldSource
- fieldFidelity.rawLineCount
- fieldFidelity.coveredLineCount
- fieldFidelity.uncoveredCount
- fieldFidelity.uncoveredRawLines
- fieldFidelity.complete

Objectif :
détecter immédiatement toute information brute qui n'aurait pas
été restituée par la structure champ / valeur.


IMAGE_URL_EXPOSE001
-------------------
Les URL d'image sont explicitement conservées et affichées.

Chaque fiche expose :
- imageUrls[]
- primaryImageUrl
- imageLinks[] historique

L'interface montre toutes les URL HTTP(S) détectées sous l'image.

Aucune écriture Firestore.
Aucune génération de question.
