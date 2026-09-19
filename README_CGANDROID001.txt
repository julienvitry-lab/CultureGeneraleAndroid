CGANDROID001 · TABLET_REBOOT001 / SMART_SESSION_CLIENT001
=========================================================

Architecture
------------
- Ancien module app/ : INCHANGÉ.
- Nouveau module : tablet/.
- Package distinct : fr.culturegenerale.android.tablet.
- Installation parallèle possible avec l'ancienne APK.

Jeu
---
- Un seul mode : Session intelligente.
- Mégathème optionnel.
- Tailles : 20 / 50 / 100 / 250 / 500 / 1000.
- Backend : CGPLAY004 smartLongStart / smartLongNext.
- Réponses QCM enregistrées dans users/<uid>/play_history.
- Les lots suivants peuvent donc relire l'historique récent.

Charte
------
- Fond noir, palette historique bleu/vert/rouge/jaune/gris.
- Comfortaa Bold issue de l'ancien module et appliquée systématiquement.
- Interface native tablette en paysage.

P
-
- Petit bouton discret.
- Crée un signalement destiné au futur traitement CGWEB.
- Tentative d'écriture dans users/<uid>/problem_reports.
- Si l'écriture Cloud est refusée/indisponible, le signalement reste dans l'outbox locale.
- P n'exclut pas la question du jeu.

T
-
- Petit bouton discret avec confirmation.
- Définition analogue identique à l'ancienne APK : même theme + même question après normalisation ; detail ignoré.
- Exclusion immédiate et persistante sur cette tablette via la clé normalisée.
- Une demande analog_exclusions est envoyée au Cloud ou conservée dans l'outbox.
- La propagation serveur massive de T à tout le catalogue sera le lot suivant ; CGANDROID001 ne modifie pas massivement les statuts Firestore.

Authentification
----------------
- Même compte e-mail / mot de passe que CGWEB.
- Firebase Auth REST, ce qui évite de remplacer/configurer l'ancienne APK Android.
- Le mot de passe n'est pas conservé ; seul le refresh token Firebase l'est.

APK
---
Workflow : CGANDROID001 Tablet APK
Artifact : CultureGenerale-Tablet-CGANDROID001
