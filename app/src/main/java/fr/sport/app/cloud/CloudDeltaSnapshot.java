package fr.sport.app.cloud;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import fr.sport.app.database.SportDatabase;
import fr.sport.app.ultra.UltraRaceModeSettings;

/**
 * SYNCLOUD003 : paquet réellement différentiel.
 *
 * Le journal SQLite enregistre seulement les lignes modifiées depuis la dernière
 * synchronisation. Les points GPS/FC sont regroupés par activité pour éviter des
 * dizaines de milliers d'entrées de journal lors d'un import.
 */
public final class CloudDeltaSnapshot {
    public static final String FORMAT = "SPORT_SYNCLOUD_DELTA";
    public static final int FORMAT_VERSION = 1;
    private static final String ENTRY_DELTA = "delta.json";
    private static final String POINTS_PREFIX = "points/";
    private static final String AUX_PREFIX = "aux/";
    private static final int BUFFER = 64 * 1024;

    private static final String[] AUX_DATABASES = new String[]{
            "records002_cache.db", "train003_links.db", "ultra007_live.db",
            "carto007_atlas.db", "quality002_audit.db", "tags001_collections.db",
            "favoris001.db", "equip002_insights.db", "train004_calendar.db",
            "performance001.db", "journal001.db"
    };

    private CloudDeltaSnapshot() {}

    public static final class Info {
        public final long maxChangeSeq;
        public final long changeCount;
        public final long pointActivityCount;
        public final long pointCount;
        public final long bytes;

        Info(long maxChangeSeq, long changeCount, long pointActivityCount, long pointCount, long bytes) {
            this.maxChangeSeq = maxChangeSeq;
            this.changeCount = changeCount;
            this.pointActivityCount = pointActivityCount;
            this.pointCount = pointCount;
            this.bytes = bytes;
        }
    }

    private static final class Change {
        final String table;
        final String key;
        final String operation;
        final long sequence;
        Change(String table, String key, String operation, long sequence) {
            this.table = table;
            this.key = key;
            this.operation = operation;
            this.sequence = sequence;
        }
    }

    public static long pendingChangeCount(Context context) {
        return scalar(context, "SELECT COUNT(*) FROM sync_change_log");
    }

    public static long maxChangeSeq(Context context) {
        return scalar(context, "SELECT COALESCE(MAX(change_seq),0) FROM sync_change_log");
    }

    public static void clearThrough(Context context, long maxSeq) {
        SportDatabase helper = new SportDatabase(context);
        try {
            helper.getWritableDatabase().delete("sync_change_log", "change_seq<=?",
                    new String[]{Long.toString(Math.max(0L, maxSeq))});
        } finally {
            helper.close();
        }
    }

    public static void clearAll(Context context) {
        SportDatabase helper = new SportDatabase(context);
        try {
            helper.getWritableDatabase().delete("sync_change_log", null, null);
        } finally {
            helper.close();
        }
    }

