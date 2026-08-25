# SYNCLOUD003 · v194

## But
Synchronisation téléphone/tablette en quelques secondes pour les changements ordinaires.

## Architecture
- base SQLite locale sur chaque appareil ;
- journal `sync_change_log` (DB v28) ;
- un delta ZIP ne contient que les lignes modifiées ;
- les points GPS/FC sont regroupés par activité modifiée ;
- chaque révision possède un payload et un manifeste immuables ;
- `sport_sync_meta.json` n’est plus qu’un pointeur HEAD, publié en dernier.

## Noms cloud
- `sport_full_R00000005.zip` : socle complet ;
- `sport_delta_R00000006.zip` : delta ;
- `sport_rev_R00000006.json` : manifeste immuable ;
- `sport_sync_meta.json` : HEAD.

## Migration v193 -> v194
Le cloud SYNCLOUD002 étant potentiellement incohérent, effectuer une seule remise à zéro sûre :
1. installer v194 sur téléphone et tablette ;
2. sur le téléphone de référence : « Garder cet appareil et l’envoyer au cloud » ;
3. sur la tablette : « Remplacer cet appareil par la version cloud » ;
4. ensuite utiliser uniquement « Synchroniser maintenant ».

Les synchronisations ordinaires suivantes sont différentielles.
