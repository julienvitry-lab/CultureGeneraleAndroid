package fr.sport.app.cloud;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import fr.sport.app.BuildConfig;
import fr.sport.app.backup.BackupManager;
import fr.sport.app.database.SportDatabase;
import fr.sport.app.diagnostic.DiagnosticJournal;

/**
 * SYNCLOUD003 : révisions immuables + vrais deltas SQLite.
 *
 * Publication atomique : payload unique -> manifeste unique de révision -> HEAD.
 * Un appareil qui reçoit le cloud applique toutes les révisions manquantes dans l'ordre.
 */
public final class CloudSyncCoordinator {
    // Noms historiques conservés pour migration/contrats.
    public static final String BACKUP_NAME = "sport_sync_backup.zip";
    public static final String QUICK_NAME = "sport_sync_quick.zip";
    public static final String META_NAME = "sport_sync_meta.json"; // HEAD mutable

    private static final String REV_PREFIX = "sport_rev_R";
    private static final String FULL_PREFIX = "sport_full_R";
    private static final String DELTA_PREFIX = "sport_delta_R";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final long BACKGROUND_DEBOUNCE_MS = 30_000L;
    private static final long DELTA_MAX_BYTES = 24L * 1024L * 1024L;
    private static final long DELTA_MAX_POINTS = 250_000L;

    private CloudSyncCoordinator() {}

    public enum Mode { AUTO, NORMAL, BACKGROUND_PUSH, FORCE_UPLOAD, FORCE_DOWNLOAD }

    public enum Outcome {
        DISABLED, OFFLINE, AUTHORIZATION_REQUIRED, NO_CHANGE, UPLOADED, DOWNLOADED,
        CONFLICT, BUSY, ERROR
    }

    public interface Callback { void onFinished(Result result); }

    public static final class Result {
        public final Outcome outcome;
        public final String message;
        public final long revision;
        public final long activityCount;
        public final long transferBytes;
        public final String payloadKind;

        public Result(Outcome outcome, String message, long revision, long activityCount) {
            this(outcome, message, revision, activityCount, 0L, "");
        }

        public Result(Outcome outcome, String message, long revision, long activityCount,
                      long transferBytes, String payloadKind) {
            this.outcome = outcome;
            this.message = message == null ? "" : message;
            this.revision = revision;
            this.activityCount = activityCount;
            this.transferBytes = Math.max(0L, transferBytes);
            this.payloadKind = payloadKind == null ? "" : payloadKind;
        }

        public boolean restoredLocalDatabase() { return outcome == Outcome.DOWNLOADED; }
    }

    public static void runStartup(Activity activity, Callback callback) {
        CloudSyncSettings settings = new CloudSyncSettings(activity);
        if (!settings.isEnabled()) {
            deliver(callback, new Result(Outcome.DISABLED, "Synchronisation cloud désactivée",
                    settings.lastRevision(), -1L));
            return;
        }
        if (!isOnline(activity)) {
            deliver(callback, new Result(Outcome.OFFLINE, "Hors connexion · données locales utilisées",
                    settings.lastRevision(), -1L));
            return;
        }
        authorizeSilently(activity,
                token -> runWithToken(activity.getApplicationContext(), token, Mode.AUTO, callback),
                () -> deliver(callback, new Result(Outcome.AUTHORIZATION_REQUIRED,
                        "Google Drive doit être réautorisé depuis Plus > Synchronisation cloud.",
                        settings.lastRevision(), -1L)),
                error -> deliver(callback, new Result(Outcome.ERROR, safe(error), settings.lastRevision(), -1L)));
    }

    public static void requestBackgroundPush(Activity activity) {
        if (activity == null || activity.isFinishing()) return;
        CloudSyncSettings settings = new CloudSyncSettings(activity);
        if (!settings.isEnabled() || !settings.hasEverSynced() || settings.hasConflict()) return;
        if (!isOnline(activity)) return;
        long now = System.currentTimeMillis();
        if (now - settings.lastBackgroundAttemptMs() < BACKGROUND_DEBOUNCE_MS) return;
        settings.markBackgroundAttempt(now);
        authorizeSilently(activity,
                token -> runWithToken(activity.getApplicationContext(), token, Mode.BACKGROUND_PUSH, null),
                () -> {}, error -> DiagnosticJournal.warning(activity, "SYNCLOUD003",
                        "Autorisation cloud indisponible en arrière-plan : " + safe(error)));
    }

