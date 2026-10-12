CGANDROID020
============

AVAILABLE_COUNTS_LOCAL_FIRST001
-------------------------------
Les nombres de questions disponibles sont calculés localement
AVANT toute synchronisation réseau.

Le réseau ne peut donc plus laisser l'écran sur "(…)".

Disponible =
- jamais posée
- ou posée mais non assimilée

Non comptées :
- assimilées
- status X
- Problème
- groupes analogues exclus


UNBOUNDED_SESSION_REWIND001
---------------------------
Aucune limite arbitraire.

Chaque pression sur Retour en arrière remonte exactement
d'UNE question réellement affichée.

Le joueur peut revenir jusqu'au début de la session.


TRANSACTIONAL_ATTEMPT_ROLLBACK001
LEARNING_ROLLBACK001
-------------------------------
Lorsqu'une question répondue passe derrière le point courant
du retour arrière, sa tentative est réellement annulée :

- attempt SQLite supprimé
- apprentissage inversé
- fail_count restauré
- mastered restauré
- session_served restauré
- cooldown thème restauré
- statistiques globales décrémentées


CLOUD_HISTORY_RETRACT001
------------------------
Si l'événement n'était pas encore synchronisé :
il est retiré de l'outbox.

S'il avait déjà atteint Firestore :
un tombstone state=retracted est écrit avec le même attempt_id.

Les lecteurs CGANDROID020 ignorent alors toutes les anciennes
versions de cette tentative.

Exemple :
Q1 Q2 Q3 Q4 Q5 puis retour jusqu'à Q2

=> Q3/Q4/Q5 ne comptent plus comme passages.


ACTIONS EXPLICITES
------------------
Problème et Exclure ce groupe ne sont PAS annulés par
Retour en arrière.

Ce sont des décisions administratives persistantes.


COMPACT_HISTORY_LIST001
-----------------------
La première page Historique affiche uniquement :

date + heure · mégathème
thème

La question, la réponse et le résultat ne sont plus affichés
dans cette liste.


RICH_HISTORY_DETAIL001
HISTORY_IMAGE001
-----------------------
Un clic ouvre le détail :

- mégathème
- thème
- question
- image lorsqu'elle existe
- réponse
- dernier résultat
- passages
- réussites
- échecs
- historique des passages


EXCLUSION_RESTORE001
--------------------
L'écran Thèmes exclus dispose d'un bouton Réintégrer
pour chaque groupe analogue.


EXCLUSION_STATE_SYNC001
-----------------------
analog_exclusions est traité comme un journal d'états.

Pour un group_key :
l'événement created_ms le plus récent gagne.

pending/active = exclu
resolved/deleted/closed = réintégré

Le résultat est synchronisable téléphone <-> tablette.


APK
---
applicationId : fr.culturegenerale.android
versionCode   : 966
versionName   : 9.6.6-cgandroid020-universal
channel       : CGANDROID020_UNIVERSAL

Aucune migration destructive SQLite.
Aucune migration destructive Firestore.
