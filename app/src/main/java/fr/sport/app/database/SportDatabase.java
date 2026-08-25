package fr.sport.app.database;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import fr.sport.app.fit.FitActivityData;
import fr.sport.app.fitflow.FitFileNaming;
import fr.sport.app.importcore.TreadmillSlopeRule;
import fr.sport.app.backup.MigrationSafetyManager;
import fr.sport.app.diagnostic.DiagnosticJournal;
import fr.sport.app.equipment.Equipment;
import fr.sport.app.equipment.EquipmentCategory;
import fr.sport.app.equipment.EquipmentEvent;
import fr.sport.app.equipment.EquipmentEventType;
import fr.sport.app.equipment.EquipmentStatus;
import fr.sport.app.equipment.EquipmentUsage;
import fr.sport.app.equipment.EquipmentUsageSample;
import fr.sport.app.equipment.EquipmentMonthlyUsage;
import fr.sport.app.model.Route;
import fr.sport.app.model.RouteWaypoint;
import fr.sport.app.model.TrainingSession;
import fr.sport.app.quality.ActivityMetricsCalculator;
import fr.sport.app.quality.ActivityQualityEngine;
import fr.sport.app.quality.ActivityQualityReport;
import fr.sport.app.repere.PersonalLandmarkDetector;
import fr.sport.app.repere.PersonalLandmarkSettings;
import fr.sport.app.tags.TagNormalizer;
import fr.sport.app.sync.ActivitySourcePriority;

/** Base locale de SPORT. Aucune donnée n'est envoyée hors du téléphone. */
public final class SportDatabase extends SQLiteOpenHelper implements AutoCloseable {
    public static final String DATABASE_NAME = "sport.db";
    private final Context appContext;
    private static final int DATABASE_VERSION = 28;
    private static final int DATABASE_BUSY_TIMEOUT_MS = 8000;

    public static final String FIT_FILE_STATUS_IMPORTED = "IMPORTED";
    public static final String FIT_FILE_STATUS_DUPLICATE = "DUPLICATE";
    public static final String FIT_FILE_STATUS_ERROR = "ERROR";
    public static final String FIT_FILE_STATUS_DUPLICATE_ACTIVITY = "DUPLICATE_ACTIVITY";
    public static final String FIT_FILE_STATUS_UNCHANGED = "UNCHANGED";

    public static final String FIT_IMPORT_ITEM_IMPORTED = "IMPORTED";
    public static final String FIT_IMPORT_ITEM_DUPLICATE_FILE = "DUPLICATE_FILE";
    public static final String FIT_IMPORT_ITEM_DUPLICATE_ACTIVITY = "DUPLICATE_ACTIVITY";
    public static final String FIT_IMPORT_ITEM_UNCHANGED = "UNCHANGED";
    public static final String FIT_IMPORT_ITEM_ERROR = "ERROR";
    public static final String FIT_IMPORT_ITEM_CANCELLED = "CANCELLED";

    public static final String INBOX_PENDING = "PENDING";
    public static final String INBOX_READY = "READY";
    public static final String INBOX_IMPORTED = "IMPORTED";
    public static final String INBOX_DUPLICATE = "DUPLICATE";
    public static final String INBOX_CONFLICT = "CONFLICT";
    public static final String INBOX_ERROR = "ERROR";
    public static final String INBOX_IGNORED = "IGNORED";
    public static final String INBOX_EXPANDED = "EXPANDED";

    public static final String STRAVA_UPLOAD_QUEUED = "QUEUED";
    public static final String STRAVA_UPLOAD_UPLOADING = "UPLOADING";
    public static final String STRAVA_UPLOAD_PROCESSING = "PROCESSING";
    public static final String STRAVA_UPLOAD_LINKED = "LINKED";
    public static final String STRAVA_UPLOAD_DUPLICATE_LINKED = "DUPLICATE_LINKED";
    public static final String STRAVA_UPLOAD_ERROR = "ERROR";

    private static final String[] ACTIVITY_DATA_COLUMNS = new String[]{
            "sha256", "file_name", "sport", "sub_sport", "start_time_ms",
            "elapsed_time_ms", "timer_time_ms", "distance_m", "calories", "ascent_m",
            "descent_m", "avg_hr", "max_hr", "avg_cadence", "manufacturer",
            "product_id", "product_name", "import_source", "source_file_sha256",
            "segment_index", "segment_count", "split_reason", "equipment_name",
            "equipment_manual", "import_profile", "file_size_bytes", "protocol_major",
            "protocol_minor", "profile_version", "record_count", "gps_point_count",
            "imported_at_ms"
    };

    public SportDatabase(Context context) {
        super(context.getApplicationContext(), DATABASE_NAME, null, DATABASE_VERSION);
        appContext = context.getApplicationContext();
        // STAB003 : plusieurs écrans et le JobScheduler Strava peuvent ouvrir sport.db
        // simultanément. WAL autorise les lectures de l'Accueil pendant une écriture
        // d'arrière-plan, au lieu de provoquer immédiatement SQLITE_BUSY.
        try {
            setWriteAheadLoggingEnabled(true);
        } catch (RuntimeException ignored) {
            // Certains appareils/ROM peuvent refuser WAL. Le busy_timeout ci-dessous
            // conserve alors une seconde ligne de défense.
        }
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
        try {
            db.execSQL("PRAGMA busy_timeout=" + DATABASE_BUSY_TIMEOUT_MS);
        } catch (RuntimeException ignored) {
            // SQLite Android peut déjà gérer son propre timeout selon la ROM.
        }
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE activities (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "sha256 TEXT NOT NULL UNIQUE," +
                        "file_name TEXT NOT NULL," +
                        "sport INTEGER NOT NULL," +
                        "sub_sport INTEGER NOT NULL," +
                        "start_time_ms INTEGER," +
                        "elapsed_time_ms INTEGER," +
                        "timer_time_ms INTEGER," +
                        "distance_m REAL," +
                        "calories INTEGER," +
                        "ascent_m INTEGER," +
                        "descent_m INTEGER," +
                        "avg_hr INTEGER," +
                        "max_hr INTEGER," +
                        "avg_cadence INTEGER," +
                        "manufacturer TEXT," +
                        "product_id INTEGER," +
                        "product_name TEXT," +
                        "import_source TEXT NOT NULL DEFAULT 'Source inconnue'," +
                        "source_file_sha256 TEXT," +
                        "segment_index INTEGER NOT NULL DEFAULT 0," +
                        "segment_count INTEGER NOT NULL DEFAULT 1," +
                        "split_reason TEXT," +
                        "equipment_name TEXT," +
                        "equipment_manual INTEGER NOT NULL DEFAULT 0," +
                        "import_profile TEXT NOT NULL DEFAULT 'STANDARD'," +
                        "file_size_bytes INTEGER NOT NULL," +
                        "protocol_major INTEGER NOT NULL," +
                        "protocol_minor INTEGER NOT NULL," +
                        "profile_version INTEGER NOT NULL," +
                        "record_count INTEGER NOT NULL," +
                        "gps_point_count INTEGER NOT NULL," +
                        "imported_at_ms INTEGER NOT NULL," +
                        "custom_title TEXT," +
                        "description TEXT," +
                        "personal_note TEXT," +
                        "feeling_score INTEGER," +
                        "difficulty_score INTEGER," +
                        "privacy TEXT NOT NULL DEFAULT 'PRIVATE'," +
                        "tags TEXT NOT NULL DEFAULT ''," +
                        "deleted_at_ms INTEGER" +
                        ")"
        );
        db.execSQL("CREATE INDEX idx_activities_start_time ON activities(start_time_ms DESC)");
        db.execSQL("CREATE INDEX idx_activities_sport ON activities(sport)");
        db.execSQL("CREATE INDEX idx_activities_source_file ON activities(source_file_sha256)");
        db.execSQL("CREATE INDEX idx_activities_deleted ON activities(deleted_at_ms)");
        createRecordsTable(db);
        createActivityPointsTable(db);
        createRoutesTable(db);
        createRoutePointsTable(db);
        createRouteWaypointsTable(db);
        createTrainingSessionsTable(db);
        createUltraTables(db);
        createEquipmentTables(db);
        createGarminActivityIndexTable(db);
        createStravaActivityIndexTable(db);
        createFitFileIndexTable(db);
        createFitImportHistoryTables(db);
        createImport004Tables(db);
        createImport005Tables(db);
        createActivityCorrectionTables(db);
        createActivityEditTables(db);
        createBackupAuditTable(db);
        createSegmentsTables(db);
        createPersonalLandmarkTables(db);
        createCloudSyncJournalTables(db);
    }


