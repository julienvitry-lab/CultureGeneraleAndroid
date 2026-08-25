package fr.sport.app.cloud;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

/** Manifeste SYNCLOUD003, utilisé pour le HEAD et chaque révision immuable. */
public final class CloudSyncMetadata {
    public static final String FORMAT = "SPORT_SYNCLOUD";
    public static final int FORMAT_VERSION = 3;
    public static final String KIND_FULL = "FULL";
    public static final String KIND_QUICK = "QUICK"; // compatibilité v193
    public static final String KIND_DELTA = "DELTA";

    public final int formatVersion;
    public final long revision;
    public final long exportedAtMs;
    public final String deviceId;
    public final String backupSha256;
    public final long backupBytes;
    public final long activityCount;
    public final long appVersionCode;
    public final String appVersionName;
    public final String payloadKind;
    public final String payloadName;
    public final long baseMaxActivityId;
    public final long currentMaxActivityId;
    public final long baseRevision;

    public CloudSyncMetadata(long revision, long exportedAtMs, String deviceId,
                             String backupSha256, long backupBytes, long activityCount,
                             long appVersionCode, String appVersionName) {
        this(FORMAT_VERSION, revision, exportedAtMs, deviceId, backupSha256, backupBytes,
                activityCount, appVersionCode, appVersionName, KIND_FULL,
                CloudSyncCoordinator.BACKUP_NAME, 0L, 0L, revision);
    }

    public CloudSyncMetadata(long revision, long exportedAtMs, String deviceId,
                             String backupSha256, long backupBytes, long activityCount,
                             long appVersionCode, String appVersionName,
                             String payloadKind, String payloadName,
                             long baseMaxActivityId, long currentMaxActivityId) {
        this(FORMAT_VERSION, revision, exportedAtMs, deviceId, backupSha256, backupBytes,
                activityCount, appVersionCode, appVersionName, payloadKind, payloadName,
                baseMaxActivityId, currentMaxActivityId,
                KIND_FULL.equals(payloadKind) ? revision : 0L);
    }

    public CloudSyncMetadata(long revision, long exportedAtMs, String deviceId,
                             String backupSha256, long backupBytes, long activityCount,
                             long appVersionCode, String appVersionName,
                             String payloadKind, String payloadName,
                             long baseMaxActivityId, long currentMaxActivityId,
                             long baseRevision) {
        this(FORMAT_VERSION, revision, exportedAtMs, deviceId, backupSha256, backupBytes,
                activityCount, appVersionCode, appVersionName, payloadKind, payloadName,
                baseMaxActivityId, currentMaxActivityId, baseRevision);
    }

    private CloudSyncMetadata(int formatVersion, long revision, long exportedAtMs, String deviceId,
                              String backupSha256, long backupBytes, long activityCount,
                              long appVersionCode, String appVersionName,
                              String payloadKind, String payloadName,
                              long baseMaxActivityId, long currentMaxActivityId,
                              long baseRevision) {
        this.formatVersion = formatVersion;
        this.revision = revision;
        this.exportedAtMs = exportedAtMs;
        this.deviceId = deviceId == null ? "" : deviceId;
        this.backupSha256 = backupSha256 == null ? "" : backupSha256;
        this.backupBytes = backupBytes;
        this.activityCount = activityCount;
        this.appVersionCode = appVersionCode;
        this.appVersionName = appVersionName == null ? "" : appVersionName;
        if (KIND_DELTA.equals(payloadKind)) this.payloadKind = KIND_DELTA;
        else if (KIND_QUICK.equals(payloadKind)) this.payloadKind = KIND_QUICK;
        else this.payloadKind = KIND_FULL;
        this.payloadName = payloadName == null ? "" : payloadName;
        this.baseMaxActivityId = Math.max(0L, baseMaxActivityId);
        this.currentMaxActivityId = Math.max(0L, currentMaxActivityId);
        this.baseRevision = Math.max(0L, baseRevision);
    }

    public boolean isQuick() { return KIND_QUICK.equals(payloadKind); }
    public boolean isDelta() { return KIND_DELTA.equals(payloadKind); }
    public boolean isFull() { return KIND_FULL.equals(payloadKind); }
    public boolean isLegacy() { return formatVersion < 3; }

    public JSONObject toJson() throws IOException {
        try {
            JSONObject json = new JSONObject();
            json.put("format", FORMAT);
            json.put("formatVersion", FORMAT_VERSION);
            json.put("revision", revision);
            json.put("exportedAtMs", exportedAtMs);
            json.put("deviceId", deviceId);
            json.put("backupSha256", backupSha256);
            json.put("backupBytes", backupBytes);
            json.put("activityCount", activityCount);
            json.put("appVersionCode", appVersionCode);
            json.put("appVersionName", appVersionName);
            json.put("payloadKind", payloadKind);
            json.put("payloadName", payloadName);
            json.put("baseMaxActivityId", baseMaxActivityId);
            json.put("currentMaxActivityId", currentMaxActivityId);
            json.put("baseRevision", baseRevision);
            return json;
        } catch (JSONException e) {
            throw new IOException("Impossible de préparer le manifeste cloud.", e);
        }
    }

    public static CloudSyncMetadata fromJson(JSONObject json) throws IOException {
        if (json == null || !FORMAT.equals(json.optString("format", ""))) {
            throw new IOException("Le manifeste cloud SPORT n'est pas reconnu.");
        }
        int version = json.optInt("formatVersion", 0);
        if (version > FORMAT_VERSION) {
            throw new IOException("Le manifeste cloud provient d'une version plus récente de SPORT.");
        }
        String kind = version >= 2 ? json.optString("payloadKind", KIND_FULL) : KIND_FULL;
        String name = version >= 2 ? json.optString("payloadName", "") : CloudSyncCoordinator.BACKUP_NAME;
        long revision = json.optLong("revision", 0L);
        long baseRevision = version >= 3
                ? json.optLong("baseRevision", KIND_FULL.equals(kind) ? revision : 0L)
                : 0L;
        return new CloudSyncMetadata(
                version,
                revision,
                json.optLong("exportedAtMs", 0L),
                json.optString("deviceId", ""),
                json.optString("backupSha256", ""),
                json.optLong("backupBytes", 0L),
                json.optLong("activityCount", -1L),
                json.optLong("appVersionCode", 0L),
                json.optString("appVersionName", ""),
                kind,
                name,
                json.optLong("baseMaxActivityId", 0L),
                json.optLong("currentMaxActivityId", 0L),
                baseRevision);
    }
}
