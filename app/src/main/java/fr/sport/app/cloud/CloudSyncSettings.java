package fr.sport.app.cloud;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

/** Préférences locales de SYNCLOUD. Elles ne sont jamais incluses dans la sauvegarde cloud. */
public final class CloudSyncSettings {
    public static final String PREFS = "sync_cloud_001";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_LAST_REVISION = "last_revision";
    private static final String KEY_LAST_LOCAL_TOKEN = "last_local_token";
    private static final String KEY_LAST_SYNC_MS = "last_sync_ms";
    private static final String KEY_LAST_STATUS = "last_status";
    private static final String KEY_CONFLICT = "conflict";
    private static final String KEY_EVER_SYNCED = "ever_synced";
    private static final String KEY_LAST_BACKGROUND_ATTEMPT_MS = "last_background_attempt_ms";
    private static final String KEY_BASE_MAX_ACTIVITY_ID = "base_max_activity_id";
    private static final String KEY_BASE_REVISION = "base_revision";
    private static final String KEY_LAST_PAYLOAD_KIND = "last_payload_kind";
    private static final String KEY_LAST_TRANSFER_BYTES = "last_transfer_bytes";
    private static final String KEY_TOKEN_SCHEMA = "token_schema";
    public static final int TOKEN_SCHEMA_VERSION = 3;

    private final SharedPreferences preferences;

    public CloudSyncSettings(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public boolean isEnabled() { return preferences.getBoolean(KEY_ENABLED, false); }
    public void setEnabled(boolean enabled) { preferences.edit().putBoolean(KEY_ENABLED, enabled).apply(); }

    public String deviceId() {
        String value = preferences.getString(KEY_DEVICE_ID, null);
        if (value == null || value.trim().isEmpty()) {
            value = UUID.randomUUID().toString();
            preferences.edit().putString(KEY_DEVICE_ID, value).commit();
        }
        return value;
    }

    public long lastRevision() { return preferences.getLong(KEY_LAST_REVISION, 0L); }
    public String lastLocalToken() { return preferences.getString(KEY_LAST_LOCAL_TOKEN, ""); }
    public long lastSyncMs() { return preferences.getLong(KEY_LAST_SYNC_MS, 0L); }
    public String lastStatus() { return preferences.getString(KEY_LAST_STATUS, "Jamais synchronisé"); }
    public boolean hasConflict() { return preferences.getBoolean(KEY_CONFLICT, false); }
    public boolean hasEverSynced() { return preferences.getBoolean(KEY_EVER_SYNCED, false); }
    public long lastBackgroundAttemptMs() { return preferences.getLong(KEY_LAST_BACKGROUND_ATTEMPT_MS, 0L); }
    public long baseMaxActivityId() { return preferences.getLong(KEY_BASE_MAX_ACTIVITY_ID, 0L); }
    public long baseRevision() { return preferences.getLong(KEY_BASE_REVISION, 0L); }
    public String lastPayloadKind() { return preferences.getString(KEY_LAST_PAYLOAD_KIND, ""); }
    public long lastTransferBytes() { return preferences.getLong(KEY_LAST_TRANSFER_BYTES, 0L); }
    public int tokenSchemaVersion() { return preferences.getInt(KEY_TOKEN_SCHEMA, 1); }

    public void markBackgroundAttempt(long whenMs) {
        preferences.edit().putLong(KEY_LAST_BACKGROUND_ATTEMPT_MS, whenMs).apply();
    }

    public void markSuccess(long revision, String localToken, String status) {
        markSuccess(revision, localToken, status, baseMaxActivityId(), lastPayloadKind(),
                lastTransferBytes(), baseRevision());
    }

    public void markSuccess(long revision, String localToken, String status,
                            long baseMaxActivityId, String payloadKind, long transferBytes) {
        markSuccess(revision, localToken, status, baseMaxActivityId, payloadKind, transferBytes,
                baseRevision());
    }

    public void markSuccess(long revision, String localToken, String status,
                            long baseMaxActivityId, String payloadKind, long transferBytes,
                            long baseRevision) {
        preferences.edit()
                .putLong(KEY_LAST_REVISION, Math.max(0L, revision))
                .putString(KEY_LAST_LOCAL_TOKEN, localToken == null ? "" : localToken)
                .putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis())
                .putString(KEY_LAST_STATUS, status == null ? "Synchronisé" : status)
                .putBoolean(KEY_CONFLICT, false)
                .putBoolean(KEY_EVER_SYNCED, true)
                .putLong(KEY_BASE_MAX_ACTIVITY_ID, Math.max(0L, baseMaxActivityId))
                .putLong(KEY_BASE_REVISION, Math.max(0L, baseRevision))
                .putString(KEY_LAST_PAYLOAD_KIND, payloadKind == null ? "" : payloadKind)
                .putLong(KEY_LAST_TRANSFER_BYTES, Math.max(0L, transferBytes))
                .putInt(KEY_TOKEN_SCHEMA, TOKEN_SCHEMA_VERSION)
                .apply();
    }

    public void markStatus(String status) {
        preferences.edit().putString(KEY_LAST_STATUS, status == null ? "" : status).apply();
    }

    public void markConflict(String status) {
        preferences.edit()
                .putBoolean(KEY_CONFLICT, true)
                .putString(KEY_LAST_STATUS, status == null ? "Conflit de synchronisation" : status)
                .apply();
    }

    public void clearConflict() {
        preferences.edit().putBoolean(KEY_CONFLICT, false).apply();
    }
}
