package fr.culturegenerale.android.tablet;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * CGANDROID012 · LOCAL_GAME_ENGINE001 / PERSISTENT_POOL001
 *
 * Sélection et état pédagogique locaux dans SQLite.
 * Le Cloud n'est plus requis pour choisir la prochaine question.
 */
final class CgLocalEngine extends SQLiteOpenHelper {

    private static final String DB_NAME = "cgandroid012_local_learning.db";
    private static final int DB_VERSION = 2;
    private static final int THEME_COOLDOWN = 8;
    private static final long CATALOG_REFRESH_MS = 6L * 60L * 60L * 1000L;

    private static final String META_READY = "catalog_ready";
    private static final String META_UID = "uid";
    private static final String META_SYNC_AT = "catalog_sync_at";
    private static final String META_SESSION = "current_session";
    private static final String META_HISTORY_SEEDED = "history_seeded";

    private final Random random = new Random();

    CgLocalEngine(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE questions (" +
                        "id TEXT PRIMARY KEY," +
                        "megatheme TEXT NOT NULL DEFAULT ''," +
                        "theme TEXT NOT NULL DEFAULT ''," +
                        "question_text TEXT NOT NULL DEFAULT ''," +
                        "detail TEXT NOT NULL DEFAULT ''," +
                        "option_a TEXT NOT NULL DEFAULT ''," +
                        "option_b TEXT NOT NULL DEFAULT ''," +
                        "option_c TEXT NOT NULL DEFAULT ''," +
                        "option_d TEXT NOT NULL DEFAULT ''," +
                        "correct_index INTEGER NOT NULL DEFAULT 0," +
                        "image_file TEXT NOT NULL DEFAULT ''," +
                        "is_image INTEGER NOT NULL DEFAULT 0," +
                        "excluded_x INTEGER NOT NULL DEFAULT 0" +
                        ")"
        );
        db.execSQL("CREATE INDEX idx_questions_megatheme ON questions(megatheme)");

        db.execSQL(
                "CREATE TABLE learning (" +
                        "question_id TEXT PRIMARY KEY," +
                        "fail_count INTEGER NOT NULL DEFAULT 0," +
                        "mastered INTEGER NOT NULL DEFAULT 0," +
                        "updated_at INTEGER NOT NULL DEFAULT 0" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE recent_themes (" +
                        "seq INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "theme_key TEXT NOT NULL" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE session_served (" +
                        "session_id TEXT NOT NULL," +
                        "question_id TEXT NOT NULL," +
                        "PRIMARY KEY(session_id, question_id)" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE meta (" +
                        "key TEXT PRIMARY KEY," +
                        "value TEXT NOT NULL DEFAULT ''" +
                        ")"
        );

        createAttemptLedger(db);
    }

    @Override
    public void onUpgrade(
            SQLiteDatabase db,
            int oldVersion,
            int newVersion
    ) {
        if (oldVersion < 2) {
            createAttemptLedger(db);
        }
        if (newVersion > DB_VERSION) {
            throw new IllegalStateException(
                    "Migration locale inconnue : "
                            + oldVersion
                            + " -> "
                            + newVersion
            );
        }
    }

    private static void createAttemptLedger(
            SQLiteDatabase db
    ) {
        db.execSQL(
                "CREATE TABLE IF NOT EXISTS attempts (" +
                        "attempt_id TEXT PRIMARY KEY," +
                        "session_id TEXT NOT NULL DEFAULT ''," +
                        "seq INTEGER NOT NULL DEFAULT 0," +
                        "question_id TEXT NOT NULL," +
                        "correct INTEGER NOT NULL DEFAULT 0," +
                        "revision INTEGER NOT NULL DEFAULT 1," +
                        "played_at INTEGER NOT NULL DEFAULT 0," +
                        "response_ms INTEGER NOT NULL DEFAULT 0" +
                        ")"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_attempts_session_seq " +
                        "ON attempts(session_id, seq)"
        );
        db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_attempts_played_at " +
                        "ON attempts(played_at DESC)"
        );
    }


    synchronized boolean historySeeded() {
        return "1".equals(
                meta(
                        getReadableDatabase(),
                        META_HISTORY_SEEDED
                )
        );
    }


    synchronized void importCloudHistory(
            List<CgHistoryItem> items
    ) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            if (items != null) {
                for (CgHistoryItem item : items) {
                    if (
                            item == null ||
                            item.questionId == null ||
                            item.questionId.trim().isEmpty()
                    ) {
                        continue;
                    }

                    String attemptId =
                            item.attemptId == null
                                    ? ""
                                    : item.attemptId.trim();

                    if (attemptId.isEmpty()) {
                        attemptId =
                                "cloud_"
                                        + item.questionId
                                        + "_"
                                        + item.playedAtMs
                                        + "_"
                                        + (item.correct ? "1" : "0");
                    }

                    ContentValues cv = new ContentValues();
                    cv.put("attempt_id", attemptId);
                    cv.put("session_id", "cloud");
                    cv.put("seq", 0);
                    cv.put("question_id", item.questionId);
                    cv.put("correct", item.correct ? 1 : 0);
                    cv.put("revision", 1);
                    cv.put("played_at", item.playedAtMs);
                    cv.put("response_ms", 0);

                    db.insertWithOnConflict(
                            "attempts",
                            null,
                            cv,
                            SQLiteDatabase.CONFLICT_IGNORE
                    );
                }
            }

            putMeta(db, META_HISTORY_SEEDED, "1");
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }


