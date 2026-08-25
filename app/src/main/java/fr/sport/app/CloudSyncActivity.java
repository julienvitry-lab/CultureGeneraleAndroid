package fr.sport.app;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentSender;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.text.DateFormat;
import java.util.Collections;
import java.util.Date;

import fr.sport.app.cloud.CloudDeltaSnapshot;
import fr.sport.app.cloud.CloudDriveClient;
import fr.sport.app.cloud.CloudLocalState;
import fr.sport.app.cloud.CloudSyncCoordinator;
import fr.sport.app.cloud.CloudSyncSettings;

/** Écran de raccordement téléphone/tablette à Google Drive appDataFolder. */
public final class CloudSyncActivity extends BaseActivity {
    private static final int REQUEST_AUTHORIZE = 9101;

    private final DateFormat dateFormat = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT);
    private TextView stateView;
    private TextView detailView;
    private ProgressBar progress;
    private Button enableButton;
    private Button syncButton;
    private Button uploadButton;
    private Button downloadButton;
    private CloudSyncCoordinator.Mode pendingMode = CloudSyncCoordinator.Mode.NORMAL;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        refreshState();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(20), dp(16), dp(30));

        TextView title = text("Synchronisation SPORT", 27, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, match());
        root.addView(text("Téléphone ⇄ Google Drive ⇄ Tablette", 15, false), margins(0, 6, 0, 14));

        LinearLayout card = card();
        card.addView(text("SYNCLOUD003 · différentiel", 19, true), match());
        card.addView(text("SPORT reste local et fonctionne hors connexion. Chaque modification est journalisée puis envoyée dans une révision cloud immuable. Une synchro normale ne transfère que les lignes réellement modifiées et les points GPS/FC des activités concernées. Le socle complet reste réservé au premier raccordement, à la migration depuis SYNCLOUD002 et aux remplacements forcés.", 14, false), margins(0, 5, 0, 10));
        stateView = text("", 16, true);
        card.addView(stateView, match());
        detailView = text("", 13, false);
        card.addView(detailView, margins(0, 5, 0, 10));
        root.addView(card, margins(0, 0, 0, 12));

        enableButton = button("Autoriser Google Drive et activer");
        enableButton.setOnClickListener(v -> {
            CloudSyncSettings settings = new CloudSyncSettings(this);
            if (settings.isEnabled()) {
                settings.setEnabled(false);
                settings.markStatus("Synchronisation cloud désactivée");
                refreshState();
            } else {
                authorizeAndRun(CloudSyncCoordinator.Mode.NORMAL, true);
            }
        });
        root.addView(enableButton, margins(0, 0, 0, 8));

        syncButton = button("Synchroniser maintenant");
        syncButton.setOnClickListener(v -> authorizeAndRun(CloudSyncCoordinator.Mode.NORMAL, true));
        root.addView(syncButton, margins(0, 0, 0, 8));

        LinearLayout conflict = card();
        conflict.addView(text("En cas de conflit", 18, true), match());
        conflict.addView(text("Si téléphone et tablette ont été modifiés avant de se revoir, SPORT n'écrase rien automatiquement. Choisis alors explicitement la version à conserver.", 13, false), margins(0, 4, 0, 8));
        uploadButton = button("Garder cet appareil et l'envoyer au cloud");
        uploadButton.setOnClickListener(v -> confirmForceUpload());
        conflict.addView(uploadButton, margins(0, 0, 0, 6));
        downloadButton = button("Remplacer cet appareil par la version cloud");
        downloadButton.setOnClickListener(v -> confirmForceDownload());
        conflict.addView(downloadButton, match());
        root.addView(conflict, margins(0, 4, 0, 12));

        progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(dp(42), dp(42));
        pp.gravity = Gravity.CENTER_HORIZONTAL;
        root.addView(progress, pp);

        Button back = button("Retour");
        back.setOnClickListener(v -> finish());
        root.addView(back, margins(0, 10, 0, 0));

        scroll.addView(root);
        setContentView(scroll);
    }

    private void refreshState() {
        CloudSyncSettings settings = new CloudSyncSettings(this);
        boolean enabled = settings.isEnabled();
        stateView.setText(enabled ? (settings.hasConflict() ? "⚠ Conflit à résoudre" : "☁ Synchronisation activée")
                : "Synchronisation désactivée");
        StringBuilder detail = new StringBuilder();
        detail.append(settings.lastStatus());
        if (settings.lastSyncMs() > 0L) detail.append("\nDernière synchronisation : ")
                .append(dateFormat.format(new Date(settings.lastSyncMs())));
        if (settings.lastRevision() > 0L) detail.append("\nRévision cloud : ").append(settings.lastRevision());
        long count = CloudLocalState.activityCount(this);
        if (count >= 0L) detail.append("\nCet appareil : ").append(count).append(" activité").append(count > 1 ? "s" : "");
        long pending = CloudDeltaSnapshot.pendingChangeCount(this);
        if (pending > 0L) detail.append("\nÀ envoyer : ").append(pending).append(" modification").append(pending > 1 ? "s" : "");
        detailView.setText(detail.toString());
        enableButton.setText(enabled ? "Désactiver la synchronisation cloud" : "Autoriser Google Drive et activer");
        syncButton.setEnabled(enabled);
        uploadButton.setEnabled(enabled);
        downloadButton.setEnabled(enabled);
    }

    private void authorizeAndRun(CloudSyncCoordinator.Mode mode, boolean enableAfterAuthorization) {
        if (!CloudSyncCoordinator.isOnline(this)) {
            showMessage("Hors connexion", "Internet est indisponible. Les données locales restent accessibles.");
            return;
        }
        pendingMode = mode;
        setBusy(true, "Autorisation Google Drive…");
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(CloudDriveClient.APPDATA_SCOPE)))
                .build();
        Identity.getAuthorizationClient(this).authorize(request)
                .addOnSuccessListener(this, result -> {
                    if (result.hasResolution()) {
                        PendingIntent pending = result.getPendingIntent();
                        if (pending == null) {
                            setBusy(false, "Autorisation Google Drive indisponible.");
                            return;
                        }
                        try {
                            startIntentSenderForResult(pending.getIntentSender(), REQUEST_AUTHORIZE,
                                    null, 0, 0, 0);
                        } catch (IntentSender.SendIntentException error) {
                            setBusy(false, CloudSyncCoordinator.safe(error));
                        }
                    } else {
                        if (enableAfterAuthorization) new CloudSyncSettings(this).setEnabled(true);
                        runAuthorized(result);
                    }
                })
                .addOnFailureListener(this, error -> {
                    setBusy(false, "Autorisation impossible : " + CloudSyncCoordinator.safe(error));
                    showMessage("Configuration Google requise",
                            "Vérifie que l'API Google Drive est activée et qu'un client OAuth Android fr.sport.app est déclaré avec l'empreinte SHA-1 de l'APK signé.\n\n" + CloudSyncCoordinator.safe(error));
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_AUTHORIZE) return;
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(this)
                    .getAuthorizationResultFromIntent(data);
            new CloudSyncSettings(this).setEnabled(true);
            runAuthorized(result);
        } catch (ApiException error) {
            setBusy(false, "Autorisation refusée : " + CloudSyncCoordinator.safe(error));
        }
    }

    private void runAuthorized(AuthorizationResult authorization) {
        String token = authorization.getAccessToken();
        if (token == null || token.trim().isEmpty()) {
            setBusy(false, "Google n'a pas fourni de jeton Drive.");
            return;
        }
        setBusy(true, pendingMode == CloudSyncCoordinator.Mode.FORCE_DOWNLOAD
                ? "Téléchargement de la version cloud…" : "Synchronisation cloud…");
        CloudSyncCoordinator.runWithToken(this, token, pendingMode, result -> {
            setBusy(false, result.message);
            refreshState();
            if (result.outcome == CloudSyncCoordinator.Outcome.DOWNLOADED) {
                new AlertDialog.Builder(this)
                        .setTitle("Données cloud installées")
                        .setMessage(result.message + "\n\nRouvre l'Accueil pour afficher immédiatement la base restaurée.")
                        .setPositiveButton("Ouvrir l'Accueil", (d, w) -> {
                            Intent intent = new Intent(this, TodayActivity.class);
                            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            finish();
                        })
                        .show();
            } else if (result.outcome == CloudSyncCoordinator.Outcome.CONFLICT) {
                showMessage("Conflit protégé", result.message);
            }
        });
    }

    private void confirmForceUpload() {
        new AlertDialog.Builder(this)
                .setTitle("Remplacer la version cloud ?")
                .setMessage("Les données de cet appareil deviendront la référence pour le téléphone et la tablette. Cette opération recrée volontairement un socle complet et peut donc être plus longue qu'une synchronisation normale.")
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Envoyer", (d, w) -> authorizeAndRun(CloudSyncCoordinator.Mode.FORCE_UPLOAD, true))
                .show();
    }

    private void confirmForceDownload() {
        new AlertDialog.Builder(this)
                .setTitle("Remplacer les données de cet appareil ?")
                .setMessage("La version présente dans Google Drive remplacera la base locale SPORT de cet appareil à partir du dernier socle complet puis de toutes les révisions différentielles manquantes. Cette opération est plus lourde qu'une synchronisation normale.")
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Télécharger", (d, w) -> authorizeAndRun(CloudSyncCoordinator.Mode.FORCE_DOWNLOAD, true))
                .show();
    }

    private void setBusy(boolean busy, String status) {
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        enableButton.setEnabled(!busy);
        syncButton.setEnabled(!busy && new CloudSyncSettings(this).isEnabled());
        uploadButton.setEnabled(!busy && new CloudSyncSettings(this).isEnabled());
        downloadButton.setEnabled(!busy && new CloudSyncSettings(this).isEnabled());
        if (status != null && !status.isEmpty()) detailView.setText(status);
    }

    private void showMessage(String title, String message) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(message)
                .setPositiveButton("Fermer", null).show();
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setBackgroundColor(Color.WHITE);
        card.setTag("sport-theme-surface");
        return card;
    }

    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(Color.BLACK);
        view.setTypeface(bold ? AppFonts.bold(this) : AppFonts.regular(this));
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        return button;
    }

    private LinearLayout.LayoutParams match() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams margins(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = match();
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