    public static void runWithToken(Context context, String accessToken, Mode mode, Callback callback) {
        if (accessToken == null || accessToken.trim().isEmpty()) {
            deliver(callback, new Result(Outcome.ERROR, "Jeton Google Drive absent.", 0L, -1L));
            return;
        }
        if (!RUNNING.compareAndSet(false, true)) {
            deliver(callback, new Result(Outcome.BUSY, "Une synchronisation SPORT est déjà en cours.",
                    new CloudSyncSettings(context).lastRevision(), -1L));
            return;
        }
        EXECUTOR.execute(() -> {
            Result result;
            try {
                result = perform(context.getApplicationContext(), accessToken, mode);
            } catch (Throwable error) {
                DiagnosticJournal.error(context, "SYNCLOUD003", "Synchronisation cloud", error);
                new CloudSyncSettings(context).markStatus("Échec cloud · " + safe(error));
                result = new Result(Outcome.ERROR, safe(error),
                        new CloudSyncSettings(context).lastRevision(), -1L);
            } finally {
                RUNNING.set(false);
            }
            deliver(callback, result);
        });
    }

    private static Result perform(Context context, String accessToken, Mode mode) throws Exception {
        CloudSyncSettings settings = new CloudSyncSettings(context);
        CloudDriveClient drive = new CloudDriveClient(accessToken);
        CloudSyncMetadata head = readHead(drive);
        long localActivities = CloudLocalState.activityCount(context);
        long localMaxActivityId = Math.max(0L, CloudLocalState.maxActivityId(context));

        if (mode == Mode.FORCE_UPLOAD) {
            long revision = Math.max(settings.lastRevision(), head == null ? 0L : head.revision) + 1L;
            return uploadFullRevision(context, drive, settings, revision, localActivities,
                    localMaxActivityId, "Cet appareil devient le nouveau socle cloud");
        }

        if (head != null && head.isLegacy()) {
            settings.markConflict("Migration SYNCLOUD003 requise : le cloud v193 doit être recréé une seule fois depuis l'appareil de référence.");
            return new Result(Outcome.CONFLICT,
                    "Cloud SYNCLOUD002 détecté. Installez v194 sur les deux appareils puis, sur l'appareil de référence, utilisez une seule fois « Garder cet appareil et l'envoyer au cloud ».",
                    head.revision, localActivities);
        }

        if (mode == Mode.FORCE_DOWNLOAD) {
            if (head == null) return new Result(Outcome.ERROR, "Aucune sauvegarde SPORT n'existe dans le cloud.",
                    settings.lastRevision(), localActivities);
            return downloadToHead(context, drive, settings, head, true);
        }

        if (head == null) {
            return uploadFullRevision(context, drive, settings,
                    Math.max(1L, settings.lastRevision() + 1L), localActivities,
                    localMaxActivityId, "Première sauvegarde cloud créée");
        }

        String localToken = CloudLocalState.changeToken(context);
        boolean tokenSchemaMigrated = settings.hasEverSynced()
                && settings.tokenSchemaVersion() < CloudSyncSettings.TOKEN_SCHEMA_VERSION;
        boolean journalChanged = CloudDeltaSnapshot.pendingChangeCount(context) > 0L;
        boolean localChanged = settings.hasEverSynced() && !tokenSchemaMigrated
                && (journalChanged || !localToken.equals(settings.lastLocalToken()));
        boolean remoteChanged = head.revision > settings.lastRevision();

        if (!settings.hasEverSynced()) {
            if (localActivities <= 0L) return downloadToHead(context, drive, settings, head, true);
            settings.markConflict("Premier raccordement : données présentes sur cet appareil et dans le cloud.");
            return new Result(Outcome.CONFLICT,
                    "Des données existent déjà sur cet appareil et dans Google Drive. Choisissez la version à conserver.",
                    head.revision, localActivities);
        }

        if (remoteChanged && localChanged) {
            settings.markConflict("Conflit : modifications locales et cloud depuis la révision "
                    + settings.lastRevision() + ".");
            return new Result(Outcome.CONFLICT,
                    "Téléphone et tablette ont été modifiés depuis leur dernière révision commune. Aucun écrasement automatique.",
                    head.revision, localActivities);
        }

        if (remoteChanged) return downloadToHead(context, drive, settings, head, false);

        if (head.revision < settings.lastRevision() || localChanged) {
            long revision = Math.max(head.revision, settings.lastRevision()) + 1L;
            return uploadDeltaOrCompact(context, drive, settings, head, revision,
                    localActivities, localMaxActivityId,
                    mode == Mode.BACKGROUND_PUSH ? "Modifications envoyées" : "Synchronisation envoyée");
        }

        // Migration du token v193 vers le journal v194 sans créer un faux changement.
        settings.markSuccess(head.revision, localToken, "Synchronisé · différentiel",
                head.currentMaxActivityId, head.payloadKind, 0L, head.baseRevision);
        settings.clearConflict();
        return new Result(Outcome.NO_CHANGE, "Déjà synchronisé", head.revision, localActivities,
                0L, head.payloadKind);
    }