    synchronized CgLocalAttempt recordAttempt(
            String sessionId,
            String attemptId,
            String questionId,
            boolean correct,
            long playedAtMs,
            long responseMs
    ) {
        SQLiteDatabase db = getWritableDatabase();

        Cursor seqCursor = db.rawQuery(
                "SELECT COALESCE(MAX(seq),0)+1 " +
                        "FROM attempts WHERE session_id=?",
                new String[]{safe(sessionId)}
        );

        int seq = 1;
        try {
            if (seqCursor.moveToFirst()) {
                seq = Math.max(1, seqCursor.getInt(0));
            }
        } finally {
            seqCursor.close();
        }

        ContentValues cv = new ContentValues();
        cv.put("attempt_id", attemptId);
        cv.put("session_id", safe(sessionId));
        cv.put("seq", seq);
        cv.put("question_id", questionId);
        cv.put("correct", correct ? 1 : 0);
        cv.put("revision", 1);
        cv.put("played_at", playedAtMs);
        cv.put("response_ms", Math.max(0L, responseMs));

        db.insertWithOnConflict(
                "attempts",
                null,
                cv,
                SQLiteDatabase.CONFLICT_REPLACE
        );

        return new CgLocalAttempt(
                attemptId,
                safe(sessionId),
                seq,
                questionId,
                correct,
                1,
                playedAtMs
        );
    }


    synchronized void reviseAttempt(
            String attemptId,
            boolean correct,
            int revision,
            long playedAtMs,
            long responseMs
    ) {
        if (
                attemptId == null ||
                attemptId.trim().isEmpty()
        ) {
            return;
        }

        ContentValues cv = new ContentValues();
        cv.put("correct", correct ? 1 : 0);
        cv.put("revision", Math.max(1, revision));
        cv.put("played_at", playedAtMs);
        cv.put("response_ms", Math.max(0L, responseMs));

        getWritableDatabase().update(
                "attempts",
                cv,
                "attempt_id=?",
                new String[]{attemptId}
        );
    }


    synchronized CgLocalAttempt previousAttempt(
            String sessionId,
            int beforeSeq
    ) {
        Cursor c = getReadableDatabase().query(
                "attempts",
                new String[]{
                        "attempt_id",
                        "session_id",
                        "seq",
                        "question_id",
                        "correct",
                        "revision",
                        "played_at"
                },
                "session_id=? AND seq<?",
                new String[]{
                        safe(sessionId),
                        String.valueOf(beforeSeq)
                },
                null,
                null,
                null,
                "seq DESC",
                "1"
        );

        try {
            if (!c.moveToFirst()) {
                return null;
            }
            return new CgLocalAttempt(
                    c.getString(0),
                    c.getString(1),
                    c.getInt(2),
                    c.getString(3),
                    c.getInt(4) != 0,
                    c.getInt(5),
                    c.getLong(6)
            );
        } finally {
            c.close();
        }
    }


