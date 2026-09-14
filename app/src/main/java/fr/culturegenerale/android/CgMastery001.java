package fr.culturegenerale.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class CgMastery001 {
    private static final int LIMIT = 2000;
    private static final long REVIEW_AFTER_MS =
            30L * 24L * 60L * 60L * 1000L;

    private final Activity activity;
    private final Typeface font;
    private final Runnable onBack;

    private final int BG = Color.rgb(20, 24, 31);
    private final int PANEL = Color.rgb(37, 43, 54);
    private final int PANEL2 = Color.rgb(49, 57, 70);
    private final int BLUE = Color.rgb(0, 102, 204);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int RED = Color.rgb(185, 0, 0);
    private final int GOLD = Color.rgb(219, 176, 55);
    private final int GREY = Color.rgb(165, 172, 184);
    private final int PURPLE = Color.rgb(130, 80, 190);

    private LinearLayout contentHost;
    private TextView summary;
    private TextView status;

    private CgMastery001(Activity activity, Typeface font, Runnable onBack) {
        this.activity = activity;
        this.font = font == null ? Typeface.DEFAULT : font;
        this.onBack = onBack;
    }

    static void show(Activity activity, Typeface font, Runnable onBack) {
        new CgMastery001(activity, font, onBack).render();
    }

    private void render() {
        LinearLayout screen = new LinearLayout(activity);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setPadding(dp(12), dp(12), dp(12), dp(8));
        screen.setBackgroundColor(BG);

        TextView title = text("Maîtrise", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(6)));

        TextView subtitle = text(
                "Analyse de l'historique joué · jusqu'à 2 000 événements",
                13,
                GREY,
                false
        );
        subtitle.setGravity(Gravity.CENTER);
        screen.addView(subtitle, lp(0, 0, 0, dp(8)));

        summary = text("Chargement…", 15, Color.WHITE, true);
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(6)));

        status = text("Connexion à Firestore…", 13, GREY, false);
        status.setGravity(Gravity.CENTER);
        screen.addView(status, lp(0, 0, 0, dp(8)));

        ScrollView scroll = new ScrollView(activity);
        contentHost = new LinearLayout(activity);
        contentHost.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(contentHost);
        screen.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        Button back = button("Retour à l'historique", 17);
        back.setTextColor(Color.WHITE);
        back.setBackground(round(PANEL2, dp(12)));
        back.setOnClickListener(v -> {
            if (onBack != null) onBack.run();
        });
        screen.addView(back, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
        ));

        activity.setContentView(screen);
        load();
    }

    private void load() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            status.setText("Utilisateur Firebase non connecté.");
            return;
        }

        FirebaseFirestore.getInstance()
                .collection("users")
                .document(user.getUid())
                .collection("play_history")
                .orderBy("client_played_at_ms", Query.Direction.DESCENDING)
                .limit(LIMIT)
                .get()
                .addOnSuccessListener(snapshot -> {
                    List<Event> events = new ArrayList<>();
                    for (DocumentSnapshot doc : snapshot.getDocuments()) {
                        events.add(Event.from(doc));
                    }
                    renderAnalysis(events);
                })
                .addOnFailureListener(error ->
                        status.setText(
                                "Analyse indisponible : "
                                        + safe(error.getMessage())
                        ));
    }

    private void renderAnalysis(List<Event> events) {
        contentHost.removeAllViews();

        if (events.isEmpty()) {
            summary.setText("Aucune question jouée");
            status.setText(
                    "Joue quelques questions pour commencer la carte de maîtrise."
            );
            return;
        }

        Map<String, QuestionStats> questions = buildQuestionStats(events);
        List<ThemeStats> themes = buildThemeStats(questions);

        int evaluableAttempts = 0;
        int positiveAttempts = 0;
        int discovery = 0;
        int fragile = 0;
        int known = 0;
        int mastered = 0;
        int review = 0;

        for (QuestionStats q : questions.values()) {
            evaluableAttempts += q.evaluableAttempts;
            positiveAttempts += q.positiveAttempts;

            String state = q.status();
            if ("Découverte".equals(state)) discovery++;
            else if ("Fragile".equals(state)) fragile++;
            else if ("Connue".equals(state)) known++;
            else if ("Maîtrisée".equals(state)) mastered++;
            else if ("À réviser".equals(state)) review++;
        }

        int success = evaluableAttempts == 0
                ? 0
                : Math.round(100f * positiveAttempts / evaluableAttempts);

        summary.setText(
                questions.size() + " questions vues · "
                        + success + "% réussite"
        );

        status.setText(
                mastered + " maîtrisées · "
                        + known + " connues · "
                        + fragile + " fragiles · "
                        + discovery + " découvertes · "
                        + review + " à réviser"
        );

        TextView legend = text(
                "Découverte : 0–1 réponse évaluée · "
                        + "Fragile : réussite < 60 % · "
                        + "Connue : ≥ 60 % · "
                        + "Maîtrisée : ≥ 3 réponses, ≥ 80 % et 2 succès récents · "
                        + "À réviser : dernière réponse négative après acquisition "
                        + "ou dernière exposition > 30 jours.",
                12,
                GREY,
                false
        );
        legend.setPadding(dp(4), dp(2), dp(4), dp(10));
        contentHost.addView(legend);

        for (ThemeStats theme : themes) {
            contentHost.addView(themeView(theme), lp(0, 0, 0, dp(8)));
        }
    }

    private Map<String, QuestionStats> buildQuestionStats(List<Event> events) {
        Map<String, QuestionStats> result = new LinkedHashMap<>();

        for (int i = events.size() - 1; i >= 0; i--) {
            Event e = events.get(i);
            String key = e.questionKey();
            QuestionStats q = result.get(key);

            if (q == null) {
                q = new QuestionStats();
                q.questionKey = key;
                q.questionId = e.questionId;
                q.question = e.question;
                q.domain = e.domain;
                q.theme = e.theme;
                result.put(key, q);
            }

            q.exposures++;
            q.lastPlayedAtMs = Math.max(q.lastPlayedAtMs, e.playedAtMs);

            if (e.isEvaluable()) {
                q.evaluableAttempts++;
                boolean positive = e.isPositive();
                if (positive) q.positiveAttempts++;
                q.recentEvaluated.add(positive);

                if (e.responseTimeMs > 0L) {
                    q.responseTimeTotalMs += e.responseTimeMs;
                    q.responseTimeCount++;
                }
            }
        }

        return result;
    }

    private List<ThemeStats> buildThemeStats(
            Map<String, QuestionStats> questions
    ) {
        Map<String, ThemeStats> grouped = new HashMap<>();

        for (QuestionStats q : questions.values()) {
            String domain = safe(q.domain);
            String theme = safe(q.theme);
            String key = domain + "\n" + theme;

            ThemeStats t = grouped.get(key);
            if (t == null) {
                t = new ThemeStats();
                t.domain = domain;
                t.theme = theme;
                grouped.put(key, t);
            }

            t.questions.add(q);
            t.attempts += q.evaluableAttempts;
            t.positive += q.positiveAttempts;

            String state = q.status();
            if ("Découverte".equals(state)) t.discovery++;
            else if ("Fragile".equals(state)) t.fragile++;
            else if ("Connue".equals(state)) t.known++;
            else if ("Maîtrisée".equals(state)) t.mastered++;
            else if ("À réviser".equals(state)) t.review++;
        }

        List<ThemeStats> themes = new ArrayList<>(grouped.values());

        Collections.sort(themes, (a, b) -> {
            int scoreA =
                    a.review * 1000
                            + a.fragile * 100
                            + a.discovery * 10
                            - a.mastered;
            int scoreB =
                    b.review * 1000
                            + b.fragile * 100
                            + b.discovery * 10
                            - b.mastered;

            if (scoreA != scoreB) {
                return Integer.compare(scoreB, scoreA);
            }

            return (a.domain + " " + a.theme)
                    .compareToIgnoreCase(b.domain + " " + b.theme);
        });

        return themes;
    }

    private View themeView(ThemeStats t) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(11), dp(9), dp(11), dp(9));
        card.setBackground(round(PANEL, dp(11)));
        card.setClickable(true);

        String title = join(" › ", t.domain, t.theme);
        if (title.isEmpty()) title = "Thème non renseigné";

        card.addView(text(title, 16, Color.WHITE, true));

        int success = t.attempts == 0
                ? 0
                : Math.round(100f * t.positive / t.attempts);

        TextView line = text(
                t.questions.size() + " questions vues · "
                        + t.attempts + " réponses évaluées · "
                        + success + "% réussite",
                12,
                GREY,
                false
        );
        line.setPadding(0, dp(4), 0, 0);
        card.addView(line);

        TextView states = text(
                t.mastered + " maîtrisées · "
                        + t.known + " connues · "
                        + t.fragile + " fragiles · "
                        + t.discovery + " découvertes"
                        + (t.review > 0
                                ? " · " + t.review + " à réviser"
                                : ""),
                13,
                themeColor(t),
                true
        );
        states.setPadding(0, dp(5), 0, 0);
        card.addView(states);

        card.setOnClickListener(v -> showThemeDetail(t));
        return card;
    }

    private int themeColor(ThemeStats t) {
        if (t.review > 0) return RED;
        if (t.fragile > 0) return GOLD;
        if (t.mastered == t.questions.size() && !t.questions.isEmpty()) {
            return GREEN;
        }
        return BLUE;
    }

    private void showThemeDetail(ThemeStats theme) {
        List<QuestionStats> questions =
                new ArrayList<>(theme.questions);

        Collections.sort(questions, (a, b) -> {
            int rankA = statusRank(a.status());
            int rankB = statusRank(b.status());

            if (rankA != rankB) {
                return Integer.compare(rankA, rankB);
            }

            return Long.compare(
                    b.lastPlayedAtMs,
                    a.lastPlayedAtMs
            );
        });

        LinearLayout host = new LinearLayout(activity);
        host.setOrientation(LinearLayout.VERTICAL);
        host.setPadding(dp(14), dp(8), dp(14), dp(8));

        for (QuestionStats q : questions) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setPadding(0, dp(8), 0, dp(8));

            row.addView(
                    text(
                            q.status(),
                            14,
                            statusColor(q.status()),
                            true
                    )
            );

            TextView question = text(
                    q.question.isEmpty()
                            ? "(question sans texte)"
                            : q.question,
                    16,
                    Color.BLACK,
                    true
            );
            question.setPadding(0, dp(3), 0, 0);
            row.addView(question);

            String metrics =
                    q.evaluableAttempts + " réponse"
                            + (q.evaluableAttempts > 1 ? "s" : "")
                            + " évaluée"
                            + (q.evaluableAttempts > 1 ? "s" : "")
                            + " · "
                            + q.successPercent()
                            + "% réussite";

            if (q.averageResponseMs() > 0L) {
                metrics += " · " + duration(q.averageResponseMs());
            }

            TextView metricView = text(
                    metrics,
                    12,
                    Color.DKGRAY,
                    false
            );
            metricView.setPadding(0, dp(3), 0, 0);
            row.addView(metricView);

            host.addView(row);

            View divider = new View(activity);
            divider.setBackgroundColor(Color.LTGRAY);
            host.addView(
                    divider,
                    new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(1)
                    )
            );
        }

        ScrollView scroll = new ScrollView(activity);
        scroll.addView(host);

        String title = join(" › ", theme.domain, theme.theme);
        if (title.isEmpty()) title = "Maîtrise du thème";

        new AlertDialog.Builder(activity)
                .setTitle(title)
                .setView(scroll)
                .setPositiveButton("Fermer", null)
                .show();
    }

    private int statusRank(String state) {
        if ("À réviser".equals(state)) return 0;
        if ("Fragile".equals(state)) return 1;
        if ("Découverte".equals(state)) return 2;
        if ("Connue".equals(state)) return 3;
        if ("Maîtrisée".equals(state)) return 4;
        return 5;
    }

    private int statusColor(String state) {
        if ("À réviser".equals(state)) return RED;
        if ("Fragile".equals(state)) return GOLD;
        if ("Connue".equals(state)) return BLUE;
        if ("Maîtrisée".equals(state)) return GREEN;
        return PURPLE;
    }

    private TextView text(
            String value,
            int sp,
            int color,
            boolean bold
    ) {
        TextView tv = new TextView(activity);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        tv.setTypeface(
                font,
                bold ? Typeface.BOLD : Typeface.NORMAL
        );
        return tv;
    }

    private Button button(String value, int sp) {
        Button b = new Button(activity);
        b.setText(value);
        b.setTextSize(sp);
        b.setTypeface(font, Typeface.BOLD);
        b.setAllCaps(false);
        return b;
    }

    private GradientDrawable round(int color, int radiusPx) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(color);
        gd.setCornerRadius(radiusPx);
        return gd;
    }

    private LinearLayout.LayoutParams lp(
            int left,
            int top,
            int right,
            int bottom
    ) {
        LinearLayout.LayoutParams p =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );
        p.setMargins(left, top, right, bottom);
        return p;
    }

    private int dp(int value) {
        return Math.round(
                value
                        * activity.getResources()
                        .getDisplayMetrics()
                        .density
        );
    }

    private static String join(
            String sep,
            String... values
    ) {
        StringBuilder out = new StringBuilder();

        for (String value : values) {
            String clean = safe(value);
            if (clean.isEmpty()) continue;

            if (out.length() > 0) out.append(sep);
            out.append(clean);
        }

        return out.toString();
    }

    private static String safe(Object value) {
        return value == null
                ? ""
                : String.valueOf(value).trim();
    }

    private static long longValue(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }

        try {
            return Long.parseLong(safe(value));
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static Boolean booleanValue(Object value) {
        return value instanceof Boolean
                ? (Boolean) value
                : null;
    }

    private static String duration(long ms) {
        if (ms <= 0L) return "";

        if (ms < 1000L) {
            return ms + " ms";
        }

        if (ms < 60000L) {
            return String.format(
                    Locale.FRANCE,
                    "%.1f s",
                    ms / 1000.0
            );
        }

        return (ms / 60000L)
                + " min "
                + ((ms % 60000L) / 1000L)
                + " s";
    }

    private static final class Event {
        long playedAtMs;
        long responseTimeMs;

        String questionId = "";
        String playType = "";
        String result = "";
        Boolean isCorrect;

        String question = "";
        String domain = "";
        String theme = "";

        boolean isEvaluable() {
            return "challenge_choice".equals(playType)
                    || "challenge_mental".equals(playType);
        }

        boolean isPositive() {
            if ("challenge_choice".equals(playType)) {
                return Boolean.TRUE.equals(isCorrect);
            }

            if ("challenge_mental".equals(playType)) {
                return "assimilated".equals(result);
            }

            return false;
        }

        String questionKey() {
            if (!questionId.isEmpty()) {
                return questionId;
            }

            if (!question.isEmpty()) {
                return domain
                        + "|"
                        + theme
                        + "|"
                        + question;
            }

            return domain
                    + "|"
                    + theme
                    + "|"
                    + playedAtMs;
        }

        static Event from(DocumentSnapshot doc) {
            Event e = new Event();

            e.playType = safe(doc.get("play_type"));
            e.result = safe(doc.get("result"));
            e.isCorrect = booleanValue(doc.get("is_correct"));
            e.questionId = safe(doc.get("question_id"));
            e.domain = safe(doc.get("domain"));
            e.theme = safe(doc.get("theme"));

            e.responseTimeMs =
                    longValue(doc.get("response_time_ms"));

            Object snapshot =
                    doc.get("question_snapshot");

            if (snapshot instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) snapshot;

                e.question =
                        safe(map.get("question"));

                if (e.domain.isEmpty()) {
                    e.domain = safe(map.get("domain"));
                }

                if (e.theme.isEmpty()) {
                    e.theme = safe(map.get("theme"));
                }
            }

            Timestamp timestamp =
                    doc.getTimestamp("played_at");

            e.playedAtMs = timestamp != null
                    ? timestamp.toDate().getTime()
                    : longValue(doc.get("client_played_at_ms"));

            return e;
        }
    }

    private static final class QuestionStats {
        String questionKey = "";
        String questionId = "";
        String question = "";
        String domain = "";
        String theme = "";

        int exposures;
        int evaluableAttempts;
        int positiveAttempts;

        long lastPlayedAtMs;
        long responseTimeTotalMs;
        int responseTimeCount;

        final List<Boolean> recentEvaluated =
                new ArrayList<>();

        int successPercent() {
            return evaluableAttempts == 0
                    ? 0
                    : Math.round(
                            100f
                                    * positiveAttempts
                                    / evaluableAttempts
                    );
        }

        long averageResponseMs() {
            return responseTimeCount == 0
                    ? 0L
                    : responseTimeTotalMs
                    / responseTimeCount;
        }

        boolean lastEvaluatedPositive() {
            return recentEvaluated.isEmpty()
                    || recentEvaluated.get(
                            recentEvaluated.size() - 1
                    );
        }

        boolean lastTwoPositive() {
            if (recentEvaluated.size() < 2) {
                return false;
            }

            int size = recentEvaluated.size();

            return recentEvaluated.get(size - 1)
                    && recentEvaluated.get(size - 2);
        }

        String status() {
            if (evaluableAttempts <= 1) {
                return "Découverte";
            }

            int success = successPercent();

            boolean stale =
                    lastPlayedAtMs > 0L
                            && System.currentTimeMillis()
                            - lastPlayedAtMs
                            > REVIEW_AFTER_MS;

            boolean acquiredBefore =
                    evaluableAttempts >= 3
                            && success >= 60;

            if ((acquiredBefore
                    && !lastEvaluatedPositive())
                    || (stale
                    && success >= 60)) {
                return "À réviser";
            }

            if (success < 60) {
                return "Fragile";
            }

            if (evaluableAttempts >= 3
                    && success >= 80
                    && lastTwoPositive()) {
                return "Maîtrisée";
            }

            return "Connue";
        }
    }

    private static final class ThemeStats {
        String domain = "";
        String theme = "";

        final List<QuestionStats> questions =
                new ArrayList<>();

        int attempts;
        int positive;

        int discovery;
        int fragile;
        int known;
        int mastered;
        int review;
    }
}
