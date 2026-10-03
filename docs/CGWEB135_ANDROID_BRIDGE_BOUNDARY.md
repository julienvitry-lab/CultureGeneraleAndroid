# CGWEB135 · Android Bridge Boundary

## Schéma Web canonique

La réponse canonique est :

`answer`

CGWEB ne manipule plus les mauvaises propositions comme données
fonctionnelles.

## Pont Android temporaire

Tant que l'application Android lit encore l'ancien schéma, le noyau Web
écrit également :

`proposition_a = answer`

`correct_index = 1`

Les champs :

`proposition_b`

`proposition_c`

`proposition_d`

ne font pas partie du pont.

## Lecture rétrocompatible

Une question ancienne peut encore ne pas contenir `answer`.

Dans ce cas seulement, les résolveurs CGWEB sont autorisés à lire
`correct_index` et la proposition historique correspondante afin de
reconstituer `answer`.

## Condition de retrait du pont

Le pont pourra être supprimé quand les applications Android téléphone
et tablette liront `answer` en priorité et auront une stratégie de
fallback compatible avec l'ancien catalogue.
