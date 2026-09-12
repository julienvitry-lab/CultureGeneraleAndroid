CGIMAGE006 FIX2 · Continuer malgré les échecs ponctuels + journal des IDs échoués

Objectif
--------
- ne plus stopper la migration automatique sur un lot ponctuellement mauvais ;
- conserver un journal local des IDs en échec ;
- permettre l'export de ce journal.

Changements
-----------
1. Le coupe-circuit n'utilise plus le seuil de 20 % d'échecs.
2. Arrêt de sécurité seulement si :
   - >= 200 échecs dans le dernier lot ; ou
   - >= 100 échecs avec 0 migration dans le lot.
3. Chaque ID échoué est ajouté à un journal localStorage :
   - lot ;
   - curseur avant lot ;
   - id ;
   - message d'erreur.
4. Le panneau affiche :
   - compteur d'IDs journalisés ;
   - zone « Journal des IDs échoués » ;
   - bouton Exporter le journal ;
   - bouton Effacer le journal.

Exploitation
------------
- recharger la page après déploiement ;
- laisser le curseur courant ;
- cliquer « Automatiser tout » pour reprendre.
