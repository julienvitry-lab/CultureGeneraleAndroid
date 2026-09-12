CGIMAGE006 · Migration automatique des images historiques

- démarre au curseur CGIMAGE005 actuellement affiché ;
- force dryRun=false ;
- enchaîne les lots séquentiellement ;
- conserve le curseur dans localStorage ;
- affiche des totaux cumulés ;
- bouton Arrêter : termine le lot en cours puis s'arrête ;
- 3 tentatives en cas d'erreur réseau ;
- arrêt de sécurité si >=50 échecs dans un lot ou >20 % d'échecs ;
- arrêt si le curseur cesse de progresser.
