package fr.culturegenerale.android;

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

/**
 * CGHISTORY001 · PLAYLOG001
 *
 * Fondation de l'historique des questions jouées.
 * Les écritures utilisent Firestore Android : elles sont mises en file localement
 * par le SDK et synchronisées automatiquement quand le réseau revient.
 */
final class CgHistory001 {
    private static final String TAG = "CGHISTORY001";

    private CgHistory001() { }

    static void log(
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
        if (q == null) return;

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            Log.w(TAG, "Utilisateur Firebase non connecté : événement ignoré.");
            return;
        }

        String eventId = UUID.randomUUID().toString();

        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("question", safe(q.question));
        snapshot.put("detail", safe(q.detail));
        snapshot.put("domain", safe(q.domain));
        snapshot.put("theme", safe(q.theme));
        snapshot.put("image_file", safe(q.imageFile));
        snapshot.put("is_image", q.isImage);
        snapshot.put("correct_index", q.correct);

        List<String> propositions = new ArrayList<>();
        for (int i = 0; i < 4; i++) propositions.add(safe(q.props[i]));
        snapshot.put("propositions", propositions);

        Map<String, Object> event = new HashMap<>();
        event.put("schema_version", 1);
        event.put("event_id", eventId);
        event.put("played_at", FieldValue.serverTimestamp());
        event.put("client_played_at_ms", System.currentTimeMillis());

        event.put("session_id", safe(sessionId));
        event.put("game_mode", safe(gameMode));
        event.put("revision_mode", safe(revisionMode));
        event.put("play_type", safe(playType));
        event.put("result", safe(result));
        event.put("response_time_ms", Math.max(0L, responseTimeMs));

        event.put("question_id", String.valueOf(q.row));
        event.put("question_row_number", q.row);
        event.put("domain", safe(q.domain));
        event.put("theme", safe(q.theme));

        event.put("selected_index", selectedIndex);
        event.put(
                "selected_answer",
                selectedIndex >= 1 && selectedIndex <= 4
                        ? safe(q.props[selectedIndex - 1])
                        : ""
        );

        event.put("correct_index", q.correct);
        event.put(
                "correct_answer",
                q.correct >= 1 && q.correct <= 4
                        ? safe(q.props[q.correct - 1])
                        : ""
        );

        event.put("is_correct", isCorrect);

        event.put("source", "android");
        event.put("app_version", BuildConfig.VERSION_NAME);
        event.put("device_model", safe(Build.MANUFACTURER) + " " + safe(Build.MODEL));
        event.put("android_sdk", Build.VERSION.SDK_INT);
        event.put("question_snapshot", snapshot);
        event.put("writer", "CGHISTORY001_PLAYLOG001");

        FirebaseFirestore.getInstance()
                .collection("users")
                .document(user.getUid())
                .collection("play_history")
                .document(eventId)
                .set(event)
                .addOnFailureListener(e ->
                        Log.w(TAG, "Écriture PLAYLOG en attente/échec", e));
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
