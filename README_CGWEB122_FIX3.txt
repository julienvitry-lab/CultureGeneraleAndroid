CGWEB122 FIX3
=============

THEME_CONTEXT_CAPTURE001
------------------------
L'extraction conserve maintenant le contexte général de la page :

- titre du thème ;
- titre HTML ;
- description META ;
- URL canonique ;
- titres H1/H2/H3 ;
- paragraphes de contexte ;
- liens découverts ;
- texte brut ;
- hash SHA-256 HTML ;
- hash SHA-256 texte.

Ces informations restent séparées de knowledge.facts.


ANNEX_QUESTIONNAIRE_CAPTURE001
------------------------------
Tous les questionnaires découverts sont désormais aspirés,
même lorsque la série de fiches est déjà complète N/N.

Pour chaque questionnaire :

- titre ;
- libellé ;
- URL ;
- page source statique ;
- question(s) ;
- détail ;
- quatre propositions si présentes ;
- index de la bonne réponse ;
- texte de la bonne réponse ;
- fiche source éventuelle ;
- image éventuelle ;
- diagnostics de capture.

Le moteur réutilise le payload officiel Quizypedia get_quiz_game.


ANNEX_PAYLOAD_ARCHIVE001
------------------------
Pour chaque questionnaire sont conservés :

- rawPayload ;
- rawPayloadText ;
- rawPayloadSha256 ;
- rawCount ;
- validQuestionCount ;
- payloadComplete.

L'objectif est de pouvoir retraiter les questionnaires ultérieurement
sans dépendre exclusivement de leur représentation transformée.


AUXILIARY_SOURCE_SEPARATION001
------------------------------
Trois couches sont désormais distinctes :

1. fiches / knowledge
   => matière principale des futures questions longues ;

2. sourceMetadata
   => crédits, licences, URL images ;

3. auxiliarySource
   => questionnaires annexes et payloads Quizypedia.

Aucun questionnaire annexe n'est automatiquement injecté
dans knowledge.facts.


IMPORTANT
---------
- aucune création de question Firestore ;
- aucune modification de question existante ;
- aucune écriture Firestore ;
- extraction documentaire uniquement.