    public static Info create(Context context, long fromRevision, long sinceMs, File destination)
            throws IOException {
        SportDatabase helper = new SportDatabase(context);
        SQLiteDatabase db = null;
        try {
            db = helper.getWritableDatabase();
            checkpoint(db);
            List<Change> changes = readChanges(db);
            long maxSeq = 0L;
            for (Change c : changes) maxSeq = Math.max(maxSeq, c.sequence);

            // Si une activité est supprimée, les suppressions en cascade de ses points
            // ne doivent pas essayer de réexporter un parent qui n'existe plus.
            Set<String> deletedActivities = new HashSet<>();
            for (Change c : changes) {
                if ("activities".equals(c.table) && "DELETE".equals(c.operation)) deletedActivities.add(c.key);
            }

            JSONArray changeJson = new JSONArray();
            List<Long> pointActivities = new ArrayList<>();
            for (Change change : changes) {
                if ("activity_points".equals(change.table)) {
                    if (!deletedActivities.contains(change.key)) {
                        try { pointActivities.add(Long.parseLong(change.key)); }
                        catch (NumberFormatException ignored) { }
                        changeJson.put(changeObject(change, null));
                    }
                    continue;
                }
                JSONObject row = "DELETE".equals(change.operation) ? null : loadRow(db, change.table, change.key);
                // Une ligne UPSERT peut avoir disparu après l'écriture du journal : elle devient tombstone.
                String operation = row == null ? "DELETE" : change.operation;
                changeJson.put(changeObject(new Change(change.table, change.key, operation, change.sequence), row));
            }

            JSONObject root = new JSONObject();
            root.put("format", FORMAT);
            root.put("formatVersion", FORMAT_VERSION);
            root.put("fromRevision", Math.max(0L, fromRevision));
            root.put("createdAtMs", System.currentTimeMillis());
            root.put("maxChangeSeq", maxSeq);
            root.put("changes", changeJson);
            root.put("todayPreferences", exportPreferences(
                    context.getSharedPreferences("today_dashboard", Context.MODE_PRIVATE)));
            root.put("ultraPreferences", exportPreferences(
                    context.getSharedPreferences(UltraRaceModeSettings.PREFERENCES_NAME, Context.MODE_PRIVATE)));

            File parent = destination.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IOException("Impossible de préparer le paquet différentiel SPORT.");
            }

            long pointCount = 0L;
            try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(destination)))) {
                writeJson(zip, ENTRY_DELTA, root);
                for (Long activityId : pointActivities) {
                    pointCount += writePoints(zip, db, activityId);
                }
                for (String name : AUX_DATABASES) {
                    File file = context.getDatabasePath(name);
                    File wal = new File(file.getAbsolutePath() + "-wal");
                    long modified = Math.max(file.isFile() ? file.lastModified() : 0L,
                            wal.isFile() ? wal.lastModified() : 0L);
                    if (!file.isFile() || file.length() <= 0L || modified <= sinceMs) continue;
                    checkpointFile(file);
                    if (file.isFile() && file.length() > 0L) writeFile(zip, AUX_PREFIX + name, file);
                }
                zip.finish();
            }
            return new Info(maxSeq, changes.size(), pointActivities.size(), pointCount, destination.length());
        } catch (JSONException error) {
            throw new IOException("Impossible de préparer le delta SPORT.", error);
        } finally {
            if (db != null) try { db.close(); } catch (RuntimeException ignored) { }
            try { helper.close(); } catch (RuntimeException ignored) { }
        }
    }

    public static long apply(Context context, File source) throws IOException {
        File work = new File(context.getCacheDir(), "sport_delta_apply_" + System.nanoTime());
        if (!work.mkdirs()) throw new IOException("Impossible de préparer la réception différentielle.");
        File deltaFile = new File(work, ENTRY_DELTA);
        File pointsDir = new File(work, "points");
        File auxDir = new File(work, "aux");
        try {
            extract(source, deltaFile, pointsDir, auxDir);
            JSONObject root = readJsonFile(deltaFile);
            validate(root);
            JSONArray changes = root.optJSONArray("changes");
            if (changes == null) throw new IOException("Liste des changements cloud absente.");

            SportDatabase helper = new SportDatabase(context);
            SQLiteDatabase db = null;
            try {
                db = helper.getWritableDatabase();
                setApplyGuard(db, true);
                db.beginTransaction();
                try {
                    applyChanges(db, changes, pointsDir);
                    db.setTransactionSuccessful();
                } finally {
                    db.endTransaction();
                    setApplyGuard(db, false);
                }
                checkpoint(db);
            } catch (JSONException error) {
                throw new IOException("Delta SPORT illisible.", error);
            } finally {
                if (db != null) {
                    try { setApplyGuard(db, false); } catch (RuntimeException ignored) { }
                    try { db.close(); } catch (RuntimeException ignored) { }
                }
                try { helper.close(); } catch (RuntimeException ignored) { }
            }

            restorePreferences(context.getSharedPreferences("today_dashboard", Context.MODE_PRIVATE),
                    root.optJSONObject("todayPreferences"));
            restorePreferences(context.getSharedPreferences(UltraRaceModeSettings.PREFERENCES_NAME, Context.MODE_PRIVATE),
                    root.optJSONObject("ultraPreferences"));
            restoreAuxiliaryDatabases(context, auxDir);
            clearAll(context);
            return changes.length();
        } catch (JSONException error) {
            throw new IOException("Delta SPORT illisible.", error);
        } finally {
            deleteRecursively(work);
        }
    }

    private static List<Change> readChanges(SQLiteDatabase db) {
        List<Change> result = new ArrayList<>();
        try (Cursor c = db.rawQuery(
                "SELECT table_name,row_key,operation,change_seq FROM sync_change_log ORDER BY change_seq", null)) {
            while (c.moveToNext()) result.add(new Change(c.getString(0), c.getString(1), c.getString(2), c.getLong(3)));
        }
        return result;
    }

    private static JSONObject changeObject(Change change, JSONObject row) throws JSONException {
        JSONObject json = new JSONObject();
        json.put("table", change.table);
        json.put("key", change.key);
        json.put("operation", change.operation);
        json.put("sequence", change.sequence);
        if (row != null) json.put("row", row);
        return json;
    }

    private static JSONObject loadRow(SQLiteDatabase db, String table, String key) throws JSONException {
        String where;
        String[] args;
        if ("activity_landmarks".equals(table)) {
            int split = key.indexOf(':');
            if (split <= 0) return null;
            where = "activity_id=? AND landmark_code=?";
            args = new String[]{key.substring(0, split), key.substring(split + 1)};
        } else if ("personal_landmarks".equals(table)) {
            where = "code=?"; args = new String[]{key};
        } else if ("personal_landmark_references".equals(table)) {
            where = "landmark_code=?"; args = new String[]{key};
        } else if ("equipment".equals(table)) {
            where = "id=?"; args = new String[]{key};
        } else if ("records".equals(table)) {
            where = "record_type=?"; args = new String[]{key};
        } else {
            where = "id=?"; args = new String[]{key};
        }
        if (!tableExists(db, table)) return null;
        try (Cursor cursor = db.query(table, null, where, args, null, null, null, "1")) {
            if (!cursor.moveToFirst()) return null;
            JSONObject row = new JSONObject();
            String[] columns = cursor.getColumnNames();
            for (int i = 0; i < columns.length; i++) putCursorValue(row, columns[i], cursor, i);
            return row;
        }
    }

    private static void applyChanges(SQLiteDatabase db, JSONArray changes, File pointsDir)
            throws JSONException, IOException {
        List<JSONObject> rows = new ArrayList<>();
        for (int i = 0; i < changes.length(); i++) rows.add(changes.getJSONObject(i));
        Collections.sort(rows, Comparator.comparingInt(CloudDeltaSnapshot::priority));
        for (JSONObject change : rows) {
            String table = change.optString("table", "");
            String key = change.optString("key", "");
            String op = change.optString("operation", "UPSERT");
            if ("activity_points".equals(table)) {
                if ("DELETE".equals(op)) continue;
                long activityId;
                try { activityId = Long.parseLong(key); }
                catch (NumberFormatException error) { throw new IOException("Identifiant GPS cloud invalide.", error); }
                db.delete("activity_points", "activity_id=?", new String[]{Long.toString(activityId)});
                File points = new File(pointsDir, activityId + ".tsv");
                if (points.isFile()) importPoints(db, points);
                continue;
            }
            if (!tableExists(db, table)) continue;
            if ("DELETE".equals(op)) {
                deleteRow(db, table, key);
                continue;
            }
            JSONObject row = change.optJSONObject("row");
            if (row == null) continue;
            if ("activities".equals(table)) {
                long id = row.optLong("id", -1L);
                if (id <= 0L) continue;
                ContentValues values = contentValues(row, "id");
                int updated = db.update(table, values, "id=?", new String[]{Long.toString(id)});
                if (updated == 0 && db.insertWithOnConflict(table, null, contentValues(row, null),
                        SQLiteDatabase.CONFLICT_ABORT) < 0L) {
                    throw new IOException("Impossible d'ajouter l'activité cloud " + id + ".");
                }
            } else if (db.insertWithOnConflict(table, null, contentValues(row, null),
                    SQLiteDatabase.CONFLICT_REPLACE) < 0L) {
                throw new IOException("Impossible d'appliquer la ligne cloud " + table + ".");
            }
        }
    }

    private static int priority(JSONObject change) {
        String table = change.optString("table", "");
        String op = change.optString("operation", "UPSERT");
        if ("DELETE".equals(op) && "activities".equals(table)) return 90;
        if ("activities".equals(table)) return 10;
        if ("personal_landmarks".equals(table) || "equipment".equals(table)) return 20;
        if ("activity_points".equals(table)) return 30;
        if ("DELETE".equals(op)) return 70;
        return 40;
    }

    private static void deleteRow(SQLiteDatabase db, String table, String key) {
        if ("activity_landmarks".equals(table)) {
            int split = key.indexOf(':');
            if (split > 0) db.delete(table, "activity_id=? AND landmark_code=?",
                    new String[]{key.substring(0, split), key.substring(split + 1)});
        } else if ("personal_landmarks".equals(table)) db.delete(table, "code=?", new String[]{key});
        else if ("personal_landmark_references".equals(table)) db.delete(table, "landmark_code=?", new String[]{key});
        else if ("equipment".equals(table)) db.delete(table, "id=?", new String[]{key});
        else if ("records".equals(table)) db.delete(table, "record_type=?", new String[]{key});
        else db.delete(table, "id=?", new String[]{key});
    }

    private static long writePoints(ZipOutputStream zip, SQLiteDatabase db, long activityId) throws IOException {
        ZipEntry entry = new ZipEntry(POINTS_PREFIX + activityId + ".tsv");
        zip.putNextEntry(entry);
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(zip, StandardCharsets.UTF_8), BUFFER);
        long count = 0L;
        try (Cursor cursor = db.rawQuery(
                "SELECT activity_id,point_index,latitude,longitude,altitude_m,distance_m,timestamp_ms,heart_rate " +
                        "FROM activity_points WHERE activity_id=? ORDER BY point_index",
                new String[]{Long.toString(activityId)})) {
            while (cursor.moveToNext()) {
                writer.write(Long.toString(cursor.getLong(0))); writer.write('\t');
                writer.write(Integer.toString(cursor.getInt(1))); writer.write('\t');
                writer.write(Double.toString(cursor.getDouble(2))); writer.write('\t');
                writer.write(Double.toString(cursor.getDouble(3))); writer.write('\t');
                writer.write(nullableNumber(cursor, 4)); writer.write('\t');
                writer.write(nullableNumber(cursor, 5)); writer.write('\t');
                writer.write(nullableLong(cursor, 6)); writer.write('\t');
                writer.write(nullableLong(cursor, 7)); writer.write('\n');
                count++;
            }
        }
        writer.flush();
        zip.closeEntry();
        return count;
    }

    private static void importPoints(SQLiteDatabase db, File file) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new FileInputStream(file), StandardCharsets.UTF_8), BUFFER)) {
            String line;
            ContentValues values = new ContentValues(8);
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) continue;
                String[] parts = line.split("\\t", -1);
                if (parts.length != 8) throw new IOException("Ligne GPS différentielle invalide.");
                values.clear();
                values.put("activity_id", Long.parseLong(parts[0]));
                values.put("point_index", Integer.parseInt(parts[1]));
                values.put("latitude", Double.parseDouble(parts[2]));
                values.put("longitude", Double.parseDouble(parts[3]));
                putNullableDouble(values, "altitude_m", parts[4]);
                putNullableDouble(values, "distance_m", parts[5]);
                putNullableLong(values, "timestamp_ms", parts[6]);
                putNullableLong(values, "heart_rate", parts[7]);
                if (db.insertWithOnConflict("activity_points", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE) < 0L) {
                    throw new IOException("Impossible de restaurer les points GPS différentiels.");
                }
            }
        } catch (NumberFormatException error) {
            throw new IOException("Valeur GPS différentielle invalide.", error);
        }
    }

    private static void setApplyGuard(SQLiteDatabase db, boolean active) {
        db.execSQL("UPDATE sync_apply_guard SET active=? WHERE id=1", new Object[]{active ? 1 : 0});
    }

    private static long scalar(Context context, String sql) {
        SportDatabase helper = new SportDatabase(context);
        try (Cursor c = helper.getReadableDatabase().rawQuery(sql, null)) {
            return c.moveToFirst() ? c.getLong(0) : 0L;
        } catch (RuntimeException error) {
            return 0L;
        } finally {
            helper.close();
        }
    }

    private static JSONObject exportPreferences(SharedPreferences prefs) throws JSONException {
        JSONObject root = new JSONObject();
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            String key = entry.getKey();
            if ("widget_order".equals(key) || "widget_hidden".equals(key) || "widget_collapsed".equals(key)) continue;
            Object value = entry.getValue();
            JSONObject encoded = new JSONObject();
            if (value instanceof String) { encoded.put("type", "string"); encoded.put("value", value); }
            else if (value instanceof Boolean) { encoded.put("type", "boolean"); encoded.put("value", value); }
            else if (value instanceof Integer) { encoded.put("type", "int"); encoded.put("value", value); }
            else if (value instanceof Long) { encoded.put("type", "long"); encoded.put("value", value); }
            else if (value instanceof Float) { encoded.put("type", "float"); encoded.put("value", ((Float) value).doubleValue()); }
            else if (value instanceof Set) {
                encoded.put("type", "string_set");
                JSONArray array = new JSONArray();
                for (Object item : (Set<?>) value) array.put(String.valueOf(item));
                encoded.put("value", array);
            } else continue;
            root.put(key, encoded);
        }
        return root;
    }

    private static void restorePreferences(SharedPreferences prefs, JSONObject root)
            throws JSONException, IOException {
        if (root == null) return;
        SharedPreferences.Editor editor = prefs.edit();
        Iterator<String> keys = root.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            JSONObject encoded = root.getJSONObject(key);
            String type = encoded.optString("type", "");
            if ("string".equals(type)) editor.putString(key, encoded.optString("value", ""));
            else if ("boolean".equals(type)) editor.putBoolean(key, encoded.optBoolean("value", false));
            else if ("int".equals(type)) editor.putInt(key, encoded.optInt("value", 0));
            else if ("long".equals(type)) editor.putLong(key, encoded.optLong("value", 0L));
            else if ("float".equals(type)) editor.putFloat(key, (float) encoded.optDouble("value", 0.0));
            else if ("string_set".equals(type)) {
                Set<String> set = new HashSet<>();
                JSONArray array = encoded.optJSONArray("value");
                if (array != null) for (int i = 0; i < array.length(); i++) set.add(array.optString(i, ""));
                editor.putStringSet(key, set);
            }
        }
        if (!editor.commit()) throw new IOException("Impossible d'enregistrer les préférences cloud.");
    }

    private static JSONObject readJsonFile(File file) throws IOException, JSONException {
        try (InputStream input = new BufferedInputStream(new FileInputStream(file));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            copy(input, output);
            return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private static void validate(JSONObject root) throws IOException {
        if (!FORMAT.equals(root.optString("format", ""))) throw new IOException("Paquet différentiel SPORT non reconnu.");
        if (root.optInt("formatVersion", 0) > FORMAT_VERSION) {
            throw new IOException("Paquet différentiel créé par une version SPORT plus récente.");
        }
    }

    private static void extract(File source, File delta, File pointsDir, File auxDir) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(source)))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (ENTRY_DELTA.equals(name)) copyEntry(zip, delta);
                else if (name.startsWith(POINTS_PREFIX) && !name.contains("..") && name.endsWith(".tsv")) {
                    copyEntry(zip, new File(pointsDir, name.substring(POINTS_PREFIX.length())));
                } else if (name.startsWith(AUX_PREFIX) && !name.contains("..") && !entry.isDirectory()) {
                    String dbName = name.substring(AUX_PREFIX.length());
                    if (isKnownAux(dbName)) copyEntry(zip, new File(auxDir, dbName));
                }
                zip.closeEntry();
            }
        }
        if (!delta.isFile()) throw new IOException("Manifest différentiel SPORT absent.");
    }

    private static void restoreAuxiliaryDatabases(Context context, File auxDir) throws IOException {
        if (!auxDir.isDirectory()) return;
        for (String name : AUX_DATABASES) {
            File received = new File(auxDir, name);
            if (!received.isFile()) continue;
            File target = context.getDatabasePath(name);
            File parent = target.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IOException("Impossible de préparer la base auxiliaire " + name + ".");
            }
            deleteIfExists(new File(target.getAbsolutePath() + "-wal"));
            deleteIfExists(new File(target.getAbsolutePath() + "-shm"));
            File temp = new File(target.getAbsolutePath() + ".cloudtmp");
            copyFile(received, temp);
            deleteIfExists(target);
            if (!temp.renameTo(target)) {
                copyFile(temp, target);
                deleteIfExists(temp);
            }
        }
    }

    private static boolean isKnownAux(String name) {
        for (String candidate : AUX_DATABASES) if (candidate.equals(name)) return true;
        return false;
    }

    private static void putCursorValue(JSONObject row, String column, Cursor cursor, int index)
            throws JSONException {
        if (cursor.isNull(index)) { row.put(column, JSONObject.NULL); return; }
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER: row.put(column, cursor.getLong(index)); break;
            case Cursor.FIELD_TYPE_FLOAT: row.put(column, cursor.getDouble(index)); break;
            case Cursor.FIELD_TYPE_BLOB:
                JSONObject blob = new JSONObject();
                blob.put("$blob", Base64.encodeToString(cursor.getBlob(index), Base64.NO_WRAP));
                row.put(column, blob); break;
            default: row.put(column, cursor.getString(index)); break;
        }
    }

    private static ContentValues contentValues(JSONObject row, String excludedColumn) throws JSONException {
        ContentValues values = new ContentValues();
        Iterator<String> keys = row.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (excludedColumn != null && excludedColumn.equals(key)) continue;
            Object value = row.get(key);
            if (value == JSONObject.NULL) values.putNull(key);
            else if (value instanceof JSONObject && ((JSONObject) value).has("$blob")) {
                values.put(key, Base64.decode(((JSONObject) value).getString("$blob"), Base64.DEFAULT));
            } else if (value instanceof Integer) values.put(key, (Integer) value);
            else if (value instanceof Long) values.put(key, (Long) value);
            else if (value instanceof Double) values.put(key, (Double) value);
            else if (value instanceof Float) values.put(key, (Float) value);
            else if (value instanceof Number) values.put(key, ((Number) value).doubleValue());
            else values.put(key, String.valueOf(value));
        }
        return values;
    }

    private static void writeJson(ZipOutputStream zip, String name, JSONObject json) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(json.toString().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static void writeFile(ZipOutputStream zip, String name, File file) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(file.lastModified());
        zip.putNextEntry(entry);
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) { copy(input, zip); }
        zip.closeEntry();
    }

    private static String nullableNumber(Cursor c, int i) { return c.isNull(i) ? "\\N" : Double.toString(c.getDouble(i)); }
    private static String nullableLong(Cursor c, int i) { return c.isNull(i) ? "\\N" : Long.toString(c.getLong(i)); }
    private static void putNullableDouble(ContentValues v, String k, String s) { if ("\\N".equals(s)) v.putNull(k); else v.put(k, Double.parseDouble(s)); }
    private static void putNullableLong(ContentValues v, String k, String s) { if ("\\N".equals(s)) v.putNull(k); else v.put(k, Long.parseLong(s)); }

    private static void checkpointFile(File file) {
        SQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
            cursor = db.rawQuery("PRAGMA wal_checkpoint(FULL)", null);
            if (cursor.moveToFirst()) { }
        } catch (RuntimeException ignored) {
        } finally {
            if (cursor != null) try { cursor.close(); } catch (RuntimeException ignored) { }
            if (db != null) try { db.close(); } catch (RuntimeException ignored) { }
        }
    }

    private static void checkpoint(SQLiteDatabase db) {
        Cursor cursor = null;
        try {
            cursor = db.rawQuery("PRAGMA wal_checkpoint(FULL)", null);
            if (cursor.moveToFirst()) { }
        } catch (RuntimeException ignored) {
        } finally {
            if (cursor != null) try { cursor.close(); } catch (RuntimeException ignored) { }
        }
    }

    private static boolean tableExists(SQLiteDatabase db, String table) {
        try (Cursor c = db.rawQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                new String[]{table})) { return c.moveToFirst(); }
    }

    private static void copyEntry(InputStream input, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Dossier cloud impossible.");
        try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) { copy(input, output); }
    }
    private static void copyFile(File source, File target) throws IOException {
        try (InputStream input = new BufferedInputStream(new FileInputStream(source));
             OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) { copy(input, output); }
    }
    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[BUFFER]; int read;
        while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        output.flush();
    }
    private static void deleteIfExists(File file) throws IOException {
        if (file.exists() && !file.delete()) throw new IOException("Impossible de remplacer " + file.getName());
    }
    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        if (!file.delete()) file.deleteOnExit();
    }
}
