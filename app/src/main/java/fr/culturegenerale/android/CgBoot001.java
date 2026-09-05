package fr.culturegenerale.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;
import android.view.WindowManager;

import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldPath;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QuerySnapshot;
import com.google.firebase.firestore.Source;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CGBOOT001 — création initiale de questions_base.sqlite depuis Firestore.
 */
public final class CgBoot001 {

    private static final int PAGE_SIZE = 500;
    private static final String TMP_SUFFIX = ".cgboot001.tmp";
    private static final AtomicBoolean OFFER_VISIBLE = new AtomicBoolean(false);
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    private CgBoot001() { }

    public interface ReadyListener {
        void onReady();
    }

    /**
     * @return true si CGBOOT001 prend la main parce que la base locale est absente.
     */
    public static boolean maybeOffer(
            Activity activity,
            File dbFile,
            FirebaseUser user,
            ReadyListener readyListener
    ) {
        if (activity == null || dbFile == null || user == null) return false;
        if (dbFile.exists()) return false;

        if (RUNNING.get()) return true;
        if (!OFFER_VISIBLE.compareAndSet(false, true)) return true;

        activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
                .setTitle("Base de questions absente")
                .setMessage(
                        "Cet appareil ne possède pas encore la base locale.\n\n" +
                        "Télécharger les questions depuis le Cloud ?\n\n" +
                        "Cette opération n'est nécessaire qu'une seule fois. " +
                        "Elle peut être reprise automatiquement si elle est interrompue."
                )
                .setPositiveButton("Télécharger la base", (dialog, which) -> {
                    OFFER_VISIBLE.set(false);
                    start(activity, dbFile, user, readyListener);
                })
                .setNegativeButton("Plus tard", (dialog, which) -> {
                    OFFER_VISIBLE.set(false);
                    dialog.dismiss();
                })
                .setOnCancelListener(dialog -> OFFER_VISIBLE.set(false))
                .show());