    private static Result uploadDeltaOrCompact(Context context, CloudDriveClient drive,
                                               CloudSyncSettings settings, CloudSyncMetadata head,
                                               long revision, long activityCount, long currentMaxActivityId,
                                               String message) throws Exception {
        File temp = File.createTempFile("sport_cloud_delta_", ".zip", context.getCacheDir());
        try {
            CloudDeltaSnapshot.Info info = CloudDeltaSnapshot.create(context, head.revision,
                    settings.lastSyncMs(), temp);
            if (info.bytes > DELTA_MAX_BYTES || info.pointCount > DELTA_MAX_POINTS) {
                return uploadFullRevision(context, drive, settings, revision, activityCount,
                        currentMaxActivityId, message + " · nouveau socle compacté");
            }
            String payloadName = deltaName(revision);
            String sha = sha256(temp);
            drive.uploadFile(payloadName, "application/zip", temp);
            long baseRevision = head.baseRevision > 0L ? head.baseRevision : settings.baseRevision();
            CloudSyncMetadata revisionMeta = new CloudSyncMetadata(
                    revision, System.currentTimeMillis(), settings.deviceId(), sha, temp.length(),
                    Math.max(0L, activityCount), BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME,
                    CloudSyncMetadata.KIND_DELTA, payloadName,
                    settings.baseMaxActivityId(), currentMaxActivityId, baseRevision);
            publishRevision(drive, revisionMeta);
            CloudDeltaSnapshot.clearThrough(context, info.maxChangeSeq);
            String token = CloudLocalState.changeToken(context);
            String status = message + " · delta " + info.changeCount + " changement"
                    + (info.changeCount > 1 ? "s" : "") + " · " + formatBytes(temp.length());
            settings.markSuccess(revision, token, status, settings.baseMaxActivityId(),
                    CloudSyncMetadata.KIND_DELTA, temp.length(), baseRevision);
            settings.clearConflict();
            return new Result(Outcome.UPLOADED, status, revision, activityCount,
                    temp.length(), CloudSyncMetadata.KIND_DELTA);
        } finally {
            if (!temp.delete()) temp.deleteOnExit();
        }
    }

    private static Result uploadFullRevision(Context context, CloudDriveClient drive,
                                             CloudSyncSettings settings, long revision,
                                             long activityCount, long currentMaxActivityId,
                                             String message) throws Exception {
        File temp = File.createTempFile("sport_cloud_full_", ".zip", context.getCacheDir());
        try {
            try (FileOutputStream output = new FileOutputStream(temp)) {
                BackupManager.createBackup(context, new SportDatabase(context), output);
            }
            String payloadName = fullName(revision);
            String sha = sha256(temp);
            drive.uploadFile(payloadName, "application/zip", temp);
            long baseMax = Math.max(0L, currentMaxActivityId);
            CloudSyncMetadata revisionMeta = new CloudSyncMetadata(
                    revision, System.currentTimeMillis(), settings.deviceId(), sha, temp.length(),
                    Math.max(0L, activityCount), BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME,
                    CloudSyncMetadata.KIND_FULL, payloadName, baseMax, baseMax, revision);
            publishRevision(drive, revisionMeta);
            CloudDeltaSnapshot.clearAll(context);
            String token = CloudLocalState.changeToken(context);
            String status = message + " · socle complet " + formatBytes(temp.length());
            settings.markSuccess(revision, token, status, baseMax,
                    CloudSyncMetadata.KIND_FULL, temp.length(), revision);
            settings.clearConflict();
            return new Result(Outcome.UPLOADED, status, revision, activityCount,
                    temp.length(), CloudSyncMetadata.KIND_FULL);
        } finally {
            if (!temp.delete()) temp.deleteOnExit();
        }
    }

