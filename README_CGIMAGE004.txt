CGIMAGE004 FIX3 · Préchargement images après synchronisation Android

Après chaque page de contenu CGSYNC006 et chaque lot LIVE :
- collecte uniquement les image_file Firebase Storage du lot ;
- élimine les doublons ;
- ignore les images déjà présentes dans le cache CGIMAGE001 ;
- limite à 3 téléchargements simultanés ;
- n'interrompt jamais la synchronisation en cas d'échec ;
- conserve le téléchargement à l'ouverture comme secours.

Aucune donnée métier et aucun status ne sont modifiés.
