CGWEB123 FIX5
=============

REVIEW_BEFORE_REJECT001
SOFT_GENERATION_GUARD001
THEME_GROUNDING001
REJECTION_DIAGNOSTICS001


PROBLÈME CORRIGÉ
----------------
FIX3/FIX4 appliquait plusieurs contrôles stricts
AVANT la seconde passe IA.

Une question pouvait donc être supprimée parce que :

- standalone_ok était false ;
- context_anchor n'était pas littéralement présent ;
- la réponse apparaissait dans la première formulation ;
- la rédaction était mécanique ;
- le grounding initial semblait insuffisant.

La relecture globale ne recevait jamais ces questions
et ne pouvait donc pas les réparer.


EXEMPLE OBSERVÉ
---------------
13 fiches analysées.

13 questions générées.

11 éliminées avant relecture.

2 seulement arrivaient à la relecture globale.

Ce comportement n'était pas souhaitable.


REVIEW_BEFORE_REJECT001
-----------------------
Nouvel ordre :

1. génération par fiche ;
2. garde souple ;
3. relecture IA de tous les candidats exploitables ;
4. réparation / contextualisation ;
5. filtre final strict ;
6. atelier humain.


SOFT_GENERATION_GUARD001
------------------------
Avant relecture, seuls restent des rejets durs :

- question vide ;
- réponse vide ;
- doublon strict ;
- dépassement du quota par fiche.

Les autres problèmes deviennent des flags :

standalone_rewrite_needed
context_anchor_rewrite_needed
answer_visible_in_question
mechanical_wording
answer_grounding_to_recheck

Le relecteur doit tenter de les réparer.


THEME_GROUNDING001
------------------
unitGroundText() reconnaît désormais :

- fiche ;
- theme_context ;
- annexQuestions.

Le contexte de thème est donc traité de manière cohérente :

- utilisable par l'IA ;
- reconnu par le grounding déterministe.


REJECTION_DIAGNOSTICS001
------------------------
Chaque candidat possède maintenant candidate_id.

Le relecteur doit comptabiliser chaque candidat :

- questions[] ;
OU
- rejections[].

Aucun candidat ne doit disparaître silencieusement.


Le rapport affiche désormais par fiche :

IA
---------
Nombre de propositions générées.

Pré-review
----------
Nombre envoyé à la seconde IA.

Relecture
---------
Nombre retourné comme question
et nombre rejeté explicitement par l'IA.

Finales
-------
Nombre réellement publié dans l'atelier.

État / diagnostic
-----------------
Motif des rejets :

pre_review
ai_review
final_filter


FILTRE FINAL
------------
Le filtre final reste strict.

Après relecture, sont notamment refusées :

- question non autonome ;
- ancrage incohérent ;
- réponse présente dans la question ;
- formulation mécanique ;
- réponse non sourcée ;
- doublon global ;
- dépassement quota par fiche.


COÛTS
-----
TOKEN_COST_METER001 est conservé.

FIX5 peut consommer davantage de tokens de relecture
que FIX4 parce que davantage de candidats atteignent
désormais la seconde passe IA.

C'est volontaire :

on mesure désormais le coût du pipeline éditorial
réellement souhaité.


FIRESTORE
---------
Aucune écriture Firestore.


MODÈLE
------
GPT-5.6 Sol
