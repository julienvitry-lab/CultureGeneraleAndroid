package fr.culturegenerale.android;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CGHISTORY001B · PLAYLOG_SAFE001
 *
 * Collecte non bloquante de l'historique de jeu.
 *
 * Principes :
 * - aucun accès à questions_base.sqlite ;
 * - aucun traitement au démarrage ;
 * - aucun blocage du thread UI ;
 * - toute erreur Firestore est absorbée et journalisée ;
 * - le SDK Firestore gère sa propre file hors ligne.
 */
final class CgHistory001B {
    private static final String TAG = "CGHISTORY001B";
    private static final String WRITER = "CGHISTORY001B_PLAYLOG_SAFE001";

    private static final ExecutorService EXECUTOR =
            Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(() -> {
                    android.os.Process.setThreadPriority(
                            android.os.Process.THREAD_PRIORITY_BACKGROUND
                    );
                    runnable.run();
                }, "CGHISTORY001B-Playlog");
                thread.setDaemon(true);
                return thread;
            });

    private CgHistory001B() { }

    static String newSessionId(String mode) {
        String prefix = safe(mode);
        if (prefix.length() == 0) prefix = "session";
        return prefix + "_" + UUID.randomUUID();
    }

    /*
     * CGANDROID017 · HISTORY_QR_SNAPSHOT001
     */
    static void logSafe(
            Context context,
            String sessionId,
            String gameMode,
            String revisionMode,
            String playType,
            MainActivity.Question q,
            int selectedIndex,
            Boolean isCorrect,
            String result,
            long responseTimeMs
    ) {

        if (context == null || q == null) {
            return;
        }

        final Context appContext =
                context.getApplicationContext();

        final long row = q.row;
        final String domain = safe(q.domain);
        final String theme = safe(q.theme);
        final String question = safe(q.question);
        final String detail = safe(q.detail);
        final String imageFile = safe(q.imageFile);
        final boolean isImage = q.isImage;

        final String answer =
                answerOf(q);

        final String safeSessionId =
                safe(sessionId);

        final String safeGameMode =
                safe(gameMode);

        final String safeRevisionMode =
                safe(revisionMode);

        final String safePlayType =
                safe(playType);

        final String safeResult =
                safe(result);

        final long safeResponseTimeMs =
                Math.max(
                        0L,
                        responseTimeMs
                );

        final long clientPlayedAtMs =
                System.currentTimeMillis();


        try {

            EXECUTOR.execute(() -> {

                try {

                    FirebaseUser user =
                            FirebaseAuth
                                    .getInstance()
                                    .getCurrentUser();

                    if (user == null) {

                        Log.w(
                                TAG,
                                "Utilisateur Firebase non connecté : événement ignoré."
                        );

                        return;
                    }


                    String eventId =
                            UUID.randomUUID()
                                    .toString();


                    Map<String,Object> snapshot =
                            new HashMap<>();

                    snapshot.put(
                            "question",
                            question
                    );

                    snapshot.put(
                            "detail",
                            detail
                    );

                    snapshot.put(
                            "domain",
                            domain
                    );

                    snapshot.put(
                            "theme",
                            theme
                    );

                    snapshot.put(
                            "answer",
                            answer
                    );

                    snapshot.put(
                            "image_file",
                            imageFile
                    );

                    snapshot.put(
                            "is_image",
                            isImage
                    );


                    Map<String,Object> event =
                            new HashMap<>();

                    event.put(
                            "schema_version",
                            3
                    );

                    event.put(
                            "event_id",
                            eventId
                    );

                    event.put(
                            "played_at",
                            FieldValue.serverTimestamp()
                    );

                    event.put(
                            "client_played_at_ms",
                            clientPlayedAtMs
                    );

                    event.put(
                            "session_id",
                            safeSessionId
                    );

                    event.put(
                            "game_mode",
                            safeGameMode
                    );

                    event.put(
                            "revision_mode",
                            safeRevisionMode
                    );

                    event.put(
                            "play_type",
                            safePlayType
                    );

                    event.put(
                            "result",
                            safeResult
                    );

                    event.put(
                            "response_time_ms",
                            safeResponseTimeMs
                    );

                    event.put(
                            "question_id",
                            String.valueOf(row)
                    );

                    event.put(
                            "question_row_number",
                            row
                    );

                    event.put(
                            "domain",
                            domain
                    );

                    event.put(
                            "theme",
                            theme
                    );

                    event.put(
                            "answer",
                            answer
                    );

                    /*
                     * Alias temporaire pour les anciens lecteurs.
                     */
                    event.put(
                            "correct_answer",
                            answer
                    );

                    event.put(
                            "is_correct",
                            isCorrect
                    );

                    event.put(
                            "source",
                            "android"
                    );

                    event.put(
                            "app_version",
                            appVersion(appContext)
                    );

                    event.put(
                            "device_model",
                            safe(Build.MANUFACTURER)
                                    + " "
                                    + safe(Build.MODEL)
                    );

                    event.put(
                            "android_sdk",
                            Build.VERSION.SDK_INT
                    );

                    event.put(
                            "question_snapshot",
                            snapshot
                    );

                    event.put(
                            "writer",
                            "CGANDROID017_HISTORY_QR_SNAPSHOT001"
                    );


                    FirebaseFirestore
                            .getInstance()
                            .collection("users")
                            .document(user.getUid())
                            .collection("play_history")
                            .document(eventId)
                            .set(event)
                            .addOnSuccessListener(
                                    EXECUTOR,
                                    unused ->
                                            Log.d(
                                                    TAG,
                                                    "PLAYLOG Q/R écrit : "
                                                            + safePlayType
                                            )
                            )
                            .addOnFailureListener(
                                    EXECUTOR,
                                    error ->
                                            Log.w(
                                                    TAG,
                                                    "PLAYLOG Q/R non écrit pour l'instant : "
                                                            + safePlayType,
                                                    error
                                            )
                            );

                } catch (Throwable error) {

                    Log.w(
                            TAG,
                            "PLAYLOG ignoré après erreur interne",
                            error
                    );
                }
            });

        } catch (Throwable error) {

            Log.w(
                    TAG,
                    "PLAYLOG non planifié",
                    error
            );
        }
    }


    private static String answerOf(
            MainActivity.Question q
    ) {

        if (
                q == null ||
                q.props == null ||
                q.correct < 1 ||
                q.correct > 4 ||
                q.correct - 1 >= q.props.length
        ) {
            return "";
        }

        return safe(
                q.props[
                        q.correct - 1
                ]
        );
    }


    private static String appVersion(Context context) {
        try {
            return safe(
                    context.getPackageManager()
                            .getPackageInfo(context.getPackageName(), 0)
                            .versionName
            );
        } catch (Throwable ignored) {
            return "";
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