    /** Le HEAD n'est publié qu'après le payload et le manifeste immuable de révision. */
    private static void publishRevision(CloudDriveClient drive, CloudSyncMetadata metadata) throws Exception {
        drive.uploadBytes(revisionManifestName(metadata.revision), "application/json; charset=UTF-8",
                metadata.toJson().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        drive.uploadBytes(META_NAME, "application/json; charset=UTF-8",
                metadata.toJson().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static Result downloadToHead(Context context, CloudDriveClient drive,
                                         CloudSyncSettings settings, CloudSyncMetadata head,
                                         boolean force) throws Exception {
        if (head == null) throw new IOException("HEAD cloud SPORT absent.");
        if (head.isLegacy()) throw new IOException("Cloud v193 non migré vers SYNCLOUD003.");

        long transferred = 0L;
        long currentRevision = force ? 0L : settings.lastRevision();
        long baseRevision = head.baseRevision;
        boolean restoredFull = false;

        if (force || currentRevision < baseRevision || CloudLocalState.activityCount(context) <= 0L) {
            CloudSyncMetadata base = readRevision(drive, baseRevision);
            if (base == null || !base.isFull()) throw new IOException("Socle immuable R" + baseRevision + " absent.");
            transferred += applyFullRevision(context, drive, base);
            restoredFull = true;
            currentRevision = baseRevision;
            settings.markSuccess(currentRevision, CloudLocalState.changeToken(context),
                    "Socle cloud reçu", base.currentMaxActivityId, CloudSyncMetadata.KIND_FULL,
                    base.backupBytes, baseRevision);
        }

        int applied = 0;
        while (currentRevision < head.revision) {
            long next = currentRevision + 1L;
            CloudSyncMetadata revision = readRevision(drive, next);
            if (revision == null) throw new IOException("Révision cloud R" + next + " absente.");
            if (revision.isFull()) {
                transferred += applyFullRevision(context, drive, revision);
                baseRevision = revision.revision;
                restoredFull = true;
            } else if (revision.isDelta()) {
                transferred += applyDeltaRevision(context, drive, revision);
            } else {
                throw new IOException("Révision cloud R" + next + " d'un ancien format non applicable.");
            }
            currentRevision = revision.revision;
            applied++;
            settings.markSuccess(currentRevision, CloudLocalState.changeToken(context),
                    "Révision cloud R" + currentRevision + " appliquée",
                    revision.currentMaxActivityId, revision.payloadKind,
                    revision.backupBytes, baseRevision);
        }

        CloudDeltaSnapshot.clearAll(context);
        String token = CloudLocalState.changeToken(context);
        String status = applied == 0 && !restoredFull
                ? "Déjà synchronisé"
                : "Cloud reçu · " + applied + " révision" + (applied > 1 ? "s" : "")
                + " · " + formatBytes(transferred);
        settings.markSuccess(head.revision, token, status, head.currentMaxActivityId,
                head.payloadKind, transferred, baseRevision);
        settings.clearConflict();
        return new Result(applied == 0 && !restoredFull ? Outcome.NO_CHANGE : Outcome.DOWNLOADED,
                status, head.revision, CloudLocalState.activityCount(context), transferred, head.payloadKind);
    }

    private static long applyFullRevision(Context context, CloudDriveClient drive,
                                          CloudSyncMetadata revision) throws Exception {
        File temp = downloadVerified(context, drive, revision);
        try {
            try (FileInputStream input = new FileInputStream(temp)) {
                BackupManager.restoreBackup(context, new SportDatabase(context), input);
            }
            CloudDeltaSnapshot.clearAll(context);
            return temp.length();
        } finally {
            if (!temp.delete()) temp.deleteOnExit();
        }
    }

    private static long applyDeltaRevision(Context context, CloudDriveClient drive,
                                           CloudSyncMetadata revision) throws Exception {
        File temp = downloadVerified(context, drive, revision);
        try {
            CloudDeltaSnapshot.apply(context, temp);
            return temp.length();
        } finally {
            if (!temp.delete()) temp.deleteOnExit();
        }
    }

    /**
     * Une révision publiée est immuable. En cas de SHA différent, on retélécharge
     * exactement le même fichier une fois. On ne transforme jamais ce défaut en conflit utilisateur.
     */
    private static File downloadVerified(Context context, CloudDriveClient drive,
                                         CloudSyncMetadata revision) throws Exception {
        IOException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            CloudDriveClient.RemoteFile payload = drive.findLatestByName(revision.payloadName);
            if (payload == null) throw new IOException("Payload immuable absent : " + revision.payloadName);
            File temp = File.createTempFile("sport_cloud_R" + revision.revision + "_", ".zip",
                    context.getCacheDir());
            try {
                drive.downloadTo(payload, temp);
                String sha = sha256(temp);
                if (revision.backupSha256.isEmpty() || revision.backupSha256.equalsIgnoreCase(sha)) return temp;
                last = new IOException("Empreinte SHA-256 invalide pour la révision R" + revision.revision + ".");
            } catch (IOException error) {
                last = error;
            }
            if (!temp.delete()) temp.deleteOnExit();
        }
        throw last == null ? new IOException("Téléchargement cloud invalide.") : last;
    }

    private static CloudSyncMetadata readHead(CloudDriveClient drive) throws Exception {
        CloudDriveClient.RemoteFile file = drive.findLatestByName(META_NAME);
        return file == null ? null : CloudSyncMetadata.fromJson(drive.downloadJson(file));
    }

    private static CloudSyncMetadata readRevision(CloudDriveClient drive, long revision) throws Exception {
        if (revision <= 0L) return null;
        CloudDriveClient.RemoteFile file = drive.findLatestByName(revisionManifestName(revision));
        return file == null ? null : CloudSyncMetadata.fromJson(drive.downloadJson(file));
    }

    public static String revisionManifestName(long revision) {
        return REV_PREFIX + String.format(Locale.US, "%08d", revision) + ".json";
    }
    public static String fullName(long revision) {
        return FULL_PREFIX + String.format(Locale.US, "%08d", revision) + ".zip";
    }
    public static String deltaName(long revision) {
        return DELTA_PREFIX + String.format(Locale.US, "%08d", revision) + ".zip";
    }

    private interface TokenCallback { void onToken(String token); }
    private interface SimpleCallback { void run(); }
    private interface ErrorCallback { void onError(Throwable error); }

    private static void authorizeSilently(Activity activity, TokenCallback tokenCallback,
                                          SimpleCallback resolutionRequired, ErrorCallback errorCallback) {
        try {
            AuthorizationRequest request = AuthorizationRequest.builder()
                    .setRequestedScopes(Collections.singletonList(new Scope(CloudDriveClient.APPDATA_SCOPE)))
                    .build();
            Identity.getAuthorizationClient(activity).authorize(request)
                    .addOnSuccessListener(activity, result -> {
                        if (result.hasResolution()) resolutionRequired.run();
                        else if (result.getAccessToken() == null || result.getAccessToken().trim().isEmpty()) {
                            errorCallback.onError(new IOException("Google n'a pas fourni de jeton Drive."));
                        } else tokenCallback.onToken(result.getAccessToken());
                    })
                    .addOnFailureListener(activity, errorCallback::onError);
        } catch (Throwable error) {
            errorCallback.onError(error);
        }
    }

    public static boolean isOnline(Context context) {
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = manager.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = manager.getNetworkCapabilities(network);
                return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            android.net.NetworkInfo info = manager.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Throwable ignored) {
            return true;
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.US, "%02x", b & 0xff));
        return hex.toString();
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024L) return bytes + " o";
        if (bytes < 1024L * 1024L) return String.format(Locale.FRANCE, "%.0f Ko", bytes / 1024.0);
        return String.format(Locale.FRANCE, "%.1f Mo", bytes / (1024.0 * 1024.0));
    }

    private static void deliver(Callback callback, Result result) {
        if (callback == null) return;
        MAIN.post(() -> callback.onFinished(result));
    }

    public static String safe(Throwable error) {
        if (error == null) return "Erreur inconnue";
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return error.getClass().getSimpleName();
        return message.trim();
    }
}
