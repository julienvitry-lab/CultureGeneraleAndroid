CGIMAGE006 FIX3 · Fin de base correctement reconnue

Cause :
Quand il n'y a plus aucun document après le curseur, CGIMAGE005 renvoie :
- scanned = 0
- nextCursor = cursor

CGIMAGE006 testait d'abord l'égalité des curseurs et affichait à tort :
« le curseur n'avance plus ».

Correction :
- la fin normale de base est testée avant l'immobilité du curseur ;
- un vrai blocage de curseur reste détecté ;
- le journal des IDs échoués de FIX2 est conservé.

Le curseur 99999 correspond à la fin lexicographique des IDs Firestore.