    private void createBackupAuditTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS backup_audit (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "event_type TEXT NOT NULL," +
                        "created_at_ms INTEGER NOT NULL," +
                        "status TEXT NOT NULL," +
                        "detail TEXT" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_backup_audit_created " +
                "ON backup_audit(created_at_ms DESC)");
    }


    private void createActivityEditTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_metadata_history (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "activity_id INTEGER NOT NULL," +
                        "created_at_ms INTEGER NOT NULL," +
                        "undone_at_ms INTEGER," +
                        "custom_title TEXT," +
                        "description TEXT," +
                        "personal_note TEXT," +
                        "feeling_score INTEGER," +
                        "difficulty_score INTEGER," +
                        "privacy TEXT NOT NULL DEFAULT 'PRIVATE'," +
                        "tags TEXT NOT NULL DEFAULT ''," +
                        "sport INTEGER NOT NULL," +
                        "sub_sport INTEGER NOT NULL," +
                        "equipment_name TEXT," +
                        "equipment_manual INTEGER NOT NULL DEFAULT 0," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_metadata_history " +
                "ON activity_metadata_history(activity_id, created_at_ms DESC)");
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_attachments (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "activity_id INTEGER NOT NULL," +
                        "display_name TEXT NOT NULL," +
                        "mime_type TEXT," +
                        "internal_path TEXT NOT NULL," +
                        "size_bytes INTEGER NOT NULL DEFAULT 0," +
                        "created_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_attachments_activity " +
                "ON activity_attachments(activity_id, created_at_ms DESC)");
    }


    private void createActivityCorrectionTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_correction_snapshots (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "activity_id INTEGER NOT NULL," +
                        "correction_type TEXT NOT NULL," +
                        "created_at_ms INTEGER NOT NULL," +
                        "undone_at_ms INTEGER," +
                        "sha256 TEXT NOT NULL," +
                        "file_name TEXT NOT NULL," +
                        "sport INTEGER NOT NULL," +
                        "sub_sport INTEGER NOT NULL," +
                        "start_time_ms INTEGER," +
                        "elapsed_time_ms INTEGER," +
                        "timer_time_ms INTEGER," +
                        "distance_m REAL," +
                        "calories INTEGER," +
                        "ascent_m INTEGER," +
                        "descent_m INTEGER," +
                        "avg_hr INTEGER," +
                        "max_hr INTEGER," +
                        "avg_cadence INTEGER," +
                        "manufacturer TEXT," +
                        "product_id INTEGER," +
                        "product_name TEXT," +
                        "import_source TEXT NOT NULL," +
                        "source_file_sha256 TEXT," +
                        "segment_index INTEGER NOT NULL," +
                        "segment_count INTEGER NOT NULL," +
                        "split_reason TEXT," +
                        "equipment_name TEXT," +
                        "equipment_manual INTEGER NOT NULL," +
                        "import_profile TEXT NOT NULL," +
                        "file_size_bytes INTEGER NOT NULL," +
                        "protocol_major INTEGER NOT NULL," +
                        "protocol_minor INTEGER NOT NULL," +
                        "profile_version INTEGER NOT NULL," +
                        "record_count INTEGER NOT NULL," +
                        "gps_point_count INTEGER NOT NULL," +
                        "imported_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_corrections_activity " +
                "ON activity_correction_snapshots(activity_id, created_at_ms DESC)");
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_correction_points (" +
                        "snapshot_id INTEGER NOT NULL," +
                        "point_index INTEGER NOT NULL," +
                        "latitude REAL NOT NULL," +
                        "longitude REAL NOT NULL," +
                        "altitude_m REAL," +
                        "distance_m REAL," +
                        "timestamp_ms INTEGER," +
                        "heart_rate INTEGER," +
                        "PRIMARY KEY(snapshot_id, point_index)," +
                        "FOREIGN KEY(snapshot_id) REFERENCES activity_correction_snapshots(id) ON DELETE CASCADE" +
                        ")"
        );
    }




    private void createFitFileIndexTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS fit_file_index (" +
                        "document_uri TEXT PRIMARY KEY," +
                        "display_name TEXT NOT NULL DEFAULT ''," +
                        "size_bytes INTEGER NOT NULL DEFAULT -1," +
                        "last_modified_ms INTEGER NOT NULL DEFAULT -1," +
                        "sha256 TEXT," +
                        "activity_fingerprint TEXT," +
                        "local_activity_id INTEGER," +
                        "import_status TEXT NOT NULL," +
                        "source TEXT NOT NULL DEFAULT 'Source inconnue'," +
                        "duplicate_reason TEXT," +
                        "last_error TEXT," +
                        "attempt_count INTEGER NOT NULL DEFAULT 0," +
                        "discovered_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_file_status ON fit_file_index(import_status, updated_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_file_activity ON fit_file_index(local_activity_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_file_fingerprint ON fit_file_index(activity_fingerprint)");
    }

    private void createFitImportHistoryTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS fit_import_runs (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "started_at_ms INTEGER NOT NULL," +
                        "finished_at_ms INTEGER," +
                        "location_uri TEXT NOT NULL DEFAULT ''," +
                        "trigger_name TEXT NOT NULL DEFAULT 'MANUAL_FOLDER'," +
                        "discovered_count INTEGER NOT NULL DEFAULT 0," +
                        "imported_count INTEGER NOT NULL DEFAULT 0," +
                        "duplicate_file_count INTEGER NOT NULL DEFAULT 0," +
                        "duplicate_activity_count INTEGER NOT NULL DEFAULT 0," +
                        "unchanged_count INTEGER NOT NULL DEFAULT 0," +
                        "error_count INTEGER NOT NULL DEFAULT 0," +
                        "cancelled INTEGER NOT NULL DEFAULT 0," +
                        "fatal_error TEXT," +
                        "undone_at_ms INTEGER," +
                        "undone_activity_count INTEGER NOT NULL DEFAULT 0" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_import_runs_started ON fit_import_runs(started_at_ms DESC)");

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS fit_import_items (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "run_id INTEGER NOT NULL," +
                        "document_uri TEXT NOT NULL DEFAULT ''," +
                        "display_name TEXT NOT NULL DEFAULT ''," +
                        "source TEXT NOT NULL DEFAULT 'Source inconnue'," +
                        "status TEXT NOT NULL," +
                        "reason TEXT," +
                        "sha256 TEXT," +
                        "activity_fingerprint TEXT," +
                        "local_activity_id INTEGER," +
                        "size_bytes INTEGER NOT NULL DEFAULT -1," +
                        "last_modified_ms INTEGER NOT NULL DEFAULT -1," +
                        "created_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(run_id) REFERENCES fit_import_runs(id) ON DELETE CASCADE," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_import_items_run ON fit_import_items(run_id, id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_import_items_status ON fit_import_items(status, created_at_ms DESC)");
    }

    private void createImport004Tables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS import_inbox_items (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "local_path TEXT NOT NULL UNIQUE," +
                        "original_uri TEXT NOT NULL DEFAULT ''," +
                        "display_name TEXT NOT NULL DEFAULT ''," +
                        "format TEXT NOT NULL DEFAULT 'UNKNOWN'," +
                        "mime_type TEXT NOT NULL DEFAULT ''," +
                        "source TEXT NOT NULL DEFAULT 'Partage Android'," +
                        "status TEXT NOT NULL DEFAULT 'PENDING'," +
                        "reason TEXT," +
                        "sha256 TEXT," +
                        "candidate_activity_id INTEGER," +
                        "local_activity_id INTEGER," +
                        "received_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "retry_count INTEGER NOT NULL DEFAULT 0," +
                        "FOREIGN KEY(candidate_activity_id) REFERENCES activities(id) ON DELETE SET NULL," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_inbox_status ON import_inbox_items(status, received_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_inbox_sha ON import_inbox_items(sha256)");

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_sources (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "activity_id INTEGER NOT NULL," +
                        "sha256 TEXT," +
                        "format TEXT NOT NULL DEFAULT 'UNKNOWN'," +
                        "display_name TEXT NOT NULL DEFAULT ''," +
                        "source TEXT NOT NULL DEFAULT 'Source inconnue'," +
                        "added_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE," +
                        "UNIQUE(activity_id, sha256)" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_sources_sha ON activity_sources(sha256)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_sources_activity ON activity_sources(activity_id)");

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS import_document_index (" +
                        "document_uri TEXT PRIMARY KEY," +
                        "display_name TEXT NOT NULL DEFAULT ''," +
                        "size_bytes INTEGER NOT NULL DEFAULT -1," +
                        "last_modified_ms INTEGER NOT NULL DEFAULT -1," +
                        "status TEXT NOT NULL DEFAULT 'QUEUED'," +
                        "updated_at_ms INTEGER NOT NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_import_document_updated ON import_document_index(updated_at_ms DESC)");
    }


    private void createImport005Tables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS strava_upload_queue (" +
                        "local_activity_id INTEGER PRIMARY KEY," +
                        "upload_id INTEGER," +
                        "strava_activity_id INTEGER," +
                        "external_id TEXT NOT NULL DEFAULT ''," +
                        "status TEXT NOT NULL DEFAULT 'QUEUED'," +
                        "last_error TEXT," +
                        "attempt_count INTEGER NOT NULL DEFAULT 0," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "completed_at_ms INTEGER," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_strava_upload_status " +
                "ON strava_upload_queue(status, updated_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_strava_upload_remote " +
                "ON strava_upload_queue(strava_activity_id)");
    }

    private void createStravaActivityIndexTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS strava_activity_index (" +
                        "strava_activity_id INTEGER PRIMARY KEY," +
                        "name TEXT NOT NULL DEFAULT ''," +
                        "sport_type TEXT NOT NULL DEFAULT 'Unknown'," +
                        "start_time_ms INTEGER NOT NULL DEFAULT 0," +
                        "distance_m REAL NOT NULL DEFAULT 0," +
                        "moving_time_ms INTEGER NOT NULL DEFAULT 0," +
                        "elapsed_time_ms INTEGER NOT NULL DEFAULT 0," +
                        "elevation_gain_m REAL NOT NULL DEFAULT 0," +
                        "trainer INTEGER NOT NULL DEFAULT 0," +
                        "commute INTEGER NOT NULL DEFAULT 0," +
                        "sync_status TEXT NOT NULL DEFAULT 'NON_SYNC'," +
                        "local_activity_id INTEGER," +
                        "last_error TEXT," +
                        "discovered_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_strava_sync_status ON strava_activity_index(sync_status, start_time_ms ASC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_strava_local_activity ON strava_activity_index(local_activity_id)");
    }


    private void createGarminActivityIndexTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS garmin_activity_index (" +
                        "garmin_activity_id INTEGER PRIMARY KEY," +
                        "name TEXT NOT NULL DEFAULT ''," +
                        "start_time_ms INTEGER NOT NULL DEFAULT 0," +
                        "activity_type TEXT NOT NULL DEFAULT 'unknown'," +
                        "distance_m REAL NOT NULL DEFAULT 0," +
                        "duration_ms INTEGER NOT NULL DEFAULT 0," +
                        "sync_status TEXT NOT NULL DEFAULT 'NON_SYNC'," +
                        "sha256 TEXT," +
                        "local_activity_id INTEGER," +
                        "last_error TEXT," +
                        "attempt_count INTEGER NOT NULL DEFAULT 0," +
                        "discovered_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "synced_at_ms INTEGER," +
                        "FOREIGN KEY(local_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_garmin_sync_status ON garmin_activity_index(sync_status, start_time_ms ASC)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_garmin_sha256 ON garmin_activity_index(sha256) WHERE sha256 IS NOT NULL");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_garmin_local_activity ON garmin_activity_index(local_activity_id)");
    }

    private void createEquipmentTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS equipment (" +
                        "id TEXT PRIMARY KEY," +
                        "category TEXT NOT NULL," +
                        "brand TEXT," +
                        "model TEXT," +
                        "custom_name TEXT," +
                        "specimen_number INTEGER NOT NULL DEFAULT 1," +
                        "status TEXT NOT NULL DEFAULT 'ACTIVE'," +
                        "purchase_date_ms INTEGER," +
                        "first_use_date_ms INTEGER," +
                        "last_use_date_ms INTEGER," +
                        "purchase_price REAL," +
                        "notes TEXT NOT NULL DEFAULT ''," +
                        "warning_distance_m REAL NOT NULL DEFAULT 0," +
                        "critical_distance_m REAL NOT NULL DEFAULT 0," +
                        "warning_duration_ms INTEGER NOT NULL DEFAULT 0," +
                        "critical_duration_ms INTEGER NOT NULL DEFAULT 0," +
                        "total_distance_m REAL NOT NULL DEFAULT 0," +
                        "total_duration_ms INTEGER NOT NULL DEFAULT 0," +
                        "total_ascent_m REAL NOT NULL DEFAULT 0," +
                        "activity_count INTEGER NOT NULL DEFAULT 0," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status, updated_at_ms DESC)");
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS equipment_events (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "equipment_id TEXT NOT NULL," +
                        "event_type TEXT NOT NULL," +
                        "event_at_ms INTEGER NOT NULL," +
                        "title TEXT NOT NULL DEFAULT ''," +
                        "details TEXT NOT NULL DEFAULT ''," +
                        "cost REAL," +
                        "FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_equipment_events ON equipment_events(equipment_id, event_at_ms DESC)");
    }

    private void createRecordsTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS records (" +
                        "record_type TEXT PRIMARY KEY," +
                        "activity_id INTEGER NOT NULL," +
                        "record_value REAL NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
    }


    private void createRoutesTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS routes (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "name TEXT NOT NULL," +
                        "description TEXT," +
                        "route_type TEXT NOT NULL DEFAULT 'standard'," +
                        "source_activity_id INTEGER," +
                        "distance_m REAL NOT NULL DEFAULT 0," +
                        "ascent_m REAL NOT NULL DEFAULT 0," +
                        "point_count INTEGER NOT NULL DEFAULT 0," +
                        "is_favorite INTEGER NOT NULL DEFAULT 0," +
                        "tags TEXT NOT NULL DEFAULT ''," +
                        "source_type TEXT NOT NULL DEFAULT 'MANUAL'," +
                        "source_name TEXT," +
                        "source_sha256 TEXT," +
                        "imported_at_ms INTEGER," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(source_activity_id) REFERENCES activities(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_routes_updated_at ON routes(updated_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_routes_source_activity ON routes(source_activity_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_routes_favorite ON routes(is_favorite DESC, updated_at_ms DESC)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_source_sha ON routes(source_sha256) " +
                "WHERE source_sha256 IS NOT NULL AND source_sha256 <> ''");
    }



    private void createTrainingSessionsTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS training_sessions (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "planned_at_ms INTEGER NOT NULL," +
                        "title TEXT NOT NULL," +
                        "sport TEXT NOT NULL DEFAULT 'Course à pied'," +
                        "route_id INTEGER," +
                        "target_distance_km REAL," +
                        "target_ascent_m INTEGER," +
                        "target_duration_min INTEGER," +
                        "target_pace TEXT," +
                        "target_heart_rate INTEGER," +
                        "status TEXT NOT NULL DEFAULT 'Prévue'," +
                        "notes TEXT NOT NULL DEFAULT ''," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(route_id) REFERENCES routes(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(planned_at_ms)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status)");
    }

    private void createUltraTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS ultra_races (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "name TEXT NOT NULL," +
                        "official_distance_km REAL," +
                        "ascent_m INTEGER," +
                        "descent_m INTEGER," +
                        "start_time_ms INTEGER," +
                        "target_duration_min INTEGER," +
                        "objective TEXT NOT NULL DEFAULT ''," +
                        "notes TEXT NOT NULL DEFAULT ''," +
                        "route_id INTEGER," +
                        "water_ml_per_hour INTEGER NOT NULL DEFAULT 500," +
                        "carbs_g_per_hour INTEGER NOT NULL DEFAULT 70," +
                        "sodium_mg_per_hour INTEGER NOT NULL DEFAULT 500," +
                        "default_stop_min INTEGER NOT NULL DEFAULT 5," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(route_id) REFERENCES routes(id) ON DELETE SET NULL" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_races_start ON ultra_races(start_time_ms)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_races_updated ON ultra_races(updated_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_races_route ON ultra_races(route_id)");

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS ultra_checkpoints (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "ultra_race_id INTEGER NOT NULL," +
                        "position INTEGER NOT NULL," +
                        "name TEXT NOT NULL," +
                        "distance_km REAL," +
                        "altitude_m INTEGER," +
                        "checkpoint_type TEXT NOT NULL DEFAULT 'Autre'," +
                        "cutoff_time_ms INTEGER," +
                        "notes TEXT NOT NULL DEFAULT ''," +
                        "stop_duration_min INTEGER NOT NULL DEFAULT 0," +
                        "assistance_bag INTEGER NOT NULL DEFAULT 0," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(ultra_race_id) REFERENCES ultra_races(id) ON DELETE CASCADE," +
                        "UNIQUE(ultra_race_id, position)" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_checkpoints_race " +
                "ON ultra_checkpoints(ultra_race_id, position)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_checkpoints_cutoff " +
                "ON ultra_checkpoints(cutoff_time_ms)");
    }

    private void createRoutePointsTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS route_points (" +
                        "route_id INTEGER NOT NULL," +
                        "point_index INTEGER NOT NULL," +
                        "latitude REAL NOT NULL," +
                        "longitude REAL NOT NULL," +
                        "altitude_m REAL," +
                        "distance_m REAL," +
                        "timestamp_ms INTEGER," +
                        "PRIMARY KEY(route_id, point_index)," +
                        "FOREIGN KEY(route_id) REFERENCES routes(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_route_points_route ON route_points(route_id, point_index)");
    }


    private void createRouteWaypointsTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS route_waypoints (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "route_id INTEGER NOT NULL," +
                        "position INTEGER NOT NULL DEFAULT 0," +
                        "name TEXT NOT NULL," +
                        "description TEXT," +
                        "waypoint_type TEXT NOT NULL DEFAULT 'Autre'," +
                        "latitude REAL NOT NULL," +
                        "longitude REAL NOT NULL," +
                        "altitude_m REAL," +
                        "distance_m REAL," +
                        "cutoff_time_ms INTEGER," +
                        "source TEXT NOT NULL DEFAULT 'MANUAL'," +
                        "created_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(route_id) REFERENCES routes(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_route_waypoints_route " +
                "ON route_waypoints(route_id, position, distance_m)");
    }

    private void createActivityPointsTable(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_points (" +
                        "activity_id INTEGER NOT NULL," +
                        "point_index INTEGER NOT NULL," +
                        "latitude REAL NOT NULL," +
                        "longitude REAL NOT NULL," +
                        "altitude_m REAL," +
                        "distance_m REAL," +
                        "timestamp_ms INTEGER," +
                        "heart_rate INTEGER," +
                        "PRIMARY KEY(activity_id, point_index)," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_points_activity ON activity_points(activity_id, point_index)");
    }


    /** SEGMENT001 : garantit le schéma à la demande sans toucher aux activités. */
    public void ensureSegmentSchema() {
        createSegmentsTables(getWritableDatabase());
    }

    /** SEGMENT001 : segments personnels et passages détectés. */
    private static void createSegmentsTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS segments (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "name TEXT NOT NULL," +
                        "sport INTEGER NOT NULL," +
                        "source_activity_id INTEGER NOT NULL," +
                        "start_point_index INTEGER NOT NULL," +
                        "end_point_index INTEGER NOT NULL," +
                        "start_distance_m REAL NOT NULL DEFAULT 0," +
                        "end_distance_m REAL NOT NULL DEFAULT 0," +
                        "distance_m REAL NOT NULL DEFAULT 0," +
                        "ascent_m REAL NOT NULL DEFAULT 0," +
                        "created_at_ms INTEGER NOT NULL," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(source_activity_id) REFERENCES activities(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS segment_points (" +
                        "segment_id INTEGER NOT NULL," +
                        "point_index INTEGER NOT NULL," +
                        "latitude REAL NOT NULL," +
                        "longitude REAL NOT NULL," +
                        "altitude_m REAL," +
                        "distance_m REAL," +
                        "PRIMARY KEY(segment_id,point_index)," +
                        "FOREIGN KEY(segment_id) REFERENCES segments(id) ON DELETE CASCADE" +
                        ")"
        );
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS segment_efforts (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "segment_id INTEGER NOT NULL," +
                        "activity_id INTEGER NOT NULL," +
                        "start_point_index INTEGER NOT NULL," +
                        "end_point_index INTEGER NOT NULL," +
                        "start_time_ms INTEGER NOT NULL," +
                        "duration_ms INTEGER NOT NULL," +
                        "distance_m REAL NOT NULL DEFAULT 0," +
                        "avg_hr INTEGER," +
                        "created_at_ms INTEGER NOT NULL," +
                        "FOREIGN KEY(segment_id) REFERENCES segments(id) ON DELETE CASCADE," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE," +
                        "UNIQUE(segment_id,activity_id,start_point_index,end_point_index)" +
                        ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_segments_sport ON segments(sport,updated_at_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment ON segment_efforts(segment_id,duration_ms,start_time_ms DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_segment_efforts_activity ON segment_efforts(activity_id)");
    }


    /** REPERE001 : six repères personnels et leur comptabilisation manuelle. */
    private static void createPersonalLandmarkTables(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS personal_landmarks (" +
                        "code TEXT PRIMARY KEY," +
                        "name TEXT NOT NULL," +
                        "landmark_type TEXT NOT NULL," +
                        "sort_order INTEGER NOT NULL" +
                        ")"
        );
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS activity_landmarks (" +
                        "activity_id INTEGER NOT NULL," +
                        "landmark_code TEXT NOT NULL," +
                        "occurrences INTEGER NOT NULL DEFAULT 1," +
                        "source TEXT NOT NULL DEFAULT 'MANUAL'," +
                        "updated_at_ms INTEGER NOT NULL," +
                        "PRIMARY KEY(activity_id, landmark_code)," +
                        "FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE," +
                        "FOREIGN KEY(landmark_code) REFERENCES personal_landmarks(code) ON DELETE CASCADE" +
                        ")"
        );
        ensureColumn(db, "activity_landmarks", "source",
                "ALTER TABLE activity_landmarks ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_activity_landmarks_code ON activity_landmarks(landmark_code, activity_id)");
        db.execSQL("CREATE TABLE IF NOT EXISTS personal_landmark_references (" +
                "landmark_code TEXT PRIMARY KEY," +
                "activity_id INTEGER NOT NULL," +
                "mode TEXT NOT NULL," +
                "latitude REAL," +
                "longitude REAL," +
                "altitude_m REAL," +
                "updated_at_ms INTEGER NOT NULL," +
                "FOREIGN KEY(landmark_code) REFERENCES personal_landmarks(code) ON DELETE CASCADE" +
                ")");
        seedPersonalLandmark(db, "B", "Basketaf", "Trajet", 1);
        seedPersonalLandmark(db, "Q", "QPUC", "Trajet", 2);
        seedPersonalLandmark(db, "C", "Colomby", "Ascension", 3);
        seedPersonalLandmark(db, "M", "Monthoisey", "Ascension", 4);
        seedPersonalLandmark(db, "R", "Reculet", "Ascension", 5);
        seedPersonalLandmark(db, "Y", "Yéti – Crozet", "Ascension", 6);
        seedPersonalLandmark(db, "V", "Velotaf", "Trajet", 7);
        // REPERE008 / v180 : raccourcis temporaires de modification en masse.
        seedPersonalLandmark(db, "A", "Repère A", "Trajet", 8);
        seedPersonalLandmark(db, "X", "Problème activité", "Trajet", 9);
        // REPERE012 / v184 : F = ascension du col de la Faucille, réservé aux activités vélo.
        seedPersonalLandmark(db, "F", "Col de la Faucille", "Ascension", 10);
    }

    private static void seedPersonalLandmark(SQLiteDatabase db, String code, String name,
                                             String type, int sortOrder) {
        ContentValues values = new ContentValues();
        values.put("code", code);
        values.put("name", name);
        values.put("landmark_type", type);
        values.put("sort_order", sortOrder);
        db.insertWithOnConflict("personal_landmarks", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    public List<PersonalLandmarkAssignment> getPersonalLandmarkAssignments(long activityId) {
        createPersonalLandmarkTables(getWritableDatabase());
        List<PersonalLandmarkAssignment> result = new ArrayList<>();
        String sql = "SELECT p.code,p.name,p.landmark_type,COALESCE(a.occurrences,0) " +
                "FROM personal_landmarks p LEFT JOIN activity_landmarks a " +
                "ON a.landmark_code=p.code AND a.activity_id=? ORDER BY p.sort_order";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, new String[]{Long.toString(activityId)})) {
            while (cursor.moveToNext()) {
                result.add(new PersonalLandmarkAssignment(cursor.getString(0), cursor.getString(1),
                        cursor.getString(2), cursor.getInt(3)));
            }
        }
        return result;
    }

    public void setPersonalLandmarkOccurrences(long activityId, String code, int occurrences) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) return;
        if (occurrences <= 0) {
            getWritableDatabase().delete("activity_landmarks", "activity_id=? AND landmark_code=?",
                    new String[]{Long.toString(activityId), normalized});
            return;
        }
        ContentValues values = new ContentValues();
        values.put("activity_id", activityId);
        values.put("landmark_code", normalized);
        values.put("occurrences", Math.min(99, occurrences));
        values.put("source", "MANUAL");
        values.put("updated_at_ms", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("activity_landmarks", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    public List<PersonalLandmarkStat> listPersonalLandmarkStats() {
        createPersonalLandmarkTables(getWritableDatabase());
        Calendar calendar = Calendar.getInstance();
        int currentYear = calendar.get(Calendar.YEAR);
        calendar.clear();
        calendar.set(currentYear, Calendar.JANUARY, 1, 0, 0, 0);
        long yearStart = calendar.getTimeInMillis();
        calendar.set(currentYear + 1, Calendar.JANUARY, 1, 0, 0, 0);
        long nextYearStart = calendar.getTimeInMillis();
        List<PersonalLandmarkStat> result = new ArrayList<>();
        String sql = "SELECT p.code,p.name,p.landmark_type," +
                "COALESCE(SUM(CASE WHEN ac.id IS NOT NULL THEN al.occurrences ELSE 0 END),0)," +
                "COALESCE(SUM(CASE WHEN ac.id IS NOT NULL AND ac.start_time_ms>=? AND ac.start_time_ms<? THEN al.occurrences ELSE 0 END),0) " +
                "FROM personal_landmarks p " +
                "LEFT JOIN activity_landmarks al ON al.landmark_code=p.code " +
                "LEFT JOIN activities ac ON ac.id=al.activity_id AND ac.deleted_at_ms IS NULL " +
                "GROUP BY p.code,p.name,p.landmark_type,p.sort_order ORDER BY p.sort_order";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql,
                new String[]{Long.toString(yearStart), Long.toString(nextYearStart)})) {
            while (cursor.moveToNext()) {
                result.add(new PersonalLandmarkStat(cursor.getString(0), cursor.getString(1),
                        cursor.getString(2), cursor.getInt(3), cursor.getInt(4), currentYear));
            }
        }
        return result;
    }

    public Map<Integer, Integer> getPersonalLandmarkYearCounts(String code) {
        createPersonalLandmarkTables(getWritableDatabase());
        Map<Integer, Integer> result = new java.util.TreeMap<>(java.util.Collections.reverseOrder());
        String sql = "SELECT ac.start_time_ms,al.occurrences FROM activity_landmarks al " +
                "JOIN activities ac ON ac.id=al.activity_id " +
                "WHERE al.landmark_code=? AND ac.deleted_at_ms IS NULL AND ac.start_time_ms IS NOT NULL " +
                "ORDER BY ac.start_time_ms DESC";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql,
                new String[]{code == null ? "" : code.trim().toUpperCase(Locale.ROOT)})) {
            Calendar calendar = Calendar.getInstance();
            while (cursor.moveToNext()) {
                calendar.setTimeInMillis(cursor.getLong(0));
                int year = calendar.get(Calendar.YEAR);
                int count = cursor.getInt(1);
                Integer previous = result.get(year);
                result.put(year, (previous == null ? 0 : previous) + count);
            }
        }
        return result;
    }


    /** REPERE002 : définit l'activité courante comme référence GPS d'un repère. */
    public boolean setPersonalLandmarkReference(String code, long activityId) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) return false;
        String type = null;
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT landmark_type FROM personal_landmarks WHERE code=?", new String[]{normalized})) {
            if (c.moveToFirst()) type = c.getString(0);
        }
        List<ActivityPoint> points = getActivityPoints(activityId);
        if (type == null || points.size() < 2) return false;
        ContentValues values = new ContentValues();
        values.put("landmark_code", normalized);
        values.put("activity_id", activityId);
        values.put("updated_at_ms", System.currentTimeMillis());
        if ("Trajet".equalsIgnoreCase(type)) {
            values.put("mode", "ROUTE");
            values.putNull("latitude"); values.putNull("longitude"); values.putNull("altitude_m");
        } else {
            PersonalLandmarkDetector.Summit summit = PersonalLandmarkDetector.summitFromReference(points);
            if (summit == null) return false;
            values.put("mode", "SUMMIT"); values.put("latitude", summit.latitude); values.put("longitude", summit.longitude);
            if (summit.altitudeMeters == null) values.putNull("altitude_m"); else values.put("altitude_m", summit.altitudeMeters);
        }
        getWritableDatabase().insertWithOnConflict("personal_landmark_references", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        return true;
    }

    /** REPERE004 : crée un repère personnalisable sans migration SQLite. */
    public boolean createPersonalLandmark(String code, String name, String type) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        String cleanName = name == null ? "" : name.trim();
        String cleanType = "Trajet".equalsIgnoreCase(type) ? "Trajet" : "Ascension";
        if (!normalized.matches("[A-Z0-9]{1,4}") || cleanName.isEmpty()) return false;
        int sortOrder = 1;
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COALESCE(MAX(sort_order),0)+1 FROM personal_landmarks", null)) {
            if (cursor.moveToFirst()) sortOrder = cursor.getInt(0);
        }
        ContentValues values = new ContentValues();
        values.put("code", normalized);
        values.put("name", cleanName);
        values.put("landmark_type", cleanType);
        values.put("sort_order", sortOrder);
        return getWritableDatabase().insertWithOnConflict(
                "personal_landmarks", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1L;
    }

    /** REPERE004 : modifie le nom et le type d'un repère existant. */
    public boolean updatePersonalLandmark(String code, String name, String type) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        String cleanName = name == null ? "" : name.trim();
        if (normalized.isEmpty() || cleanName.isEmpty()) return false;
        ContentValues values = new ContentValues();
        values.put("name", cleanName);
        values.put("landmark_type", "Trajet".equalsIgnoreCase(type) ? "Trajet" : "Ascension");
        boolean changed = getWritableDatabase().update(
                "personal_landmarks", values, "code=?", new String[]{normalized}) > 0;
        if (changed) {
            // Une référence de l'ancien type n'est pas forcément valable après changement de type.
            clearPersonalLandmarkReference(normalized);
        }
        return changed;
    }

    /** REPERE004 : supprime le repère et ses associations locales. */
    public boolean deletePersonalLandmark(String code) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) return false;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("activity_landmarks", "landmark_code=?", new String[]{normalized});
            db.delete("personal_landmark_references", "landmark_code=?", new String[]{normalized});
            boolean deleted = db.delete("personal_landmarks", "code=?", new String[]{normalized}) > 0;
            db.setTransactionSuccessful();
            return deleted;
        } finally {
            db.endTransaction();
        }
    }

    /** REPERE004 : enregistre le point exact choisi sur la carte pour une ascension / destination. */
    public boolean setPersonalLandmarkPointReference(String code, long activityId,
                                                      double latitude, double longitude, Double altitudeMeters) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty() || !Double.isFinite(latitude) || !Double.isFinite(longitude)) return false;
        ContentValues values = new ContentValues();
        values.put("landmark_code", normalized);
        values.put("activity_id", activityId);
        values.put("mode", "POINT");
        values.put("latitude", latitude);
        values.put("longitude", longitude);
        if (altitudeMeters == null) values.putNull("altitude_m"); else values.put("altitude_m", altitudeMeters);
        values.put("updated_at_ms", System.currentTimeMillis());
        return getWritableDatabase().insertWithOnConflict(
                "personal_landmark_references", null, values, SQLiteDatabase.CONFLICT_REPLACE) != -1L;
    }

    public void clearPersonalLandmarkReference(String code) {
        createPersonalLandmarkTables(getWritableDatabase());
        getWritableDatabase().delete("personal_landmark_references", "landmark_code=?",
                new String[]{code == null ? "" : code.trim().toUpperCase(Locale.ROOT)});
    }

    public List<PersonalLandmarkReference> listPersonalLandmarkReferences() {
        createPersonalLandmarkTables(getWritableDatabase());
        List<PersonalLandmarkReference> result = new ArrayList<>();
        String sql = "SELECT p.code,p.name,p.landmark_type,r.activity_id,r.mode,r.latitude,r.longitude,r.altitude_m " +
                "FROM personal_landmarks p LEFT JOIN personal_landmark_references r ON r.landmark_code=p.code ORDER BY p.sort_order";
        try (Cursor c = getReadableDatabase().rawQuery(sql, null)) {
            while (c.moveToNext()) result.add(new PersonalLandmarkReference(c.getString(0), c.getString(1), c.getString(2),
                    c.isNull(3) ? null : c.getLong(3), c.isNull(4) ? null : c.getString(4),
                    c.isNull(5) ? null : c.getDouble(5), c.isNull(6) ? null : c.getDouble(6), c.isNull(7) ? null : c.getDouble(7)));
        }
        return result;
    }

    public int detectPersonalLandmarksForActivity(long activityId) {
        createPersonalLandmarkTables(getWritableDatabase());
        List<ActivityPoint> candidate = getActivityPoints(activityId);
        if (candidate.size() < 2) return 0;
        int detections = 0;
        for (PersonalLandmarkReference ref : listPersonalLandmarkReferences()) {
            if (ref.activityId == null) continue;
            detections += detectPersonalLandmarkForActivity(activityId, candidate, ref);
        }
        return detections;
    }

    private int detectPersonalLandmarkForActivity(long activityId, List<ActivityPoint> candidate, PersonalLandmarkReference ref) {
        String preset = PersonalLandmarkSettings.getPreset(appContext, ref.code);
        PersonalLandmarkSettings.DetectionProfile profile = PersonalLandmarkSettings.profile(preset);
        int count;
        if ("ROUTE".equals(ref.mode)) {
            // REPERE005 : un trajet est reconnu uniquement dans le même sport que l'activité de référence.
            Integer referenceSport = getActivitySport(ref.activityId);
            Integer candidateSport = getActivitySport(activityId);
            if (referenceSport == null || candidateSport == null || !referenceSport.equals(candidateSport)) {
                count = 0;
            } else {
                count = PersonalLandmarkDetector.detectRoute(getActivityPoints(ref.activityId), candidate, profile);
            }
        } else if (ref.latitude != null && ref.longitude != null) {
            count = PersonalLandmarkDetector.detectClimb(candidate, ref.latitude, ref.longitude, profile);
        } else {
            return 0;
        }
        String currentSource = null;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT source FROM activity_landmarks WHERE activity_id=? AND landmark_code=?",
                new String[]{Long.toString(activityId), ref.code})) {
            if (c.moveToFirst()) currentSource = c.getString(0);
        }
        if ("MANUAL".equals(currentSource)) return 0;
        if (count <= 0) {
            getWritableDatabase().delete("activity_landmarks", "activity_id=? AND landmark_code=? AND source='AUTO'",
                    new String[]{Long.toString(activityId), ref.code});
            return 0;
        }
        ContentValues values = new ContentValues();
        values.put("activity_id", activityId);
        values.put("landmark_code", ref.code);
        values.put("occurrences", Math.min(99, count));
        values.put("source", "AUTO");
        values.put("updated_at_ms", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("activity_landmarks", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        return count;
    }


    /** REPERE005 : sport FIT brut d'une activité, utilisé pour éviter vélo/course sur un même trajet. */
    private Integer getActivitySport(long activityId) {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT sport FROM activities WHERE id=?", new String[]{Long.toString(activityId)})) {
            return c.moveToFirst() && !c.isNull(0) ? c.getInt(0) : null;
        }
    }

    public AutoLandmarkScanResult scanAllPersonalLandmarks() {
        createPersonalLandmarkTables(getWritableDatabase());
        int activities = 0, detections = 0;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM activities WHERE deleted_at_ms IS NULL ORDER BY start_time_ms", null)) {
            while (c.moveToNext()) { activities++; detections += detectPersonalLandmarksForActivity(c.getLong(0)); }
        }
        return new AutoLandmarkScanResult(activities, detections);
    }

    /** REPERE003 : réanalyse un seul repère avec sa sensibilité courante. */
    public AutoLandmarkScanResult scanPersonalLandmark(String code) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        PersonalLandmarkReference target = null;
        for (PersonalLandmarkReference ref : listPersonalLandmarkReferences()) {
            if (normalized.equals(ref.code)) { target = ref; break; }
        }
        if (target == null || target.activityId == null) return new AutoLandmarkScanResult(0, 0);
        int activities = 0, detections = 0;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM activities WHERE deleted_at_ms IS NULL ORDER BY start_time_ms", null)) {
            while (c.moveToNext()) {
                long activityId = c.getLong(0);
                List<ActivityPoint> candidate = getActivityPoints(activityId);
                if (candidate.size() < 2) continue;
                activities++;
                detections += detectPersonalLandmarkForActivity(activityId, candidate, target);
            }
        }
        return new AutoLandmarkScanResult(activities, detections);
    }

    public PersonalLandmarkSourceStat getPersonalLandmarkSourceStat(String code) {
        createPersonalLandmarkTables(getWritableDatabase());
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        int manual = 0, automatic = 0;
        String sql = "SELECT al.source,COALESCE(SUM(al.occurrences),0) FROM activity_landmarks al " +
                "JOIN activities a ON a.id=al.activity_id " +
                "WHERE al.landmark_code=? AND a.deleted_at_ms IS NULL GROUP BY al.source";
        try (Cursor c = getReadableDatabase().rawQuery(sql, new String[]{normalized})) {
            while (c.moveToNext()) {
                if ("MANUAL".equals(c.getString(0))) manual = c.getInt(1);
                else if ("AUTO".equals(c.getString(0))) automatic = c.getInt(1);
            }
        }
        return new PersonalLandmarkSourceStat(manual, automatic);
    }

    public String getPersonalLandmarkDetectionPreset(String code) {
        return PersonalLandmarkSettings.getPreset(appContext, code);
    }

    public void setPersonalLandmarkDetectionPreset(String code, String preset) {
        PersonalLandmarkSettings.setPreset(appContext, code, preset);
    }

    public static final class AutoLandmarkScanResult {
        public final int activitiesScanned, detections;
        public AutoLandmarkScanResult(int activitiesScanned, int detections) { this.activitiesScanned = activitiesScanned; this.detections = detections; }
    }

    public static final class PersonalLandmarkSourceStat {
        public final int manualOccurrences;
        public final int automaticOccurrences;
        public PersonalLandmarkSourceStat(int manualOccurrences, int automaticOccurrences) {
            this.manualOccurrences = manualOccurrences;
            this.automaticOccurrences = automaticOccurrences;
        }
    }

    public static final class PersonalLandmarkReference {
        public final String code, name, type, mode; public final Long activityId; public final Double latitude, longitude, altitudeMeters;
        public PersonalLandmarkReference(String code, String name, String type, Long activityId, String mode,
                                         Double latitude, Double longitude, Double altitudeMeters) {
            this.code=code; this.name=name; this.type=type; this.activityId=activityId; this.mode=mode;
            this.latitude=latitude; this.longitude=longitude; this.altitudeMeters=altitudeMeters;
        }
    }

    public static final class PersonalLandmarkAssignment {
        public final String code;
        public final String name;
        public final String type;
        public final int occurrences;

        public PersonalLandmarkAssignment(String code, String name, String type, int occurrences) {
            this.code = code;
            this.name = name;
            this.type = type;
            this.occurrences = occurrences;
        }
    }

    public static final class PersonalLandmarkStat {
        public final String code;
        public final String name;
        public final String type;
        public final int totalCount;
        public final int currentYearCount;
        public final int currentYear;

        public PersonalLandmarkStat(String code, String name, String type, int totalCount,
                                    int currentYearCount, int currentYear) {
            this.code = code;
            this.name = name;
            this.type = type;
            this.totalCount = totalCount;
            this.currentYearCount = currentYearCount;
            this.currentYear = currentYear;
        }
    }

    /** SYNCLOUD003 : journal compact des mutations locales pour synchronisation différentielle. */
    private static void createCloudSyncJournalTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS sync_change_counter (" +
                "id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("INSERT OR IGNORE INTO sync_change_counter(id,value) VALUES(1,0)");
        db.execSQL("CREATE TABLE IF NOT EXISTS sync_apply_guard (" +
                "id INTEGER PRIMARY KEY CHECK(id=1), active INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("INSERT OR IGNORE INTO sync_apply_guard(id,active) VALUES(1,0)");
        db.execSQL("CREATE TABLE IF NOT EXISTS sync_change_log (" +
                "table_name TEXT NOT NULL, row_key TEXT NOT NULL, operation TEXT NOT NULL," +
                "change_seq INTEGER NOT NULL, changed_at_ms INTEGER NOT NULL," +
                "PRIMARY KEY(table_name,row_key))");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_sync_change_seq ON sync_change_log(change_seq)");

        createSyncTriggers(db, "activities", "CAST(NEW.id AS TEXT)", "CAST(OLD.id AS TEXT)", false);
        // Les points sont regroupés par activité : une activité modifiée = une seule entrée journal.
        createSyncTriggers(db, "activity_points", "CAST(NEW.activity_id AS TEXT)",
                "CAST(OLD.activity_id AS TEXT)", true);
        createSyncTriggers(db, "activity_landmarks",
                "CAST(NEW.activity_id AS TEXT)||':'||NEW.landmark_code",
                "CAST(OLD.activity_id AS TEXT)||':'||OLD.landmark_code", false);
        createSyncTriggers(db, "personal_landmarks", "NEW.code", "OLD.code", false);
        createSyncTriggers(db, "personal_landmark_references", "NEW.landmark_code", "OLD.landmark_code", false);
        createSyncTriggers(db, "equipment", "NEW.id", "OLD.id", false);
        createSyncTriggers(db, "equipment_events", "CAST(NEW.id AS TEXT)", "CAST(OLD.id AS TEXT)", false);
        createSyncTriggers(db, "records", "NEW.record_type", "OLD.record_type", false);
        createSyncTriggers(db, "activity_sources", "CAST(NEW.id AS TEXT)", "CAST(OLD.id AS TEXT)", false);
        createSyncTriggers(db, "activity_metadata_history", "CAST(NEW.id AS TEXT)", "CAST(OLD.id AS TEXT)", false);
    }

    private static void createSyncTriggers(SQLiteDatabase db, String table, String newKey,
                                           String oldKey, boolean deleteAsUpsert) {
        String safe = table.replaceAll("[^A-Za-z0-9_]", "");
        String guard = " WHEN (SELECT active FROM sync_apply_guard WHERE id=1)=0 ";
        String upsertBody = " BEGIN " +
                "UPDATE sync_change_counter SET value=value+1 WHERE id=1; " +
                "INSERT INTO sync_change_log(table_name,row_key,operation,change_seq,changed_at_ms) " +
                "VALUES('" + safe + "',%KEY%,'UPSERT',(SELECT value FROM sync_change_counter WHERE id=1)," +
                "CAST(strftime('%s','now') AS INTEGER)*1000) " +
                "ON CONFLICT(table_name,row_key) DO UPDATE SET operation=excluded.operation," +
                "change_seq=excluded.change_seq,changed_at_ms=excluded.changed_at_ms; END";
        db.execSQL("CREATE TRIGGER IF NOT EXISTS sync_" + safe + "_ai AFTER INSERT ON " + safe + guard +
                upsertBody.replace("%KEY%", newKey));
        db.execSQL("CREATE TRIGGER IF NOT EXISTS sync_" + safe + "_au AFTER UPDATE ON " + safe + guard +
                upsertBody.replace("%KEY%", newKey));
        String deleteOp = deleteAsUpsert ? "UPSERT" : "DELETE";
        String deleteBody = " BEGIN " +
                "UPDATE sync_change_counter SET value=value+1 WHERE id=1; " +
                "INSERT INTO sync_change_log(table_name,row_key,operation,change_seq,changed_at_ms) " +
                "VALUES('" + safe + "'," + oldKey + ",'" + deleteOp + "',(SELECT value FROM sync_change_counter WHERE id=1)," +
                "CAST(strftime('%s','now') AS INTEGER)*1000) " +
                "ON CONFLICT(table_name,row_key) DO UPDATE SET operation=excluded.operation," +
                "change_seq=excluded.change_seq,changed_at_ms=excluded.changed_at_ms; END";
        db.execSQL("CREATE TRIGGER IF NOT EXISTS sync_" + safe + "_ad AFTER DELETE ON " + safe + guard + deleteBody);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        MigrationSafetyManager.beforeUpgrade(appContext, db, oldVersion, newVersion);
        boolean migrationSuccess = false;
        try {
        if (oldVersion < 2) {
            createRecordsTable(db);
            rebuildRecords(db);
        }
        if (oldVersion < 3) {
            createActivityPointsTable(db);
        }
        if (oldVersion < 4) {
            createRoutesTable(db);
        }
        if (oldVersion < 5) {
            createRoutePointsTable(db);
        }
        if (oldVersion >= 4 && oldVersion < 6) {
            db.execSQL("ALTER TABLE routes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE routes ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_routes_favorite ON routes(is_favorite DESC, updated_at_ms DESC)");
        }
        if (oldVersion < 7) {
            createTrainingSessionsTable(db);
        }
        if (oldVersion < 8) {
            createUltraTables(db);
        }
        if (oldVersion < 9) {
            createEquipmentTables(db);
        }
        if (oldVersion < 10) {
            createGarminActivityIndexTable(db);
        }
        if (oldVersion < 11) {
            createStravaActivityIndexTable(db);
        }
        if (oldVersion < 12) {
            createFitFileIndexTable(db);
        }
        if (oldVersion < 13) {
            db.execSQL("ALTER TABLE activities ADD COLUMN import_source TEXT NOT NULL DEFAULT 'Historique local'");
            if (oldVersion >= 12) {
                db.execSQL("ALTER TABLE fit_file_index ADD COLUMN activity_fingerprint TEXT");
                db.execSQL("ALTER TABLE fit_file_index ADD COLUMN source TEXT NOT NULL DEFAULT 'Source inconnue'");
                db.execSQL("ALTER TABLE fit_file_index ADD COLUMN duplicate_reason TEXT");
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_fit_file_fingerprint ON fit_file_index(activity_fingerprint)");
            }
            createFitImportHistoryTables(db);
        }
        if (oldVersion < 14) {
            db.execSQL("ALTER TABLE activities ADD COLUMN source_file_sha256 TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN segment_index INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE activities ADD COLUMN segment_count INTEGER NOT NULL DEFAULT 1");
            db.execSQL("ALTER TABLE activities ADD COLUMN split_reason TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN equipment_name TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN equipment_manual INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE activities ADD COLUMN import_profile TEXT NOT NULL DEFAULT 'STANDARD'");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_activities_source_file ON activities(source_file_sha256)");
            if (oldVersion >= 13) {
                db.execSQL("ALTER TABLE fit_import_runs ADD COLUMN undone_at_ms INTEGER");
                db.execSQL("ALTER TABLE fit_import_runs ADD COLUMN undone_activity_count INTEGER NOT NULL DEFAULT 0");
            }
        }
        if (oldVersion < 15) {
            createImport004Tables(db);
            db.execSQL("INSERT OR IGNORE INTO activity_sources " +
                    "(activity_id, sha256, format, display_name, source, added_at_ms) " +
                    "SELECT id, COALESCE(source_file_sha256, sha256), import_profile, " +
                    "file_name, import_source, imported_at_ms FROM activities");
        }
        if (oldVersion < 16) {
            createImport005Tables(db);
        }
        if (oldVersion < 17) {
            createActivityCorrectionTables(db);
        }
        if (oldVersion < 18) {
            db.execSQL("ALTER TABLE activities ADD COLUMN deleted_at_ms INTEGER");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_activities_deleted ON activities(deleted_at_ms)");
        }
        if (oldVersion < 19) {
            db.execSQL("ALTER TABLE activities ADD COLUMN custom_title TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN description TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN personal_note TEXT");
            db.execSQL("ALTER TABLE activities ADD COLUMN feeling_score INTEGER");
            db.execSQL("ALTER TABLE activities ADD COLUMN difficulty_score INTEGER");
            db.execSQL("ALTER TABLE activities ADD COLUMN privacy TEXT NOT NULL DEFAULT 'PRIVATE'");
            db.execSQL("ALTER TABLE activities ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
            createActivityEditTables(db);
        }
        if (oldVersion < 20) {
            createBackupAuditTable(db);
        }
        if (oldVersion < 21) {
            ensureColumn(db, "routes", "source_type",
                    "ALTER TABLE routes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'MANUAL'");
            ensureColumn(db, "routes", "source_name",
                    "ALTER TABLE routes ADD COLUMN source_name TEXT");
            ensureColumn(db, "routes", "source_sha256",
                    "ALTER TABLE routes ADD COLUMN source_sha256 TEXT");
            ensureColumn(db, "routes", "imported_at_ms",
                    "ALTER TABLE routes ADD COLUMN imported_at_ms INTEGER");
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_source_sha ON routes(source_sha256) " +
                    "WHERE source_sha256 IS NOT NULL AND source_sha256 <> ''");
            createRouteWaypointsTable(db);
        }
        if (oldVersion < 22) {
            ensureColumn(db, "ultra_races", "route_id",
                    "ALTER TABLE ultra_races ADD COLUMN route_id INTEGER");
            ensureColumn(db, "ultra_races", "water_ml_per_hour",
                    "ALTER TABLE ultra_races ADD COLUMN water_ml_per_hour INTEGER NOT NULL DEFAULT 500");
            ensureColumn(db, "ultra_races", "carbs_g_per_hour",
                    "ALTER TABLE ultra_races ADD COLUMN carbs_g_per_hour INTEGER NOT NULL DEFAULT 70");
            ensureColumn(db, "ultra_races", "sodium_mg_per_hour",
                    "ALTER TABLE ultra_races ADD COLUMN sodium_mg_per_hour INTEGER NOT NULL DEFAULT 500");
            ensureColumn(db, "ultra_races", "default_stop_min",
                    "ALTER TABLE ultra_races ADD COLUMN default_stop_min INTEGER NOT NULL DEFAULT 5");
            ensureColumn(db, "ultra_checkpoints", "stop_duration_min",
                    "ALTER TABLE ultra_checkpoints ADD COLUMN stop_duration_min INTEGER NOT NULL DEFAULT 0");
            ensureColumn(db, "ultra_checkpoints", "assistance_bag",
                    "ALTER TABLE ultra_checkpoints ADD COLUMN assistance_bag INTEGER NOT NULL DEFAULT 0");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_ultra_races_route ON ultra_races(route_id)");
        }
        if (oldVersion < 23) {
            rebaseSplitActivityDistances(db);
        }
        if (oldVersion < 24) {
            // STAB002 : SEGMENT001 ne doit jamais empêcher l'ouverture de SPORT.
            // En cas d'anomalie locale, les tables seront recréées à la première
            // ouverture du menu Segments via ensureSegmentSchema().
            try {
                createSegmentsTables(db);
            } catch (RuntimeException error) {
                DiagnosticJournal.error(appContext, "STAB002",
                        "Migration SEGMENT001 différée", error);
            }
        }
        if (oldVersion < 25) {
            createPersonalLandmarkTables(db);
        }
        if (oldVersion < 26) {
            createPersonalLandmarkTables(db);
        }
        if (oldVersion < 27) {
            try { db.execSQL("ALTER TABLE activity_points ADD COLUMN heart_rate INTEGER"); }
            catch (RuntimeException ignored) { }
            try { db.execSQL("ALTER TABLE activity_correction_points ADD COLUMN heart_rate INTEGER"); }
            catch (RuntimeException ignored) { }
        }
        if (oldVersion < 28) {
            createCloudSyncJournalTables(db);
        }
        migrationSuccess = true;
        } finally {
            MigrationSafetyManager.afterUpgrade(appContext, oldVersion, newVersion, migrationSuccess);
        }
    }

    /**
     * Les premières versions du découpage conservaient la distance cumulée de l'activité mère.
     * Chaque activité fille doit repartir de zéro, sans modifier ses coordonnées GPS.
     */
    private static void rebaseSplitActivityDistances(SQLiteDatabase db) {
        try (Cursor activities = db.rawQuery(
                "SELECT id FROM activities WHERE segment_count > 1", null)) {
            while (activities.moveToNext()) {
                long activityId = activities.getLong(0);
                Double offset = null;
                try (Cursor first = db.rawQuery(
                        "SELECT distance_m FROM activity_points "
                                + "WHERE activity_id=? AND distance_m IS NOT NULL "
                                + "ORDER BY point_index LIMIT 1",
                        new String[]{Long.toString(activityId)})) {
                    if (first.moveToFirst() && !first.isNull(0)) offset = first.getDouble(0);
                }
                if (offset == null || !Double.isFinite(offset) || offset <= 0.000001) continue;
                db.execSQL("UPDATE activity_points "
                                + "SET distance_m=MAX(0.0, distance_m-?) "
                                + "WHERE activity_id=? AND distance_m IS NOT NULL",
                        new Object[]{offset, activityId});
            }
        }
    }

    private static void ensureColumn(SQLiteDatabase db, String table, String column,
                                     String alterSql) {
        boolean found = false;
        try (Cursor cursor = db.rawQuery("PRAGMA table_info(" + table + ")", null)) {
            int nameIndex = cursor.getColumnIndex("name");
            while (cursor.moveToNext()) {
                if (nameIndex >= 0 && column.equalsIgnoreCase(cursor.getString(nameIndex))) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) db.execSQL(alterSql);
    }

    public void recordBackupAudit(String eventType, String status, String detail) {
        ContentValues values = new ContentValues();
        values.put("event_type", cleanOrDefault(eventType, "BACKUP"));
        values.put("created_at_ms", System.currentTimeMillis());
        values.put("status", cleanOrDefault(status, "INFO"));
        putNullable(values, "detail", detail);
        getWritableDatabase().insert("backup_audit", null, values);
    }

    public List<String> listBackupAudit(int limit) {
        List<String> result = new ArrayList<>();
        int safeLimit = Math.max(1, Math.min(100, limit));
        try (Cursor cursor = getReadableDatabase().query("backup_audit",
                new String[]{"event_type", "created_at_ms", "status", "detail"},
                null, null, null, null, "created_at_ms DESC", String.valueOf(safeLimit))) {
            SimpleDateFormat format = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE);
            while (cursor.moveToNext()) {
                String line = format.format(new Date(cursor.getLong(1))) + " • " +
                        cursor.getString(0) + " • " + cursor.getString(2);
                if (!cursor.isNull(3) && !cursor.getString(3).trim().isEmpty()) {
                    line += " • " + cursor.getString(3);
                }
                result.add(line);
            }
        }
        return result;
    }

    public boolean isFitFileAlreadyHandled(String documentUri, long sizeBytes, long lastModifiedMs) {
        String sql = "SELECT import_status, size_bytes, last_modified_ms " +
                "FROM fit_file_index WHERE document_uri = ? LIMIT 1";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, new String[]{documentUri})) {
            if (!cursor.moveToFirst()) return false;
            String status = cursor.getString(0);
            long storedSize = cursor.getLong(1);
            long storedModified = cursor.getLong(2);
            boolean successful = FIT_FILE_STATUS_IMPORTED.equals(status)
                    || FIT_FILE_STATUS_DUPLICATE.equals(status)
                    || FIT_FILE_STATUS_DUPLICATE_ACTIVITY.equals(status);
            boolean reliableMetadata = sizeBytes >= 0L && lastModifiedMs >= 0L
                    && storedSize >= 0L && storedModified >= 0L;
            return successful && reliableMetadata
                    && storedSize == sizeBytes && storedModified == lastModifiedMs;
        }
    }

    public Long findFirstActivityBySourceFileSha(String sourceFileSha256) {
        SourceFileImportState state = getSourceFileImportState(sourceFileSha256);
        return state == null ? null : state.firstActivityId;
    }

    /** PROFILE003 / v189 : URI du FIT original ayant produit une activité découpée. */
    public String findFitSourceDocumentUri(long activityId, String sourceFileSha256) {
        SQLiteDatabase db = getReadableDatabase();
        if (activityId > 0L) {
            try (Cursor cursor = db.rawQuery(
                    "SELECT document_uri FROM fit_import_items WHERE local_activity_id=? " +
                            "AND TRIM(COALESCE(document_uri,''))<>'' ORDER BY created_at_ms DESC LIMIT 1",
                    new String[]{Long.toString(activityId)})) {
                if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
            }
            try (Cursor cursor = db.rawQuery(
                    "SELECT original_uri FROM import_inbox_items WHERE local_activity_id=? " +
                            "AND TRIM(COALESCE(original_uri,''))<>'' ORDER BY updated_at_ms DESC LIMIT 1",
                    new String[]{Long.toString(activityId)})) {
                if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
            }
        }
        if (sourceFileSha256 == null || sourceFileSha256.trim().isEmpty()) return null;
        String sha = sourceFileSha256.trim();
        try (Cursor cursor = db.rawQuery(
                "SELECT document_uri FROM fit_file_index WHERE sha256=? " +
                        "AND TRIM(COALESCE(document_uri,''))<>'' ORDER BY updated_at_ms DESC LIMIT 1",
                new String[]{sha})) {
            if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        }
        // Un ancien import peut n'avoir indexé le document que sur un autre segment frère.
        try (Cursor cursor = db.rawQuery(
                "SELECT fii.document_uri FROM fit_import_items fii JOIN activities a " +
                        "ON a.id=fii.local_activity_id WHERE a.source_file_sha256=? " +
                        "AND TRIM(COALESCE(fii.document_uri,''))<>'' ORDER BY fii.created_at_ms DESC LIMIT 1",
                new String[]{sha})) {
            if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        }
        return null;
    }

    public SourceFileImportState getSourceFileImportState(String sourceFileSha256) {
        if (sourceFileSha256 == null || sourceFileSha256.trim().isEmpty()) return null;
        String sql = "SELECT MIN(id), COUNT(DISTINCT segment_index), MAX(segment_count) " +
                "FROM activities WHERE source_file_sha256 = ?";
        try (Cursor cursor = getReadableDatabase().rawQuery(
                sql, new String[]{sourceFileSha256.trim()})) {
            if (!cursor.moveToFirst() || cursor.isNull(0) || cursor.getInt(1) <= 0) return null;
            return new SourceFileImportState(cursor.getLong(0), cursor.getInt(1), cursor.getInt(2));
        }
    }

    public void recordFitFileResult(String documentUri,
                                    String displayName,
                                    long sizeBytes,
                                    long lastModifiedMs,
                                    String sha256,
                                    Long localActivityId,
                                    String status,
                                    String lastError) {
        recordFitFileResult(documentUri, displayName, sizeBytes, lastModifiedMs,
                sha256, null, localActivityId, status, "Source inconnue", null, lastError);
    }

    public void recordFitFileResult(String documentUri,
                                    String displayName,
                                    long sizeBytes,
                                    long lastModifiedMs,
                                    String sha256,
                                    String activityFingerprint,
                                    Long localActivityId,
                                    String status,
                                    String source,
                                    String duplicateReason,
                                    String lastError) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        int previousAttempts = 0;
        long discoveredAt = now;
        try (Cursor cursor = db.rawQuery(
                "SELECT attempt_count, discovered_at_ms FROM fit_file_index WHERE document_uri = ? LIMIT 1",
                new String[]{documentUri})) {
            if (cursor.moveToFirst()) {
                previousAttempts = cursor.getInt(0);
                discoveredAt = cursor.getLong(1);
            }
        }

        ContentValues values = new ContentValues();
        values.put("document_uri", documentUri);
        values.put("display_name", displayName == null ? "" : displayName);
        values.put("size_bytes", sizeBytes);
        values.put("last_modified_ms", lastModifiedMs);
        putNullable(values, "sha256", sha256);
        putNullable(values, "activity_fingerprint", activityFingerprint);
        putNullable(values, "local_activity_id", localActivityId);
        values.put("import_status", status);
        values.put("source", source == null ? "Source inconnue" : source);
        putNullable(values, "duplicate_reason", duplicateReason);
        putNullable(values, "last_error", lastError);
        values.put("attempt_count", previousAttempts + 1);
        values.put("discovered_at_ms", discoveredAt);
        values.put("updated_at_ms", now);
        db.insertWithOnConflict("fit_file_index", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public EquivalentActivity findEquivalentFitActivity(FitActivityData activity) {
        if (activity == null) return null;
        String sha256 = activity.getSha256();
        if (sha256 != null && !sha256.trim().isEmpty()) {
            try (Cursor sourceCursor = getReadableDatabase().rawQuery(
                    "SELECT activity_id FROM activity_sources WHERE sha256 = ? LIMIT 1",
                    new String[]{sha256.trim()})) {
                if (sourceCursor.moveToFirst()) {
                    return new EquivalentActivity(sourceCursor.getLong(0), true,
                            "Fichier source déjà rattaché à cette activité");
                }
            } catch (RuntimeException ignored) {
                // Base antérieure à IMPORT004 pendant une migration défensive.
            }
            try (Cursor sourceFileCursor = getReadableDatabase().query(
                    "activities", new String[]{"id"}, "source_file_sha256 = ?",
                    new String[]{sha256}, null, null, null, "1")) {
                if (sourceFileCursor.moveToFirst()) {
                    return new EquivalentActivity(sourceFileCursor.getLong(0), true,
                            "Même fichier source déjà importé, y compris après découpage");
                }
            }
            try (Cursor cursor = getReadableDatabase().query(
                    "activities", new String[]{"id"}, "sha256 = ?",
                    new String[]{sha256}, null, null, null, "1")) {
                if (cursor.moveToFirst()) {
                    return new EquivalentActivity(cursor.getLong(0), true,
                            "Contenu FIT strictement identique");
                }
            }
        }

        Long start = activity.getStartTimeEpochMillis();
        if (start == null) return null;
        long toleranceStartMs = 30_000L;
        String sql = "SELECT id, sha256, sub_sport, start_time_ms, timer_time_ms, elapsed_time_ms, " +
                "distance_m, record_count, gps_point_count FROM activities " +
                "WHERE sport = ? AND start_time_ms BETWEEN ? AND ? ORDER BY ABS(start_time_ms - ?) ASC LIMIT 20";
        String[] args = new String[]{
                String.valueOf(activity.getSport()),
                String.valueOf(start - toleranceStartMs),
                String.valueOf(start + toleranceStartMs),
                String.valueOf(start)
        };

        Long incomingDuration = activity.getTimerTimeMillis() != null
                ? activity.getTimerTimeMillis() : activity.getElapsedTimeMillis();
        Double incomingDistance = activity.getDistanceMeters();

        try (Cursor cursor = getReadableDatabase().rawQuery(sql, args)) {
            while (cursor.moveToNext()) {
                long id = cursor.getLong(0);
                int storedSubSport = cursor.getInt(2);
                long storedStart = cursor.getLong(3);
                Long storedTimer = cursor.isNull(4) ? null : cursor.getLong(4);
                Long storedElapsed = cursor.isNull(5) ? null : cursor.getLong(5);
                Long storedDuration = storedTimer != null ? storedTimer : storedElapsed;
                Double storedDistance = cursor.isNull(6) ? null : cursor.getDouble(6);
                int storedRecords = cursor.getInt(7);
                int storedGps = cursor.getInt(8);

                if (activity.getSubSport() >= 0 && storedSubSport >= 0
                        && activity.getSubSport() != storedSubSport) continue;

                long startDelta = Math.abs(storedStart - start);
                boolean durationComparable = incomingDuration != null && storedDuration != null;
                boolean distanceComparable = incomingDistance != null && storedDistance != null;
                boolean recordsComparable = activity.getRecordCount() > 0 && storedRecords > 0;
                boolean gpsComparable = activity.getGpsPointCount() > 0 && storedGps > 0;

                boolean durationMatch = !durationComparable || Math.abs(storedDuration - incomingDuration)
                        <= Math.max(15_000L, Math.round(Math.max(storedDuration, incomingDuration) * 0.005));
                boolean distanceMatch = !distanceComparable || Math.abs(storedDistance - incomingDistance)
                        <= Math.max(100.0, Math.max(storedDistance, incomingDistance) * 0.01);
                boolean recordsMatch = recordsComparable && Math.abs(storedRecords - activity.getRecordCount())
                        <= Math.max(5, Math.round(Math.max(storedRecords, activity.getRecordCount()) * 0.03f));
                boolean gpsMatch = gpsComparable && Math.abs(storedGps - activity.getGpsPointCount())
                        <= Math.max(5, Math.round(Math.max(storedGps, activity.getGpsPointCount()) * 0.03f));

                boolean twoCoreMetrics = durationComparable && distanceComparable
                        && durationMatch && distanceMatch;
                boolean oneCorePlusSecondary = ((durationComparable && durationMatch)
                        || (distanceComparable && distanceMatch)) && (recordsMatch || gpsMatch);
                if (startDelta <= toleranceStartMs && (twoCoreMetrics || oneCorePlusSecondary)) {
                    return new EquivalentActivity(id, false,
                            "Même départ, sport, durée et distance proches");
                }
            }
        }
        return null;
    }

    public long startFitImportRun(String locationUri, String triggerName) {
        ContentValues values = new ContentValues();
        values.put("started_at_ms", System.currentTimeMillis());
        values.put("location_uri", locationUri == null ? "" : locationUri);
        values.put("trigger_name", triggerName == null ? "MANUAL_FOLDER" : triggerName);
        long id = getWritableDatabase().insertOrThrow("fit_import_runs", null, values);
        return id;
    }

    public void completeFitImportRun(long runId,
                                     int discovered,
                                     int imported,
                                     int duplicateFile,
                                     int duplicateActivity,
                                     int unchanged,
                                     int errors,
                                     boolean cancelled,
                                     String fatalError) {
        ContentValues values = new ContentValues();
        values.put("finished_at_ms", System.currentTimeMillis());
        values.put("discovered_count", discovered);
        values.put("imported_count", imported);
        values.put("duplicate_file_count", duplicateFile);
        values.put("duplicate_activity_count", duplicateActivity);
        values.put("unchanged_count", unchanged);
        values.put("error_count", errors);
        values.put("cancelled", cancelled ? 1 : 0);
        putNullable(values, "fatal_error", fatalError);
        getWritableDatabase().update("fit_import_runs", values, "id = ?",
                new String[]{String.valueOf(runId)});
        pruneFitImportHistory(100);
    }

    public void recordFitImportItem(long runId,
                                    String documentUri,
                                    String displayName,
                                    String source,
                                    String status,
                                    String reason,
                                    String sha256,
                                    String activityFingerprint,
                                    Long localActivityId,
                                    long sizeBytes,
                                    long lastModifiedMs) {
        ContentValues values = new ContentValues();
        values.put("run_id", runId);
        values.put("document_uri", documentUri == null ? "" : documentUri);
        values.put("display_name", displayName == null ? "" : displayName);
        values.put("source", source == null ? "Source inconnue" : source);
        values.put("status", status);
        putNullable(values, "reason", reason);
        putNullable(values, "sha256", sha256);
        putNullable(values, "activity_fingerprint", activityFingerprint);
        putNullable(values, "local_activity_id", localActivityId);
        values.put("size_bytes", sizeBytes);
        values.put("last_modified_ms", lastModifiedMs);
        values.put("created_at_ms", System.currentTimeMillis());
        getWritableDatabase().insertOrThrow("fit_import_items", null, values);
    }

    public List<FitImportRun> getRecentFitImportRuns(int limit) {
        List<FitImportRun> result = new ArrayList<>();
        int safeLimit = Math.max(1, Math.min(limit, 250));
        String sql = "SELECT id, started_at_ms, finished_at_ms, location_uri, trigger_name, " +
                "discovered_count, imported_count, duplicate_file_count, duplicate_activity_count, " +
                "unchanged_count, error_count, cancelled, fatal_error, undone_at_ms, undone_activity_count " +
                "FROM fit_import_runs ORDER BY started_at_ms DESC LIMIT " + safeLimit;
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, null)) {
            while (cursor.moveToNext()) {
                result.add(new FitImportRun(
                        cursor.getLong(0),
                        cursor.getLong(1),
                        cursor.isNull(2) ? null : cursor.getLong(2),
                        cursor.getString(3),
                        cursor.getString(4),
                        cursor.getInt(5),
                        cursor.getInt(6),
                        cursor.getInt(7),
                        cursor.getInt(8),
                        cursor.getInt(9),
                        cursor.getInt(10),
                        cursor.getInt(11) != 0,
                        cursor.isNull(12) ? null : cursor.getString(12),
                        cursor.isNull(13) ? null : cursor.getLong(13),
                        cursor.getInt(14)
                ));
            }
        }
        return result;
    }

    public List<FitImportItem> getFitImportItems(long runId, int limit) {
        List<FitImportItem> result = new ArrayList<>();
        int safeLimit = Math.max(1, Math.min(limit, 5000));
        String sql = "SELECT id, run_id, document_uri, display_name, source, status, reason, sha256, " +
                "activity_fingerprint, local_activity_id, size_bytes, last_modified_ms, created_at_ms " +
                "FROM fit_import_items WHERE run_id = ? ORDER BY id ASC LIMIT " + safeLimit;
        try (Cursor cursor = getReadableDatabase().rawQuery(sql,
                new String[]{String.valueOf(runId)})) {
            while (cursor.moveToNext()) {
                result.add(new FitImportItem(
                        cursor.getLong(0),
                        cursor.getLong(1),
                        cursor.getString(2),
                        cursor.getString(3),
                        cursor.getString(4),
                        cursor.getString(5),
                        cursor.isNull(6) ? null : cursor.getString(6),
                        cursor.isNull(7) ? null : cursor.getString(7),
                        cursor.isNull(8) ? null : cursor.getString(8),
                        cursor.isNull(9) ? null : cursor.getLong(9),
                        cursor.getLong(10),
                        cursor.getLong(11),
                        cursor.getLong(12)
                ));
            }
        }
        return result;
    }

    public UndoImportResult undoFitImportRun(long runId) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            List<Long> activityIds = new ArrayList<>();
            List<String> documentUris = new ArrayList<>();
            try (Cursor cursor = db.rawQuery(
                    "SELECT local_activity_id, document_uri FROM fit_import_items " +
                            "WHERE run_id = ? AND status = ? AND local_activity_id IS NOT NULL",
                    new String[]{String.valueOf(runId), FIT_IMPORT_ITEM_IMPORTED})) {
                while (cursor.moveToNext()) {
                    activityIds.add(cursor.getLong(0));
                    String uri = cursor.getString(1);
                    if (uri != null && !documentUris.contains(uri)) documentUris.add(uri);
                }
            }

            int deleted = 0;
            for (Long activityId : activityIds) {
                deleted += db.delete("activities", "id = ?", new String[]{String.valueOf(activityId)});
            }
            for (String uri : documentUris) {
                db.delete("fit_file_index", "document_uri = ?", new String[]{uri});
            }

            ContentValues values = new ContentValues();
            values.put("undone_at_ms", System.currentTimeMillis());
            values.put("undone_activity_count", deleted);
            db.update("fit_import_runs", values, "id = ?", new String[]{String.valueOf(runId)});
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return new UndoImportResult(deleted, documentUris.size());
        } finally {
            db.endTransaction();
        }
    }

    public void clearFitImportHistory() {
        getWritableDatabase().delete("fit_import_runs", null, null);
    }

    public void resetFitFileIndex() {
        getWritableDatabase().delete("fit_file_index", null, null);
    }

    private void pruneFitImportHistory(int keepRuns) {
        String sql = "DELETE FROM fit_import_runs WHERE id NOT IN (" +
                "SELECT id FROM fit_import_runs ORDER BY started_at_ms DESC LIMIT " +
                Math.max(1, keepRuns) + ")";
        getWritableDatabase().execSQL(sql);
    }

    public ImportResult saveActivity(String fileName, FitActivityData activity) {
        return saveActivity(fileName, activity, "Source inconnue", ImportMetadata.standard(activity));
    }

    public ImportResult saveActivity(String fileName, FitActivityData activity, String importSource) {
        return saveActivity(fileName, activity, importSource, ImportMetadata.standard(activity));
    }

    public ImportResult saveActivity(String fileName,
                                     FitActivityData activity,
                                     String importSource,
                                     ImportMetadata metadata) {
        SQLiteDatabase db = getWritableDatabase();
        ImportMetadata safeMetadata = metadata == null
                ? ImportMetadata.standard(activity) : metadata;
        boolean ownsTransaction = !db.inTransaction();
        if (ownsTransaction) db.beginTransaction();
        try {
            ContentValues values = activityValues(fileName, activity, importSource, safeMetadata);
            long insertedId = db.insertWithOnConflict(
                    "activities", null, values, SQLiteDatabase.CONFLICT_IGNORE);

            ImportResult result;
            if (insertedId != -1L) {
                insertActivityPoints(db, insertedId, activity.getPoints());
                updateRecordsForActivity(db, insertedId, activity);
                recordActivitySourceInternal(db, insertedId, activity.getSha256(),
                        safeMetadata.importProfile, fileName, importSource);
                try { detectPersonalLandmarksForActivity(insertedId); }
                catch (RuntimeException ignored) { /* La détection ne doit jamais bloquer un import. */ }
                result = new ImportResult(insertedId, false);
            } else {
                Long existingId = null;
                try (Cursor cursor = db.query("activities", new String[]{"id"}, "sha256 = ?",
                        new String[]{activity.getSha256()}, null, null, null, "1")) {
                    if (cursor.moveToFirst()) existingId = cursor.getLong(0);
                }
                if (existingId == null) {
                    throw new IllegalStateException("L'activité n'a pas pu être enregistrée");
                }
                recordActivitySourceInternal(db, existingId, activity.getSha256(),
                        safeMetadata.importProfile, fileName, importSource);
                result = new ImportResult(existingId, true);
            }

            if (ownsTransaction) db.setTransactionSuccessful();
            return result;
        } finally {
            if (ownsTransaction) db.endTransaction();
        }
    }

    /** Enregistre tous les segments d'un même fichier dans une transaction SQLite unique. */
    public List<ImportResult> saveActivityBatch(List<ActivitySaveRequest> requests) {
        List<ImportResult> results = new ArrayList<>();
        if (requests == null || requests.isEmpty()) return results;
        SQLiteDatabase db = getWritableDatabase();
        boolean ownsTransaction = !db.inTransaction();
        if (ownsTransaction) db.beginTransaction();
        try {
            for (ActivitySaveRequest request : requests) {
                if (request == null || request.activity == null) continue;
                results.add(saveActivity(request.fileName, request.activity,
                        request.importSource, request.metadata));
            }
            if (results.isEmpty()) throw new IllegalStateException("Aucune activité à enregistrer");
            if (ownsTransaction) db.setTransactionSuccessful();
            return results;
        } finally {
            if (ownsTransaction) db.endTransaction();
        }
    }

    public boolean updateActivityEquipment(long activityId, String equipmentName, boolean manual) {
        ContentValues values = new ContentValues();
        String cleaned = equipmentName == null ? null : equipmentName.trim();
        if (cleaned == null || cleaned.isEmpty()) values.putNull("equipment_name");
        else values.put("equipment_name", cleaned);
        values.put("equipment_manual", manual ? 1 : 0);
        return getWritableDatabase().update("activities", values, "id = ?",
                new String[]{String.valueOf(activityId)}) > 0;
    }


    /**
     * Aperçu d'une affectation massive temporaire de matériel.
     * Le mode 0 cible uniquement les activités sans matériel, le mode 1 inclut
     * les associations automatiques mais préserve les choix manuels, et le mode
     * 2 autorise explicitement le remplacement de toutes les associations.
     */
    public EquipmentBulkPreview previewEquipmentBulkAssignment(int sportFilter,
                                                                 Integer yearFilter,
                                                                 Long startInclusiveMs,
                                                                 Long endExclusiveMs,
                                                                 String sourceText,
                                                                 int assignmentMode) {
        EquipmentBulkWhere where = equipmentBulkWhere(sportFilter, yearFilter,
                startInclusiveMs, endExclusiveMs, sourceText, assignmentMode);
        String sql = "SELECT COUNT(*), COALESCE(SUM(COALESCE(distance_m,0)),0), " +
                "MIN(COALESCE(start_time_ms,imported_at_ms)), " +
                "MAX(COALESCE(start_time_ms,imported_at_ms)), " +
                "COALESCE(SUM(CASE WHEN TRIM(COALESCE(equipment_name,'')) <> '' THEN 1 ELSE 0 END),0) " +
                "FROM activities WHERE " + where.selection;
        try (Cursor c = getReadableDatabase().rawQuery(sql, where.args)) {
            if (!c.moveToFirst()) return new EquipmentBulkPreview(0, 0d, null, null, 0);
            Long first = c.isNull(2) ? null : c.getLong(2);
            Long last = c.isNull(3) ? null : c.getLong(3);
            return new EquipmentBulkPreview(c.getInt(0), c.getDouble(1), first, last, c.getInt(4));
        }
    }

    /** Affecte un même matériel à toutes les activités correspondant au filtre. */
    /** Affecte manuellement un matériel à une sélection explicite d'activités. */
    public int bulkAssignEquipmentToIds(List<Long> activityIds, String equipmentName) {
        if (activityIds == null || activityIds.isEmpty()) return 0;
        String cleaned = equipmentName == null ? "" : equipmentName.trim();
        if (cleaned.isEmpty()) throw new IllegalArgumentException("Matériel vide");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        int changed = 0;
        try {
            ContentValues values = new ContentValues();
            values.put("equipment_name", cleaned);
            values.put("equipment_manual", 1);
            for (Long id : activityIds) {
                if (id != null && id > 0L) {
                    changed += db.update("activities", values, "id = ? AND deleted_at_ms IS NULL",
                            new String[]{Long.toString(id)});
                }
            }
            db.setTransactionSuccessful();
            return changed;
        } finally {
            db.endTransaction();
        }
    }

    public int bulkAssignEquipment(String equipmentName,
                                   int sportFilter,
                                   Integer yearFilter,
                                   Long startInclusiveMs,
                                   Long endExclusiveMs,
                                   String sourceText,
                                   int assignmentMode) {
        String cleaned = equipmentName == null ? "" : equipmentName.trim();
        if (cleaned.isEmpty()) throw new IllegalArgumentException("Matériel vide");
        EquipmentBulkWhere where = equipmentBulkWhere(sportFilter, yearFilter,
                startInclusiveMs, endExclusiveMs, sourceText, assignmentMode);
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("equipment_name", cleaned);
            // Une affectation massive demandée par l'utilisateur est un choix manuel.
            // Elle ne doit donc pas être écrasée par les règles automatiques futures.
            values.put("equipment_manual", 1);
            int changed = db.update("activities", values, where.selection, where.args);
            db.setTransactionSuccessful();
            return changed;
        } finally {
            db.endTransaction();
        }
    }

    /** Années réellement présentes dans la bibliothèque, de la plus récente à la plus ancienne. */
    public List<Integer> getActivityYears() {
        List<Integer> result = new ArrayList<>();
        String sql = "SELECT DISTINCT CAST(strftime('%Y', COALESCE(start_time_ms,imported_at_ms)/1000, " +
                "'unixepoch','localtime') AS INTEGER) AS y FROM activities " +
                "WHERE deleted_at_ms IS NULL AND COALESCE(start_time_ms,imported_at_ms) > 0 " +
                "ORDER BY y DESC";
        try (Cursor c = getReadableDatabase().rawQuery(sql, null)) {
            while (c.moveToNext()) {
                int year = c.getInt(0);
                if (year > 1900 && year < 2200) result.add(year);
            }
        }
        return result;
    }

    private EquipmentBulkWhere equipmentBulkWhere(int sportFilter,
                                                    Integer yearFilter,
                                                    Long startInclusiveMs,
                                                    Long endExclusiveMs,
                                                    String sourceText,
                                                    int assignmentMode) {
        List<String> clauses = new ArrayList<>();
        List<String> args = new ArrayList<>();
        clauses.add("deleted_at_ms IS NULL");
        if (sportFilter >= 0) {
            clauses.add("sport = ?");
            args.add(Integer.toString(sportFilter));
        } else if (sportFilter == -2) {
            clauses.add("sport NOT IN (1,2,5,11,17)");
        }
        if (yearFilter != null && yearFilter > 1900) {
            clauses.add("strftime('%Y', COALESCE(start_time_ms,imported_at_ms)/1000, 'unixepoch','localtime') = ?");
            args.add(Integer.toString(yearFilter));
        }
        if (startInclusiveMs != null) {
            clauses.add("COALESCE(start_time_ms,imported_at_ms) >= CAST(? AS INTEGER)");
            args.add(Long.toString(startInclusiveMs));
        }
        if (endExclusiveMs != null) {
            clauses.add("COALESCE(start_time_ms,imported_at_ms) < CAST(? AS INTEGER)");
            args.add(Long.toString(endExclusiveMs));
        }
        String source = sourceText == null ? "" : sourceText.trim();
        if (!source.isEmpty()) {
            clauses.add("LOWER(COALESCE(import_source,'')) LIKE ?");
            args.add("%" + source.toLowerCase(Locale.ROOT) + "%");
        }
        if (assignmentMode <= 0) {
            clauses.add("TRIM(COALESCE(equipment_name,'')) = ''");
        } else if (assignmentMode == 1) {
            clauses.add("(TRIM(COALESCE(equipment_name,'')) = '' OR equipment_manual = 0)");
        }
        return new EquipmentBulkWhere(String.join(" AND ", clauses), args.toArray(new String[0]));
    }

    private static final class EquipmentBulkWhere {
        final String selection;
        final String[] args;
        EquipmentBulkWhere(String selection, String[] args) {
            this.selection = selection;
            this.args = args;
        }
    }

    public static final class EquipmentBulkPreview {
        public final int activityCount;
        public final double distanceMeters;
        public final Long firstActivityMs;
        public final Long lastActivityMs;
        public final int alreadyAssignedCount;

        EquipmentBulkPreview(int activityCount, double distanceMeters, Long firstActivityMs,
                             Long lastActivityMs, int alreadyAssignedCount) {
            this.activityCount = Math.max(0, activityCount);
            this.distanceMeters = Math.max(0d, distanceMeters);
            this.firstActivityMs = firstActivityMs;
            this.lastActivityMs = lastActivityMs;
            this.alreadyAssignedCount = Math.max(0, alreadyAssignedCount);
        }
    }

    /** Applique une règle automatique aux imports correspondants sans toucher aux choix manuels. */
    public int applyAutomaticEquipmentMapping(String importSource, int sport, int subSport,
                                               String equipmentName) {
        ContentValues values = new ContentValues();
        String cleaned = equipmentName == null ? null : equipmentName.trim();
        if (cleaned == null || cleaned.isEmpty()) values.putNull("equipment_name");
        else values.put("equipment_name", cleaned);
        values.put("equipment_manual", 0);
        return getWritableDatabase().update("activities", values,
                "LOWER(TRIM(COALESCE(import_source,'')))=LOWER(TRIM(?)) " +
                        "AND sport=? AND sub_sport=? AND equipment_manual=0",
                new String[]{importSource == null ? "" : importSource.trim(),
                        Integer.toString(sport), Integer.toString(subSport)});
    }

    public MetadataEditInfo getLatestMetadataEdit(long activityId) {
        String sql = "SELECT id,created_at_ms FROM activity_metadata_history " +
                "WHERE activity_id = ? AND undone_at_ms IS NULL ORDER BY created_at_ms DESC,id DESC LIMIT 1";
        try (Cursor c = getReadableDatabase().rawQuery(sql, new String[]{String.valueOf(activityId)})) {
            return c.moveToFirst() ? new MetadataEditInfo(c.getLong(0), c.getLong(1)) : null;
        }
    }

    public boolean saveActivityMetadata(long activityId, ActivityMetadata metadata) {
        if (metadata == null) return false;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ActivityRecord current = getActivity(activityId);
            if (current == null) return false;
            ContentValues history = new ContentValues();
            history.put("activity_id", activityId);
            history.put("created_at_ms", System.currentTimeMillis());
            putNullable(history, "custom_title", current.customTitle);
            putNullable(history, "description", current.description);
            putNullable(history, "personal_note", current.personalNote);
            putNullable(history, "feeling_score", current.feelingScore);
            putNullable(history, "difficulty_score", current.difficultyScore);
            history.put("privacy", cleanPrivacy(current.privacy));
            history.put("tags", normalizeTags(current.tags));
            history.put("sport", current.sport);
            history.put("sub_sport", current.subSport);
            putNullable(history, "equipment_name", current.equipmentName);
            history.put("equipment_manual", current.equipmentManual ? 1 : 0);
            db.insertOrThrow("activity_metadata_history", null, history);

            ContentValues values = new ContentValues();
            putNullable(values, "custom_title", cleanOptional(metadata.customTitle, 120));
            putNullable(values, "description", cleanOptional(metadata.description, 4000));
            putNullable(values, "personal_note", cleanOptional(metadata.personalNote, 4000));
            putNullable(values, "feeling_score", bounded(metadata.feelingScore, 1, 5));
            putNullable(values, "difficulty_score", bounded(metadata.difficultyScore, 1, 10));
            values.put("privacy", cleanPrivacy(metadata.privacy));
            values.put("tags", normalizeTags(metadata.tags));
            values.put("sport", Math.max(0, metadata.sport));
            values.put("sub_sport", Math.max(0, metadata.subSport));
            putNullable(values, "equipment_name", cleanOptional(metadata.equipmentName, 160));
            values.put("equipment_manual", 1);
            int updated = db.update("activities", values, "id = ?", new String[]{String.valueOf(activityId)});
            if (updated != 1) return false;
            db.execSQL("DELETE FROM activity_metadata_history WHERE activity_id = ? AND id NOT IN (" +
                    "SELECT id FROM activity_metadata_history WHERE activity_id = ? ORDER BY created_at_ms DESC,id DESC LIMIT 10)",
                    new Object[]{activityId, activityId});
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }

    /** Ajoute ou retire des étiquettes sur plusieurs activités en conservant l'historique. */
    public int updateActivityTagsBulk(List<Long> activityIds, String rawTags, boolean remove) {
        if (activityIds == null || activityIds.isEmpty()) return 0;
        String normalized = TagNormalizer.normalize(rawTags);
        if (normalized.isEmpty()) return 0;
        int changed = 0;
        for (Long activityId : activityIds) {
            if (activityId == null || activityId <= 0L) continue;
            ActivityRecord current = getActivity(activityId);
            if (current == null) continue;
            String updatedTags = remove
                    ? TagNormalizer.remove(current.tags, normalized)
                    : TagNormalizer.merge(current.tags, normalized);
            if (TagNormalizer.normalize(current.tags).equals(updatedTags)) continue;
            ActivityMetadata metadata = new ActivityMetadata(current.customTitle, current.description,
                    current.personalNote, current.feelingScore, current.difficultyScore,
                    current.privacy, updatedTags, current.sport, current.subSport,
                    current.equipmentName);
            if (saveActivityMetadata(activityId, metadata)) changed++;
        }
        return changed;
    }

    public boolean undoLatestMetadataEdit(long activityId) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String sql = "SELECT * FROM activity_metadata_history WHERE activity_id = ? " +
                    "AND undone_at_ms IS NULL ORDER BY created_at_ms DESC,id DESC LIMIT 1";
            try (Cursor c = db.rawQuery(sql, new String[]{String.valueOf(activityId)})) {
                if (!c.moveToFirst()) return false;
                long historyId = getLong(c, "id");
                ContentValues values = new ContentValues();
                putNullable(values, "custom_title", getString(c, "custom_title"));
                putNullable(values, "description", getString(c, "description"));
                putNullable(values, "personal_note", getString(c, "personal_note"));
                putNullable(values, "feeling_score", getNullableInt(c, "feeling_score"));
                putNullable(values, "difficulty_score", getNullableInt(c, "difficulty_score"));
                values.put("privacy", cleanPrivacy(getString(c, "privacy")));
                values.put("tags", normalizeTags(getString(c, "tags")));
                values.put("sport", getInt(c, "sport"));
                values.put("sub_sport", getInt(c, "sub_sport"));
                putNullable(values, "equipment_name", getString(c, "equipment_name"));
                values.put("equipment_manual", getInt(c, "equipment_manual"));
                if (db.update("activities", values, "id = ?", new String[]{String.valueOf(activityId)}) != 1) {
                    return false;
                }
                ContentValues undone = new ContentValues();
                undone.put("undone_at_ms", System.currentTimeMillis());
                db.update("activity_metadata_history", undone, "id = ?", new String[]{String.valueOf(historyId)});
                rebuildRecords(db);
            }
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }

    public long addActivityAttachment(long activityId, String displayName, String mimeType,
                                      String internalPath, long sizeBytes) {
        if (getActivity(activityId) == null) return -1L;
        ContentValues values = new ContentValues();
        values.put("activity_id", activityId);
        values.put("display_name", cleanOrDefault(displayName, "Pièce jointe"));
        putNullable(values, "mime_type", mimeType);
        values.put("internal_path", internalPath);
        values.put("size_bytes", Math.max(0L, sizeBytes));
        values.put("created_at_ms", System.currentTimeMillis());
        return getWritableDatabase().insert("activity_attachments", null, values);
    }

    public List<ActivityAttachment> listActivityAttachments(long activityId) {
        List<ActivityAttachment> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("activity_attachments", null,
                "activity_id = ?", new String[]{String.valueOf(activityId)}, null, null,
                "created_at_ms DESC,id DESC")) {
            while (c.moveToNext()) {
                result.add(new ActivityAttachment(getLong(c, "id"), activityId,
                        getString(c, "display_name"), getString(c, "mime_type"),
                        getString(c, "internal_path"), getLong(c, "size_bytes"),
                        getLong(c, "created_at_ms")));
            }
        }
        return result;
    }

    public ActivityAttachment getActivityAttachment(long attachmentId) {
        try (Cursor c = getReadableDatabase().query("activity_attachments", null,
                "id = ?", new String[]{String.valueOf(attachmentId)}, null, null, null, "1")) {
            return c.moveToFirst() ? new ActivityAttachment(getLong(c, "id"),
                    getLong(c, "activity_id"), getString(c, "display_name"),
                    getString(c, "mime_type"), getString(c, "internal_path"),
                    getLong(c, "size_bytes"), getLong(c, "created_at_ms")) : null;
        }
    }

    public boolean deleteActivityAttachment(long attachmentId) {
        return getWritableDatabase().delete("activity_attachments", "id = ?",
                new String[]{String.valueOf(attachmentId)}) > 0;
    }

    private static String cleanOptional(String value, int maxLength) {
        if (value == null) return null;
        String cleaned = value.trim();
        if (cleaned.isEmpty()) return null;
        return cleaned.length() > maxLength ? cleaned.substring(0, maxLength) : cleaned;
    }

    private static Integer bounded(Integer value, int min, int max) {
        if (value == null || value < min) return null;
        return Math.min(max, value);
    }

    private static String cleanPrivacy(String privacy) {
        if ("PUBLIC".equals(privacy) || "UNLISTED".equals(privacy)) return privacy;
        return "PRIVATE";
    }

    private static String normalizeTags(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "";
        String[] parts = raw.split("[,;#]");
        List<String> normalized = new ArrayList<>();
        for (String part : parts) {
            String tag = part == null ? "" : part.trim().toLowerCase(Locale.ROOT);
            if (tag.isEmpty() || normalized.contains(tag)) continue;
            normalized.add(tag.length() > 40 ? tag.substring(0, 40) : tag);
            if (normalized.size() >= 20) break;
        }
        return String.join(", ", normalized);
    }

    public List<ActivityPoint> getActivityPoints(long activityId) {
        List<ActivityPoint> result = new ArrayList<>();
        String sql = "SELECT latitude, longitude, altitude_m, distance_m, timestamp_ms, heart_rate " +
                "FROM activity_points WHERE activity_id = ? ORDER BY point_index";
        try (Cursor c = getReadableDatabase().rawQuery(sql, new String[]{String.valueOf(activityId)})) {
            while (c.moveToNext()) {
                result.add(new ActivityPoint(c.getDouble(0), c.getDouble(1),
                        c.isNull(2) ? null : c.getDouble(2),
                        c.isNull(3) ? null : c.getDouble(3),
                        c.isNull(4) ? null : c.getLong(4),
                        c.isNull(5) ? null : c.getInt(5)));
            }
        }
        return result;
    }

    /** PROFILE001 : complète la FC point par point à partir d'un FIT relu, sans toucher à la trace. */
    public int backfillActivityPointHeartRates(long activityId, List<FitActivityData.FitPoint> source) {
        if (activityId <= 0L || source == null || source.isEmpty()) return 0;
        List<ActivityPoint> stored = getActivityPoints(activityId);
        if (stored.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        int changed = 0;
        for (int i = 0; i < stored.size(); i++) {
            ActivityPoint target = stored.get(i);
            if (target.heartRate != null && target.heartRate > 0) continue;
            FitActivityData.FitPoint best = null;
            if (source.size() == stored.size()) {
                best = source.get(i);
            } else {
                long bestDelta = Long.MAX_VALUE;
                if (target.timestampMs != null) {
                    for (FitActivityData.FitPoint candidate : source) {
                        if (candidate == null || candidate.heartRate == null || candidate.timestampMs == null) continue;
                        long delta = Math.abs(candidate.timestampMs - target.timestampMs);
                        if (delta < bestDelta) { bestDelta = delta; best = candidate; }
                    }
                    if (bestDelta > 2500L) best = null;
                }
                if (best == null && target.distanceMeters != null) {
                    double bestDistance = Double.POSITIVE_INFINITY;
                    for (FitActivityData.FitPoint candidate : source) {
                        if (candidate == null || candidate.heartRate == null || candidate.distanceMeters == null) continue;
                        double delta = Math.abs(candidate.distanceMeters - target.distanceMeters);
                        if (delta < bestDistance) { bestDistance = delta; best = candidate; }
                    }
                    if (bestDistance > 8.0) best = null;
                }
            }
            if (best == null || best.heartRate == null || best.heartRate <= 0 || best.heartRate >= 260) continue;
            ContentValues values = new ContentValues();
            values.put("heart_rate", best.heartRate);
            changed += db.update("activity_points", values, "activity_id=? AND point_index=?",
                    new String[]{Long.toString(activityId), Integer.toString(i)});
        }
        return changed;
    }

    /**
     * PROFILE002 / v188 : rattrapage FC depuis toute la timeline FIT, y compris lorsque
     * certains enregistrements FC n'ont pas de coordonnées GPS. Le rapprochement se fait
     * d'abord par horodatage, puis par distance, avec des seuils assez larges pour les
     * anciennes traces simplifiées sans attribuer une FC à un point éloigné.
     */
    public int backfillActivityPointHeartRatesFromTimeline(long activityId,
                                                            List<FitActivityData.FitTimelinePoint> source) {
        if (activityId <= 0L || source == null || source.isEmpty()) return 0;
        List<ActivityPoint> stored = getActivityPoints(activityId);
        if (stored.isEmpty()) return 0;
        List<FitActivityData.FitTimelinePoint> heartRates = new ArrayList<>();
        for (FitActivityData.FitTimelinePoint point : source) {
            if (point != null && point.heartRate != null && point.heartRate > 0 && point.heartRate < 260) {
                heartRates.add(point);
            }
        }
        if (heartRates.isEmpty()) return 0;

        SQLiteDatabase db = getWritableDatabase();
        int changed = 0;
        int timeIndex = 0;
        int distanceIndex = 0;
        db.beginTransaction();
        try {
            for (int i = 0; i < stored.size(); i++) {
                ActivityPoint target = stored.get(i);
                if (target.heartRate != null && target.heartRate > 0) continue;
                FitActivityData.FitTimelinePoint best = null;

                if (target.timestampMs != null) {
                    while (timeIndex + 1 < heartRates.size()
                            && safeTime(heartRates.get(timeIndex + 1)) <= target.timestampMs) {
                        timeIndex++;
                    }
                    FitActivityData.FitTimelinePoint left = heartRates.get(timeIndex);
                    FitActivityData.FitTimelinePoint right = timeIndex + 1 < heartRates.size()
                            ? heartRates.get(timeIndex + 1) : null;
                    long leftDelta = left.timestampMs == null ? Long.MAX_VALUE
                            : Math.abs(left.timestampMs - target.timestampMs);
                    long rightDelta = right == null || right.timestampMs == null ? Long.MAX_VALUE
                            : Math.abs(right.timestampMs - target.timestampMs);
                    best = rightDelta < leftDelta ? right : left;
                    long delta = Math.min(leftDelta, rightDelta);
                    if (delta > 5_000L) best = null;
                }

                if (best == null && target.distanceMeters != null) {
                    while (distanceIndex + 1 < heartRates.size()
                            && safeDistance(heartRates.get(distanceIndex + 1)) <= target.distanceMeters) {
                        distanceIndex++;
                    }
                    FitActivityData.FitTimelinePoint left = heartRates.get(distanceIndex);
                    FitActivityData.FitTimelinePoint right = distanceIndex + 1 < heartRates.size()
                            ? heartRates.get(distanceIndex + 1) : null;
                    double leftDelta = left.distanceMeters == null ? Double.POSITIVE_INFINITY
                            : Math.abs(left.distanceMeters - target.distanceMeters);
                    double rightDelta = right == null || right.distanceMeters == null ? Double.POSITIVE_INFINITY
                            : Math.abs(right.distanceMeters - target.distanceMeters);
                    best = rightDelta < leftDelta ? right : left;
                    double delta = Math.min(leftDelta, rightDelta);
                    if (delta > 25.0) best = null;
                }

                if (best == null || best.heartRate == null) continue;
                ContentValues values = new ContentValues();
                values.put("heart_rate", best.heartRate);
                changed += db.update("activity_points", values, "activity_id=? AND point_index=?",
                        new String[]{Long.toString(activityId), Integer.toString(i)});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return changed;
    }

    private static long safeTime(FitActivityData.FitTimelinePoint point) {
        return point == null || point.timestampMs == null ? Long.MAX_VALUE : point.timestampMs;
    }

    private static double safeDistance(FitActivityData.FitTimelinePoint point) {
        return point == null || point.distanceMeters == null ? Double.POSITIVE_INFINITY : point.distanceMeters;
    }


    public ActivityQualityReport analyzeActivityQuality(long activityId) {
        ActivityRecord activity = getActivity(activityId);
        if (activity == null) return ActivityQualityEngine.analyze(null);
        List<ActivityMetricsCalculator.Point> points = toQualityPoints(getActivityPoints(activityId));
        return ActivityQualityEngine.analyze(new ActivityQualityEngine.Input(
                activity.startTimeMs, activity.elapsedTimeMs, activity.timerTimeMs,
                activity.distanceM, activity.ascentM, activity.recordCount,
                activity.gpsPointCount, activity.importSource, points));
    }

    public RecalculationPreview previewActivityRecalculation(long activityId) {
        ActivityRecord activity = getActivity(activityId);
        if (activity == null) return null;
        ActivityMetricsCalculator.Result metrics = ActivityMetricsCalculator.calculate(
                toQualityPoints(getActivityPoints(activityId)));
        return new RecalculationPreview(activity.distanceM, activity.ascentM, activity.descentM,
                metrics.distanceMeters, metrics.ascentMeters, metrics.descentMeters,
                metrics.validGpsPointCount, metrics.altitudePointCount);
    }

    public RecalculationResult recalculateActivityFromPoints(long activityId) {
        ActivityRecord before = getActivity(activityId);
        if (before == null) return new RecalculationResult(false, "Activité introuvable", null);
        RecalculationPreview preview = previewActivityRecalculation(activityId);
        if (preview == null || !preview.hasAnyCalculatedMetric()) {
            return new RecalculationResult(false,
                    "Aucune distance ou altitude exploitable dans les points enregistrés", preview);
        }

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            createActivityCorrectionSnapshot(db, activityId, "RECALCUL_POINTS_R5_3");
            ContentValues values = new ContentValues();
            if (preview.calculatedDistanceM != null && preview.calculatedDistanceM > 0.0)
                values.put("distance_m", preview.calculatedDistanceM);
            if (preview.calculatedAscentM != null)
                values.put("ascent_m", preview.calculatedAscentM);
            if (preview.calculatedDescentM != null)
                values.put("descent_m", preview.calculatedDescentM);
            values.put("gps_point_count", preview.validGpsPointCount);
            String profile = cleanOrDefault(before.importProfile, "STANDARD");
            if (!profile.contains("RECALC_R5_3")) profile += "+RECALC_R5_3";
            values.put("import_profile", profile);
            int changed = db.update("activities", values, "id = ?",
                    new String[]{String.valueOf(activityId)});
            if (changed == 0) throw new IllegalStateException("Activité introuvable pendant le recalcul");
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return new RecalculationResult(true,
                    "Distance, dénivelé et records recalculés", preview);
        } finally {
            db.endTransaction();
        }
    }

    public List<ActivitySource> listActivitySources(long activityId) {
        List<ActivitySource> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query("activity_sources", null,
                "activity_id = ?", new String[]{String.valueOf(activityId)},
                null, null, "added_at_ms DESC", "20")) {
            while (cursor.moveToNext()) {
                result.add(new ActivitySource(getLong(cursor, "id"), activityId,
                        getString(cursor, "sha256"), getString(cursor, "format"),
                        getString(cursor, "display_name"), getString(cursor, "source"),
                        getLong(cursor, "added_at_ms")));
            }
        }
        return result;
    }

    public CorrectionInfo getLatestActivityCorrection(long activityId) {
        try (Cursor cursor = getReadableDatabase().query("activity_correction_snapshots",
                new String[]{"id", "correction_type", "created_at_ms"},
                "activity_id = ? AND undone_at_ms IS NULL",
                new String[]{String.valueOf(activityId)}, null, null,
                "created_at_ms DESC, id DESC", "1")) {
            if (!cursor.moveToFirst()) return null;
            return new CorrectionInfo(cursor.getLong(0), activityId,
                    cursor.getString(1), cursor.getLong(2));
        }
    }

    public UndoCorrectionResult undoLatestActivityCorrection(long activityId) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            CorrectionInfo correction = getLatestActivityCorrection(activityId);
            if (correction == null) {
                return new UndoCorrectionResult(false, "Aucune correction à annuler");
            }
            try (Cursor snapshot = db.query("activity_correction_snapshots", null,
                    "id = ?", new String[]{String.valueOf(correction.id)},
                    null, null, null, "1")) {
                if (!snapshot.moveToFirst()) {
                    return new UndoCorrectionResult(false, "Instantané de correction introuvable");
                }
                ContentValues values = new ContentValues();
                for (String column : ACTIVITY_DATA_COLUMNS) {
                    copyCursorValue(snapshot, column, values);
                }
                int changed = db.update("activities", values, "id = ?",
                        new String[]{String.valueOf(activityId)});
                if (changed == 0) throw new IllegalStateException("Activité à restaurer introuvable");
            }
            db.delete("activity_points", "activity_id = ?",
                    new String[]{String.valueOf(activityId)});
            db.execSQL("INSERT INTO activity_points " +
                            "(activity_id, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms, heart_rate) " +
                            "SELECT ?, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms, heart_rate " +
                            "FROM activity_correction_points WHERE snapshot_id = ? ORDER BY point_index",
                    new Object[]{activityId, correction.id});
            ContentValues undone = new ContentValues();
            undone.put("undone_at_ms", System.currentTimeMillis());
            db.update("activity_correction_snapshots", undone, "id = ?",
                    new String[]{String.valueOf(correction.id)});
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return new UndoCorrectionResult(true, "Dernière correction annulée");
        } finally {
            db.endTransaction();
        }
    }

    private long createActivityCorrectionSnapshot(SQLiteDatabase db, long activityId,
                                                   String correctionType) {
        String columns = joinColumns(ACTIVITY_DATA_COLUMNS);
        db.execSQL("INSERT INTO activity_correction_snapshots " +
                        "(activity_id, correction_type, created_at_ms," + columns + ") " +
                        "SELECT id, ?, ?," + columns + " FROM activities WHERE id = ?",
                new Object[]{cleanOrDefault(correctionType, "CORRECTION"),
                        System.currentTimeMillis(), activityId});
        long snapshotId;
        try (Cursor cursor = db.rawQuery("SELECT last_insert_rowid()", null)) {
            if (!cursor.moveToFirst()) throw new IllegalStateException("Instantané non créé");
            snapshotId = cursor.getLong(0);
        }
        if (snapshotId <= 0L) throw new IllegalStateException("Instantané de correction vide");
        db.execSQL("INSERT INTO activity_correction_points " +
                        "(snapshot_id, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms, heart_rate) " +
                        "SELECT ?, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms, heart_rate " +
                        "FROM activity_points WHERE activity_id = ?",
                new Object[]{snapshotId, activityId});
        db.execSQL("DELETE FROM activity_correction_snapshots WHERE activity_id = ? AND id NOT IN (" +
                        "SELECT id FROM activity_correction_snapshots WHERE activity_id = ? " +
                        "ORDER BY created_at_ms DESC, id DESC LIMIT 5)",
                new Object[]{activityId, activityId});
        return snapshotId;
    }

    private static String joinColumns(String[] columns) {
        StringBuilder builder = new StringBuilder();
        if (columns == null) return "";
        for (String column : columns) {
            if (builder.length() > 0) builder.append(',');
            builder.append(column);
        }
        return builder.toString();
    }

    private static void copyCursorValue(Cursor cursor, String column, ContentValues values) {
        int index = cursor.getColumnIndexOrThrow(column);
        if (cursor.isNull(index)) {
            values.putNull(column);
            return;
        }
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER:
                values.put(column, cursor.getLong(index));
                break;
            case Cursor.FIELD_TYPE_FLOAT:
                values.put(column, cursor.getDouble(index));
                break;
            case Cursor.FIELD_TYPE_BLOB:
                values.put(column, cursor.getBlob(index));
                break;
            default:
                values.put(column, cursor.getString(index));
                break;
        }
    }

    private static List<ActivityMetricsCalculator.Point> toQualityPoints(List<ActivityPoint> points) {
        List<ActivityMetricsCalculator.Point> result = new ArrayList<>();
        if (points == null) return result;
        for (ActivityPoint point : points) {
            if (point == null) continue;
            result.add(new ActivityMetricsCalculator.Point(point.latitude, point.longitude,
                    point.altitudeMeters, point.distanceMeters, point.timestampMs));
        }
        return result;
    }

    /** Retourne une copie ordonnée des points d'un parcours enregistré. */
    public List<ActivityPoint> getRoutePoints(long routeId) {
        List<ActivityPoint> result = new ArrayList<>();
        String sql = "SELECT latitude, longitude, altitude_m, distance_m, timestamp_ms " +
                "FROM route_points WHERE route_id = ? ORDER BY point_index";
        try (Cursor c = getReadableDatabase().rawQuery(sql, new String[]{String.valueOf(routeId)})) {
            while (c.moveToNext()) {
                result.add(new ActivityPoint(c.getDouble(0), c.getDouble(1),
                        c.isNull(2) ? null : c.getDouble(2),
                        c.isNull(3) ? null : c.getDouble(3),
                        c.isNull(4) ? null : c.getLong(4)));
            }
        }
        return result;
    }

    public Summary getSummary() {
        String sql = "SELECT COUNT(*), COALESCE(SUM(distance_m), 0), " +
                "COALESCE(SUM(timer_time_ms), 0), COALESCE(SUM(ascent_m), 0) FROM activities WHERE deleted_at_ms IS NULL";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, null)) {
            if (cursor.moveToFirst()) {
                return new Summary(cursor.getLong(0), cursor.getDouble(1), cursor.getLong(2), cursor.getLong(3));
            }
        }
        return new Summary(0L, 0.0, 0L, 0L);
    }


    public Summary getSummaryBetween(long startInclusiveMs, long endExclusiveMs) {
        String sql = "SELECT COUNT(*), COALESCE(SUM(distance_m), 0), " +
                "COALESCE(SUM(timer_time_ms), 0), COALESCE(SUM(ascent_m), 0) " +
                "FROM activities WHERE deleted_at_ms IS NULL AND start_time_ms >= ? AND start_time_ms < ?";
        String[] args = new String[]{String.valueOf(startInclusiveMs), String.valueOf(endExclusiveMs)};
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, args)) {
            if (cursor.moveToFirst()) {
                return new Summary(cursor.getLong(0), cursor.getDouble(1), cursor.getLong(2), cursor.getLong(3));
            }
        }
        return new Summary(0L, 0.0, 0L, 0L);
    }

    /** Synthèse filtrée par discipline pour UX004. */
    public Summary getSummaryBetweenForSport(long startInclusiveMs, long endExclusiveMs, int sport) {
        List<String> clauses = new ArrayList<>();
        List<String> args = new ArrayList<>();
        clauses.add("deleted_at_ms IS NULL");
        clauses.add("start_time_ms >= ?");
        args.add(String.valueOf(startInclusiveMs));
        clauses.add("start_time_ms < ?");
        args.add(String.valueOf(endExclusiveMs));
        if (sport >= 0) {
            if (sport == 0) clauses.add("sport NOT IN (1,2,5,11,17)");
            else {
                clauses.add("sport = ?");
                args.add(String.valueOf(sport));
            }
        }
        String sql = "SELECT COUNT(*), COALESCE(SUM(distance_m), 0), " +
                "COALESCE(SUM(timer_time_ms), 0), COALESCE(SUM(ascent_m), 0) " +
                "FROM activities WHERE " + String.join(" AND ", clauses);
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, args.toArray(new String[0]))) {
            if (cursor.moveToFirst()) {
                return new Summary(cursor.getLong(0), cursor.getDouble(1),
                        cursor.getLong(2), cursor.getLong(3));
            }
        }
        return new Summary(0L, 0.0, 0L, 0L);
    }

    /** Disciplines réellement présentes dans la bibliothèque, sans doublon. */
    public List<Integer> getSportsWithActivities() {
        List<Integer> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT DISTINCT sport FROM activities WHERE deleted_at_ms IS NULL ORDER BY sport", null)) {
            while (cursor.moveToNext()) result.add(cursor.getInt(0));
        }
        return result;
    }

    public DashboardSummary getDashboardSummary(long todayStartMs, long tomorrowStartMs,
                                                long weekStartMs, long monthStartMs,
                                                long yearStartMs) {
        Summary today = getSummaryBetween(todayStartMs, tomorrowStartMs);
        Summary week = getSummaryBetween(weekStartMs, tomorrowStartMs);
        Summary month = getSummaryBetween(monthStartMs, tomorrowStartMs);
        Summary year = getSummaryBetween(yearStartMs, tomorrowStartMs);
        Summary allTime = getSummary();
        return new DashboardSummary(today, week, month, year, allTime);
    }


    private void updateRecordsForActivity(SQLiteDatabase db, long activityId, FitActivityData activity) {
        upsertRecordIfHigher(db, "distance", activityId, activity.getDistanceMeters());
        upsertRecordIfHigher(db, "duration", activityId,
                activity.getTimerTimeMillis() == null ? null : activity.getTimerTimeMillis().doubleValue());
        upsertRecordIfHigher(db, "ascent", activityId,
                activity.getTotalAscentMeters() == null ? null : activity.getTotalAscentMeters().doubleValue());
    }

    private void upsertRecordIfHigher(SQLiteDatabase db, String type, long activityId, Double value) {
        if (value == null || value <= 0.0) return;
        double current = -1.0;
        try (Cursor c = db.query("records", new String[]{"record_value"}, "record_type = ?",
                new String[]{type}, null, null, null, "1")) {
            if (c.moveToFirst()) current = c.getDouble(0);
        }
        if (value <= current) return;
        ContentValues record = new ContentValues();
        record.put("record_type", type);
        record.put("activity_id", activityId);
        record.put("record_value", value);
        record.put("updated_at_ms", System.currentTimeMillis());
        db.insertWithOnConflict("records", null, record, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private void rebuildRecords(SQLiteDatabase db) {
        db.delete("records", null, null);
        rebuildOneRecord(db, "distance", "distance_m");
        rebuildOneRecord(db, "duration", "timer_time_ms");
        rebuildOneRecord(db, "ascent", "ascent_m");
    }

    private void rebuildOneRecord(SQLiteDatabase db, String type, String column) {
        String sql = "SELECT id, " + column + " FROM activities WHERE deleted_at_ms IS NULL AND " + column +
                " IS NOT NULL AND " + column + " > 0 ORDER BY " + column + " DESC, id ASC LIMIT 1";
        try (Cursor c = db.rawQuery(sql, null)) {
            if (!c.moveToFirst()) return;
            ContentValues record = new ContentValues();
            record.put("record_type", type);
            record.put("activity_id", c.getLong(0));
            record.put("record_value", c.getDouble(1));
            record.put("updated_at_ms", System.currentTimeMillis());
            db.insertWithOnConflict("records", null, record, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    public RecordsSummary getRecordsSummary() {
        RecordEntry distance = null;
        RecordEntry duration = null;
        RecordEntry ascent = null;
        String sql = "SELECT r.record_type, r.record_value, a.id, a.file_name, a.start_time_ms, a.sport " +
                "FROM records r JOIN activities a ON a.id = r.activity_id WHERE a.deleted_at_ms IS NULL";
        try (Cursor c = getReadableDatabase().rawQuery(sql, null)) {
            while (c.moveToNext()) {
                RecordEntry entry = new RecordEntry(c.getString(0), c.getDouble(1), c.getLong(2),
                        c.getString(3), c.isNull(4) ? null : c.getLong(4), c.getInt(5));
                if ("distance".equals(entry.type)) distance = entry;
                else if ("duration".equals(entry.type)) duration = entry;
                else if ("ascent".equals(entry.type)) ascent = entry;
            }
        }
        return new RecordsSummary(distance, duration, ascent);
    }


    public ActivityBadges getActivityBadges(ActivityRecord activity) {
        if (activity == null) return new ActivityBadges(false, false, false, false, false);
        boolean distanceRecord = isRecordHolder("distance", activity.id);
        boolean durationRecord = isRecordHolder("duration", activity.id);
        boolean ascentRecord = isRecordHolder("ascent", activity.id);
        boolean monthDistance = false;
        boolean yearAscent = false;

        if (activity.startTimeMs != null) {
            Calendar start = Calendar.getInstance();
            start.setTimeInMillis(activity.startTimeMs);
            start.set(Calendar.DAY_OF_MONTH, 1);
            start.set(Calendar.HOUR_OF_DAY, 0);
            start.set(Calendar.MINUTE, 0);
            start.set(Calendar.SECOND, 0);
            start.set(Calendar.MILLISECOND, 0);
            Calendar monthEnd = (Calendar) start.clone();
            monthEnd.add(Calendar.MONTH, 1);
            monthDistance = isPeriodMaximum(activity.id, "distance_m", start.getTimeInMillis(), monthEnd.getTimeInMillis());

            start.setTimeInMillis(activity.startTimeMs);
            start.set(Calendar.MONTH, Calendar.JANUARY);
            start.set(Calendar.DAY_OF_MONTH, 1);
            start.set(Calendar.HOUR_OF_DAY, 0);
            start.set(Calendar.MINUTE, 0);
            start.set(Calendar.SECOND, 0);
            start.set(Calendar.MILLISECOND, 0);
            Calendar yearEnd = (Calendar) start.clone();
            yearEnd.add(Calendar.YEAR, 1);
            yearAscent = isPeriodMaximum(activity.id, "ascent_m", start.getTimeInMillis(), yearEnd.getTimeInMillis());
        }
        return new ActivityBadges(distanceRecord, durationRecord, ascentRecord, monthDistance, yearAscent);
    }

    private boolean isRecordHolder(String type, long activityId) {
        try (Cursor c = getReadableDatabase().query("records", new String[]{"activity_id"},
                "record_type = ?", new String[]{type}, null, null, null, "1")) {
            return c.moveToFirst() && c.getLong(0) == activityId;
        }
    }

    private boolean isPeriodMaximum(long activityId, String column, long startMs, long endMs) {
        String sql = "SELECT id FROM activities WHERE deleted_at_ms IS NULL AND start_time_ms >= ? AND start_time_ms < ? " +
                "AND " + column + " IS NOT NULL AND " + column + " > 0 " +
                "ORDER BY " + column + " DESC, id ASC LIMIT 1";
        String[] args = new String[]{String.valueOf(startMs), String.valueOf(endMs)};
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            return c.moveToFirst() && c.getLong(0) == activityId;
        }
    }

    public List<SportStats> getStatsBySport() {
        List<SportStats> result = new ArrayList<>();
        String sql = "SELECT sport, COUNT(*), COALESCE(SUM(distance_m), 0), " +
                "COALESCE(SUM(timer_time_ms), 0), COALESCE(SUM(ascent_m), 0), " +
                "COALESCE(MAX(distance_m), 0), MAX(start_time_ms) " +
                "FROM activities WHERE deleted_at_ms IS NULL GROUP BY sport ORDER BY COUNT(*) DESC, sport ASC";
        try (Cursor c = getReadableDatabase().rawQuery(sql, null)) {
            while (c.moveToNext()) {
                result.add(new SportStats(
                        c.getInt(0), c.getLong(1), c.getDouble(2), c.getLong(3),
                        c.getLong(4), c.getDouble(5), c.isNull(6) ? null : c.getLong(6)));
            }
        }
        return result;
    }

    public List<TrendPoint> getMonthlyTrends(int monthCount) {
        int count = Math.max(1, monthCount);
        List<TrendPoint> result = new ArrayList<>();
        Calendar first = Calendar.getInstance();
        first.set(Calendar.DAY_OF_MONTH, 1);
        first.set(Calendar.HOUR_OF_DAY, 0);
        first.set(Calendar.MINUTE, 0);
        first.set(Calendar.SECOND, 0);
        first.set(Calendar.MILLISECOND, 0);
        first.add(Calendar.MONTH, -(count - 1));
        SimpleDateFormat labelFormat = new SimpleDateFormat("MMM", Locale.FRANCE);

        for (int i = 0; i < count; i++) {
            Calendar start = (Calendar) first.clone();
            start.add(Calendar.MONTH, i);
            Calendar end = (Calendar) start.clone();
            end.add(Calendar.MONTH, 1);
            Summary summary = getSummaryBetween(start.getTimeInMillis(), end.getTimeInMillis());
            String label = labelFormat.format(new Date(start.getTimeInMillis())).replace(".", "");
            if (!label.isEmpty()) label = label.substring(0, 1).toUpperCase(Locale.FRANCE) + label.substring(1);
            result.add(new TrendPoint(label, start.getTimeInMillis(), summary.getActivityCount(),
                    summary.getDistanceMeters(), summary.getTimerTimeMillis(), summary.getAscentMeters()));
        }
        return result;
    }

    public List<String> getAutomaticInsights() {
        List<String> insights = new ArrayList<>();
        List<TrendPoint> months = getMonthlyTrends(3);
        if (months.size() >= 2) {
            TrendPoint previous = months.get(months.size() - 2);
            TrendPoint current = months.get(months.size() - 1);
            addVariationInsight(insights, "Le volume de distance", previous.distanceMeters, current.distanceMeters, "ce mois");
            addVariationInsight(insights, "Le dénivelé positif", previous.ascentMeters, current.ascentMeters, "ce mois");
            addVariationInsight(insights, "Le temps d’entraînement", previous.timerTimeMillis, current.timerTimeMillis, "ce mois");
        }

        String weekdaySql = "SELECT CAST(strftime('%w', start_time_ms / 1000, 'unixepoch', 'localtime') AS INTEGER), COUNT(*) " +
                "FROM activities WHERE deleted_at_ms IS NULL AND start_time_ms IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1";
        try (Cursor c = getReadableDatabase().rawQuery(weekdaySql, null)) {
            if (c.moveToFirst() && c.getLong(1) > 0) {
                String[] days = {"dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"};
                int day = Math.max(0, Math.min(6, c.getInt(0)));
                insights.add("Ton jour d’entraînement le plus fréquent est le " + days[day] + " (" + c.getLong(1) + " activités).");
            }
        }

        List<SportStats> sports = getStatsBySport();
        if (!sports.isEmpty()) {
            SportStats main = sports.get(0);
            insights.add("Le sport le plus présent dans ton historique représente " + main.activityCount + " activités et " +
                    String.format(Locale.FRANCE, "%.2f km", main.distanceMeters / 1000.0) + ".");
        }

        String latestSql = "SELECT id, distance_m, ascent_m FROM activities WHERE deleted_at_ms IS NULL ORDER BY COALESCE(start_time_ms, imported_at_ms) DESC LIMIT 1";
        try (Cursor c = getReadableDatabase().rawQuery(latestSql, null)) {
            if (c.moveToFirst()) {
                long id = c.getLong(0);
                double distance = c.isNull(1) ? 0.0 : c.getDouble(1);
                int ascent = c.isNull(2) ? 0 : c.getInt(2);
                long harder = 0;
                try (Cursor r = getReadableDatabase().rawQuery(
                        "SELECT COUNT(*) FROM activities WHERE deleted_at_ms IS NULL AND (COALESCE(distance_m,0) + COALESCE(ascent_m,0) * 10.0) > ?",
                        new String[]{String.valueOf(distance + ascent * 10.0)})) {
                    if (r.moveToFirst()) harder = r.getLong(0);
                }
                insights.add("Ta dernière activité se classe environ " + (harder + 1) + "e par difficulté combinée (distance + D+).");
            }
        }
        return insights;
    }

    private void addVariationInsight(List<String> insights, String label, double previous, double current, String periodLabel) {
        if (previous <= 0.0 && current <= 0.0) return;
        if (previous <= 0.0) {
            insights.add(label + " démarre " + periodLabel + " avec une nouvelle valeur mesurable.");
            return;
        }
        double percent = ((current - previous) / previous) * 100.0;
        if (Math.abs(percent) < 1.0) {
            insights.add(label + " est stable " + periodLabel + " par rapport au mois précédent.");
        } else {
            insights.add(label + " est en " + (percent > 0 ? "hausse" : "baisse") + " de " +
                    String.format(Locale.FRANCE, "%.0f %%", Math.abs(percent)) + " " + periodLabel + " par rapport au mois précédent.");
        }
    }

    public List<ActivityRecord> searchActivities(String query, int sportFilter, int limit) {
        return searchActivitiesAdvanced(query, sportFilter, null, null, null, null, null, null, limit).activities;
    }

    public SearchResult searchActivitiesAdvanced(String query, int sportFilter,
                                                  Long startInclusiveMs, Long endExclusiveMs,
                                                  Double minDistanceM, Double maxDistanceM,
                                                  Integer minAscentM, Long minDurationMs,
                                                  int limit) {
        List<ActivityRecord> result = new ArrayList<>();
        String normalized = query == null ? "" : query.trim();
        List<String> clauses = new ArrayList<>();
        clauses.add("deleted_at_ms IS NULL");
        List<String> argList = new ArrayList<>();

        if (!normalized.isEmpty()) {
            clauses.add("(LOWER(file_name) LIKE ? OR LOWER(COALESCE(custom_title,'')) LIKE ? OR " +
                    "LOWER(COALESCE(description,'')) LIKE ? OR LOWER(COALESCE(personal_note,'')) LIKE ? OR " +
                    "LOWER(COALESCE(tags,'')) LIKE ? OR LOWER(product_name) LIKE ? OR LOWER(import_source) LIKE ? OR " +
                    "LOWER(COALESCE(equipment_name,'')) LIKE ? OR LOWER(COALESCE(manufacturer,'')) LIKE ? OR " +
                    "LOWER(COALESCE(import_profile,'')) LIKE ? OR LOWER(COALESCE(split_reason,'')) LIKE ? OR " +
                    "CAST(sport AS TEXT) = ? OR CAST(start_time_ms AS TEXT) LIKE ?)");
            String like = "%" + normalized.toLowerCase(Locale.ROOT) + "%";
            for (int i = 0; i < 11; i++) argList.add(like);
            argList.add(normalized); argList.add(like);
        }
        if (sportFilter >= 0) { clauses.add("sport = ?"); argList.add(String.valueOf(sportFilter)); }
        else if (sportFilter == -2) clauses.add("sport NOT IN (1, 2, 5, 11, 17)");
        if (startInclusiveMs != null) { clauses.add("start_time_ms >= ?"); argList.add(String.valueOf(startInclusiveMs)); }
        if (endExclusiveMs != null) { clauses.add("start_time_ms < ?"); argList.add(String.valueOf(endExclusiveMs)); }
        if (minDistanceM != null) { clauses.add("distance_m >= ?"); argList.add(String.valueOf(minDistanceM)); }
        if (maxDistanceM != null) { clauses.add("distance_m <= ?"); argList.add(String.valueOf(maxDistanceM)); }
        if (minAscentM != null) { clauses.add("ascent_m >= ?"); argList.add(String.valueOf(minAscentM)); }
        if (minDurationMs != null) { clauses.add("timer_time_ms >= ?"); argList.add(String.valueOf(minDurationMs)); }

        String selection = clauses.isEmpty() ? null : String.join(" AND ", clauses);
        String[] args = argList.isEmpty() ? null : argList.toArray(new String[0]);
        String[] columns = new String[]{
                "id", "sha256", "file_name", "sport", "sub_sport", "start_time_ms",
                "elapsed_time_ms", "timer_time_ms", "distance_m", "calories", "ascent_m",
                "descent_m", "avg_hr", "max_hr", "avg_cadence", "manufacturer", "product_id",
                "product_name", "import_source", "source_file_sha256", "segment_index",
                "segment_count", "split_reason", "equipment_name", "equipment_manual",
                "import_profile", "file_size_bytes", "protocol_major", "protocol_minor",
                "profile_version", "record_count", "gps_point_count", "imported_at_ms",
                "custom_title", "description", "personal_note", "feeling_score",
                "difficulty_score", "privacy", "tags"
        };
        try (Cursor c = getReadableDatabase().query("activities", columns, selection, args,
                null, null, "COALESCE(start_time_ms, imported_at_ms) DESC, id DESC",
                String.valueOf(Math.max(1, limit)))) {
            while (c.moveToNext()) result.add(readRecord(c));
        }

        String where = selection == null ? "" : " WHERE " + selection;
        Summary summary = new Summary(0L, 0.0, 0L, 0L);
        String sql = "SELECT COUNT(*), COALESCE(SUM(distance_m),0), COALESCE(SUM(timer_time_ms),0), " +
                "COALESCE(SUM(ascent_m),0) FROM activities" + where;
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            if (c.moveToFirst()) summary = new Summary(c.getLong(0), c.getDouble(1), c.getLong(2), c.getLong(3));
        }
        return new SearchResult(result, summary);
    }


    public LibraryPage searchLibrary(LibraryQuery request) {
        LibraryQuery query = request == null ? new LibraryQuery() : request;
        List<String> clauses = new ArrayList<>();
        List<String> args = new ArrayList<>();
        clauses.add(query.trashMode ? "deleted_at_ms IS NOT NULL" : "deleted_at_ms IS NULL");

        String normalized = normalizeSearchText(cleanOrDefault(query.text, ""));
        if (!normalized.isEmpty()) {
            String[] searchableFields = new String[]{
                    "file_name", "custom_title", "description", "personal_note", "tags",
                    "product_name", "import_source", "equipment_name", "manufacturer",
                    "import_profile", "split_reason"
            };
            for (String token : normalized.split("\\s+")) {
                if (token == null || token.trim().isEmpty()) continue;
                String cleanToken = token.trim();
                List<String> tokenClauses = new ArrayList<>();
                for (String field : searchableFields) {
                    tokenClauses.add(foldSearchSql(field) + " LIKE ?");
                    args.add("%" + cleanToken + "%");
                }
                tokenClauses.add("CAST(sport AS TEXT) = ?");
                args.add(cleanToken);
                clauses.add("(" + String.join(" OR ", tokenClauses) + ")");
            }
        }
        if (query.sportFilter >= 0) {
            clauses.add("sport = ?"); args.add(String.valueOf(query.sportFilter));
        } else if (query.sportFilter == -2) {
            clauses.add("sport NOT IN (1,2,5,11,17)");
        }
        if (query.startInclusiveMs != null) { clauses.add("start_time_ms >= ?"); args.add(String.valueOf(query.startInclusiveMs)); }
        if (query.endExclusiveMs != null) { clauses.add("start_time_ms < ?"); args.add(String.valueOf(query.endExclusiveMs)); }
        if (query.minDistanceM != null) { clauses.add("distance_m >= ?"); args.add(String.valueOf(query.minDistanceM)); }
        if (query.maxDistanceM != null) { clauses.add("distance_m <= ?"); args.add(String.valueOf(query.maxDistanceM)); }
        if (query.minAscentM != null) { clauses.add("ascent_m >= ?"); args.add(String.valueOf(query.minAscentM)); }
        if (query.minDurationMs != null) { clauses.add("timer_time_ms >= ?"); args.add(String.valueOf(query.minDurationMs)); }
        if (query.yearFilter != null && query.yearFilter > 0) {
            Calendar yearStart = Calendar.getInstance();
            yearStart.clear();
            yearStart.set(Calendar.YEAR, query.yearFilter);
            Calendar nextYear = (Calendar) yearStart.clone();
            nextYear.add(Calendar.YEAR, 1);
            clauses.add("start_time_ms >= ? AND start_time_ms < ?");
            args.add(String.valueOf(yearStart.getTimeInMillis()));
            args.add(String.valueOf(nextYear.getTimeInMillis()));
        }
        if (query.untaggedOnly) {
            clauses.add("TRIM(COALESCE(tags,'')) = ''");
        } else if (query.tagsCsv != null && !query.tagsCsv.trim().isEmpty()) {
            List<String> tagClauses = new ArrayList<>();
            for (String rawTag : query.tagsCsv.split(",")) {
                String tag = rawTag == null ? "" : rawTag.trim().toLowerCase(Locale.ROOT);
                if (tag.isEmpty()) continue;
                tagClauses.add("(',' || LOWER(REPLACE(COALESCE(tags,''), ', ', ',')) || ',') LIKE ?");
                args.add("%," + tag + ",%");
            }
            if (!tagClauses.isEmpty()) {
                clauses.add("(" + String.join(query.matchAllTags ? " AND " : " OR ", tagClauses) + ")");
            }
        }
        if (query.nightOnly) {
            clauses.add("start_time_ms IS NOT NULL AND (" +
                    "CAST(strftime('%H', start_time_ms / 1000, 'unixepoch', 'localtime') AS INTEGER) >= 21 " +
                    "OR CAST(strftime('%H', start_time_ms / 1000, 'unixepoch', 'localtime') AS INTEGER) < 6)");
        }
        if (query.sourceText != null && !query.sourceText.trim().isEmpty()) {
            clauses.add(foldSearchSql("import_source") + " LIKE ?");
            args.add("%" + normalizeSearchText(query.sourceText) + "%");
        }
        if (query.equipmentText != null && !query.equipmentText.trim().isEmpty()) {
            clauses.add(foldSearchSql("equipment_name") + " LIKE ?");
            args.add("%" + normalizeSearchText(query.equipmentText) + "%");
        }
        if (query.landmarkCodes != null && !query.landmarkCodes.trim().isEmpty()) {
            List<String> landmarkCodes = new ArrayList<>();
            for (String rawCode : query.landmarkCodes.split(";")) {
                String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
                if (!code.isEmpty() && !landmarkCodes.contains(code)) landmarkCodes.add(code);
            }
            if (!landmarkCodes.isEmpty()) {
                List<String> placeholders = new ArrayList<>();
                for (String code : landmarkCodes) {
                    placeholders.add("?");
                    args.add(code);
                }
                clauses.add("EXISTS (SELECT 1 FROM activity_landmarks al " +
                        "WHERE al.activity_id=activities.id AND al.occurrences>0 " +
                        "AND UPPER(al.landmark_code) IN (" + String.join(",", placeholders) + "))");
            }
        } else if (query.ascentLandmarkOnly) {
            clauses.add("EXISTS (SELECT 1 FROM activity_landmarks al " +
                    "JOIN personal_landmarks pl ON pl.code=al.landmark_code " +
                    "WHERE al.activity_id=activities.id AND al.occurrences>0 " +
                    "AND LOWER(pl.landmark_type)='ascension')");
        } else if (query.landmarkCode != null && !query.landmarkCode.trim().isEmpty()) {
            clauses.add("EXISTS (SELECT 1 FROM activity_landmarks al " +
                    "WHERE al.activity_id=activities.id AND al.occurrences>0 AND al.landmark_code=?)");
            args.add(query.landmarkCode.trim().toUpperCase(Locale.ROOT));
        }

        String selection = String.join(" AND ", clauses);
        String[] selectionArgs = args.toArray(new String[0]);
        String orderBy = libraryOrderBy(query.sortKey);
        int pageSize = Math.max(1, Math.min(100, query.limit));
        int offset = Math.max(0, query.offset);
        String limit = offset + "," + pageSize;
        String[] columns = new String[]{
                "id", "sha256", "file_name", "sport", "sub_sport", "start_time_ms",
                "elapsed_time_ms", "timer_time_ms", "distance_m", "calories", "ascent_m",
                "descent_m", "avg_hr", "max_hr", "avg_cadence", "manufacturer", "product_id",
                "product_name", "import_source", "source_file_sha256", "segment_index",
                "segment_count", "split_reason", "equipment_name", "equipment_manual",
                "import_profile", "file_size_bytes", "protocol_major", "protocol_minor",
                "profile_version", "record_count", "gps_point_count", "imported_at_ms",
                "custom_title", "description", "personal_note", "feeling_score",
                "difficulty_score", "privacy", "tags"
        };
        List<ActivityRecord> rows = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("activities", columns, selection, selectionArgs,
                null, null, orderBy, limit)) {
            while (c.moveToNext()) rows.add(readRecord(c));
        }

        Summary summary = new Summary(0L, 0.0, 0L, 0L);
        String aggregate = "SELECT COUNT(*),COALESCE(SUM(distance_m),0)," +
                "COALESCE(SUM(timer_time_ms),0),COALESCE(SUM(ascent_m),0) FROM activities WHERE " + selection;
        try (Cursor c = getReadableDatabase().rawQuery(aggregate, selectionArgs)) {
            if (c.moveToFirst()) summary = new Summary(c.getLong(0), c.getDouble(1), c.getLong(2), c.getLong(3));
        }
        return new LibraryPage(rows, summary, offset, pageSize, query.trashMode);
    }


    private static String normalizeSearchText(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replace('’', '\'')
                .trim();
    }

    private static String foldSearchSql(String field) {
        String sql = "lower(coalesce(" + field + ", ''))";
        final String[][] replacements = new String[][]{
                {"à", "a"}, {"â", "a"}, {"ä", "a"}, {"ç", "c"},
                {"é", "e"}, {"è", "e"}, {"ê", "e"}, {"ë", "e"},
                {"î", "i"}, {"ï", "i"}, {"ô", "o"}, {"ö", "o"},
                {"ù", "u"}, {"û", "u"}, {"ü", "u"}, {"ÿ", "y"}
        };
        for (String[] replacement : replacements) {
            sql = "replace(" + sql + ", '" + replacement[0] + "', '" + replacement[1] + "')";
        }
        return sql;
    }

    private static String libraryOrderBy(String sortKey) {
        if ("DATE_ASC".equals(sortKey)) return "COALESCE(start_time_ms,imported_at_ms) ASC,id ASC";
        if ("DISTANCE_DESC".equals(sortKey)) return "COALESCE(distance_m,0) DESC,COALESCE(start_time_ms,imported_at_ms) DESC";
        if ("DURATION_DESC".equals(sortKey)) return "COALESCE(timer_time_ms,0) DESC,COALESCE(start_time_ms,imported_at_ms) DESC";
        if ("ASCENT_DESC".equals(sortKey)) return "COALESCE(ascent_m,0) DESC,COALESCE(start_time_ms,imported_at_ms) DESC";
        if ("SPORT_ASC".equals(sortKey)) return "sport ASC,COALESCE(start_time_ms,imported_at_ms) DESC";
        if ("SOURCE_ASC".equals(sortKey)) return "LOWER(COALESCE(import_source,'')) ASC,COALESCE(start_time_ms,imported_at_ms) DESC";
        if ("EQUIPMENT_ASC".equals(sortKey)) return "LOWER(COALESCE(equipment_name,'')) ASC,COALESCE(start_time_ms,imported_at_ms) DESC";
        return "COALESCE(start_time_ms,imported_at_ms) DESC,id DESC";
    }

    public int setActivitiesTrashed(List<Long> activityIds, boolean trashed) {
        if (activityIds == null || activityIds.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        int changed = 0;
        try {
            ContentValues values = new ContentValues();
            if (trashed) values.put("deleted_at_ms", System.currentTimeMillis());
            else values.putNull("deleted_at_ms");
            for (Long id : activityIds) {
                if (id != null) changed += db.update("activities", values, "id = ?", new String[]{String.valueOf(id)});
            }
            rebuildRecords(db);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return changed;
    }

    public int deleteTrashedActivitiesPermanently(List<Long> activityIds) {
        return deleteActivitiesPermanentlyInternal(activityIds, true);
    }

    /** Suppression directe depuis la fiche activité, avec mémorisation côté Strava. */
    public int deleteActivitiesPermanently(List<Long> activityIds) {
        return deleteActivitiesPermanentlyInternal(activityIds, false);
    }

    private int deleteActivitiesPermanentlyInternal(List<Long> activityIds, boolean requireTrashed) {
        if (activityIds == null || activityIds.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        int deleted = 0;
        try {
            for (Long id : activityIds) {
                if (id == null) continue;
                // Si l'activité provient de Strava, conserver un tombstone avant la
                // suppression locale. Sinon la prochaine synchro la recréerait.
                ContentValues tombstone = new ContentValues();
                tombstone.put("sync_status", "SUPPRIMEE");
                tombstone.putNull("local_activity_id");
                tombstone.putNull("last_error");
                tombstone.put("updated_at_ms", System.currentTimeMillis());
                db.update("strava_activity_index", tombstone, "local_activity_id = ?",
                        new String[]{String.valueOf(id)});

                String where = requireTrashed
                        ? "id = ? AND deleted_at_ms IS NOT NULL" : "id = ?";
                deleted += db.delete("activities", where, new String[]{String.valueOf(id)});
            }
            rebuildRecords(db);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return deleted;
    }

    public static final class LibraryQuery {
        public String text = "";
        public int sportFilter = -1;
        public Long startInclusiveMs;
        public Long endExclusiveMs;
        public Double minDistanceM;
        public Double maxDistanceM;
        public Integer minAscentM;
        public Long minDurationMs;
        public String sourceText = "";
        public String equipmentText = "";
        public String landmarkCode = "";
        public String landmarkCodes = "";
        public boolean ascentLandmarkOnly = false;
        public String tagsCsv = "";
        public boolean matchAllTags = false;
        public Integer yearFilter;
        public boolean nightOnly = false;
        public boolean untaggedOnly = false;
        public String sortKey = "DATE_DESC";
        public int limit = 30;
        public int offset = 0;
        public boolean trashMode = false;
    }

    public static final class LibraryPage {
        public final List<ActivityRecord> activities;
        public final Summary summary;
        public final int offset;
        public final int pageSize;
        public final boolean trashMode;
        LibraryPage(List<ActivityRecord> activities, Summary summary, int offset, int pageSize, boolean trashMode) {
            this.activities = activities; this.summary = summary; this.offset = offset;
            this.pageSize = pageSize; this.trashMode = trashMode;
        }
    }


    /**
     * Records de référence calculés à partir des moyennes de l'activité complète.
     * Le temps équivalent est projeté au seuil choisi; il ne s'agit pas d'un split GPS.
     */
    public List<ReferenceRecord> getReferenceRecords() {
        List<ReferenceRecord> result = new ArrayList<>();
        double[] distanceTargets = new double[]{1000.0, 5000.0, 10000.0, 21097.5, 42195.0, 50000.0, 100000.0};
        String[] distanceLabels = new String[]{"1 km", "5 km", "10 km", "Semi-marathon", "Marathon", "50 km", "100 km"};
        for (int i = 0; i < distanceTargets.length; i++) {
            ReferenceRecord r = findDistanceReference(distanceLabels[i], distanceTargets[i]);
            if (r != null) result.add(r);
        }
        int[] ascentTargets = new int[]{500, 1000, 2000, 5000, 10000};
        for (int target : ascentTargets) {
            ReferenceRecord r = findAscentReference(String.format(Locale.FRANCE, "%,d m D+", target), target);
            if (r != null) result.add(r);
        }
        return result;
    }

    private ReferenceRecord findDistanceReference(String label, double targetMeters) {
        String sql = "SELECT id, file_name, start_time_ms, sport, distance_m, timer_time_ms, " +
                "(timer_time_ms * ? / distance_m) AS equivalent_ms " +
                "FROM activities WHERE deleted_at_ms IS NULL AND sport IN (1,11,17) AND distance_m >= ? " +
                "AND timer_time_ms IS NOT NULL AND timer_time_ms > 0 " +
                "ORDER BY equivalent_ms ASC, id ASC LIMIT 1";
        String[] args = new String[]{String.valueOf(targetMeters), String.valueOf(targetMeters)};
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            if (!c.moveToFirst()) return null;
            return new ReferenceRecord("distance", label, targetMeters, c.getLong(0), c.getString(1),
                    c.isNull(2) ? null : c.getLong(2), c.getInt(3), c.getDouble(4),
                    c.getLong(5), Math.round(c.getDouble(6)));
        }
    }

    private ReferenceRecord findAscentReference(String label, int targetMeters) {
        String sql = "SELECT id, file_name, start_time_ms, sport, ascent_m, timer_time_ms, " +
                "(timer_time_ms * ? / ascent_m) AS equivalent_ms " +
                "FROM activities WHERE deleted_at_ms IS NULL AND sport IN (1,2,11,17,21,22) AND ascent_m >= ? " +
                "AND timer_time_ms IS NOT NULL AND timer_time_ms > 0 " +
                "ORDER BY equivalent_ms ASC, id ASC LIMIT 1";
        String[] args = new String[]{String.valueOf(targetMeters), String.valueOf(targetMeters)};
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            if (!c.moveToFirst()) return null;
            return new ReferenceRecord("ascent", label, targetMeters, c.getLong(0), c.getString(1),
                    c.isNull(2) ? null : c.getLong(2), c.getInt(3), c.getDouble(4),
                    c.getLong(5), Math.round(c.getDouble(6)));
        }
    }

    /** Crée un parcours et retourne son identifiant local. */
    public long createRoute(Route route) {
        if (route == null) throw new IllegalArgumentException("Le parcours est obligatoire");
        long now = System.currentTimeMillis();
        ContentValues values = routeValues(route, now, now);
        long id = getWritableDatabase().insertOrThrow("routes", null, values);
        return id;
    }


    /** Crée un parcours en recopiant les données et les points GPS d'une activité existante. */
    public long createRouteFromActivity(long activityId, String name, String description, String routeType, boolean favorite, String tags) {
        ActivityRecord activity = getActivity(activityId);
        if (activity == null) throw new IllegalArgumentException("Activité introuvable");

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            int pointCount = 0;
            try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM activity_points WHERE activity_id = ?",
                    new String[]{String.valueOf(activityId)})) {
                if (c.moveToFirst()) pointCount = c.getInt(0);
            }

            Route route = new Route(0L, name, description, routeType, activityId,
                    activity.distanceM == null ? 0.0 : activity.distanceM,
                    activity.ascentM == null ? 0.0 : activity.ascentM.doubleValue(), pointCount,
                    favorite, tags == null ? "" : tags.trim(), 0L, 0L,
                    "ACTIVITY", activity.fileName, null, System.currentTimeMillis());
            long now = System.currentTimeMillis();
            long routeId = db.insertOrThrow("routes", null, routeValues(route, now, now));

            db.execSQL(
                    "INSERT INTO route_points(route_id, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms) " +
                            "SELECT ?, point_index, latitude, longitude, altitude_m, distance_m, timestamp_ms " +
                            "FROM activity_points WHERE activity_id = ? ORDER BY point_index",
                    new Object[]{routeId, activityId});
            db.setTransactionSuccessful();
            return routeId;
        } finally {
            db.endTransaction();
        }
    }


    /** Crée un nouveau parcours autonome à partir d'une liste ordonnée de points GPS. */
    public long createRouteFromPoints(String name, String description, String routeType,
                                      boolean favorite, String tags, List<ActivityPoint> sourcePoints) {
        if (sourcePoints == null || sourcePoints.size() < 2) {
            throw new IllegalArgumentException("Au moins deux points GPS sont nécessaires");
        }
        List<ActivityPoint> points = normalizeRoutePoints(sourcePoints);
        double distance = points.get(points.size() - 1).distanceMeters == null
                ? 0.0 : points.get(points.size() - 1).distanceMeters;
        double ascent = calculateAscent(points);
        Route route = new Route(0L, name, description, routeType, null,
                distance, ascent, points.size(), favorite, tags, 0L, 0L,
                "DERIVED", null, null, System.currentTimeMillis());

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            long now = System.currentTimeMillis();
            long routeId = db.insertOrThrow("routes", null, routeValues(route, now, now));
            insertRoutePoints(db, routeId, points);
            db.setTransactionSuccessful();
            return routeId;
        } finally {
            db.endTransaction();
        }
    }

    /** Importe un GPX comme parcours, séparé des activités réalisées. */
    public long createRouteFromGpx(String name, String description, String routeType,
                                   boolean favorite, String tags, String sourceName,
                                   String sourceSha256, List<ActivityPoint> sourcePoints,
                                   List<RouteWaypoint> sourceWaypoints) {
        if (sourceSha256 == null || sourceSha256.trim().isEmpty()) {
            throw new IllegalArgumentException("Empreinte GPX absente");
        }
        Long existing = findRouteBySourceSha256(sourceSha256);
        if (existing != null) throw new IllegalStateException("Ce fichier GPX est déjà importé");

        if (sourcePoints == null || sourcePoints.size() < 2) {
            throw new IllegalArgumentException("Trace GPX insuffisante");
        }
        List<ActivityPoint> points = normalizeRoutePoints(sourcePoints);
        if (points.size() < 2) throw new IllegalArgumentException("Trace GPX insuffisante");
        double distance = points.get(points.size() - 1).distanceMeters == null
                ? 0.0 : points.get(points.size() - 1).distanceMeters;
        double ascent = calculateAscent(points);
        long now = System.currentTimeMillis();
        Route route = new Route(0L, name, description, routeType, null,
                distance, ascent, points.size(), favorite, tags, 0L, 0L,
                "GPX", sourceName, sourceSha256.trim(), now);

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            long routeId = db.insertOrThrow("routes", null, routeValues(route, now, now));
            insertRoutePoints(db, routeId, points);
            if (sourceWaypoints != null) {
                int position = 0;
                for (RouteWaypoint waypoint : sourceWaypoints) {
                    insertRouteWaypoint(db, RouteWaypoint.draft(routeId, position++,
                            waypoint.name, waypoint.description, waypoint.waypointType,
                            waypoint.latitude, waypoint.longitude, waypoint.altitudeMeters,
                            waypoint.distanceMeters, waypoint.cutoffTimeMs, "GPX"));
                }
            }
            db.setTransactionSuccessful();
            return routeId;
        } finally {
            db.endTransaction();
        }
    }

    public Long findRouteBySourceSha256(String sourceSha256) {
        if (sourceSha256 == null || sourceSha256.trim().isEmpty()) return null;
        try (Cursor cursor = getReadableDatabase().query("routes", new String[]{"id"},
                "source_sha256 = ?", new String[]{sourceSha256.trim()},
                null, null, null, "1")) {
            return cursor.moveToFirst() ? cursor.getLong(0) : null;
        }
    }

    private void insertRoutePoints(SQLiteDatabase db, long routeId, List<ActivityPoint> points) {
        for (int i = 0; i < points.size(); i++) {
            ActivityPoint point = points.get(i);
            ContentValues values = new ContentValues();
            values.put("route_id", routeId);
            values.put("point_index", i);
            values.put("latitude", point.latitude);
            values.put("longitude", point.longitude);
            putNullable(values, "altitude_m", point.altitudeMeters);
            putNullable(values, "distance_m", point.distanceMeters);
            putNullable(values, "timestamp_ms", point.timestampMs);
            db.insertOrThrow("route_points", null, values);
        }
    }

    /** Recalcule les distances cumulées pour rendre tout parcours dérivé cohérent. */
    private List<ActivityPoint> normalizeRoutePoints(List<ActivityPoint> source) {
        List<ActivityPoint> result = new ArrayList<>();
        double cumulative = 0.0;
        ActivityPoint previous = null;
        for (ActivityPoint p : source) {
            if (previous != null) cumulative += haversineMeters(previous.latitude, previous.longitude, p.latitude, p.longitude);
            result.add(new ActivityPoint(p.latitude, p.longitude, p.altitudeMeters, cumulative, p.timestampMs));
            previous = p;
        }
        return result;
    }

    private double calculateAscent(List<ActivityPoint> points) {
        double ascent = 0.0;
        Double previous = null;
        for (ActivityPoint p : points) {
            if (p.altitudeMeters != null) {
                if (previous != null && p.altitudeMeters > previous) ascent += p.altitudeMeters - previous;
                previous = p.altitudeMeters;
            }
        }
        return ascent;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double radius = 6371000.0;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return radius * 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
    }

    public List<RouteWaypoint> listRouteWaypoints(long routeId) {
        List<RouteWaypoint> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query("route_waypoints", null,
                "route_id = ?", new String[]{String.valueOf(routeId)}, null, null,
                "position ASC, COALESCE(distance_m,0) ASC, id ASC")) {
            while (cursor.moveToNext()) result.add(readRouteWaypoint(cursor));
        }
        return result;
    }

    public long addRouteWaypoint(RouteWaypoint waypoint) {
        if (waypoint == null || waypoint.routeId <= 0L) {
            throw new IllegalArgumentException("Repère de parcours invalide");
        }
        if (getRoute(waypoint.routeId) == null) {
            throw new IllegalArgumentException("Parcours introuvable");
        }
        return insertRouteWaypoint(getWritableDatabase(), waypoint);
    }

    private long insertRouteWaypoint(SQLiteDatabase db, RouteWaypoint waypoint) {
        ContentValues values = new ContentValues();
        values.put("route_id", waypoint.routeId);
        values.put("position", Math.max(0, waypoint.position));
        values.put("name", cleanOrDefault(waypoint.name, "Repère"));
        putNullable(values, "description", cleanOptional(waypoint.description, 500));
        values.put("waypoint_type", cleanOrDefault(waypoint.waypointType, "Autre"));
        values.put("latitude", waypoint.latitude);
        values.put("longitude", waypoint.longitude);
        putNullable(values, "altitude_m", waypoint.altitudeMeters);
        putNullable(values, "distance_m", waypoint.distanceMeters);
        putNullable(values, "cutoff_time_ms", waypoint.cutoffTimeMs);
        values.put("source", cleanOrDefault(waypoint.source, "MANUAL"));
        values.put("created_at_ms", System.currentTimeMillis());
        return db.insertOrThrow("route_waypoints", null, values);
    }

    public boolean deleteRouteWaypoint(long waypointId) {
        return getWritableDatabase().delete("route_waypoints", "id = ?",
                new String[]{String.valueOf(waypointId)}) > 0;
    }

    private RouteWaypoint readRouteWaypoint(Cursor cursor) {
        return new RouteWaypoint(getLong(cursor, "id"), getLong(cursor, "route_id"),
                getInt(cursor, "position"), getString(cursor, "name"),
                getString(cursor, "description"), getString(cursor, "waypoint_type"),
                getNullableDouble(cursor, "latitude") == null ? 0.0 : getNullableDouble(cursor, "latitude"),
                getNullableDouble(cursor, "longitude") == null ? 0.0 : getNullableDouble(cursor, "longitude"),
                getNullableDouble(cursor, "altitude_m"), getNullableDouble(cursor, "distance_m"),
                getNullableLong(cursor, "cutoff_time_ms"), getString(cursor, "source"));
    }

    public List<ActivityRecord> getRecentGpsActivities(int limit) {
        List<ActivityRecord> result = new ArrayList<>();
        String[] columns = new String[]{
                "id", "sha256", "file_name", "sport", "sub_sport", "start_time_ms",
                "elapsed_time_ms", "timer_time_ms", "distance_m", "calories", "ascent_m",
                "descent_m", "avg_hr", "max_hr", "avg_cadence", "manufacturer", "product_id",
                "product_name", "import_source", "source_file_sha256", "segment_index",
                "segment_count", "split_reason", "equipment_name", "equipment_manual",
                "import_profile", "file_size_bytes", "protocol_major", "protocol_minor",
                "profile_version", "record_count", "gps_point_count", "imported_at_ms",
                "custom_title", "description", "personal_note", "feeling_score",
                "difficulty_score", "privacy", "tags"
        };
        try (Cursor cursor = getReadableDatabase().query("activities", columns,
                "deleted_at_ms IS NULL AND gps_point_count > 1", null, null, null,
                "COALESCE(start_time_ms, imported_at_ms) DESC, id DESC",
                String.valueOf(Math.max(1, Math.min(200, limit))))) {
            while (cursor.moveToNext()) result.add(readRecord(cursor));
        }
        return result;
    }

    /** Met à jour un parcours existant. */
    public boolean updateRoute(Route route) {
        if (route == null || route.id <= 0L) return false;
        Route existing = getRoute(route.id);
        if (existing == null) return false;
        ContentValues values = routeValues(route, existing.createdAtMs, System.currentTimeMillis());
        return getWritableDatabase().update("routes", values, "id = ?",
                new String[]{String.valueOf(route.id)}) > 0;
    }

    /** Supprime un parcours. Les futures tables de points pourront utiliser ON DELETE CASCADE. */
    public boolean deleteRoute(long routeId) {
        return getWritableDatabase().delete("routes", "id = ?",
                new String[]{String.valueOf(routeId)}) > 0;
    }

    public Route getRoute(long routeId) {
        try (Cursor c = getReadableDatabase().query("routes", null, "id = ?",
                new String[]{String.valueOf(routeId)}, null, null, null, "1")) {
            return c.moveToFirst() ? readRoute(c) : null;
        }
    }

    /** Retourne les parcours, favoris d'abord, avec recherche facultative. */
    public List<Route> getRoutes() {
        return searchRoutes("", false);
    }

    public List<Route> searchRoutes(String query, boolean favoritesOnly) {
        List<Route> routes = new ArrayList<>();
        String q = query == null ? "" : query.trim();
        String selection = null;
        List<String> args = new ArrayList<>();
        if (!q.isEmpty()) {
            selection = "(name LIKE ? OR description LIKE ? OR tags LIKE ? OR source_name LIKE ?)";
            String like = "%" + q + "%";
            args.add(like); args.add(like); args.add(like); args.add(like);
        }
        if (favoritesOnly) {
            selection = selection == null ? "is_favorite = 1" : selection + " AND is_favorite = 1";
        }
        try (Cursor c = getReadableDatabase().query("routes", null, selection,
                args.isEmpty() ? null : args.toArray(new String[0]), null, null,
                "is_favorite DESC, updated_at_ms DESC, id DESC")) {
            while (c.moveToNext()) routes.add(readRoute(c));
        }
        return routes;
    }

    public boolean setRouteFavorite(long routeId, boolean favorite) {
        ContentValues values = new ContentValues();
        values.put("is_favorite", favorite ? 1 : 0);
        values.put("updated_at_ms", System.currentTimeMillis());
        return getWritableDatabase().update("routes", values, "id = ?",
                new String[]{String.valueOf(routeId)}) > 0;
    }

    private ContentValues routeValues(Route route, long createdAtMs, long updatedAtMs) {
        String name = route.name == null ? "" : route.name.trim();
        if (name.isEmpty()) throw new IllegalArgumentException("Le nom du parcours est obligatoire");
        ContentValues values = new ContentValues();
        values.put("name", name);
        putNullable(values, "description", route.description);
        values.put("route_type", route.routeType == null || route.routeType.trim().isEmpty()
                ? "standard" : route.routeType.trim());
        putNullable(values, "source_activity_id", route.sourceActivityId);
        values.put("distance_m", Math.max(0.0, route.distanceMeters));
        values.put("ascent_m", Math.max(0.0, route.ascentMeters));
        values.put("point_count", Math.max(0, route.pointCount));
        values.put("is_favorite", route.favorite ? 1 : 0);
        values.put("tags", route.tags == null ? "" : route.tags.trim());
        values.put("source_type", cleanOrDefault(route.sourceType,
                route.sourceActivityId == null ? "MANUAL" : "ACTIVITY"));
        putNullable(values, "source_name", cleanOptional(route.sourceName, 300));
        putNullable(values, "source_sha256", cleanOptional(route.sourceSha256, 80));
        putNullable(values, "imported_at_ms", route.importedAtMs);
        values.put("created_at_ms", createdAtMs);
        values.put("updated_at_ms", updatedAtMs);
        return values;
    }

    private Route readRoute(Cursor c) {
        return new Route(
                getLong(c, "id"),
                getString(c, "name"),
                getString(c, "description"),
                getString(c, "route_type"),
                getNullableLong(c, "source_activity_id"),
                getNullableDouble(c, "distance_m") == null ? 0.0 : getNullableDouble(c, "distance_m"),
                getNullableDouble(c, "ascent_m") == null ? 0.0 : getNullableDouble(c, "ascent_m"),
                getInt(c, "point_count"),
                getInt(c, "is_favorite") == 1,
                getString(c, "tags"),
                getLong(c, "created_at_ms"),
                getLong(c, "updated_at_ms"),
                getString(c, "source_type"),
                getString(c, "source_name"),
                getString(c, "source_sha256"),
                getNullableLong(c, "imported_at_ms")
        );
    }

    // ---------------------------------------------------------------------
    // IMPORT004 - boîte d'import universelle et fusion locale
    // ---------------------------------------------------------------------

    public boolean isUniversalDocumentQueued(String documentUri, long sizeBytes, long lastModifiedMs) {
        try (Cursor c = getReadableDatabase().query("import_document_index",
                new String[]{"size_bytes", "last_modified_ms"}, "document_uri = ?",
                new String[]{documentUri}, null, null, null, "1")) {
            if (!c.moveToFirst()) return false;
            long storedSize = c.getLong(0);
            long storedModified = c.getLong(1);
            return sizeBytes >= 0 && lastModifiedMs >= 0 && storedSize == sizeBytes
                    && storedModified == lastModifiedMs;
        }
    }

    public void recordUniversalDocument(String documentUri, String displayName,
                                        long sizeBytes, long lastModifiedMs, String status) {
        ContentValues values = new ContentValues();
        values.put("document_uri", cleanOrDefault(documentUri, ""));
        values.put("display_name", cleanOrDefault(displayName, "Fichier sportif"));
        values.put("size_bytes", sizeBytes);
        values.put("last_modified_ms", lastModifiedMs);
        values.put("status", cleanOrDefault(status, "QUEUED"));
        values.put("updated_at_ms", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("import_document_index", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    public long enqueueInboxItem(String localPath,
                                 String originalUri,
                                 String displayName,
                                 String format,
                                 String mimeType,
                                 String source) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("local_path", cleanOrDefault(localPath, ""));
        values.put("original_uri", cleanOrDefault(originalUri, ""));
        values.put("display_name", cleanOrDefault(displayName, "Fichier sportif"));
        values.put("format", cleanOrDefault(format, "UNKNOWN"));
        values.put("mime_type", cleanOrDefault(mimeType, ""));
        values.put("source", cleanOrDefault(source, "Partage Android"));
        values.put("status", INBOX_PENDING);
        values.put("received_at_ms", now);
        values.put("updated_at_ms", now);
        long id = getWritableDatabase().insertWithOnConflict(
                "import_inbox_items", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (id != -1L) return id;
        try (Cursor c = getReadableDatabase().query("import_inbox_items", new String[]{"id"},
                "local_path = ?", new String[]{localPath}, null, null, null, "1")) {
            return c.moveToFirst() ? c.getLong(0) : -1L;
        }
    }

    public InboxItem getInboxItem(long id) {
        try (Cursor c = getReadableDatabase().query("import_inbox_items", null, "id = ?",
                new String[]{String.valueOf(id)}, null, null, null, "1")) {
            return c.moveToFirst() ? readInboxItem(c) : null;
        }
    }

    public List<InboxItem> getInboxItems(int limit) {
        List<InboxItem> result = new ArrayList<>();
        String order = "CASE status WHEN 'CONFLICT' THEN 0 WHEN 'ERROR' THEN 1 " +
                "WHEN 'PENDING' THEN 2 WHEN 'READY' THEN 3 ELSE 4 END, received_at_ms DESC";
        try (Cursor c = getReadableDatabase().query("import_inbox_items", null, null, null,
                null, null, order, String.valueOf(Math.max(1, limit)))) {
            while (c.moveToNext()) result.add(readInboxItem(c));
        }
        return result;
    }

    public int countActiveInboxItems() {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM import_inbox_items WHERE status IN (?,?,?,?)",
                new String[]{INBOX_PENDING, INBOX_READY, INBOX_CONFLICT, INBOX_ERROR})) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    public void updateInboxItem(long id,
                                String status,
                                String reason,
                                String sha256,
                                Long candidateActivityId,
                                Long localActivityId,
                                boolean incrementRetry) {
        ContentValues values = new ContentValues();
        values.put("status", cleanOrDefault(status, INBOX_ERROR));
        putNullable(values, "reason", reason);
        putNullable(values, "sha256", sha256);
        putNullable(values, "candidate_activity_id", candidateActivityId);
        putNullable(values, "local_activity_id", localActivityId);
        values.put("updated_at_ms", System.currentTimeMillis());
        if (incrementRetry) {
            getWritableDatabase().execSQL(
                    "UPDATE import_inbox_items SET retry_count = retry_count + 1 WHERE id = ?",
                    new Object[]{id});
        }
        getWritableDatabase().update("import_inbox_items", values, "id = ?",
                new String[]{String.valueOf(id)});
    }

    public void forgetUniversalDocument(String documentUri) {
        if (documentUri == null || documentUri.trim().isEmpty()) return;
        getWritableDatabase().delete("import_document_index", "document_uri = ?",
                new String[]{documentUri});
    }

    public void deleteInboxItem(long id) {
        getWritableDatabase().delete("import_inbox_items", "id = ?",
                new String[]{String.valueOf(id)});
    }

    public void clearCompletedInboxItems() {
        getWritableDatabase().delete("import_inbox_items",
                "status IN (?,?,?,?)", new String[]{INBOX_IMPORTED, INBOX_DUPLICATE,
                        INBOX_IGNORED, INBOX_EXPANDED});
    }

    public void recordActivitySource(long activityId, String sha256, String format,
                                     String displayName, String source) {
        recordActivitySourceInternal(getWritableDatabase(), activityId, sha256,
                format, displayName, source);
    }

    private void recordActivitySourceInternal(SQLiteDatabase db, long activityId, String sha256,
                                              String format, String displayName, String source) {
        ContentValues values = new ContentValues();
        values.put("activity_id", activityId);
        putNullable(values, "sha256", sha256);
        values.put("format", cleanOrDefault(format, "UNKNOWN"));
        values.put("display_name", cleanOrDefault(displayName, "Fichier sportif"));
        values.put("source", cleanOrDefault(source, "Source inconnue"));
        values.put("added_at_ms", System.currentTimeMillis());
        db.insertWithOnConflict("activity_sources", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    public ImportResult replaceActivity(long activityId,
                                        String fileName,
                                        FitActivityData activity,
                                        String source,
                                        ImportMetadata metadata) {
        SQLiteDatabase db = getWritableDatabase();
        ImportMetadata safe = metadata == null ? ImportMetadata.standard(activity) : metadata;
        db.beginTransaction();
        try {
            createActivityCorrectionSnapshot(db, activityId, "REPLACE_IMPORT");
            ContentValues values = activityValues(fileName, activity, source, safe);
            int changed = db.update("activities", values, "id = ?",
                    new String[]{String.valueOf(activityId)});
            if (changed == 0) throw new IllegalStateException("Activité à remplacer introuvable");
            db.delete("activity_points", "activity_id = ?", new String[]{String.valueOf(activityId)});
            insertActivityPoints(db, activityId, activity.getPoints());
            recordActivitySourceInternal(db, activityId, activity.getSha256(), safe.importProfile,
                    fileName, source);
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return new ImportResult(activityId, false);
        } finally {
            db.endTransaction();
        }
    }

    public ImportResult mergeActivity(long activityId,
                                      String fileName,
                                      FitActivityData incoming,
                                      String source,
                                      ImportMetadata metadata) {
        ActivityRecord current = getActivity(activityId);
        if (current == null) throw new IllegalStateException("Activité à fusionner introuvable");
        ImportMetadata safe = metadata == null ? ImportMetadata.standard(incoming) : metadata;
        int currentPriority = ActivitySourcePriority.rank(current.importSource,
                current.manufacturer, current.importProfile, current.fileName);
        int incomingPriority = ActivitySourcePriority.rank(source,
                incoming.getManufacturer(), safe.importProfile, fileName);
        boolean incomingWins = ActivitySourcePriority.shouldReplace(currentPriority, incomingPriority);
        boolean protectOriginal = ActivitySourcePriority.protectsOriginalFromStrava(
                currentPriority, incomingPriority);

        SQLiteDatabase db = getWritableDatabase();
        int storedAltitudePointCount = countStoredAltitudePoints(db, activityId);
        int incomingAltitudePointCount = countIncomingAltitudePoints(incoming.getPoints());
        db.beginTransaction();
        try {
            createActivityCorrectionSnapshot(db, activityId, "MERGE_IMPORT");
            ContentValues values = new ContentValues();

            if (incomingWins) {
                values.put("sport", incoming.getSport());
                values.put("sub_sport", incoming.getSubSport());
                putNullable(values, "start_time_ms", incoming.getStartTimeEpochMillis());
                putNullable(values, "elapsed_time_ms", incoming.getElapsedTimeMillis());
                putNullable(values, "timer_time_ms", incoming.getTimerTimeMillis());
                putNullable(values, "distance_m", incoming.getDistanceMeters());
                putNullable(values, "calories", incoming.getCalories());
                putNullable(values, "ascent_m", incoming.getTotalAscentMeters());
                putNullable(values, "descent_m", incoming.getTotalDescentMeters());
                putNullable(values, "avg_hr", incoming.getAverageHeartRate());
                putNullable(values, "max_hr", incoming.getMaximumHeartRate());
                putNullable(values, "avg_cadence", incoming.getAverageCadence());
                putNullable(values, "manufacturer", incoming.getManufacturer());
                putNullable(values, "product_id", incoming.getProductId());
                putNullable(values, "product_name", incoming.getProductName());
                values.put("import_profile", cleanOrDefault(safe.importProfile, "IMPORT004_MERGED"));
            } else if (!protectOriginal) {
                if (current.startTimeMs == null && incoming.getStartTimeEpochMillis() != null)
                    values.put("start_time_ms", incoming.getStartTimeEpochMillis());
                if (current.elapsedTimeMs == null && incoming.getElapsedTimeMillis() != null)
                    values.put("elapsed_time_ms", incoming.getElapsedTimeMillis());
                if (current.timerTimeMs == null && incoming.getTimerTimeMillis() != null)
                    values.put("timer_time_ms", incoming.getTimerTimeMillis());
                if (incoming.getDistanceMeters() != null && (current.distanceM == null
                        || incoming.getGpsPointCount() > current.gpsPointCount))
                    values.put("distance_m", incoming.getDistanceMeters());
                if (current.calories == null && incoming.getCalories() != null)
                    values.put("calories", incoming.getCalories());
                if (incoming.getTotalAscentMeters() != null && (current.ascentM == null
                        || incoming.getTotalAscentMeters() > current.ascentM))
                    values.put("ascent_m", incoming.getTotalAscentMeters());
                if (incoming.getTotalDescentMeters() != null && (current.descentM == null
                        || incoming.getTotalDescentMeters() > current.descentM))
                    values.put("descent_m", incoming.getTotalDescentMeters());
                if (current.avgHr == null && incoming.getAverageHeartRate() != null)
                    values.put("avg_hr", incoming.getAverageHeartRate());
                if (current.maxHr == null && incoming.getMaximumHeartRate() != null)
                    values.put("max_hr", incoming.getMaximumHeartRate());
                if (current.avgCadence == null && incoming.getAverageCadence() != null)
                    values.put("avg_cadence", incoming.getAverageCadence());
                if (current.manufacturer == null && incoming.getManufacturer() != null)
                    values.put("manufacturer", incoming.getManufacturer());
                if (current.productId == null && incoming.getProductId() != null)
                    values.put("product_id", incoming.getProductId());
                if (current.productName == null && incoming.getProductName() != null)
                    values.put("product_name", incoming.getProductName());
            }

            values.put("record_count", Math.max(current.recordCount, incoming.getRecordCount()));
            values.put("gps_point_count", Math.max(current.gpsPointCount, incoming.getGpsPointCount()));
            values.put("file_size_bytes", Math.max(current.fileSizeBytes, incoming.getFileSizeBytes()));
            String mergedSource = cleanOrDefault(current.importSource, "Source inconnue");
            String newSource = cleanOrDefault(source, "Source inconnue");
            if (!mergedSource.toLowerCase(Locale.ROOT).contains(newSource.toLowerCase(Locale.ROOT)))
                mergedSource += " + " + newSource;
            values.put("import_source", mergedSource);
            if (!incomingWins && !values.containsKey("import_profile")) {
                values.put("import_profile", cleanOrDefault(current.importProfile, "IMPORT004_MERGED"));
            }
            db.update("activities", values, "id = ?", new String[]{String.valueOf(activityId)});

            boolean betterGpsCoverage = incoming.getGpsPointCount() > current.gpsPointCount;
            boolean betterAltitudeCoverage = incomingAltitudePointCount > storedAltitudePointCount;
            boolean replacePoints = incomingWins || (!protectOriginal
                    && (betterGpsCoverage || betterAltitudeCoverage));
            if (replacePoints && incoming.getPoints() != null && !incoming.getPoints().isEmpty()) {
                db.delete("activity_points", "activity_id = ?", new String[]{String.valueOf(activityId)});
                insertActivityPoints(db, activityId, incoming.getPoints());
            }
            recordActivitySourceInternal(db, activityId, incoming.getSha256(), safe.importProfile,
                    fileName, source);
            rebuildRecords(db);
            db.setTransactionSuccessful();
            return new ImportResult(activityId, false);
        } finally {
            db.endTransaction();
        }
    }

    private int countStoredAltitudePoints(SQLiteDatabase db, long activityId) {
        try (Cursor cursor = db.rawQuery(
                "SELECT COUNT(*) FROM activity_points WHERE activity_id = ? AND altitude_m IS NOT NULL",
                new String[]{String.valueOf(activityId)})) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private int countIncomingAltitudePoints(List<FitActivityData.FitPoint> points) {
        if (points == null) return 0;
        int count = 0;
        for (FitActivityData.FitPoint point : points) {
            if (point != null && point.altitudeMeters != null
                    && !Double.isNaN(point.altitudeMeters)
                    && !Double.isInfinite(point.altitudeMeters)) {
                count++;
            }
        }
        return count;
    }

    private ContentValues activityValues(String fileName, FitActivityData activity,
                                         String importSource, ImportMetadata metadata) {
        ContentValues values = new ContentValues();
        values.put("sha256", activity.getSha256());
        values.put("file_name", cleanOrDefault(fileName, "Fichier sportif"));
        values.put("sport", activity.getSport());
        values.put("sub_sport", activity.getSubSport());
        putNullable(values, "start_time_ms", activity.getStartTimeEpochMillis());
        putNullable(values, "elapsed_time_ms", activity.getElapsedTimeMillis());
        putNullable(values, "timer_time_ms", activity.getTimerTimeMillis());
        putNullable(values, "distance_m", activity.getDistanceMeters());
        putNullable(values, "calories", activity.getCalories());
        putNullable(values, "ascent_m", activity.getTotalAscentMeters());
        putNullable(values, "descent_m", activity.getTotalDescentMeters());
        putNullable(values, "avg_hr", activity.getAverageHeartRate());
        putNullable(values, "max_hr", activity.getMaximumHeartRate());
        putNullable(values, "avg_cadence", activity.getAverageCadence());
        putNullable(values, "manufacturer", activity.getManufacturer());
        putNullable(values, "product_id", activity.getProductId());
        putNullable(values, "product_name", activity.getProductName());
        values.put("import_source", cleanOrDefault(importSource, "Source inconnue"));
        putNullable(values, "source_file_sha256", metadata.sourceFileSha256);
        values.put("segment_index", metadata.segmentIndex);
        values.put("segment_count", metadata.segmentCount);
        putNullable(values, "split_reason", metadata.splitReason);
        putNullable(values, "equipment_name", metadata.equipmentName);
        values.put("equipment_manual", metadata.equipmentManual ? 1 : 0);
        values.put("import_profile", cleanOrDefault(metadata.importProfile, "IMPORT004"));
        values.put("file_size_bytes", activity.getFileSizeBytes());
        values.put("protocol_major", activity.getProtocolVersionMajor());
        values.put("protocol_minor", activity.getProtocolVersionMinor());
        values.put("profile_version", activity.getProfileVersion());
        values.put("record_count", activity.getRecordCount());
        values.put("gps_point_count", activity.getGpsPointCount());
        values.put("imported_at_ms", System.currentTimeMillis());
        return values;
    }

    private void insertActivityPoints(SQLiteDatabase db, long activityId,
                                      List<FitActivityData.FitPoint> points) {
        if (points == null) return;
        int index = 0;
        for (FitActivityData.FitPoint point : points) {
            ContentValues values = new ContentValues();
            values.put("activity_id", activityId);
            values.put("point_index", index++);
            values.put("latitude", point.latitude);
            values.put("longitude", point.longitude);
            putNullable(values, "altitude_m", point.altitudeMeters);
            putNullable(values, "distance_m", point.distanceMeters);
            putNullable(values, "timestamp_ms", point.timestampMs);
            putNullable(values, "heart_rate", point.heartRate);
            db.insertOrThrow("activity_points", null, values);
        }
    }

    private InboxItem readInboxItem(Cursor c) {
        return new InboxItem(getLong(c, "id"), getString(c, "local_path"),
                getString(c, "original_uri"), getString(c, "display_name"),
                getString(c, "format"), getString(c, "mime_type"), getString(c, "source"),
                getString(c, "status"), getString(c, "reason"), getString(c, "sha256"),
                getNullableLong(c, "candidate_activity_id"), getNullableLong(c, "local_activity_id"),
                getLong(c, "received_at_ms"), getLong(c, "updated_at_ms"), getInt(c, "retry_count"));
    }

    public void beginStravaUpload(long localActivityId, String externalId) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        int previousAttempts = 0;
        long createdAt = now;
        try (Cursor cursor = db.query("strava_upload_queue",
                new String[]{"attempt_count", "created_at_ms"},
                "local_activity_id = ?", new String[]{String.valueOf(localActivityId)},
                null, null, null, "1")) {
            if (cursor.moveToFirst()) {
                previousAttempts = cursor.getInt(0);
                createdAt = cursor.getLong(1);
            }
        }
        ContentValues values = new ContentValues();
        values.put("local_activity_id", localActivityId);
        values.putNull("upload_id");
        values.putNull("strava_activity_id");
        values.put("external_id", cleanOrDefault(externalId, activityCode(localActivityId)));
        values.put("status", STRAVA_UPLOAD_QUEUED);
        values.putNull("last_error");
        values.put("attempt_count", previousAttempts + 1);
        values.put("created_at_ms", createdAt);
        values.put("updated_at_ms", now);
        values.putNull("completed_at_ms");
        db.insertWithOnConflict("strava_upload_queue", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public void updateStravaUpload(long localActivityId, Long uploadId, Long stravaActivityId,
                                   String status, String lastError, boolean completed) {
        ContentValues values = new ContentValues();
        putNullable(values, "upload_id", uploadId);
        putNullable(values, "strava_activity_id", stravaActivityId);
        values.put("status", cleanOrDefault(status, STRAVA_UPLOAD_ERROR));
        putNullable(values, "last_error", lastError);
        values.put("updated_at_ms", System.currentTimeMillis());
        if (completed) values.put("completed_at_ms", System.currentTimeMillis());
        else values.putNull("completed_at_ms");
        int rows = getWritableDatabase().update("strava_upload_queue", values,
                "local_activity_id = ?", new String[]{String.valueOf(localActivityId)});
        if (rows == 0) {
            beginStravaUpload(localActivityId, activityCode(localActivityId));
            getWritableDatabase().update("strava_upload_queue", values,
                    "local_activity_id = ?", new String[]{String.valueOf(localActivityId)});
        }
    }

    public void linkStravaActivity(long localActivityId, long stravaActivityId, String name,
                                   String sportType, boolean trainer, boolean commute) {
        ActivityRecord activity = getActivity(localActivityId);
        if (activity == null || stravaActivityId <= 0L) return;
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("strava_activity_id", stravaActivityId);
        values.put("name", cleanOrDefault(name, activity.getCode()));
        values.put("sport_type", cleanOrDefault(sportType, "Unknown"));
        values.put("start_time_ms", activity.startTimeMs == null ? 0L : activity.startTimeMs);
        values.put("distance_m", activity.distanceM == null ? 0.0 : activity.distanceM);
        values.put("moving_time_ms", activity.timerTimeMs == null ? 0L : activity.timerTimeMs);
        values.put("elapsed_time_ms", activity.elapsedTimeMs == null ? 0L : activity.elapsedTimeMs);
        values.put("elevation_gain_m", activity.ascentM == null ? 0.0 : activity.ascentM.doubleValue());
        values.put("trainer", trainer ? 1 : 0);
        values.put("commute", commute ? 1 : 0);
        values.put("sync_status", "EXPORTEE");
        values.put("local_activity_id", localActivityId);
        values.putNull("last_error");
        values.put("discovered_at_ms", now);
        values.put("updated_at_ms", now);
        getWritableDatabase().insertWithOnConflict("strava_activity_index", null,
                values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public StravaUploadRecord getStravaUpload(long localActivityId) {
        try (Cursor cursor = getReadableDatabase().query("strava_upload_queue", null,
                "local_activity_id = ?", new String[]{String.valueOf(localActivityId)},
                null, null, null, "1")) {
            return cursor.moveToFirst() ? readStravaUpload(cursor) : null;
        }
    }

    public List<StravaUploadRecord> listRecentStravaUploads(int limit) {
        List<StravaUploadRecord> result = new ArrayList<>();
        int safeLimit = Math.max(1, Math.min(200, limit));
        try (Cursor cursor = getReadableDatabase().query("strava_upload_queue", null,
                null, null, null, null, "updated_at_ms DESC", String.valueOf(safeLimit))) {
            while (cursor.moveToNext()) result.add(readStravaUpload(cursor));
        }
        return result;
    }

    private StravaUploadRecord readStravaUpload(Cursor cursor) {
        return new StravaUploadRecord(getLong(cursor, "local_activity_id"),
                getNullableLong(cursor, "upload_id"),
                getNullableLong(cursor, "strava_activity_id"),
                getString(cursor, "external_id"), getString(cursor, "status"),
                getString(cursor, "last_error"), getInt(cursor, "attempt_count"),
                getLong(cursor, "created_at_ms"), getLong(cursor, "updated_at_ms"),
                getNullableLong(cursor, "completed_at_ms"));
    }

    /** Activités importées depuis une date, utile pour les notifications Strava détaillées. */
    public List<ActivityRecord> listActivitiesImportedSince(long sinceMs, String source) {
        List<ActivityRecord> result = new ArrayList<>();
        String selection = "deleted_at_ms IS NULL AND imported_at_ms>=?";
        List<String> args = new ArrayList<>();
        args.add(String.valueOf(Math.max(0L, sinceMs)));
        if (source != null && !source.trim().isEmpty()) {
            selection += " AND lower(import_source)=lower(?)";
            args.add(source.trim());
        }
        try (Cursor c = getReadableDatabase().query("activities", null, selection,
                args.toArray(new String[0]), null, null, "imported_at_ms ASC,id ASC")) {
            while (c.moveToNext()) result.add(readRecord(c));
        }
        return result;
    }

    public ActivityRecord getActivity(long id) {
        try (Cursor c = getReadableDatabase().query("activities", null, "id = ?",
                new String[]{String.valueOf(id)}, null, null, null, "1")) {
            return c.moveToFirst() ? readRecord(c) : null;
        }
    }

    /** EQUIP006 : toutes les activités actives, ordre chronologique, pour l'export CSV temporaire. */
    public List<ActivityRecord> listActivitiesForEquipmentCsv() {
        List<ActivityRecord> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("activities", null,
                "deleted_at_ms IS NULL", null, null, null,
                "COALESCE(start_time_ms,imported_at_ms) ASC,id ASC")) {
            while (c.moveToNext()) result.add(readRecord(c));
        }
        return result;
    }

    /** EQUIP006 : applique en une transaction les associations validées par le CSV. */
    public int applyManualEquipmentAssignments(Map<Long, String> assignments) {
        if (assignments == null || assignments.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        boolean ownsTransaction = !db.inTransaction();
        if (ownsTransaction) db.beginTransaction();
        int changed = 0;
        try {
            for (Map.Entry<Long, String> entry : assignments.entrySet()) {
                if (entry == null || entry.getKey() == null) continue;
                String equipment = entry.getValue() == null ? "" : entry.getValue().trim();
                if (equipment.isEmpty()) continue;
                ContentValues values = new ContentValues();
                values.put("equipment_name", equipment);
                values.put("equipment_manual", 1);
                changed += db.update("activities", values,
                        "id=? AND deleted_at_ms IS NULL",
                        new String[]{String.valueOf(entry.getKey())});
            }
            if (ownsTransaction) db.setTransactionSuccessful();
            return changed;
        } finally {
            if (ownsTransaction) db.endTransaction();
        }
    }

    /** Activités immédiatement plus ancienne et plus récente dans l'ordre chronologique global. */
    public ActivityNeighbors getActivityNeighbors(long activityId) {
        long orderTime;
        try (Cursor current = getReadableDatabase().rawQuery(
                "SELECT COALESCE(start_time_ms,imported_at_ms) FROM activities "
                        + "WHERE id=? AND deleted_at_ms IS NULL LIMIT 1",
                new String[]{String.valueOf(activityId)})) {
            if (!current.moveToFirst()) return new ActivityNeighbors(null, null);
            orderTime = current.getLong(0);
        }
        Long older = adjacentActivityId(activityId, orderTime, false);
        Long newer = adjacentActivityId(activityId, orderTime, true);
        return new ActivityNeighbors(older, newer);
    }

    private Long adjacentActivityId(long activityId, long orderTime, boolean newer) {
        String comparator = newer ? ">" : "<";
        String idComparator = newer ? ">" : "<";
        String direction = newer ? "ASC" : "DESC";
        // rawQuery(String[]) lie les paramètres comme TEXT. Sans CAST explicite, SQLite peut
        // comparer un INTEGER de date à un TEXT par classe de stockage : toute date numérique
        // devient alors "<" au paramètre texte. Symptôme observé : la flèche gauche renvoyait
        // systématiquement vers l'activité la plus récente et la flèche droite restait grisée.
        String sql = "SELECT id FROM activities WHERE deleted_at_ms IS NULL AND ("
                + "COALESCE(start_time_ms,imported_at_ms) " + comparator + " CAST(? AS INTEGER) OR ("
                + "COALESCE(start_time_ms,imported_at_ms)=CAST(? AS INTEGER) AND id "
                + idComparator + " CAST(? AS INTEGER))) "
                + "ORDER BY COALESCE(start_time_ms,imported_at_ms) " + direction
                + ", id " + direction + " LIMIT 1";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, new String[]{
                String.valueOf(orderTime), String.valueOf(orderTime), String.valueOf(activityId)})) {
            return cursor.moveToFirst() ? cursor.getLong(0) : null;
        }
    }

    public static final class ActivityNeighbors {
        public final Long olderActivityId;
        public final Long newerActivityId;
        public ActivityNeighbors(Long olderActivityId, Long newerActivityId) {
            this.olderActivityId = olderActivityId;
            this.newerActivityId = newerActivityId;
        }
    }

    private ActivityRecord readRecord(Cursor c) {
        return new ActivityRecord(
                getLong(c, "id"), getString(c, "sha256"), getString(c, "file_name"),
                getInt(c, "sport"), getInt(c, "sub_sport"), getNullableLong(c, "start_time_ms"),
                getNullableLong(c, "elapsed_time_ms"), getNullableLong(c, "timer_time_ms"),
                getNullableDouble(c, "distance_m"), getNullableInt(c, "calories"),
                getNullableInt(c, "ascent_m"), getNullableInt(c, "descent_m"),
                getNullableInt(c, "avg_hr"), getNullableInt(c, "max_hr"),
                getNullableInt(c, "avg_cadence"), getString(c, "manufacturer"),
                getNullableInt(c, "product_id"), getString(c, "product_name"),
                getString(c, "import_source"), getString(c, "source_file_sha256"),
                getInt(c, "segment_index"), getInt(c, "segment_count"),
                getString(c, "split_reason"), getString(c, "equipment_name"),
                getInt(c, "equipment_manual") == 1, getString(c, "import_profile"),
                getLong(c, "file_size_bytes"), getInt(c, "protocol_major"),
                getInt(c, "protocol_minor"), getInt(c, "profile_version"),
                getInt(c, "record_count"), getInt(c, "gps_point_count"),
                getLong(c, "imported_at_ms"), getString(c, "custom_title"),
                getString(c, "description"), getString(c, "personal_note"),
                getNullableInt(c, "feeling_score"), getNullableInt(c, "difficulty_score"),
                getString(c, "privacy"), getString(c, "tags")
        );
    }

    private static long getLong(Cursor c, String name) { return c.getLong(c.getColumnIndexOrThrow(name)); }
    private static int getInt(Cursor c, String name) { return c.getInt(c.getColumnIndexOrThrow(name)); }
    private static String getString(Cursor c, String name) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? null : c.getString(i);
    }
    private static Long getNullableLong(Cursor c, String name) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? null : c.getLong(i);
    }
    private static Integer getNullableInt(Cursor c, String name) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? null : c.getInt(i);
    }
    private static Double getNullableDouble(Cursor c, String name) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? null : c.getDouble(i);
    }

    public static String activityCode(long id) {
        return String.format(Locale.ROOT, "ACT%010d", id);
    }

    private static String cleanOrDefault(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        return value.trim();
    }

    private static void putNullable(ContentValues v, String k, Long x) { if (x == null) v.putNull(k); else v.put(k, x); }
    private static void putNullable(ContentValues v, String k, Integer x) { if (x == null) v.putNull(k); else v.put(k, x); }
    private static void putNullable(ContentValues v, String k, Double x) { if (x == null) v.putNull(k); else v.put(k, x); }
    private static void putNullable(ContentValues v, String k, String x) { if (x == null || x.trim().isEmpty()) v.putNull(k); else v.put(k, x); }


    // ---------------------------------------------------------------------
    // Sprint E - inventaire et cycle de vie du matériel
    // ---------------------------------------------------------------------

    public void saveEquipment(Equipment equipment) {
        ContentValues v = equipmentValues(equipment);
        SQLiteDatabase db = getWritableDatabase();
        int updated = db.update("equipment", v, "id = ?", new String[]{equipment.getId()});
        if (updated == 0) db.insertOrThrow("equipment", null, v);
    }

    public Equipment getEquipment(String id) {
        try (Cursor c = getReadableDatabase().query("equipment", null, "id = ?",
                new String[]{id}, null, null, null, "1")) {
            return c.moveToFirst() ? readEquipment(c) : null;
        }
    }

    public List<Equipment> getAllEquipment() {
        List<Equipment> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("equipment", null, null, null, null, null,
                "status ASC, updated_at_ms DESC")) {
            while (c.moveToNext()) result.add(readEquipment(c));
        }
        return result;
    }

    public void deleteEquipment(String id) {
        getWritableDatabase().delete("equipment", "id = ?", new String[]{id});
    }

    public long addEquipmentEvent(EquipmentEvent event) {
        ContentValues v = new ContentValues();
        v.put("equipment_id", event.getEquipmentId());
        v.put("event_type", event.getType().name());
        v.put("event_at_ms", event.getEventAtMs());
        v.put("title", event.getTitle());
        v.put("details", event.getDetails());
        putNullable(v, "cost", event.getCost());
        return getWritableDatabase().insertOrThrow("equipment_events", null, v);
    }

    public List<EquipmentEvent> getEquipmentEvents(String equipmentId) {
        List<EquipmentEvent> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("equipment_events", null, "equipment_id = ?",
                new String[]{equipmentId}, null, null, "event_at_ms DESC, id DESC")) {
            while (c.moveToNext()) {
                result.add(new EquipmentEvent(
                        c.getLong(c.getColumnIndexOrThrow("id")),
                        c.getString(c.getColumnIndexOrThrow("equipment_id")),
                        EquipmentEventType.valueOf(c.getString(c.getColumnIndexOrThrow("event_type"))),
                        c.getLong(c.getColumnIndexOrThrow("event_at_ms")),
                        c.getString(c.getColumnIndexOrThrow("title")),
                        c.getString(c.getColumnIndexOrThrow("details")),
                        c.isNull(c.getColumnIndexOrThrow("cost")) ? null : c.getDouble(c.getColumnIndexOrThrow("cost"))));
            }
        }
        return result;
    }

    /** Activités réelles ayant utilisé cet équipement depuis la date indiquée. */
    public List<EquipmentUsageSample> getEquipmentUsageSamples(String equipmentId, long sinceMs) {
        List<EquipmentUsageSample> result = new ArrayList<>();
        Equipment equipment = getEquipment(equipmentId);
        if (equipment == null) return result;
        String sql = "SELECT COALESCE(start_time_ms,imported_at_ms), " +
                "COALESCE(distance_m,0), COALESCE(NULLIF(timer_time_ms,0),elapsed_time_ms,0), " +
                "COALESCE(ascent_m,0) FROM activities " +
                "WHERE deleted_at_ms IS NULL AND COALESCE(start_time_ms,imported_at_ms) >= ? " +
                "AND LOWER(TRIM(COALESCE(equipment_name,''))) = LOWER(TRIM(?)) " +
                "ORDER BY COALESCE(start_time_ms,imported_at_ms) ASC";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql,
                new String[]{String.valueOf(Math.max(0L, sinceMs)), equipment.getDisplayName()})) {
            while (cursor.moveToNext()) {
                result.add(new EquipmentUsageSample(cursor.getLong(0), cursor.getDouble(1),
                        cursor.getLong(2), cursor.getDouble(3)));
            }
        }
        return result;
    }

    /** Agrégats mensuels continus, y compris les mois sans activité. */
    public List<EquipmentMonthlyUsage> getEquipmentMonthlyUsage(String equipmentId, int months, long nowMs) {
        int count = Math.max(1, Math.min(36, months));
        Calendar start = Calendar.getInstance();
        start.setTimeInMillis(nowMs > 0L ? nowMs : System.currentTimeMillis());
        start.set(Calendar.DAY_OF_MONTH, 1);
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        start.add(Calendar.MONTH, -(count - 1));
        long firstMonth = start.getTimeInMillis();
        List<EquipmentUsageSample> samples = getEquipmentUsageSamples(equipmentId, firstMonth);
        List<EquipmentMonthlyUsage> result = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            long monthStart = start.getTimeInMillis();
            Calendar next = (Calendar) start.clone();
            next.add(Calendar.MONTH, 1);
            long monthEnd = next.getTimeInMillis();
            double distance = 0d;
            long duration = 0L;
            double ascent = 0d;
            int activities = 0;
            for (EquipmentUsageSample sample : samples) {
                if (sample.getUsedAtMs() >= monthStart && sample.getUsedAtMs() < monthEnd) {
                    distance += sample.getDistanceMeters();
                    duration += sample.getDurationMs();
                    ascent += sample.getAscentMeters();
                    activities++;
                }
            }
            result.add(new EquipmentMonthlyUsage(monthStart, distance, duration, ascent, activities));
            start.add(Calendar.MONTH, 1);
        }
        return result;
    }

    /** Dernier entretien, réparation ou remplacement de pièce consigné pour EQUIP002. */
    public Long getLastEquipmentMaintenanceDate(String equipmentId) {
        if (equipmentId == null || equipmentId.trim().isEmpty()) return null;
        String sql = "SELECT MAX(event_at_ms) FROM equipment_events WHERE equipment_id = ? " +
                "AND event_type IN (?,?,?)";
        String[] args = new String[]{equipmentId.trim(), EquipmentEventType.MAINTENANCE.name(),
                EquipmentEventType.REPAIR.name(), EquipmentEventType.PART_REPLACEMENT.name()};
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, args)) {
            return cursor.moveToFirst() && !cursor.isNull(0) ? cursor.getLong(0) : null;
        }
    }

    /** Mise à jour transactionnelle des compteurs après association d'une activité. */
    public Equipment applyEquipmentUsage(String equipmentId, EquipmentUsage usage) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            Equipment current = getEquipment(equipmentId);
            if (current == null) throw new IllegalArgumentException("Matériel inconnu : " + equipmentId);
            Long first = current.getFirstUseDateMs();
            if (first == null || usage.getUsedAtMs() < first) first = usage.getUsedAtMs();
            Long last = current.getLastUseDateMs();
            if (last == null || usage.getUsedAtMs() > last) last = usage.getUsedAtMs();
            Equipment updated = Equipment.copyOf(current)
                    .firstUseDateMs(first)
                    .lastUseDateMs(last)
                    .usage(current.getTotalDistanceMeters() + usage.getDistanceMeters(),
                            current.getTotalDurationMs() + usage.getDurationMs(),
                            current.getTotalAscentMeters() + usage.getAscentMeters(),
                            current.getActivityCount() + 1)
                    .timestamps(current.getCreatedAtMs(), System.currentTimeMillis())
                    .build();
            int changed = db.update("equipment", equipmentValues(updated), "id = ?",
                    new String[]{updated.getId()});
            if (changed == 0) db.insertOrThrow("equipment", null, equipmentValues(updated));
            db.setTransactionSuccessful();
            return updated;
        } finally {
            db.endTransaction();
        }
    }

    /** Somme des coûts consignés dans le carnet de vie d'un équipement. */
    public double getEquipmentEventTotalCost(String equipmentId) {
        if (equipmentId == null || equipmentId.trim().isEmpty()) return 0d;
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT COALESCE(SUM(cost),0) FROM equipment_events WHERE equipment_id = ?",
                new String[]{equipmentId})) {
            return c.moveToFirst() ? Math.max(0d, c.getDouble(0)) : 0d;
        }
    }

    /**
     * FITFLOW001 : applique rétrospectivement la pente permanente de 12 %
     * aux seules activités tapis de course. Les activités home trainer restent
     * fidèles au profil transmis par la source.
     */
    public int applyTreadmillSlopeRuleToExistingActivities(double slopePercent) {
        SQLiteDatabase db = getWritableDatabase();
        List<Long> ids = new ArrayList<>();
        List<Double> distances = new ArrayList<>();
        String sql = "SELECT DISTINCT a.id,COALESCE(a.distance_m,0) " +
                "FROM activities a " +
                "LEFT JOIN strava_activity_index s ON s.local_activity_id=a.id " +
                "WHERE a.deleted_at_ms IS NULL AND a.sport=1 " +
                "AND COALESCE(a.distance_m,0)>0 AND (" +
                "a.sub_sport=21 " +
                "OR LOWER(COALESCE(s.sport_type,'')) IN ('virtualrun','treadmill') " +
                "OR LOWER(COALESCE(a.custom_title,'')) LIKE '%tapis%' " +
                "OR LOWER(COALESCE(a.custom_title,'')) LIKE '%treadmill%' " +
                "OR LOWER(COALESCE(a.import_profile,'')) LIKE '%treadmill%' " +
                "OR LOWER(COALESCE(a.product_name,'')) LIKE '%treadmill%' " +
                "OR (LOWER(COALESCE(a.import_source,'')) LIKE '%kinomap%' AND a.sport=1))";
        try (Cursor cursor = db.rawQuery(sql, null)) {
            while (cursor.moveToNext()) {
                ids.add(cursor.getLong(0));
                distances.add(cursor.getDouble(1));
            }
        }
        if (ids.isEmpty()) return 0;

        int changed = 0;
        db.beginTransaction();
        try {
            for (int i = 0; i < ids.size(); i++) {
                int ascent = TreadmillSlopeRule.calculateAscentMeters(
                        distances.get(i), slopePercent);
                ContentValues values = new ContentValues();
                values.put("sport", 1);
                values.put("sub_sport", 21);
                values.put("ascent_m", ascent);
                values.put("descent_m", 0);
                int summaryChanged = db.update("activities", values,
                        "id=? AND (sport<>1 OR sub_sport<>21 OR COALESCE(ascent_m,-1)<>? " +
                                "OR COALESCE(descent_m,-1)<>0)",
                        new String[]{Long.toString(ids.get(i)), Integer.toString(ascent)});
                int profileChanged = normalizeTreadmillPointAltitudes(db, ids.get(i),
                        distances.get(i), slopePercent);
                if (summaryChanged > 0 || profileChanged > 0) changed++;
            }
            if (changed > 0) rebuildRecords(db);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        if (changed > 0) recalculateAllEquipmentUsage();
        return changed;
    }

    /** Ancien point d'entrée conservé pour les installations v125, désormais sans effet. */
    @Deprecated
    public int applyHomeTrainerSlopeRuleToExistingActivities(double slopePercent) {
        return 0;
    }

    /** Remplace le profil vidéo d'un tapis par une montée linéaire à pente constante. */
    private int normalizeTreadmillPointAltitudes(SQLiteDatabase db, long activityId,
                                                 double totalDistanceMeters,
                                                 double slopePercent) {
        List<Integer> indexes = new ArrayList<>();
        List<Double> pointDistances = new ArrayList<>();
        double baseAltitude = 0.0;
        boolean baseFound = false;
        try (Cursor cursor = db.rawQuery(
                "SELECT point_index,distance_m,altitude_m FROM activity_points " +
                        "WHERE activity_id=? ORDER BY point_index",
                new String[]{Long.toString(activityId)})) {
            while (cursor.moveToNext()) {
                indexes.add(cursor.getInt(0));
                pointDistances.add(cursor.isNull(1) ? null : cursor.getDouble(1));
                if (!baseFound && !cursor.isNull(2)) {
                    double candidate = cursor.getDouble(2);
                    if (Double.isFinite(candidate)) {
                        baseAltitude = candidate;
                        baseFound = true;
                    }
                }
            }
        }
        if (indexes.isEmpty()) return 0;
        int changed = 0;
        double previousDistance = 0.0;
        int last = indexes.size() - 1;
        for (int i = 0; i < indexes.size(); i++) {
            Double stored = pointDistances.get(i);
            double distance = stored != null && Double.isFinite(stored) && stored >= 0.0
                    ? stored : (last <= 0 ? 0.0 : totalDistanceMeters * i / (double) last);
            distance = Math.max(previousDistance,
                    Math.min(Math.max(0.0, totalDistanceMeters), distance));
            previousDistance = distance;
            double altitude = TreadmillSlopeRule.syntheticAltitudeMeters(
                    baseAltitude, distance, slopePercent);
            ContentValues pointValues = new ContentValues();
            pointValues.put("altitude_m", altitude);
            changed += db.update("activity_points", pointValues,
                    "activity_id=? AND point_index=? AND (altitude_m IS NULL OR ABS(altitude_m-?)>0.01)",
                    new String[]{Long.toString(activityId), Integer.toString(indexes.get(i)),
                            Double.toString(altitude)});
        }
        return changed;
    }

    /** Noms libres déjà employés dans les activités, utiles pour amorcer l'inventaire. */
    public List<String> getDistinctActivityEquipmentNames() {
        List<String> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT TRIM(equipment_name) AS name FROM activities " +
                        "WHERE deleted_at_ms IS NULL AND TRIM(COALESCE(equipment_name,'')) <> '' " +
                        "GROUP BY LOWER(TRIM(equipment_name)) ORDER BY LOWER(TRIM(equipment_name))",
                null)) {
            while (c.moveToNext()) result.add(c.getString(0));
        }
        return result;
    }

    /** Sport le plus fréquent pour un nom de matériel déjà associé aux activités. */
    public int getDominantSportForEquipmentName(String equipmentName) {
        if (equipmentName == null || equipmentName.trim().isEmpty()) return -1;
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT sport, COUNT(*) AS n FROM activities " +
                        "WHERE deleted_at_ms IS NULL " +
                        "AND LOWER(TRIM(COALESCE(equipment_name,''))) = LOWER(TRIM(?)) " +
                        "GROUP BY sport ORDER BY n DESC LIMIT 1",
                new String[]{equipmentName})) {
            return c.moveToFirst() ? c.getInt(0) : -1;
        }
    }

    /**
     * Recalcule les compteurs d'une fiche depuis les activités portant exactement
     * son nom d'affichage. Les activités en corbeille sont exclues.
     */
    public Equipment recalculateEquipmentUsage(String equipmentId) {
        Equipment current = getEquipment(equipmentId);
        if (current == null) return null;
        double distance = 0d;
        long duration = 0L;
        double ascent = 0d;
        int count = 0;
        Long first = null;
        Long last = null;
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT COALESCE(SUM(COALESCE(distance_m,0)),0), " +
                        "COALESCE(SUM(COALESCE(NULLIF(timer_time_ms,0),elapsed_time_ms,0)),0), " +
                        "COALESCE(SUM(COALESCE(ascent_m,0)),0), COUNT(*), " +
                        "MIN(COALESCE(start_time_ms,imported_at_ms)), " +
                        "MAX(COALESCE(start_time_ms,imported_at_ms)) " +
                        "FROM activities WHERE deleted_at_ms IS NULL " +
                        "AND LOWER(TRIM(COALESCE(equipment_name,''))) = LOWER(TRIM(?))",
                new String[]{current.getDisplayName()})) {
            if (c.moveToFirst()) {
                distance = Math.max(0d, c.getDouble(0));
                duration = Math.max(0L, c.getLong(1));
                ascent = Math.max(0d, c.getDouble(2));
                count = Math.max(0, c.getInt(3));
                if (!c.isNull(4)) first = c.getLong(4);
                if (!c.isNull(5)) last = c.getLong(5);
            }
        }
        if (count == 0) {
            first = current.getFirstUseDateMs();
            last = current.getLastUseDateMs();
        }
        Equipment updated = Equipment.copyOf(current)
                .firstUseDateMs(first)
                .lastUseDateMs(last)
                .usage(distance, duration, ascent, count)
                .timestamps(current.getCreatedAtMs(), System.currentTimeMillis())
                .build();
        saveEquipment(updated);
        return updated;
    }

    /** Recalcule toutes les fiches; renvoie le nombre de fiches traitées. */
    public int recalculateAllEquipmentUsage() {
        List<Equipment> all = getAllEquipment();
        for (Equipment equipment : all) recalculateEquipmentUsage(equipment.getId());
        return all.size();
    }

    /** Propage un changement de nom de fiche vers les associations d'activités. */
    public int renameActivityEquipment(String oldName, String newName) {
        if (oldName == null || oldName.trim().isEmpty() || newName == null || newName.trim().isEmpty()) return 0;
        ContentValues values = new ContentValues();
        values.put("equipment_name", newName.trim());
        return getWritableDatabase().update("activities", values,
                "LOWER(TRIM(COALESCE(equipment_name,''))) = LOWER(TRIM(?))",
                new String[]{oldName});
    }

    private static ContentValues equipmentValues(Equipment e) {
        ContentValues v = new ContentValues();
        v.put("id", e.getId());
        v.put("category", e.getCategory().name());
        putNullable(v, "brand", e.getBrand());
        putNullable(v, "model", e.getModel());
        putNullable(v, "custom_name", e.getCustomName());
        v.put("specimen_number", e.getSpecimenNumber());
        v.put("status", e.getStatus().name());
        putNullable(v, "purchase_date_ms", e.getPurchaseDateMs());
        putNullable(v, "first_use_date_ms", e.getFirstUseDateMs());
        putNullable(v, "last_use_date_ms", e.getLastUseDateMs());
        putNullable(v, "purchase_price", e.getPurchasePrice());
        v.put("notes", e.getNotes());
        v.put("warning_distance_m", e.getWarningDistanceMeters());
        v.put("critical_distance_m", e.getCriticalDistanceMeters());
        v.put("warning_duration_ms", e.getWarningDurationMs());
        v.put("critical_duration_ms", e.getCriticalDurationMs());
        v.put("total_distance_m", e.getTotalDistanceMeters());
        v.put("total_duration_ms", e.getTotalDurationMs());
        v.put("total_ascent_m", e.getTotalAscentMeters());
        v.put("activity_count", e.getActivityCount());
        v.put("created_at_ms", e.getCreatedAtMs());
        v.put("updated_at_ms", e.getUpdatedAtMs());
        return v;
    }

    private static Equipment readEquipment(Cursor c) {
        return Equipment.builder(c.getString(c.getColumnIndexOrThrow("id")),
                        EquipmentCategory.valueOf(c.getString(c.getColumnIndexOrThrow("category"))))
                .brand(nullableString(c, "brand"))
                .model(nullableString(c, "model"))
                .customName(nullableString(c, "custom_name"))
                .specimenNumber(c.getInt(c.getColumnIndexOrThrow("specimen_number")))
                .status(EquipmentStatus.valueOf(c.getString(c.getColumnIndexOrThrow("status"))))
                .purchaseDateMs(nullableLong(c, "purchase_date_ms"))
                .firstUseDateMs(nullableLong(c, "first_use_date_ms"))
                .lastUseDateMs(nullableLong(c, "last_use_date_ms"))
                .purchasePrice(nullableDouble(c, "purchase_price"))
                .notes(c.getString(c.getColumnIndexOrThrow("notes")))
                .warningDistanceMeters(c.getDouble(c.getColumnIndexOrThrow("warning_distance_m")))
                .criticalDistanceMeters(c.getDouble(c.getColumnIndexOrThrow("critical_distance_m")))
                .warningDurationMs(c.getLong(c.getColumnIndexOrThrow("warning_duration_ms")))
                .criticalDurationMs(c.getLong(c.getColumnIndexOrThrow("critical_duration_ms")))
                .usage(c.getDouble(c.getColumnIndexOrThrow("total_distance_m")),
                        c.getLong(c.getColumnIndexOrThrow("total_duration_ms")),
                        c.getDouble(c.getColumnIndexOrThrow("total_ascent_m")),
                        c.getInt(c.getColumnIndexOrThrow("activity_count")))
                .timestamps(c.getLong(c.getColumnIndexOrThrow("created_at_ms")),
                        c.getLong(c.getColumnIndexOrThrow("updated_at_ms")))
                .build();
    }

    private static String nullableString(Cursor c, String column) {
        int i = c.getColumnIndexOrThrow(column);
        return c.isNull(i) ? null : c.getString(i);
    }

    private static Long nullableLong(Cursor c, String column) {
        int i = c.getColumnIndexOrThrow(column);
        return c.isNull(i) ? null : c.getLong(i);
    }

    private static Double nullableDouble(Cursor c, String column) {
        int i = c.getColumnIndexOrThrow(column);
        return c.isNull(i) ? null : c.getDouble(i);
    }

    public static final class SourceFileImportState {
        public final long firstActivityId;
        public final int importedSegmentCount;
        public final int declaredSegmentCount;

        SourceFileImportState(long firstActivityId,
                              int importedSegmentCount,
                              int declaredSegmentCount) {
            this.firstActivityId = firstActivityId;
            this.importedSegmentCount = Math.max(0, importedSegmentCount);
            this.declaredSegmentCount = Math.max(1, declaredSegmentCount);
        }

        public boolean isCompleteFor(int expectedSegmentCount) {
            int expected = Math.max(1, expectedSegmentCount);
            return importedSegmentCount >= expected && declaredSegmentCount >= expected;
        }
    }

    public static final class ActivitySaveRequest {
        public final String fileName;
        public final FitActivityData activity;
        public final String importSource;
        public final ImportMetadata metadata;

        public ActivitySaveRequest(String fileName,
                                   FitActivityData activity,
                                   String importSource,
                                   ImportMetadata metadata) {
            this.fileName = fileName;
            this.activity = activity;
            this.importSource = importSource;
            this.metadata = metadata;
        }
    }

    public static final class ImportMetadata {
        public final String sourceFileSha256;
        public final int segmentIndex;
        public final int segmentCount;
        public final String splitReason;
        public final String equipmentName;
        public final boolean equipmentManual;
        public final String importProfile;

        public ImportMetadata(String sourceFileSha256,
                              int segmentIndex,
                              int segmentCount,
                              String splitReason,
                              String equipmentName,
                              boolean equipmentManual,
                              String importProfile) {
            this.sourceFileSha256 = sourceFileSha256;
            this.segmentIndex = Math.max(0, segmentIndex);
            this.segmentCount = Math.max(1, segmentCount);
            this.splitReason = splitReason;
            this.equipmentName = equipmentName;
            this.equipmentManual = equipmentManual;
            this.importProfile = importProfile;
        }

        public static ImportMetadata standard(FitActivityData activity) {
            return new ImportMetadata(activity == null ? null : activity.getSha256(),
                    0, 1, null, null, false, "STANDARD");
        }
    }

    public static final class ImportResult {
        private final long activityId; private final boolean duplicate;
        public ImportResult(long activityId, boolean duplicate) { this.activityId = activityId; this.duplicate = duplicate; }
        public long getActivityId() { return activityId; }
        public boolean isDuplicate() { return duplicate; }
        public String getActivityCode() { return activityCode(activityId); }
    }

    public static final class Summary {
        private final long activityCount; private final double distanceMeters;
        private final long timerTimeMillis; private final long ascentMeters;
        public Summary(long c, double d, long t, long a) { activityCount = c; distanceMeters = d; timerTimeMillis = t; ascentMeters = a; }
        public long getActivityCount() { return activityCount; }
        public double getDistanceMeters() { return distanceMeters; }
        public long getTimerTimeMillis() { return timerTimeMillis; }
        public long getAscentMeters() { return ascentMeters; }
    }


    public static final class DashboardSummary {
        public final Summary today;
        public final Summary week;
        public final Summary month;
        public final Summary year;
        public final Summary allTime;

        public DashboardSummary(Summary today, Summary week, Summary month, Summary year, Summary allTime) {
            this.today = today;
            this.week = week;
            this.month = month;
            this.year = year;
            this.allTime = allTime;
        }
    }

    public static final class RecordsSummary {
        public final RecordEntry distance;
        public final RecordEntry duration;
        public final RecordEntry ascent;
        public RecordsSummary(RecordEntry distance, RecordEntry duration, RecordEntry ascent) {
            this.distance = distance; this.duration = duration; this.ascent = ascent;
        }
    }

    public static final class RecordEntry {
        public final String type;
        public final double value;
        public final long activityId;
        public final String fileName;
        public final Long startTimeMs;
        public final int sport;
        RecordEntry(String type, double value, long activityId, String fileName, Long startTimeMs, int sport) {
            this.type = type; this.value = value; this.activityId = activityId;
            this.fileName = fileName; this.startTimeMs = startTimeMs; this.sport = sport;
        }
    }



    public static final class ReferenceRecord {
        public final String type;
        public final String label;
        public final double targetValue;
        public final long activityId;
        public final String fileName;
        public final Long startTimeMs;
        public final int sport;
        public final double activityValue;
        public final long activityDurationMs;
        public final long equivalentDurationMs;

        public ReferenceRecord(String type, String label, double targetValue, long activityId,
                               String fileName, Long startTimeMs, int sport, double activityValue,
                               long activityDurationMs, long equivalentDurationMs) {
            this.type = type; this.label = label; this.targetValue = targetValue;
            this.activityId = activityId; this.fileName = fileName; this.startTimeMs = startTimeMs;
            this.sport = sport; this.activityValue = activityValue;
            this.activityDurationMs = activityDurationMs; this.equivalentDurationMs = equivalentDurationMs;
        }
    }


    /** Calcule une photographie simple de charge à partir des 42 derniers jours. */
    public CoachSnapshot getCoachSnapshot(long nowMs) {
        final long dayMs = 24L * 60L * 60L * 1000L;
        long start42 = nowMs - 42L * dayMs;
        double[] daily = new double[42];
        int activities = 0;
        String sql = "SELECT start_time_ms,timer_time_ms,distance_m,ascent_m,avg_hr FROM activities " +
                "WHERE deleted_at_ms IS NULL AND start_time_ms IS NOT NULL AND start_time_ms>=? AND start_time_ms<=?";
        try (Cursor c = getReadableDatabase().rawQuery(sql,
                new String[]{String.valueOf(start42), String.valueOf(nowMs)})) {
            while (c.moveToNext()) {
                long start = c.getLong(0);
                int index = (int) ((start - start42) / dayMs);
                if (index < 0 || index >= daily.length) continue;
                double minutes = c.isNull(1) ? 0.0 : c.getLong(1) / 60000.0;
                double km = c.isNull(2) ? 0.0 : c.getDouble(2) / 1000.0;
                double ascent = c.isNull(3) ? 0.0 : c.getDouble(3);
                double hrFactor = 1.0;
                if (!c.isNull(4) && c.getInt(4) > 0) {
                    hrFactor = Math.max(0.75, Math.min(1.50, c.getInt(4) / 130.0));
                }
                daily[index] += (minutes + km * 2.0 + ascent / 100.0) * hrFactor;
                activities++;
            }
        }
        double acute = 0.0, chronic = 0.0;
        for (int i = 0; i < daily.length; i++) {
            chronic += daily[i];
            if (i >= 35) acute += daily[i];
        }
        acute /= 7.0;
        chronic /= 42.0;
        double ratio = chronic <= 0.01 ? 0.0 : acute / chronic;
        double freshness = chronic - acute;

        long next7 = nowMs + 7L * dayMs;
        double planned = 0.0;
        String plannedSql = "SELECT target_duration_min,target_distance_km,target_ascent_m,status " +
                "FROM training_sessions WHERE planned_at_ms>=? AND planned_at_ms<?";
        try (Cursor c = getReadableDatabase().rawQuery(plannedSql,
                new String[]{String.valueOf(nowMs), String.valueOf(next7)})) {
            while (c.moveToNext()) {
                String status = c.getString(3);
                if ("Annulée".equals(status)) continue;
                planned += (c.isNull(0) ? 0.0 : c.getInt(0));
                planned += (c.isNull(1) ? 0.0 : c.getDouble(1) * 2.0);
                planned += (c.isNull(2) ? 0.0 : c.getInt(2) / 100.0);
            }
        }
        String level;
        String recommendation;
        if (activities == 0) {
            level = "Données insuffisantes";
            recommendation = "Importer quelques activités pour obtenir une recommandation personnalisée.";
        } else if (ratio >= 1.50 || freshness < -35.0) {
            level = "Surcharge élevée";
            recommendation = "Repos ou récupération très légère. Éviter une nouvelle séance intense aujourd’hui.";
        } else if (ratio >= 1.25 || freshness < -15.0) {
            level = "Fatigue marquée";
            recommendation = "Endurance facile ou récupération active, avec priorité au sommeil et à l’alimentation.";
        } else if (ratio >= 0.80) {
            level = "Charge productive";
            recommendation = "La charge est cohérente. Une séance qualitative reste possible si les sensations sont bonnes.";
        } else {
            level = "Charge basse";
            recommendation = "Bonne fraîcheur apparente. Une séance structurée ou une sortie longue peut être envisagée.";
        }
        return new CoachSnapshot(acute, chronic, ratio, freshness, planned, activities, level, recommendation);
    }

    public static final class CoachSnapshot {
        public final double acuteLoad;
        public final double chronicLoad;
        public final double loadRatio;
        public final double freshness;
        public final double plannedLoadNext7Days;
        public final int activityCount42Days;
        public final String level;
        public final String recommendation;

        public CoachSnapshot(double acuteLoad, double chronicLoad, double loadRatio, double freshness,
                             double plannedLoadNext7Days, int activityCount42Days,
                             String level, String recommendation) {
            this.acuteLoad = acuteLoad;
            this.chronicLoad = chronicLoad;
            this.loadRatio = loadRatio;
            this.freshness = freshness;
            this.plannedLoadNext7Days = plannedLoadNext7Days;
            this.activityCount42Days = activityCount42Days;
            this.level = level;
            this.recommendation = recommendation;
        }
    }

    public long createTrainingSession(TrainingSession session) {
        ContentValues v = trainingValues(session);
        long now = System.currentTimeMillis();
        v.put("created_at_ms", now);
        v.put("updated_at_ms", now);
        return getWritableDatabase().insertOrThrow("training_sessions", null, v);
    }

    public boolean updateTrainingSession(TrainingSession session) {
        ContentValues v = trainingValues(session);
        v.put("updated_at_ms", System.currentTimeMillis());
        return getWritableDatabase().update("training_sessions", v, "id = ?",
                new String[]{String.valueOf(session.id)}) > 0;
    }

    public boolean deleteTrainingSession(long id) {
        return getWritableDatabase().delete("training_sessions", "id = ?",
                new String[]{String.valueOf(id)}) > 0;
    }

    private ContentValues trainingValues(TrainingSession s) {
        ContentValues v = new ContentValues();
        v.put("planned_at_ms", s.plannedAtMs);
        v.put("title", s.title);
        v.put("sport", s.sport);
        if (s.routeId == null) v.putNull("route_id"); else v.put("route_id", s.routeId);
        if (s.targetDistanceKm == null) v.putNull("target_distance_km"); else v.put("target_distance_km", s.targetDistanceKm);
        if (s.targetAscentM == null) v.putNull("target_ascent_m"); else v.put("target_ascent_m", s.targetAscentM);
        if (s.targetDurationMin == null) v.putNull("target_duration_min"); else v.put("target_duration_min", s.targetDurationMin);
        if (s.targetPace == null) v.putNull("target_pace"); else v.put("target_pace", s.targetPace);
        if (s.targetHeartRate == null) v.putNull("target_heart_rate"); else v.put("target_heart_rate", s.targetHeartRate);
        v.put("status", s.status);
        v.put("notes", s.notes == null ? "" : s.notes);
        return v;
    }

    public List<TrainingSession> getTrainingSessions(long startMs, long endMs) {
        List<TrainingSession> result = new ArrayList<>();
        String sql = "SELECT t.id,t.planned_at_ms,t.title,t.sport,t.route_id,r.name," +
                "t.target_distance_km,t.target_ascent_m,t.target_duration_min,t.target_pace," +
                "t.target_heart_rate,t.status,t.notes FROM training_sessions t " +
                "LEFT JOIN routes r ON r.id=t.route_id WHERE t.planned_at_ms>=? AND t.planned_at_ms<? " +
                "ORDER BY t.planned_at_ms,t.id";
        try (Cursor c = getReadableDatabase().rawQuery(sql,
                new String[]{String.valueOf(startMs), String.valueOf(endMs)})) {
            while (c.moveToNext()) {
                result.add(new TrainingSession(c.getLong(0), c.getLong(1), c.getString(2), c.getString(3),
                        c.isNull(4) ? null : c.getLong(4), c.isNull(5) ? null : c.getString(5),
                        c.isNull(6) ? null : c.getDouble(6), c.isNull(7) ? null : c.getInt(7),
                        c.isNull(8) ? null : c.getInt(8), c.isNull(9) ? null : c.getString(9),
                        c.isNull(10) ? null : c.getInt(10), c.getString(11), c.getString(12)));
            }
        }
        return result;
    }

    public static final class ActivityBadges {
        public final boolean allTimeDistanceRecord;
        public final boolean allTimeDurationRecord;
        public final boolean allTimeAscentRecord;
        public final boolean longestDistanceOfMonth;
        public final boolean highestAscentOfYear;

        public ActivityBadges(boolean distance, boolean duration, boolean ascent,
                              boolean monthDistance, boolean yearAscent) {
            this.allTimeDistanceRecord = distance;
            this.allTimeDurationRecord = duration;
            this.allTimeAscentRecord = ascent;
            this.longestDistanceOfMonth = monthDistance;
            this.highestAscentOfYear = yearAscent;
        }

        public boolean hasAny() {
            return allTimeDistanceRecord || allTimeDurationRecord || allTimeAscentRecord ||
                    longestDistanceOfMonth || highestAscentOfYear;
        }
    }

    public static final class SportStats {
        public final int sport;
        public final long activityCount;
        public final double distanceMeters;
        public final long timerTimeMillis;
        public final long ascentMeters;
        public final double longestDistanceMeters;
        public final Long latestStartTimeMs;

        public SportStats(int sport, long activityCount, double distanceMeters, long timerTimeMillis,
                          long ascentMeters, double longestDistanceMeters, Long latestStartTimeMs) {
            this.sport = sport;
            this.activityCount = activityCount;
            this.distanceMeters = distanceMeters;
            this.timerTimeMillis = timerTimeMillis;
            this.ascentMeters = ascentMeters;
            this.longestDistanceMeters = longestDistanceMeters;
            this.latestStartTimeMs = latestStartTimeMs;
        }

        public double getAverageSpeedKmh() {
            if (timerTimeMillis <= 0L) return 0.0;
            return (distanceMeters / 1000.0) / (timerTimeMillis / 3600000.0);
        }
    }

    public static final class TrendPoint {
        public final String label;
        public final long periodStartMs;
        public final long activityCount;
        public final double distanceMeters;
        public final long timerTimeMillis;
        public final long ascentMeters;

        public TrendPoint(String label, long periodStartMs, long activityCount, double distanceMeters,
                          long timerTimeMillis, long ascentMeters) {
            this.label = label;
            this.periodStartMs = periodStartMs;
            this.activityCount = activityCount;
            this.distanceMeters = distanceMeters;
            this.timerTimeMillis = timerTimeMillis;
            this.ascentMeters = ascentMeters;
        }
    }

    public static final class EquivalentActivity {
        public final long activityId;
        public final boolean exactFileContent;
        public final String reason;

        public EquivalentActivity(long activityId, boolean exactFileContent, String reason) {
            this.activityId = activityId;
            this.exactFileContent = exactFileContent;
            this.reason = reason;
        }
    }

    public static final class InboxItem {
        public final long id;
        public final String localPath;
        public final String originalUri;
        public final String displayName;
        public final String format;
        public final String mimeType;
        public final String source;
        public final String status;
        public final String reason;
        public final String sha256;
        public final Long candidateActivityId;
        public final Long localActivityId;
        public final long receivedAtMs;
        public final long updatedAtMs;
        public final int retryCount;

        InboxItem(long id, String localPath, String originalUri, String displayName,
                  String format, String mimeType, String source, String status,
                  String reason, String sha256, Long candidateActivityId,
                  Long localActivityId, long receivedAtMs, long updatedAtMs, int retryCount) {
            this.id = id; this.localPath = localPath; this.originalUri = originalUri;
            this.displayName = displayName; this.format = format; this.mimeType = mimeType;
            this.source = source; this.status = status; this.reason = reason; this.sha256 = sha256;
            this.candidateActivityId = candidateActivityId; this.localActivityId = localActivityId;
            this.receivedAtMs = receivedAtMs; this.updatedAtMs = updatedAtMs;
            this.retryCount = retryCount;
        }

        public boolean isActive() {
            return INBOX_PENDING.equals(status) || INBOX_READY.equals(status)
                    || INBOX_CONFLICT.equals(status) || INBOX_ERROR.equals(status);
        }
    }

    public static final class FitImportRun {
        public final long id;
        public final long startedAtMs;
        public final Long finishedAtMs;
        public final String locationUri;
        public final String triggerName;
        public final int discovered;
        public final int imported;
        public final int duplicateFiles;
        public final int duplicateActivities;
        public final int unchanged;
        public final int errors;
        public final boolean cancelled;
        public final String fatalError;
        public final Long undoneAtMs;
        public final int undoneActivityCount;

        public FitImportRun(long id,
                            long startedAtMs,
                            Long finishedAtMs,
                            String locationUri,
                            String triggerName,
                            int discovered,
                            int imported,
                            int duplicateFiles,
                            int duplicateActivities,
                            int unchanged,
                            int errors,
                            boolean cancelled,
                            String fatalError,
                            Long undoneAtMs,
                            int undoneActivityCount) {
            this.id = id;
            this.startedAtMs = startedAtMs;
            this.finishedAtMs = finishedAtMs;
            this.locationUri = locationUri;
            this.triggerName = triggerName;
            this.discovered = discovered;
            this.imported = imported;
            this.duplicateFiles = duplicateFiles;
            this.duplicateActivities = duplicateActivities;
            this.unchanged = unchanged;
            this.errors = errors;
            this.cancelled = cancelled;
            this.fatalError = fatalError;
            this.undoneAtMs = undoneAtMs;
            this.undoneActivityCount = undoneActivityCount;
        }

        public boolean isUndone() { return undoneAtMs != null; }

        public int ignored() {
            return duplicateFiles + duplicateActivities + unchanged;
        }
    }

    public static final class UndoImportResult {
        public final int deletedActivities;
        public final int reopenedFiles;

        public UndoImportResult(int deletedActivities, int reopenedFiles) {
            this.deletedActivities = Math.max(0, deletedActivities);
            this.reopenedFiles = Math.max(0, reopenedFiles);
        }
    }

    public static final class FitImportItem {
        public final long id;
        public final long runId;
        public final String documentUri;
        public final String displayName;
        public final String source;
        public final String status;
        public final String reason;
        public final String sha256;
        public final String activityFingerprint;
        public final Long localActivityId;
        public final long sizeBytes;
        public final long lastModifiedMs;
        public final long createdAtMs;

        public FitImportItem(long id,
                             long runId,
                             String documentUri,
                             String displayName,
                             String source,
                             String status,
                             String reason,
                             String sha256,
                             String activityFingerprint,
                             Long localActivityId,
                             long sizeBytes,
                             long lastModifiedMs,
                             long createdAtMs) {
            this.id = id;
            this.runId = runId;
            this.documentUri = documentUri;
            this.displayName = displayName;
            this.source = source;
            this.status = status;
            this.reason = reason;
            this.sha256 = sha256;
            this.activityFingerprint = activityFingerprint;
            this.localActivityId = localActivityId;
            this.sizeBytes = sizeBytes;
            this.lastModifiedMs = lastModifiedMs;
            this.createdAtMs = createdAtMs;
        }
    }

    public static final class SearchResult {
        public final List<ActivityRecord> activities;
        public final Summary summary;
        public SearchResult(List<ActivityRecord> activities, Summary summary) {
            this.activities = activities;
            this.summary = summary;
        }
    }

    public static final class ActivitySource {
        public final long id;
        public final long activityId;
        public final String sha256;
        public final String format;
        public final String displayName;
        public final String source;
        public final long addedAtMs;

        ActivitySource(long id, long activityId, String sha256, String format,
                       String displayName, String source, long addedAtMs) {
            this.id = id;
            this.activityId = activityId;
            this.sha256 = sha256;
            this.format = format;
            this.displayName = displayName;
            this.source = source;
            this.addedAtMs = addedAtMs;
        }
    }

    public static final class RecalculationPreview {
        public final Double currentDistanceM;
        public final Integer currentAscentM;
        public final Integer currentDescentM;
        public final Double calculatedDistanceM;
        public final Integer calculatedAscentM;
        public final Integer calculatedDescentM;
        public final int validGpsPointCount;
        public final int altitudePointCount;

        RecalculationPreview(Double currentDistanceM, Integer currentAscentM,
                             Integer currentDescentM, Double calculatedDistanceM,
                             Integer calculatedAscentM, Integer calculatedDescentM,
                             int validGpsPointCount, int altitudePointCount) {
            this.currentDistanceM = currentDistanceM;
            this.currentAscentM = currentAscentM;
            this.currentDescentM = currentDescentM;
            this.calculatedDistanceM = calculatedDistanceM;
            this.calculatedAscentM = calculatedAscentM;
            this.calculatedDescentM = calculatedDescentM;
            this.validGpsPointCount = validGpsPointCount;
            this.altitudePointCount = altitudePointCount;
        }

        public boolean hasAnyCalculatedMetric() {
            return calculatedDistanceM != null || calculatedAscentM != null
                    || calculatedDescentM != null;
        }
    }

    public static final class RecalculationResult {
        public final boolean success;
        public final String message;
        public final RecalculationPreview preview;

        RecalculationResult(boolean success, String message, RecalculationPreview preview) {
            this.success = success;
            this.message = message;
            this.preview = preview;
        }
    }

    public static final class CorrectionInfo {
        public final long id;
        public final long activityId;
        public final String type;
        public final long createdAtMs;

        CorrectionInfo(long id, long activityId, String type, long createdAtMs) {
            this.id = id;
            this.activityId = activityId;
            this.type = type;
            this.createdAtMs = createdAtMs;
        }
    }

    public static final class UndoCorrectionResult {
        public final boolean success;
        public final String message;

        UndoCorrectionResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }
    }


    public static final class ActivityMetadata {
        public final String customTitle; public final String description; public final String personalNote;
        public final Integer feelingScore; public final Integer difficultyScore;
        public final String privacy; public final String tags;
        public final int sport; public final int subSport; public final String equipmentName;

        public ActivityMetadata(String customTitle, String description, String personalNote,
                                Integer feelingScore, Integer difficultyScore, String privacy,
                                String tags, int sport, int subSport, String equipmentName) {
            this.customTitle = customTitle; this.description = description; this.personalNote = personalNote;
            this.feelingScore = feelingScore; this.difficultyScore = difficultyScore;
            this.privacy = privacy; this.tags = tags; this.sport = sport; this.subSport = subSport;
            this.equipmentName = equipmentName;
        }
    }

    public static final class MetadataEditInfo {
        public final long id; public final long createdAtMs;
        MetadataEditInfo(long id, long createdAtMs) { this.id = id; this.createdAtMs = createdAtMs; }
    }

    public static final class ActivityAttachment {
        public final long id; public final long activityId; public final String displayName;
        public final String mimeType; public final String internalPath; public final long sizeBytes;
        public final long createdAtMs;
        ActivityAttachment(long id, long activityId, String displayName, String mimeType,
                           String internalPath, long sizeBytes, long createdAtMs) {
            this.id = id; this.activityId = activityId; this.displayName = displayName;
            this.mimeType = mimeType; this.internalPath = internalPath;
            this.sizeBytes = sizeBytes; this.createdAtMs = createdAtMs;
        }
    }

    public static final class ActivityPoint {
        public final double latitude;
        public final double longitude;
        public final Double altitudeMeters;
        public final Double distanceMeters;
        public final Long timestampMs;
        public final Integer heartRate;

        public ActivityPoint(double latitude, double longitude, Double altitudeMeters, Double distanceMeters, Long timestampMs) {
            this(latitude, longitude, altitudeMeters, distanceMeters, timestampMs, null);
        }

        public ActivityPoint(double latitude, double longitude, Double altitudeMeters, Double distanceMeters,
                             Long timestampMs, Integer heartRate) {
            this.latitude = latitude;
            this.longitude = longitude;
            this.altitudeMeters = altitudeMeters;
            this.distanceMeters = distanceMeters;
            this.timestampMs = timestampMs;
            this.heartRate = heartRate;
        }
    }

    public static final class StravaUploadRecord {
        public final long localActivityId;
        public final Long uploadId;
        public final Long stravaActivityId;
        public final String externalId;
        public final String status;
        public final String lastError;
        public final int attemptCount;
        public final long createdAtMs;
        public final long updatedAtMs;
        public final Long completedAtMs;

        StravaUploadRecord(long localActivityId, Long uploadId, Long stravaActivityId,
                           String externalId, String status, String lastError, int attemptCount,
                           long createdAtMs, long updatedAtMs, Long completedAtMs) {
            this.localActivityId = localActivityId;
            this.uploadId = uploadId;
            this.stravaActivityId = stravaActivityId;
            this.externalId = externalId;
            this.status = status;
            this.lastError = lastError;
            this.attemptCount = attemptCount;
            this.createdAtMs = createdAtMs;
            this.updatedAtMs = updatedAtMs;
            this.completedAtMs = completedAtMs;
        }

        public boolean isLinked() {
            return stravaActivityId != null && stravaActivityId > 0L
                    && (STRAVA_UPLOAD_LINKED.equals(status)
                    || STRAVA_UPLOAD_DUPLICATE_LINKED.equals(status));
        }
    }

    public static final class ActivityRecord {
        public final long id; public final String sha256; public final String fileName;
        public final int sport; public final int subSport; public final Long startTimeMs;
        public final Long elapsedTimeMs; public final Long timerTimeMs; public final Double distanceM;
        public final Integer calories; public final Integer ascentM; public final Integer descentM;
        public final Integer avgHr; public final Integer maxHr; public final Integer avgCadence;
        public final String manufacturer; public final Integer productId; public final String productName;
        public final String importSource; public final String sourceFileSha256;
        public final int segmentIndex; public final int segmentCount; public final String splitReason;
        public final String equipmentName; public final boolean equipmentManual; public final String importProfile;
        public final long fileSizeBytes;
        public final int protocolMajor; public final int protocolMinor;
        public final int profileVersion; public final int recordCount; public final int gpsPointCount;
        public final long importedAtMs;
        public final String customTitle; public final String description; public final String personalNote;
        public final Integer feelingScore; public final Integer difficultyScore;
        public final String privacy; public final String tags;

        ActivityRecord(long id, String sha256, String fileName, int sport, int subSport, Long startTimeMs,
                       Long elapsedTimeMs, Long timerTimeMs, Double distanceM, Integer calories,
                       Integer ascentM, Integer descentM, Integer avgHr, Integer maxHr, Integer avgCadence,
                       String manufacturer, Integer productId, String productName, String importSource,
                       String sourceFileSha256, int segmentIndex, int segmentCount, String splitReason,
                       String equipmentName, boolean equipmentManual, String importProfile,
                       long fileSizeBytes, int protocolMajor, int protocolMinor, int profileVersion, int recordCount,
                       int gpsPointCount, long importedAtMs, String customTitle, String description,
                       String personalNote, Integer feelingScore, Integer difficultyScore,
                       String privacy, String tags) {
            this.id=id; this.sha256=sha256; this.fileName=fileName; this.sport=sport; this.subSport=subSport;
            this.startTimeMs=startTimeMs; this.elapsedTimeMs=elapsedTimeMs; this.timerTimeMs=timerTimeMs;
            this.distanceM=distanceM; this.calories=calories; this.ascentM=ascentM; this.descentM=descentM;
            this.avgHr=avgHr; this.maxHr=maxHr; this.avgCadence=avgCadence; this.manufacturer=manufacturer;
            this.productId=productId; this.productName=productName; this.importSource=importSource;
            this.sourceFileSha256=sourceFileSha256; this.segmentIndex=segmentIndex; this.segmentCount=segmentCount;
            this.splitReason=splitReason; this.equipmentName=equipmentName;
            this.equipmentManual=equipmentManual; this.importProfile=importProfile;
            this.fileSizeBytes=fileSizeBytes;
            this.protocolMajor=protocolMajor; this.protocolMinor=protocolMinor; this.profileVersion=profileVersion;
            this.recordCount=recordCount; this.gpsPointCount=gpsPointCount; this.importedAtMs=importedAtMs;
            this.customTitle=customTitle; this.description=description; this.personalNote=personalNote;
            this.feelingScore=feelingScore; this.difficultyScore=difficultyScore;
            this.privacy=privacy == null ? "PRIVATE" : privacy;
            this.tags=tags == null ? "" : tags;
        }
        public String getCode() { return activityCode(id); }
        public String displayTitle() {
            return FitFileNaming.canonicalTitle(startTimeMs == null ? importedAtMs : startTimeMs, sport, subSport,
                    segmentIndex, segmentCount, importProfile, gpsPointCount);
        }
    }
}