    synchronized CgQuestion questionById(
            String questionId
    ) {
        if (
                questionId == null ||
                questionId.trim().isEmpty()
        ) {
            return null;
        }

        Cursor c = getReadableDatabase().query(
                "questions",
                null,
                "id=?",
                new String[]{questionId},
                null,
                null,
                null,
                "1"
        );

        try {
            return c.moveToFirst()
                    ? readQuestion(c)
                    : null;
        } finally {
            c.close();
        }
    }


    synchronized List<CgHistoryItem> listLocalHistory(
            int maxItems
    ) {
        List<CgHistoryItem> out =
                new ArrayList<>();

        Cursor c = getReadableDatabase().rawQuery(
                "SELECT " +
                        "a.attempt_id," +
                        "a.question_id," +
                        "a.correct," +
                        "a.played_at," +
                        "q.megatheme," +
                        "q.theme," +
                        "q.question_text," +
                        "q.option_a," +
                        "q.option_b," +
                        "q.option_c," +
                        "q.option_d," +
                        "q.correct_index " +
                        "FROM attempts a " +
                        "LEFT JOIN questions q ON q.id=a.question_id " +
                        "ORDER BY a.played_at DESC LIMIT ?",
                new String[]{
                        String.valueOf(
                                Math.max(1, maxItems)
                        )
                }
        );

        try {
            while (c.moveToNext()) {
                CgHistoryItem item =
                        new CgHistoryItem();

                item.attemptId = safe(c.getString(0));
                item.questionId = safe(c.getString(1));
                item.correct = c.getInt(2) != 0;
                item.playedAtMs = c.getLong(3);
                item.domain = safe(c.getString(4));
                item.theme = safe(c.getString(5));
                item.question = safe(c.getString(6));

                int correctIndex = c.getInt(11);

                if (
                        correctIndex >= 1 &&
                        correctIndex <= 4
                ) {
                    item.correctAnswer =
                            safe(
                                    c.getString(
                                            6 + correctIndex
                                    )
                            );
                }

                item.interactionMode =
                        "local_attempt_ledger";

                out.add(item);
            }
        } finally {
            c.close();
        }

        return out;
    }


    synchronized boolean isReady(String uid) {
        if (uid == null || uid.trim().isEmpty()) return false;
        SQLiteDatabase db = getReadableDatabase();
        return "1".equals(meta(db, META_READY))
                && uid.trim().equals(meta(db, META_UID))
                && questionCount(db) > 0;
    }

    synchronized boolean needsCatalogRefresh(String uid) {
        if (!isReady(uid)) return false;
        long at = parseLong(meta(getReadableDatabase(), META_SYNC_AT));
        return at <= 0L || System.currentTimeMillis() - at >= CATALOG_REFRESH_MS;
    }

    synchronized int catalogSize() {
        return questionCount(getReadableDatabase());
    }