        return true;
    }

    private static void start(
            Activity activity,
            File dbFile,
            FirebaseUser user,
            ReadyListener readyListener
    ) {
        if (!RUNNING.compareAndSet(false, true)) return;

        File parent = dbFile.getParentFile();
        if (parent == null) {
            RUNNING.set(false);
            showError(activity, "Dossier de destination introuvable.");
            return;
        }
        if (!parent.exists() && !parent.mkdirs()) {
            RUNNING.set(false);
            showError(activity, "Impossible de créer le dossier : " + parent.getAbsolutePath());
            return;
        }

        File tmpFile = new File(parent, dbFile.getName() + TMP_SUFFIX);

        activity.runOnUiThread(() ->
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));

        ProgressDialog progress = new ProgressDialog(activity);
        progress.setTitle("Création de la base locale");
        progress.setMessage("Préparation…");
        progress.setIndeterminate(true);
        progress.setCancelable(false);
        progress.show();

        try {
            SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(tmpFile, null);
            initialiseSchema(db);

            String lastDocId = readMeta(db, "last_doc_id");
            long already = parseLong(readMeta(db, "count"), 0L);

            updateProgress(activity, progress,
                    already == 0
                            ? "Connexion au Cloud…"
                            : "Reprise à " + formatCount(already) + " questions…");

            downloadPage(
                    activity,
                    progress,
                    dbFile,
                    tmpFile,
                    db,
                    user,
                    lastDocId,
                    already,
                    readyListener
            );
        } catch (Exception e) {
            RUNNING.set(false);
            clearKeepScreenOn(activity);
            safeDismiss(activity, progress);
            showError(activity, "Impossible de préparer la base locale : " + friendly(e));
        }
    }

    private static void initialiseSchema(SQLiteDatabase db) {
        // CGBOOT001_FIX2_SCHEMA_START
        // Ne pas executer PRAGMA journal_mode via execSQL() :
        // sur Android cette commande renvoie une valeur et peut interrompre
        // l initialisation AVANT la creation des tables.
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS questions (" +
                        "row_number INTEGER," +
                        "original_id TEXT NOT NULL," +
                        "megatheme TEXT," +
                        "theme TEXT," +
                        "question TEXT," +
                        "detail TEXT," +
                        "proposition_a TEXT," +
                        "proposition_b TEXT," +
                        "proposition_c TEXT," +
                        "proposition_d TEXT," +
                        "correct_index INTEGER," +
                        "url_quizypedia TEXT," +
                        "url_internet TEXT," +
                        "image_file TEXT," +
                        "non_trouve INTEGER," +
                        "status TEXT," +
                        "is_image INTEGER" +
                        ")"
        );

        db.execSQL(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_original_id " +
                        "ON questions(original_id)"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_questions_row_number " +
                        "ON questions(row_number)"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_questions_megatheme " +
                        "ON questions(megatheme)"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_questions_theme " +
                        "ON questions(theme)"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_questions_status " +
                        "ON questions(status)"
        );

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS cgboot_meta (" +
                        "k TEXT PRIMARY KEY," +
                        "v TEXT" +
                        ")"
        );
    }

    private static void downloadPage(
            Activity activity,
            ProgressDialog progress,
            File dbFile,
            File tmpFile,
            SQLiteDatabase db,
            FirebaseUser user,
            String lastDocId,
            long count,
            ReadyListener readyListener
    ) {
        FirebaseFirestore firestore = FirebaseFirestore.getInstance();

        Query query = firestore
                .collection("users")
                .document(user.getUid())
                .collection("questions")
                .orderBy(FieldPath.documentId())
                .limit(PAGE_SIZE);

        if (lastDocId != null && !lastDocId.isEmpty()) {
            query = query.startAfter(lastDocId);
        }

        query.get(Source.SERVER).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                finishWithFailure(
                        activity,
                        progress,
                        db,
                        "Téléchargement interrompu : " +
                                friendly(task.getException()) +
                                "\n\nLa prochaine tentative reprendra automatiquement."
                );
                return;
            }

            QuerySnapshot snapshot = task.getResult();
            if (snapshot == null) {
                finishWithFailure(activity, progress, db,
                        "Réponse Cloud vide. Réessaie plus tard.");
                return;
            }

            List<DocumentSnapshot> docs = snapshot.getDocuments();

            if (docs.isEmpty()) {
                finishSuccess(
                        activity, progress, dbFile, tmpFile, db, count, readyListener);
                return;
            }

            String newLastDocId = lastDocId;
            long newCount = count;

            db.beginTransaction();
            try {
                for (DocumentSnapshot doc : docs) {
                    ContentValues cv = toValues(doc);
                    db.insertWithOnConflict(
                            "questions",
                            null,
                            cv,
                            SQLiteDatabase.CONFLICT_REPLACE
                    );
                    newLastDocId = doc.getId();
                    newCount++;
                }

                writeMeta(db, "last_doc_id", newLastDocId);
                writeMeta(db, "count", String.valueOf(newCount));
                db.setTransactionSuccessful();
            } catch (Exception e) {
                finishWithFailure(
                        activity,
                        progress,
                        db,
                        "Erreur d'écriture SQLite : " + friendly(e) +
                                "\n\nLa prochaine tentative reprendra au dernier lot validé."
                );
                return;
            } finally {
                try {
                    if (db.inTransaction()) db.endTransaction();
                } catch (Exception ignored) { }
            }

            updateProgress(
                    activity,
                    progress,
                    "Téléchargement : " + formatCount(newCount) + " questions"
            );

            if (docs.size() < PAGE_SIZE) {
                finishSuccess(
                        activity,
                        progress,
                        dbFile,
                        tmpFile,
                        db,
                        newCount,
                        readyListener
                );
            } else {
                downloadPage(
                        activity,
                        progress,
                        dbFile,
                        tmpFile,
                        db,
                        user,
                        newLastDocId,
                        newCount,
                        readyListener
                );
            }
        });
    }

    private static ContentValues toValues(DocumentSnapshot doc) {
        ContentValues cv = new ContentValues();

        putValue(cv, "row_number", doc.get("row_number"));
        putValue(cv, "original_id",
                doc.get("original_id") != null ? doc.get("original_id") : doc.getId());
        putValue(cv, "megatheme", doc.get("megatheme"));
        putValue(cv, "theme", doc.get("theme"));
        putValue(cv, "question", doc.get("question"));
        putValue(cv, "detail", doc.get("detail"));
        putValue(cv, "proposition_a", doc.get("proposition_a"));
        putValue(cv, "proposition_b", doc.get("proposition_b"));
        putValue(cv, "proposition_c", doc.get("proposition_c"));
        putValue(cv, "proposition_d", doc.get("proposition_d"));
        putValue(cv, "correct_index", doc.get("correct_index"));
        putValue(cv, "url_quizypedia", doc.get("url_quizypedia"));
        putValue(cv, "url_internet", doc.get("url_internet"));
        putValue(cv, "image_file", doc.get("image_file"));
        putValue(cv, "non_trouve", doc.get("non_trouve"));
        putValue(cv, "status", doc.get("status"));
        putValue(cv, "is_image", doc.get("is_image"));

        return cv;
    }

    private static void putValue(ContentValues cv, String key, Object value) {
        if (value == null) {
            cv.putNull(key);
        } else if (value instanceof Boolean) {
            cv.put(key, ((Boolean) value) ? 1 : 0);
        } else if (value instanceof Integer) {
            cv.put(key, (Integer) value);
        } else if (value instanceof Long) {
            cv.put(key, (Long) value);
        } else if (value instanceof Double) {
            cv.put(key, (Double) value);
        } else if (value instanceof Float) {
            cv.put(key, (Float) value);
        } else {
            cv.put(key, String.valueOf(value));
        }
    }

    private static String readMeta(SQLiteDatabase db, String key) {
        android.database.Cursor cursor = null;
        try {
            cursor = db.rawQuery(
                    "SELECT v FROM cgboot_meta WHERE k=? LIMIT 1",
                    new String[]{key}
            );
            return cursor.moveToFirst() ? cursor.getString(0) : "";
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static void writeMeta(SQLiteDatabase db, String key, String value) {
        ContentValues cv = new ContentValues();
        cv.put("k", key);
        cv.put("v", value);
        db.insertWithOnConflict(
                "cgboot_meta",
                null,
                cv,
                SQLiteDatabase.CONFLICT_REPLACE
        );
    }

    private static void finishSuccess(
            Activity activity,
            ProgressDialog progress,
            File dbFile,
            File tmpFile,
            SQLiteDatabase db,
            long count,
            ReadyListener readyListener
    ) {
        try {
            long sqlCount = queryCount(db);
            if (sqlCount <= 0) {
                finishWithFailure(
                        activity, progress, db,
                        "Aucune question n'a été téléchargée."
                );
                return;
            }

            try {
                db.execSQL("DROP TABLE IF EXISTS cgboot_meta");
            } catch (Exception ignored) { }

            try {
                db.close();
            } catch (Exception ignored) { }

            deleteSidecars(tmpFile);

            if (!moveIntoPlace(tmpFile, dbFile)) {
                RUNNING.set(false);
                clearKeepScreenOn(activity);
                safeDismiss(activity, progress);
                showError(
                        activity,
                        "Téléchargement terminé mais impossible d'installer la base locale."
                );
                return;
            }

            RUNNING.set(false);
            clearKeepScreenOn(activity);
            safeDismiss(activity, progress);

            activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
                    .setTitle("Base locale prête")
                    .setMessage(
                            formatCount(sqlCount) +
                                    " questions ont été installées depuis Firestore."
                    )
                    .setPositiveButton("Continuer", (dialog, which) -> {
                        dialog.dismiss();
                        if (readyListener != null) readyListener.onReady();
                    })
                    .show());

        } catch (Exception e) {
            finishWithFailure(
                    activity,
                    progress,
                    db,
                    "Erreur pendant la finalisation : " + friendly(e)
            );
        }
    }

    private static long queryCount(SQLiteDatabase db) {
        android.database.Cursor cursor = null;
        try {
            cursor = db.rawQuery("SELECT COUNT(*) FROM questions", null);
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static void finishWithFailure(
            Activity activity,
            ProgressDialog progress,
            SQLiteDatabase db,
            String message
    ) {
        try {
            db.close();
        } catch (Exception ignored) { }

        RUNNING.set(false);
        clearKeepScreenOn(activity);
        safeDismiss(activity, progress);
        showError(activity, message);
    }

    private static boolean moveIntoPlace(File src, File dst) {
        if (dst.exists() && !dst.delete()) return false;

        if (src.renameTo(dst)) return true;

        try (FileInputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dst)) {
            byte[] buffer = new byte[1024 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
            }
            out.flush();
        } catch (IOException e) {
            return false;
        }

        if (dst.length() <= 0) return false;
        //noinspection ResultOfMethodCallIgnored
        src.delete();
        return true;
    }

    private static void deleteSidecars(File file) {
        File wal = new File(file.getAbsolutePath() + "-wal");
        File shm = new File(file.getAbsolutePath() + "-shm");
        File journal = new File(file.getAbsolutePath() + "-journal");
        //noinspection ResultOfMethodCallIgnored
        wal.delete();
        //noinspection ResultOfMethodCallIgnored
        shm.delete();
        //noinspection ResultOfMethodCallIgnored
        journal.delete();
    }

    private static void updateProgress(
            Activity activity,
            ProgressDialog dialog,
            String message
    ) {
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && dialog.isShowing()) {
                dialog.setMessage(message);
            }
        });
    }

    private static void safeDismiss(Activity activity, ProgressDialog dialog) {
        activity.runOnUiThread(() -> {
            try {
                if (dialog.isShowing()) dialog.dismiss();
            } catch (Exception ignored) { }
        });
    }

    private static void showError(Activity activity, String message) {
        activity.runOnUiThread(() -> {
            if (activity.isFinishing()) return;
            new AlertDialog.Builder(activity)
                    .setTitle("Téléchargement impossible")
                    .setMessage(message)
                    .setPositiveButton("OK", null)
                    .show();
        });
    }

    private static void clearKeepScreenOn(Activity activity) {
        activity.runOnUiThread(() -> {
            try {
                activity.getWindow().clearFlags(
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) { }
        });
    }

    private static long parseLong(String value, long fallback) {
        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String formatCount(long n) {
        return String.format(java.util.Locale.FRANCE, "%,d", n)
                .replace('\u00a0', ' ')
                .replace('\u202f', ' ');
    }

    private static String friendly(Throwable t) {
        if (t == null) return "erreur inconnue";
        String msg = t.getMessage();
        return (msg == null || msg.trim().isEmpty())
                ? t.getClass().getSimpleName()
                : msg;
    }
}
