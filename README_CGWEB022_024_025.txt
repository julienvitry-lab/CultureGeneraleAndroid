CGWEB022 · HISTORY002
- centre historique global dans Plus > Historique
- filtres ID / opération / source
- snapshots avant/après ajoutés aux futures modifications CGSYNC007
- restauration sécurisée créant une nouvelle révision
- restauration possible aussi après suppression si le snapshot existe
- anciennes entrées sans snapshot restent consultables mais non restaurables
- résumé des opérations CGWEB021 bulk_audits

CGWEB024 · IMPORTREVIEW001
- nouvel onglet Import Quizypedia > Validation après import
- le bouton d'import CGIMPORT009 envoie désormais les QCM dans import_review
- approbation manuelle avant création définitive
- détection de doublon exact question + détail avant approbation
- possibilité explicite d'importer malgré le doublon
- rejet sans suppression physique du journal de validation

CGWEB025 · DUPLICATES002
- remplace visuellement CGDEDUP001 dans Plus > Doublons intelligents
- scan serveur de toute la collection
- exacts = 100 %
- proches = score hybride Jaccard mots + Dice trigrammes
- seuil configurable 75 / 82 / 90 / 100 %
- aucune suppression automatique
- conserver A/B utilise la transaction atomique CGDEDUP001 existante
- ignorer mémorisé localement
