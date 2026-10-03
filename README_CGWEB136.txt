CGWEB136
========

ANDROID_BRIDGE_RETIRE001
------------------------
CGANDROID017 a rendu Android capable de lire directement le champ answer.

CGWEB n'écrit donc plus :

proposition_a
correct_index

comme pont Android.


PURE_QR_WRITE001
----------------
Les créations Web écrivent désormais :

question
detail
answer
...

sans :

proposition_a
proposition_b
proposition_c
proposition_d
correct_index.

Les modifications contenant answer suppriment physiquement les cinq
anciens champs QCM éventuellement encore présents dans le document.


DEDUP
-----
Une fusion avec une réponse canonique produit un document Q/R pur.

Les cinq champs historiques sont supprimés de la question conservée.


CGWEB021 / CGWEB022
-------------------
Les opérations undo / restore savent toujours LIRE un ancien snapshot
QCM grâce au fallback historique.

Mais elles restaurent désormais uniquement :

answer

et suppriment les cinq propriétés legacy.


LEGACY_READ_ONLY001
-------------------
Les références à proposition_[A-D] / correct_index qui subsistent dans
CGWEB sont exclusivement des lecteurs de compatibilité.

Elles permettent d'ouvrir :
- une ancienne question Firestore ;
- un ancien snapshot d'historique ;
- un ancien audit bulk ;
- un ancien événement de jeu.

Elles ne doivent plus constituer un chemin d'écriture.


FINAL_QR_AUDIT001
-----------------
Le lot vérifie :
- que les writers Web ne recréent plus le bridge Android ;
- que les restaurations backend sont Q/R pures ;
- qu'Android CGANDROID017 lit bien answer ;
- que toute occurrence legacy restante dans le runtime actif est
  classifiée comme lecture rétrocompatible ou parsing source.

Aucune migration globale Firestore n'est lancée.
Les anciennes questions non modifiées restent intactes.
