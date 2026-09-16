CGIMPORT011 FIX5 - RESIDUE_CLEANUP002
================================

Fonction :
- import de plusieurs themes Quizypedia depuis un fichier .csv ou .ods ;
- colonne A = URL Quizypedia ;
- entete URL / Adresse / Lien automatiquement ignoree ;
- lignes vides ignorees ;
- URL invalides ignorees avec compteur ;
- doublons d'URL dedoublonnes avant traitement ;
- maximum 5000 URL par fichier.

Execution :
- un theme a la fois ;
- reutilise le champ Adresse Quizypedia et le bouton Analyser l'URL existants ;
- vide le champ Theme avant chaque URL pour conserver la detection depuis l'URL ;
- pause, reprise et arret apres le theme en cours ;
- etat de la file conserve dans localStorage pour reprendre apres rechargement ;
- rapport CSV telechargeable.

ODS :
- lecture locale dans le navigateur via SheetJS 0.18.5 stocke dans web/public/vendor ;
- le tableur lui-meme n'est pas envoye sur Firebase par CGIMPORT011.

Securite :
- nettoyage des residus limite au namespace CGIMPORT011 ;
- CGIMPORT011 n'ecrit directement ni dans Firestore ni dans Storage ;
- il pilote l'importeur Quizypedia deja en place, de maniere sequentielle.