    synchronized void bootstrapSync(String token, String uid) throws Exception {
        if (isReady(uid)) return;

        List<LocalQuestionRow> rows = fetchQuestions(token, uid);
        if (rows.isEmpty()) throw new Exception("Catalogue local vide.");

        Set<String> bucketX = fetchBucketX(token, uid);
        Map<String, LocalLearningState> learning = fetchLearningState(token, uid);

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            replaceCatalog(db, rows, bucketX);

            db.delete("learning", null, null);
            db.delete("recent_themes", null, null);
            db.delete("session_served", null, null);

            for (Map.Entry<String, LocalLearningState> e : learning.entrySet()) {
                writeLearning(db, e.getKey(), e.getValue());
            }

            putMeta(db, META_UID, uid);
            putMeta(db, META_READY, "1");
            putMeta(db, META_SYNC_AT, String.valueOf(System.currentTimeMillis()));
            putMeta(db, META_SESSION, "");

            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    synchronized void refreshCatalogSync(String token, String uid) throws Exception {
        if (!isReady(uid)) {
            bootstrapSync(token, uid);
            return;
        }

        List<LocalQuestionRow> rows = fetchQuestions(token, uid);
        if (rows.isEmpty()) throw new Exception("Catalogue distant vide.");

        Set<String> bucketX = fetchBucketX(token, uid);

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            replaceCatalog(db, rows, bucketX);
            putMeta(db, META_SYNC_AT, String.valueOf(System.currentTimeMillis()));
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    synchronized void beginSession(String sessionId) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("session_served", null, null);
            putMeta(db, META_SESSION, sessionId == null ? "" : sessionId);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    synchronized void endSession() {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("session_served", null, null);
        putMeta(db, META_SESSION, "");
    }

    synchronized CgQuestion nextQuestion(String domain, CgFlags flags) {
        SQLiteDatabase db = getWritableDatabase();
        String sessionId = meta(db, META_SESSION);
        if (sessionId.isEmpty()) return null;

        Set<String> served = servedIds(db, sessionId);

        boolean allDomains =
                domain == null
                        || domain.trim().isEmpty()
                        || "Toutes les questions".equals(domain.trim());

        String sql =
                "SELECT q.id,q.megatheme,q.theme,q.question_text,q.detail," +
                        "q.option_a,q.option_b,q.option_c,q.option_d," +
                        "q.correct_index,q.image_file,q.is_image," +
                        "COALESCE(l.fail_count,0) AS local_fail " +
                        "FROM questions q " +
                        "LEFT JOIN learning l ON l.question_id=q.id " +
                        "WHERE q.excluded_x=0 AND COALESCE(l.mastered,0)=0 ";

        List<String> args = new ArrayList<>();
        if (!allDomains) {
            sql += "AND q.megatheme=? ";
            args.add(domain.trim());
        }

        Cursor c = db.rawQuery(sql, args.toArray(new String[0]));
        int minFail = Integer.MAX_VALUE;
        List<LocalCandidate> candidates = new ArrayList<>();

        try {
            while (c.moveToNext()) {
                CgQuestion q = readQuestion(c);

                if (q.id.isEmpty() || served.contains(q.id)) continue;
                if (flags != null && flags.isTExcluded(q)) continue;

                int fail = c.getInt(c.getColumnIndexOrThrow("local_fail"));

                if (fail < minFail) {
                    minFail = fail;
                    candidates.clear();
                }

                if (fail == minFail) {
                    LocalCandidate candidate = new LocalCandidate();
                    candidate.question = q;
                    candidate.themeKey = themeKey(q);
                    candidates.add(candidate);
                }
            }
        } finally {
            c.close();
        }

        if (candidates.isEmpty()) return null;

        List<String> recent = recentThemes(db);
        List<LocalCandidate> outsideCooldown = new ArrayList<>();

        for (LocalCandidate candidate : candidates) {
            if (!recent.contains(candidate.themeKey)) {
                outsideCooldown.add(candidate);
            }
        }

        List<LocalCandidate> selectable;

        if (!outsideCooldown.isEmpty()) {
            selectable = outsideCooldown;
        } else {
            int oldestIndex = -1;
            selectable = new ArrayList<>();

            for (LocalCandidate candidate : candidates) {
                int index = recent.indexOf(candidate.themeKey);

                if (index > oldestIndex) {
                    oldestIndex = index;
                    selectable.clear();
                    selectable.add(candidate);
                } else if (index == oldestIndex) {
                    selectable.add(candidate);
                }
            }

            if (selectable.isEmpty()) selectable = candidates;
        }

        Collections.shuffle(selectable, random);
        LocalCandidate chosen = selectable.get(0);

        ContentValues servedCv = new ContentValues();
        servedCv.put("session_id", sessionId);
        servedCv.put("question_id", chosen.question.id);

        db.insertWithOnConflict(
                "session_served",
                null,
                servedCv,
                SQLiteDatabase.CONFLICT_IGNORE
        );

        rememberTheme(db, chosen.themeKey);
        return chosen.question;
    }

    synchronized void recordAnswer(String questionId, boolean correct) {
        if (questionId == null || questionId.trim().isEmpty()) return;

        SQLiteDatabase db = getWritableDatabase();
        LocalLearningState state = readLearning(db, questionId);

        if (correct) {
            state.mastered = true;
        } else {
            state.failCount = Math.max(0, state.failCount) + 1;
        }

        writeLearning(db, questionId, state);
    }

    synchronized void reviseAnswer(
            String questionId,
            boolean oldCorrect,
            boolean newCorrect
    ) {
        if (
                questionId == null
                        || questionId.trim().isEmpty()
                        || oldCorrect == newCorrect
        ) {
            return;
        }

        SQLiteDatabase db = getWritableDatabase();
        LocalLearningState state = readLearning(db, questionId);

        if (!oldCorrect && newCorrect) {
            state.failCount = Math.max(0, state.failCount - 1);
            state.mastered = true;
        } else if (oldCorrect && !newCorrect) {
            state.mastered = false;
            state.failCount = Math.max(0, state.failCount) + 1;
        }

        writeLearning(db, questionId, state);
    }

    synchronized void clearLearning() {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("learning", null, null);
            db.delete("recent_themes", null, null);
            db.delete("session_served", null, null);
            db.delete("attempts", null, null);
            putMeta(db, META_SESSION, "");
            putMeta(db, META_HISTORY_SEEDED, "1");
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private void replaceCatalog(
            SQLiteDatabase db,
            List<LocalQuestionRow> rows,
            Set<String> bucketX
    ) {
        db.delete("questions", null, null);

        for (LocalQuestionRow row : rows) {
            CgQuestion q = row.question;
            ContentValues cv = new ContentValues();

            cv.put("id", q.id);
            cv.put("megatheme", safe(q.megatheme));
            cv.put("theme", safe(q.theme));
            cv.put("question_text", safe(q.question));
            cv.put("detail", safe(q.detail));
            cv.put("option_a", safe(q.options[0]));
            cv.put("option_b", safe(q.options[1]));
            cv.put("option_c", safe(q.options[2]));
            cv.put("option_d", safe(q.options[3]));
            cv.put("correct_index", q.correctIndex);
            cv.put("image_file", safe(q.imageFile));
            cv.put("is_image", q.isImage ? 1 : 0);

            boolean x =
                    "X".equalsIgnoreCase(row.status)
                            || bucketX.contains(q.id);

            cv.put("excluded_x", x ? 1 : 0);

            db.insertWithOnConflict(
                    "questions",
                    null,
                    cv,
                    SQLiteDatabase.CONFLICT_REPLACE
            );
        }
    }

    private List<LocalQuestionRow> fetchQuestions(
            String token,
            String uid
    ) throws Exception {
        List<LocalQuestionRow> out = new ArrayList<>();
        String pageToken = "";

        for (;;) {
            String url =
                    firestoreBase(uid)
                            + "/questions?pageSize=1000"
                            + (
                            pageToken.isEmpty()
                                    ? ""
                                    : "&pageToken=" + enc(pageToken)
                    );

            JSONObject response = CgHttp.json("GET", url, token, null);
            JSONArray docs = response.optJSONArray("documents");

            if (docs != null) {
                for (int i = 0; i < docs.length(); i++) {
                    JSONObject doc = docs.optJSONObject(i);
                    if (doc == null) continue;

                    JSONObject fields = doc.optJSONObject("fields");
                    if (fields == null) continue;

                    CgQuestion q = parseQuestion(doc, fields);

                    if (
                            q.id.isEmpty()
                                    || q.question.isEmpty()
                                    || q.correctIndex < 1
                                    || q.correctIndex > 4
                    ) {
                        continue;
                    }

                    LocalQuestionRow row = new LocalQuestionRow();
                    row.question = q;
                    row.status = str(fields, "status");
                    out.add(row);
                }
            }

            pageToken = response.optString("nextPageToken", "");
            if (pageToken.isEmpty()) break;
        }

        return out;
    }

    private Set<String> fetchBucketX(
            String token,
            String uid
    ) throws Exception {
        Set<String> out = new HashSet<>();
        String pageToken = "";

        for (;;) {
            String url =
                    firestoreBase(uid)
                            + "/statusBuckets?pageSize=1000"
                            + (
                            pageToken.isEmpty()
                                    ? ""
                                    : "&pageToken=" + enc(pageToken)
                    );

            JSONObject response = CgHttp.json("GET", url, token, null);
            JSONArray docs = response.optJSONArray("documents");

            if (docs != null) {
                for (int i = 0; i < docs.length(); i++) {
                    JSONObject doc = docs.optJSONObject(i);
                    if (doc == null) continue;

                    JSONObject fields = doc.optJSONObject("fields");
                    if (fields == null) continue;

                    JSONObject statusesValue = fields.optJSONObject("statuses");
                    if (statusesValue == null) continue;

                    JSONObject mapValue = statusesValue.optJSONObject("mapValue");
                    if (mapValue == null) continue;

                    JSONObject statuses = mapValue.optJSONObject("fields");
                    if (statuses == null) continue;

                    java.util.Iterator<String> keys = statuses.keys();

                    while (keys.hasNext()) {
                        String id = keys.next();
                        JSONObject value = statuses.optJSONObject(id);

                        if (
                                value != null
                                        && "X".equalsIgnoreCase(
                                        typedString(value)
                                )
                        ) {
                            out.add(id);
                        }
                    }
                }
            }

            pageToken = response.optString("nextPageToken", "");
            if (pageToken.isEmpty()) break;
        }

        return out;
    }

    private Map<String, LocalLearningState> fetchLearningState(
            String token,
            String uid
    ) throws Exception {
        Map<String, LocalLearningState> out = new HashMap<>();
        Set<String> seenAttempts = new HashSet<>();
        String pageToken = "";

        for (;;) {
            String url =
                    firestoreBase(uid)
                            + "/play_history?pageSize=1000"
                            + "&orderBy=client_played_at_ms%20desc"
                            + (
                            pageToken.isEmpty()
                                    ? ""
                                    : "&pageToken=" + enc(pageToken)
                    );

            JSONObject response = CgHttp.json("GET", url, token, null);
            JSONArray docs = response.optJSONArray("documents");

            if (docs != null) {
                for (int i = 0; i < docs.length(); i++) {
                    JSONObject doc = docs.optJSONObject(i);
                    if (doc == null) continue;

                    JSONObject fields = doc.optJSONObject("fields");
                    if (fields == null) continue;

                    Boolean correct = boolNullable(fields, "is_correct");
                    if (correct == null) continue;

                    String attemptId = str(fields, "attempt_id");

                    if (!attemptId.isEmpty()) {
                        if (seenAttempts.contains(attemptId)) continue;
                        seenAttempts.add(attemptId);
                    }

                    String questionId = str(fields, "question_id");

                    if (questionId.isEmpty()) {
                        JSONObject snap = mapFields(fields, "question_snapshot");
                        if (snap != null) {
                            questionId = str(snap, "question_id");
                        }
                    }

                    if (questionId.isEmpty()) {
                        questionId = numericString(
                                fields,
                                "question_row_number"
                        );
                    }

                    if (questionId.isEmpty()) continue;

                    LocalLearningState state = out.get(questionId);

                    if (state == null) {
                        state = new LocalLearningState();
                        out.put(questionId, state);
                    }

                    if (correct) {
                        state.mastered = true;
                    } else {
                        state.failCount =
                                Math.max(0, state.failCount) + 1;
                    }
                }
            }

            pageToken = response.optString("nextPageToken", "");
            if (pageToken.isEmpty()) break;
        }

        return out;
    }

    private static String firestoreBase(String uid) {
        return "https://firestore.googleapis.com/v1/projects/"
                + enc(BuildConfig.FIREBASE_PROJECT_ID)
                + "/databases/(default)/documents/users/"
                + enc(uid);
    }

    private CgQuestion parseQuestion(
            JSONObject doc,
            JSONObject fields
    ) {
        CgQuestion q = new CgQuestion();

        String name = doc.optString("name", "");
        int slash = name.lastIndexOf('/');
        q.id = slash >= 0 ? name.substring(slash + 1) : name;

        q.megatheme = str(fields, "megatheme");
        q.theme = str(fields, "theme");
        q.question = str(fields, "question");
        q.detail = str(fields, "detail");
        q.options[0] = str(fields, "proposition_a");
        q.options[1] = str(fields, "proposition_b");
        q.options[2] = str(fields, "proposition_c");
        q.options[3] = str(fields, "proposition_d");
        q.correctIndex = integer(fields, "correct_index");
        q.imageFile = str(fields, "image_file");
        q.isImage = bool(fields, "is_image") || !q.imageFile.isEmpty();

        return q;
    }

    private CgQuestion readQuestion(Cursor c) {
        CgQuestion q = new CgQuestion();

        q.id = c.getString(c.getColumnIndexOrThrow("id"));
        q.megatheme = c.getString(c.getColumnIndexOrThrow("megatheme"));
        q.theme = c.getString(c.getColumnIndexOrThrow("theme"));
        q.question = c.getString(c.getColumnIndexOrThrow("question_text"));
        q.detail = c.getString(c.getColumnIndexOrThrow("detail"));
        q.options[0] = c.getString(c.getColumnIndexOrThrow("option_a"));
        q.options[1] = c.getString(c.getColumnIndexOrThrow("option_b"));
        q.options[2] = c.getString(c.getColumnIndexOrThrow("option_c"));
        q.options[3] = c.getString(c.getColumnIndexOrThrow("option_d"));
        q.correctIndex = c.getInt(c.getColumnIndexOrThrow("correct_index"));
        q.imageFile = c.getString(c.getColumnIndexOrThrow("image_file"));
        q.isImage = c.getInt(c.getColumnIndexOrThrow("is_image")) != 0;

        return q;
    }

    private Set<String> servedIds(SQLiteDatabase db, String sessionId) {
        Set<String> out = new HashSet<>();

        Cursor c = db.query(
                "session_served",
                new String[]{"question_id"},
                "session_id=?",
                new String[]{sessionId},
                null,
                null,
                null
        );

        try {
            while (c.moveToNext()) out.add(c.getString(0));
        } finally {
            c.close();
        }

        return out;
    }

    private List<String> recentThemes(SQLiteDatabase db) {
        List<String> out = new ArrayList<>();

        Cursor c = db.query(
                "recent_themes",
                new String[]{"theme_key"},
                null,
                null,
                null,
                null,
                "seq DESC",
                String.valueOf(THEME_COOLDOWN)
        );

        try {
            while (c.moveToNext()) out.add(c.getString(0));
        } finally {
            c.close();
        }

        return out;
    }

    private void rememberTheme(SQLiteDatabase db, String themeKey) {
        if (themeKey == null || themeKey.isEmpty()) return;

        ContentValues cv = new ContentValues();
        cv.put("theme_key", themeKey);
        db.insert("recent_themes", null, cv);

        db.execSQL(
                "DELETE FROM recent_themes WHERE seq NOT IN (" +
                        "SELECT seq FROM recent_themes " +
                        "ORDER BY seq DESC LIMIT " +
                        THEME_COOLDOWN +
                        ")"
        );
    }

    private LocalLearningState readLearning(
            SQLiteDatabase db,
            String questionId
    ) {
        LocalLearningState state = new LocalLearningState();

        Cursor c = db.query(
                "learning",
                new String[]{"fail_count", "mastered"},
                "question_id=?",
                new String[]{questionId},
                null,
                null,
                null
        );

        try {
            if (c.moveToFirst()) {
                state.failCount = c.getInt(0);
                state.mastered = c.getInt(1) != 0;
            }
        } finally {
            c.close();
        }

        return state;
    }

    private void writeLearning(
            SQLiteDatabase db,
            String questionId,
            LocalLearningState state
    ) {
        ContentValues cv = new ContentValues();
        cv.put("question_id", questionId);
        cv.put("fail_count", Math.max(0, state.failCount));
        cv.put("mastered", state.mastered ? 1 : 0);
        cv.put("updated_at", System.currentTimeMillis());

        db.insertWithOnConflict(
                "learning",
                null,
                cv,
                SQLiteDatabase.CONFLICT_REPLACE
        );
    }

    private int questionCount(SQLiteDatabase db) {
        Cursor c = db.rawQuery(
                "SELECT COUNT(*) FROM questions",
                null
        );

        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    private static String themeKey(CgQuestion q) {
        String base =
                q.theme == null || q.theme.trim().isEmpty()
                        ? q.megatheme
                        : q.theme;
        return CgFlags.comparisonKey(base);
    }

    private static String meta(SQLiteDatabase db, String key) {
        Cursor c = db.query(
                "meta",
                new String[]{"value"},
                "key=?",
                new String[]{key},
                null,
                null,
                null
        );

        try {
            return c.moveToFirst() ? safe(c.getString(0)) : "";
        } finally {
            c.close();
        }
    }

    private static void putMeta(
            SQLiteDatabase db,
            String key,
            String value
    ) {
        ContentValues cv = new ContentValues();
        cv.put("key", key);
        cv.put("value", value == null ? "" : value);

        db.insertWithOnConflict(
                "meta",
                null,
                cv,
                SQLiteDatabase.CONFLICT_REPLACE
        );
    }

    private static JSONObject mapFields(JSONObject fields, String key) {
        JSONObject value = fields.optJSONObject(key);
        if (value == null) return null;

        JSONObject map = value.optJSONObject("mapValue");
        return map == null ? null : map.optJSONObject("fields");
    }

    private static String str(JSONObject fields, String key) {
        JSONObject value = fields.optJSONObject(key);
        return value == null ? "" : typedString(value);
    }

    private static String typedString(JSONObject value) {
        if (value.has("stringValue")) return value.optString("stringValue", "");
        if (value.has("integerValue")) return value.optString("integerValue", "");
        if (value.has("doubleValue")) return value.optString("doubleValue", "");
        if (value.has("booleanValue")) {
            return String.valueOf(value.optBoolean("booleanValue", false));
        }
        return "";
    }

    private static int integer(JSONObject fields, String key) {
        try {
            return Integer.parseInt(str(fields, key));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static boolean bool(JSONObject fields, String key) {
        Boolean value = boolNullable(fields, key);
        return value != null && value;
    }

    private static Boolean boolNullable(JSONObject fields, String key) {
        JSONObject value = fields.optJSONObject(key);

        if (value == null || !value.has("booleanValue")) return null;
        return value.optBoolean("booleanValue", false);
    }

    private static String numericString(JSONObject fields, String key) {
        JSONObject value = fields.optJSONObject(key);
        if (value == null) return "";
        if (value.has("integerValue")) return value.optString("integerValue", "");
        return typedString(value);
    }

    private static String enc(String value) {
        try {
            return URLEncoder.encode(
                    value == null ? "" : value,
                    StandardCharsets.UTF_8.name()
            );
        } catch (Exception ignored) {
            return value == null ? "" : value;
        }
    }

    private static long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static final class LocalQuestionRow {
        CgQuestion question;
        String status = "";
    }

    private static final class LocalLearningState {
        int failCount = 0;
        boolean mastered = false;
    }

    private static final class LocalCandidate {
        CgQuestion question;
        String themeKey = "";
    }
}

final class CgLocalAttempt {

    final String attemptId;
    final String sessionId;
    final int seq;
    final String questionId;
    final boolean correct;
    final int revision;
    final long playedAtMs;

    CgLocalAttempt(
            String attemptId,
            String sessionId,
            int seq,
            String questionId,
            boolean correct,
            int revision,
            long playedAtMs
    ) {
        this.attemptId =
                attemptId == null ? "" : attemptId;
        this.sessionId =
                sessionId == null ? "" : sessionId;
        this.seq = seq;
        this.questionId =
                questionId == null ? "" : questionId;
        this.correct = correct;
        this.revision = Math.max(1, revision);
        this.playedAtMs = playedAtMs;
    }
}
