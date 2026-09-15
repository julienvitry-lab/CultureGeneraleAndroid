package fr.culturegenerale.android;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
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
import com.google.firebase.firestore.QuerySnapshot;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CGSTATS002 · RESPONSE_TIME001
 *
 * Analyse personnelle des temps de réponse depuis play_history.
 * Lecture Firestore uniquement. Aucun accès SQLite.
 * Les révélations de Révision sont exclues : seules les réponses évaluées
 * challenge_choice et challenge_mental sont chronométrées ici.
 */
final class CgResponseTime001 {
    private static final int PAGE_SIZE = 1000;
    private static final long MAX_VALID_MS = 10L * 60L * 1000L;
    private static final long ABSOLUTE_SLOW_MS = 8000L;

    private static final ExecutorService EXECUTOR =
            Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(() -> {
                    android.os.Process.setThreadPriority(
                            android.os.Process.THREAD_PRIORITY_BACKGROUND
                    );
                    runnable.run();
                }, "CGSTATS002-ResponseTime");
                thread.setDaemon(true);
                return thread;
            });

    private final Activity activity;
    private final Typeface font;
    private final Runnable onBack;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final int BG = Color.rgb(20, 24, 31);
    private final int PANEL = Color.rgb(37, 43, 54);
    private final int PANEL2 = Color.rgb(49, 57, 70);
    private final int BLUE = Color.rgb(0, 102, 204);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int RED = Color.rgb(185, 0, 0);
    private final int GOLD = Color.rgb(219, 176, 55);
    private final int GREY = Color.rgb(165, 172, 184);

    private Result result;

    private CgResponseTime001(
            Activity activity,
            Typeface font,
            Runnable onBack
    ) {
        this.activity = activity;
        this.font = font == null ? Typeface.DEFAULT : font;
        this.onBack = onBack;
    }

    static void show(
            Activity activity,
            Typeface font,
            Runnable onBack
    ) {
        CgResponseTime001 screen =
                new CgResponseTime001(activity, font, onBack);
        screen.renderLoading();
        screen.load();
    }

    private void renderLoading() {
        LinearLayout root = baseScreen();

        TextView title = text("Temps de réponse", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(8)));

        TextView info = text(
                "Analyse des réponses évaluées…",
                15,
                GREY,
                false
        );
        info.setGravity(Gravity.CENTER);
        root.addView(info, lp(0, 0, 0, dp(8)));

        TextView rule = text(
                "Les révélations de Révision sont exclues. "
                        + "Les chronos supérieurs à 10 minutes sont ignorés.",
                12,
                GREY,
                false
        );
        rule.setGravity(Gravity.CENTER);
        root.addView(rule, lp(0, 0, 0, dp(8)));

        LinearLayout spacer = new LinearLayout(activity);
        root.addView(
                spacer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        root.addView(backButton("Retour à la maîtrise"), fixedHeight(52));
        activity.setContentView(root);
    }

    private void load() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();

        if (user == null) {
            renderError("Utilisateur Firebase non connecté.");
            return;
        }

        Aggregator aggregator = new Aggregator();
        loadPage(user.getUid(), null, aggregator);
    }

    private void loadPage(
            String uid,
            DocumentSnapshot lastDocument,
            Aggregator aggregator
    ) {
        Query query = FirebaseFirestore.getInstance()
                .collection("users")
                .document(uid)
                .collection("play_history")
                .orderBy(
                        "client_played_at_ms",
                        Query.Direction.DESCENDING
                )
                .limit(PAGE_SIZE);

        if (lastDocument != null) {
            query = query.startAfter(lastDocument);
        }

        query.get()
                .addOnSuccessListener(
                        EXECUTOR,
                        snapshot -> {
                            aggregator.consume(snapshot);

                            if (snapshot.size() >= PAGE_SIZE) {
                                List<DocumentSnapshot> docs =
                                        snapshot.getDocuments();
                                loadPage(
                                        uid,
                                        docs.get(docs.size() - 1),
                                        aggregator
                                );
                            } else {
                                Result finished = aggregator.finish();
                                mainHandler.post(() -> {
                                    result = finished;
                                    renderDomains();
                                });
                            }
                        }
                )
                .addOnFailureListener(
                        EXECUTOR,
                        error -> mainHandler.post(
                                () -> renderError(
                                        "Analyse indisponible : "
                                                + safe(error.getMessage())
                                )
                        )
                );
    }

    private void renderDomains() {
        if (result == null || result.timedEvents == 0) {
            renderNoData();
            return;
        }

        LinearLayout screen = baseScreen();

        TextView title = text("Temps de réponse", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(5)));

        TextView summary = text(
                result.timedEvents
                        + " réponse"
                        + (result.timedEvents > 1 ? "s" : "")
                        + " chronométrée"
                        + (result.timedEvents > 1 ? "s" : "")
                        + " · médiane "
                        + duration(result.globalMedianMs)
                        + " · moyenne "
                        + duration(result.globalAverageMs),
                14,
                GREY,
                false
        );
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(4)));

        TextView slow = text(
                result.knownSlowCount
                        + " question"
                        + (result.knownSlowCount > 1 ? "s" : "")
                        + " connue"
                        + (result.knownSlowCount > 1 ? "s" : "")
                        + " mais lente"
                        + (result.knownSlowCount > 1 ? "s" : ""),
                14,
                result.knownSlowCount > 0 ? GOLD : GREEN,
                true
        );
        slow.setGravity(Gravity.CENTER);
        screen.addView(slow, lp(0, 0, 0, dp(8)));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (DomainStats domain : result.domains) {
            list.addView(domainView(domain), lp(0, 0, 0, dp(7)));
        }

        screen.addView(
                scroll,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        screen.addView(backButton("Retour à la maîtrise"), fixedHeight(52));
        activity.setContentView(screen);
    }

    private View domainView(DomainStats domain) {
        LinearLayout card = card();

        card.addView(text(
                domain.domain.isEmpty() ? "(Sans domaine)" : domain.domain,
                19,
                Color.WHITE,
                true
        ));

        TextView metrics = text(
                domain.timedEvents
                        + " chrono"
                        + (domain.timedEvents > 1 ? "s" : "")
                        + " · médiane "
                        + duration(domain.medianMs)
                        + " · moyenne "
                        + duration(domain.averageMs),
                13,
                GREY,
                false
        );
        metrics.setPadding(0, dp(4), 0, 0);
        card.addView(metrics);

        TextView slow = text(
                domain.knownSlowCount
                        + " connue"
                        + (domain.knownSlowCount > 1 ? "s" : "")
                        + " mais lente"
                        + (domain.knownSlowCount > 1 ? "s" : ""),
                13,
                domain.knownSlowCount > 0 ? GOLD : BLUE,
                true
        );
        slow.setPadding(0, dp(4), 0, 0);
        card.addView(slow);

        card.setOnClickListener(v -> renderThemes(domain));
        return card;
    }

    private void renderThemes(DomainStats domain) {
        LinearLayout screen = baseScreen();

        TextView title = text(
                domain.domain.isEmpty() ? "(Sans domaine)" : domain.domain,
                25,
                Color.WHITE,
                true
        );
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(4)));

        TextView summary = text(
                "Médiane "
                        + duration(domain.medianMs)
                        + " · "
                        + domain.knownSlowCount
                        + " connue"
                        + (domain.knownSlowCount > 1 ? "s" : "")
                        + " mais lente"
                        + (domain.knownSlowCount > 1 ? "s" : ""),
                14,
                GREY,
                false
        );
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(8)));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (ThemeStats theme : domain.themes) {
            list.addView(themeView(theme), lp(0, 0, 0, dp(7)));
        }

        screen.addView(
                scroll,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        Button back = button("Retour aux domaines", 16);
        back.setTextColor(Color.WHITE);
        back.setBackground(round(PANEL2, dp(11)));
        back.setOnClickListener(v -> renderDomains());
        screen.addView(back, fixedHeight(52));

        activity.setContentView(screen);
    }

    private View themeView(ThemeStats theme) {
        LinearLayout card = card();

        card.addView(text(
                theme.theme.isEmpty() ? "(Sans thème)" : theme.theme,
                17,
                Color.WHITE,
                true
        ));

        TextView metrics = text(
                theme.questions.size()
                        + " question"
                        + (theme.questions.size() > 1 ? "s" : "")
                        + " · médiane "
                        + duration(theme.medianMs)
                        + " · moyenne "
                        + duration(theme.averageMs),
                13,
                GREY,
                false
        );
        metrics.setPadding(0, dp(4), 0, 0);
        card.addView(metrics);

        TextView slow = text(
                theme.knownSlowCount
                        + " connue"
                        + (theme.knownSlowCount > 1 ? "s" : "")
                        + " mais lente"
                        + (theme.knownSlowCount > 1 ? "s" : ""),
                13,
                theme.knownSlowCount > 0 ? GOLD : BLUE,
                true
        );
        slow.setPadding(0, dp(4), 0, 0);
        card.addView(slow);

        card.setOnClickListener(v -> renderQuestions(theme));
        return card;
    }

    private void renderQuestions(ThemeStats theme) {
        LinearLayout screen = baseScreen();

        TextView title = text(
                theme.theme.isEmpty() ? "(Sans thème)" : theme.theme,
                23,
                Color.WHITE,
                true
        );
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(4)));

        TextView summary = text(
                "Référence "
                        + duration(theme.baselineMs)
                        + " · tri du plus lent au plus rapide",
                13,
                GREY,
                false
        );
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(8)));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (QuestionStats question : theme.questions) {
            list.addView(questionView(question, theme.baselineMs),
                    lp(0, 0, 0, dp(7)));
        }

        screen.addView(
                scroll,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        Button back = button("Retour aux thèmes", 16);
        back.setTextColor(Color.WHITE);
        back.setBackground(round(PANEL2, dp(11)));
        back.setOnClickListener(v -> renderThemes(theme.domainStats));
        screen.addView(back, fixedHeight(52));

        activity.setContentView(screen);
    }

    private View questionView(
            QuestionStats question,
            long baselineMs
    ) {
        LinearLayout card = card();

        String label = question.question.isEmpty()
                ? "Question #" + question.row
                : question.question;

        card.addView(text(label, 16, Color.WHITE, true));

        String status = speedLabel(question, baselineMs);
        int statusColor = speedColor(status);

        TextView speed = text(
                status
                        + " · moyenne "
                        + duration(question.averageMs())
                        + " · médiane "
                        + duration(question.medianMs()),
                13,
                statusColor,
                true
        );
        speed.setPadding(0, dp(5), 0, 0);
        card.addView(speed);

        TextView metrics = text(
                question.times.size()
                        + " mesure"
                        + (question.times.size() > 1 ? "s" : "")
                        + " · "
                        + question.successPercent()
                        + "% réussite"
                        + (question.recentAverageMs() > 0L
                                ? " · récent "
                                + duration(question.recentAverageMs())
                                : ""),
                12,
                GREY,
                false
        );
        metrics.setPadding(0, dp(4), 0, 0);
        card.addView(metrics);

        if (isKnownButSlow(question, baselineMs)) {
            TextView knownSlow = text(
                    "Connue mais lente",
                    13,
                    GOLD,
                    true
            );
            knownSlow.setPadding(0, dp(5), 0, 0);
            card.addView(knownSlow);
        }

        return card;
    }

    private String speedLabel(
            QuestionStats question,
            long baselineMs
    ) {
        if (question.times.size() < 2) {
            return "Données limitées";
        }

        long reference = baselineMs > 0L
                ? baselineMs
                : result.globalMedianMs;

        if (reference <= 0L) return "Normal";

        double ratio = question.averageMs() / (double) reference;

        if (ratio <= 0.80) return "Rapide";
        if (ratio <= 1.25) return "Normal";
        if (ratio <= 1.75) return "Lente";
        return "Très lente";
    }

    private boolean isKnownButSlow(
            QuestionStats question,
            long baselineMs
    ) {
        if (question.times.size() < 2) return false;
        if (question.successPercent() < 60) return false;

        long reference = baselineMs > 0L
                ? baselineMs
                : result.globalMedianMs;

        long threshold = Math.max(
                ABSOLUTE_SLOW_MS,
                Math.round(reference * 1.5)
        );

        return question.averageMs() >= threshold;
    }

    private int speedColor(String label) {
        if ("Rapide".equals(label)) return GREEN;
        if ("Lente".equals(label)) return GOLD;
        if ("Très lente".equals(label)) return RED;
        if ("Données limitées".equals(label)) return GREY;
        return BLUE;
    }

    private void renderNoData() {
        LinearLayout root = baseScreen();

        TextView title = text("Temps de réponse", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(8)));

        TextView info = text(
                "Pas encore assez de réponses chronométrées.",
                17,
                GREY,
                false
        );
        info.setGravity(Gravity.CENTER);
        root.addView(info, lp(0, dp(10), 0, dp(10)));

        LinearLayout spacer = new LinearLayout(activity);
        root.addView(
                spacer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        root.addView(backButton("Retour à la maîtrise"), fixedHeight(52));
        activity.setContentView(root);
    }

    private void renderError(String message) {
        LinearLayout root = baseScreen();

        TextView title = text("Temps de réponse", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(8)));

        TextView error = text(message, 16, RED, true);
        error.setGravity(Gravity.CENTER);
        root.addView(error, lp(0, dp(10), 0, dp(10)));

        LinearLayout spacer = new LinearLayout(activity);
        root.addView(
                spacer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        root.addView(backButton("Retour à la maîtrise"), fixedHeight(52));
        activity.setContentView(root);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(11), dp(9), dp(11), dp(9));
        card.setBackground(round(PANEL, dp(11)));
        card.setClickable(true);
        return card;
    }

    private LinearLayout baseScreen() {
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12), dp(12), dp(12), dp(8));
        root.setBackgroundColor(BG);
        return root;
    }

    private Button backButton(String label) {
        Button b = button(label, 16);
        b.setTextColor(Color.WHITE);
        b.setBackground(round(PANEL2, dp(11)));
        b.setOnClickListener(v -> {
            if (onBack != null) onBack.run();
        });
        return b;
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

    private GradientDrawable round(int color, int radius) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(color);
        gd.setCornerRadius(radius);
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

    private LinearLayout.LayoutParams fixedHeight(int px) {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(px)
        );
    }

    private int dp(int value) {
        return Math.round(
                value
                        * activity.getResources()
                        .getDisplayMetrics()
                        .density
        );
    }

    private static String duration(long ms) {
        if (ms <= 0L) return "—";
        if (ms < 1000L) return ms + " ms";
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

    private static String safe(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
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
        return value instanceof Boolean ? (Boolean) value : null;
    }

    private static long average(List<Long> values) {
        if (values.isEmpty()) return 0L;
        long total = 0L;
        for (long value : values) total += value;
        return total / values.size();
    }

    private static long median(List<Long> values) {
        if (values.isEmpty()) return 0L;
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int size = sorted.size();
        if ((size & 1) == 1) return sorted.get(size / 2);
        return (sorted.get(size / 2 - 1) + sorted.get(size / 2)) / 2L;
    }

    private static final class Aggregator {
        private final Map<Long, QuestionStats> questions = new HashMap<>();
        private final List<Long> allTimes = new ArrayList<>();

        void consume(QuerySnapshot snapshot) {
            for (DocumentSnapshot doc : snapshot.getDocuments()) {
                consume(doc);
            }
        }

        private void consume(DocumentSnapshot doc) {
            String playType = safe(doc.get("play_type"));

            if (!"challenge_choice".equals(playType)
                    && !"challenge_mental".equals(playType)) {
                return;
            }

            long responseTime = longValue(doc.get("response_time_ms"));
            if (responseTime <= 0L || responseTime > MAX_VALID_MS) {
                return;
            }

            long row = longValue(doc.get("question_row_number"));
            if (row <= 0L) row = longValue(doc.get("question_id"));
            if (row <= 0L) return;

            QuestionStats question = questions.get(row);
            if (question == null) {
                question = new QuestionStats();
                question.row = row;
                questions.put(row, question);
            }

            question.times.add(responseTime);
            allTimes.add(responseTime);

            boolean positive;
            if ("challenge_choice".equals(playType)) {
                positive = Boolean.TRUE.equals(
                        booleanValue(doc.get("is_correct"))
                );
            } else {
                positive = "assimilated".equals(safe(doc.get("result")));
            }

            question.evaluatedAttempts++;
            if (positive) question.positiveAttempts++;

            if (question.recentNewest.size() < 3) {
                question.recentNewest.add(responseTime);
            }

            if (question.domain.isEmpty()) {
                question.domain = safe(doc.get("domain"));
            }
            if (question.theme.isEmpty()) {
                question.theme = safe(doc.get("theme"));
            }

            Object snapshotObject = doc.get("question_snapshot");
            if (snapshotObject instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) snapshotObject;

                if (question.question.isEmpty()) {
                    question.question = safe(map.get("question"));
                }
                if (question.domain.isEmpty()) {
                    question.domain = safe(map.get("domain"));
                }
                if (question.theme.isEmpty()) {
                    question.theme = safe(map.get("theme"));
                }
            }
        }

        Result finish() {
            Result result = new Result();
            result.timedEvents = allTimes.size();
            result.globalAverageMs = average(allTimes);
            result.globalMedianMs = median(allTimes);

            Map<String, DomainStats> groupedDomains = new TreeMap<>(
                    String.CASE_INSENSITIVE_ORDER
            );

            for (QuestionStats question : questions.values()) {
                String domainKey = question.domain;
                DomainStats domain = groupedDomains.get(domainKey);

                if (domain == null) {
                    domain = new DomainStats();
                    domain.domain = domainKey;
                    groupedDomains.put(domainKey, domain);
                }

                domain.questions.add(question);
                domain.allTimes.addAll(question.times);
            }

            for (DomainStats domain : groupedDomains.values()) {
                domain.averageMs = average(domain.allTimes);
                domain.medianMs = median(domain.allTimes);

                Map<String, ThemeStats> groupedThemes = new TreeMap<>(
                        String.CASE_INSENSITIVE_ORDER
                );

                for (QuestionStats question : domain.questions) {
                    String themeKey = question.theme;
                    ThemeStats theme = groupedThemes.get(themeKey);

                    if (theme == null) {
                        theme = new ThemeStats();
                        theme.theme = themeKey;
                        theme.domainStats = domain;
                        groupedThemes.put(themeKey, theme);
                    }

                    theme.questions.add(question);
                    theme.allTimes.addAll(question.times);
                }

                for (ThemeStats theme : groupedThemes.values()) {
                    theme.averageMs = average(theme.allTimes);
                    theme.medianMs = median(theme.allTimes);
                    theme.baselineMs = theme.allTimes.size() >= 5
                            ? theme.medianMs
                            : (domain.allTimes.size() >= 5
                                    ? domain.medianMs
                                    : result.globalMedianMs);

                    Collections.sort(
                            theme.questions,
                            (a, b) -> Long.compare(
                                    b.averageMs(),
                                    a.averageMs()
                            )
                    );

                    for (QuestionStats question : theme.questions) {
                        if (knownButSlow(
                                question,
                                theme.baselineMs,
                                result.globalMedianMs
                        )) {
                            theme.knownSlowCount++;
                            domain.knownSlowCount++;
                            result.knownSlowCount++;
                        }
                    }
                }

                domain.themes.addAll(groupedThemes.values());
                Collections.sort(
                        domain.themes,
                        (a, b) -> Long.compare(b.medianMs, a.medianMs)
                );
                domain.timedEvents = domain.allTimes.size();
            }

            result.domains.addAll(groupedDomains.values());
            Collections.sort(
                    result.domains,
                    (a, b) -> Long.compare(b.medianMs, a.medianMs)
            );

            return result;
        }

        private static boolean knownButSlow(
                QuestionStats question,
                long baselineMs,
                long globalMedianMs
        ) {
            if (question.times.size() < 2) return false;
            if (question.successPercent() < 60) return false;

            long reference = baselineMs > 0L
                    ? baselineMs
                    : globalMedianMs;

            long threshold = Math.max(
                    ABSOLUTE_SLOW_MS,
                    Math.round(reference * 1.5)
            );

            return question.averageMs() >= threshold;
        }
    }

    private static final class QuestionStats {
        long row;
        String question = "";
        String domain = "";
        String theme = "";
        int evaluatedAttempts;
        int positiveAttempts;
        final List<Long> times = new ArrayList<>();
        final List<Long> recentNewest = new ArrayList<>();

        int successPercent() {
            return evaluatedAttempts == 0
                    ? 0
                    : Math.round(
                            100f * positiveAttempts / evaluatedAttempts
                    );
        }

        long averageMs() {
            return average(times);
        }

        long medianMs() {
            return median(times);
        }

        long recentAverageMs() {
            return average(recentNewest);
        }
    }

    private static final class ThemeStats {
        String theme = "";
        DomainStats domainStats;
        final List<QuestionStats> questions = new ArrayList<>();
        final List<Long> allTimes = new ArrayList<>();
        long averageMs;
        long medianMs;
        long baselineMs;
        int knownSlowCount;
    }

    private static final class DomainStats {
        String domain = "";
        final List<QuestionStats> questions = new ArrayList<>();
        final List<ThemeStats> themes = new ArrayList<>();
        final List<Long> allTimes = new ArrayList<>();
        int timedEvents;
        long averageMs;
        long medianMs;
        int knownSlowCount;
    }

    private static final class Result {
        final List<DomainStats> domains = new ArrayList<>();
        int timedEvents;
        long globalAverageMs;
        long globalMedianMs;
        int knownSlowCount;
    }
}
