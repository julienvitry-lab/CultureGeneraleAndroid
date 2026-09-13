CGWEB020 + CGWEB021 + CGWEB023

CGWEB020 QUALITY002
- analyse Firestore à la demande
- questions vides, bonne réponse absente, propositions dupliquées
- thème / mégathème vides
- incohérences image_file / is_image / non_trouve
- HTML résiduel
- doublons exacts de question

CGWEB021 BULK002
- sélection reprise de CGWEB018
- dry-run obligatoire
- aperçu avant / après
- contrôle de révision
- journal bulk_audits + snapshots avant modification
- annulation sécurisée si aucune modification ultérieure
- maximum 500 questions par lot

CGWEB023 SYNCHEALTH002
- Firestore
- index statique
- delta live
- tombstones Android
- conflits CGSYNC007
- catalogue thèmes
- dernières dates de modification
- état Android explicite non inventé : aucun heartbeat n'est actuellement instrumenté
