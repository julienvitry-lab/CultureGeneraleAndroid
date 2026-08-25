package fr.sport.app.cloud;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import fr.sport.app.database.SportDatabase;
import fr.sport.app.ultra.UltraRaceModeSettings;

/** Empreinte ultra-légère SYNCLOUD003 : journal + préférences + petites bases. */
public final class CloudLocalState {
    private static final String[] AUXILIARY_DATABASES = new String[]{
            "records002_cache.db", "train003_links.db", "ultra007_live.db",
            "carto007_atlas.db", "quality002_audit.db", "tags001_collections.db",
            "favoris001.db", "equip002_insights.db", "train004_calendar.db",
            "performance001.db", "journal001.db"
    };

    private CloudLocalState() {}

    /**
     * SYNCLOUD003 ne rescane plus les 6 000+ activités à chaque ouverture.
     * Le journal SQLite donne immédiatement la dernière séquence de mutation.
     */
    public static String changeToken(Context context) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            update(digest, "syncSeq=" + syncSequence(context));
            update(digest, "pending=" + CloudDeltaSnapshot.pendingChangeCount(context));
            for (String name : AUXILIARY_DATABASES) {
                File file = context.getDatabasePath(name);
                File wal = new File(file.getAbsolutePath() + "-wal");
                update(digest, "aux|" + name + "|" + (file.isFile() ? file.length() : -1L)
                        + "|" + (file.isFile() ? file.lastModified() : -1L)
                        + "|wal=" + (wal.isFile() ? wal.length() : -1L)
                        + "|" + (wal.isFile() ? wal.lastModified() : -1L));
            }
            HashSet<String> ignoredToday = new HashSet<>();
            ignoredToday.add("widget_order");
            ignoredToday.add("widget_hidden");
            ignoredToday.add("widget_collapsed");
            updatePreferences(digest, context.getSharedPreferences("today_dashboard", Context.MODE_PRIVATE),
                    "prefs/today", ignoredToday);
            updatePreferences(digest, context.getSharedPreferences(UltraRaceModeSettings.PREFERENCES_NAME,
                    Context.MODE_PRIVATE), "prefs/ultra", Collections.emptySet());
            return toHex(digest.digest());
        } catch (Exception error) {
            return "token-error-" + error.getClass().getSimpleName();
        }
    }

    public static long activityCount(Context context) {
        return queryActivityScalar(context, "SELECT COUNT(*) FROM activities");
    }

    public static long maxActivityId(Context context) {
        return queryActivityScalar(context, "SELECT COALESCE(MAX(id),0) FROM activities");
    }

    public static long syncSequence(Context context) {
        File db = context.getDatabasePath(SportDatabase.DATABASE_NAME);
        if (!db.isFile() || db.length() == 0L) return 0L;
        SQLiteDatabase sqlite = null;
        try {
            sqlite = SQLiteDatabase.openDatabase(db.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            try (Cursor c = sqlite.rawQuery("SELECT value FROM sync_change_counter WHERE id=1", null)) {
                return c.moveToFirst() ? c.getLong(0) : 0L;
            }
        } catch (RuntimeException ignored) {
            return 0L;
        } finally {
            if (sqlite != null) try { sqlite.close(); } catch (RuntimeException ignored) { }
        }
    }

    private static long queryActivityScalar(Context context, String sql) {
        File db = context.getDatabasePath(SportDatabase.DATABASE_NAME);
        if (!db.isFile() || db.length() == 0L) return 0L;
        SQLiteDatabase sqlite = null;
        try {
            sqlite = SQLiteDatabase.openDatabase(db.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            try (Cursor cursor = sqlite.rawQuery(sql, null)) {
                return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
            }
        } catch (RuntimeException ignored) {
            return -1L;
        } finally {
            if (sqlite != null) try { sqlite.close(); } catch (RuntimeException ignored) { }
        }
    }

    private static void updatePreferences(MessageDigest digest, SharedPreferences prefs, String label,
                                          Set<String> ignoredKeys) {
        Map<String, ?> all = prefs.getAll();
        List<String> keys = new ArrayList<>(all.keySet());
        Collections.sort(keys);
        for (String key : keys) {
            if (ignoredKeys.contains(key)) continue;
            Object value = all.get(key);
            if (value instanceof Set) {
                List<String> values = new ArrayList<>();
                for (Object item : (Set<?>) value) values.add(String.valueOf(item));
                Collections.sort(values);
                update(digest, label + "|" + key + "=" + values);
            } else update(digest, label + "|" + key + "=" + String.valueOf(value));
        }
    }

    private static void update(MessageDigest digest, String value) {
        digest.update(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
        digest.update((byte) '\n');
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) builder.append(String.format(java.util.Locale.US, "%02x", b & 0xff));
        return builder.toString();
    }
}
