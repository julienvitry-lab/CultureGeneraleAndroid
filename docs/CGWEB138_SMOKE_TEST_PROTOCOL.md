# CGWEB138 · Smoke test Q/R

## Scénario

CREATE
→ READ
→ UPDATE
→ HISTORY UPDATE
→ RESTORE
→ HISTORY RESTORE
→ DELETE
→ HISTORY DELETE

## Invariants

À chaque lecture de la question active :

- `answer` doit être présent ;
- `proposition_a` doit être absent ;
- `proposition_b` doit être absent ;
- `proposition_c` doit être absent ;
- `proposition_d` doit être absent ;
- `correct_index` doit être absent.

## Legacy

CGQR001 doit encore résoudre une ancienne question QCM en mémoire.

Aucun ancien document n'est créé pour ce test.

## Nettoyage

La question smoke est supprimée.

Les traces d'audit peuvent rester dans l'historique et les tombstones.

## Validation

Un résultat final :

`CGWEB138 : TOUS LES TESTS SONT PASSÉS.`

valide le round-trip runtime.
