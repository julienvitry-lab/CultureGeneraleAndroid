CGHISTORY001 · PLAYLOG001

Fondation de l'historique complet des questions jouées.

Événements enregistrés :
- challenge_choice : réponse choisie, vrai/faux, temps de réponse ;
- challenge_mental : Assimilée / À revoir, temps de réponse ;
- revision_reveal : révélation d'une question en Révision.

Chaque entrée conserve également :
- session, date appareil + date serveur ;
- ID de question, mégathème, thème ;
- réponse choisie et bonne réponse ;
- mode de jeu / mode de révision ;
- appareil et version de l'application ;
- instantané de la question et de ses 4 propositions.

Firestore :
users/{uid}/play_history/{event_id}

Le SDK Firestore Android conserve les écritures hors ligne et les synchronise ensuite.
CGHISTORY001 ne modifie aucune question existante.
