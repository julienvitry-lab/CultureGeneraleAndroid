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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CGLEARN003 · WEAKNESS_ENGINE001
 *
 * Analyse personnelle des points faibles à partir de play_history.
 * Lecture Firestore uniquement. Aucun accès SQLite.
 */
final class CgWeakness001 {
    private static final int PAGE_SIZE = 1000;
    private static final int WORK_THRESHOLD = 35;

    interface Starter {
        void start(List<Long> rows, String label);
    }

    private static final ExecutorService EXECUTOR =
            Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(() -> {
                    android.os.Process.setThreadPriority(
                            android.os.Process.THREAD_PRIORITY_BACKGROUND
                    );
                    runnable.run();
                }, "CGLEARN003-Weakness");
                thread.setDaemon(true);
                return thread;
            });

    private final Activity activity;
    private final Typeface font;
    private final Starter starter;
    private final Runnable onBack;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final int BG = Color.rgb(20, 24, 31);
    private final int PANEL = Color.rgb(37, 43, 54);
    private final int PANEL2 = Color.rgb(49, 57, 70);
    private final int RED = Color.rgb(185, 0, 0);
    private final int GOLD = Color.rgb(219, 176, 55);
    private final int BLUE = Color.rgb(0, 102, 204);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int GREY = Color.rgb(165, 172, 184);

    private Result currentResult;

    private CgWeakness001(
            Activity activity,
            Typeface font,
            Starter starter,
            Runnable onBack
    ) {
        this.activity = activity;
        this.font = font == null ? Typeface.DEFAULT : font;
        this.starter = starter;
        this.onBack = onBack;
    }

    static void show(
            Activity activity,
            Typeface font,
            Starter starter,
            Runnable onBack
    ) {
        CgWeakness001 screen =
                new CgWeakness001(activity, font, starter, onBack);

        screen.renderLoading();
        screen.loadHistory();
    }

    private void renderLoading() {
        LinearLayout root = baseScreen();

        TextView title = text("Points faibles", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(6)));

        TextView info = text(
                "Analyse de l'historique de jeu…",
                15,
                GREY,
                false
        );
        info.setGravity(Gravity.CENTER);
        root.addView(info, lp(0, 0, 0, dp(8)));

        TextView formula = text(
                "Score = 45 % échecs globaux · 30 % résultats récents · "
                        + "15 % erreurs répétées · 10 % temps de réponse",
                12,
                GREY,
                false
        );
        formula.setGravity(Gravity.CENTER);
        root.addView(formula, lp(0, 0, 0, dp(8)));

        LinearLayout spacer = new LinearLayout(activity);
        root.addView(
                spacer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        root.addView(backButton("Retour"), fixedHeight(52));
        activity.setContentView(root);
    }

    private void loadHistory() {
        FirebaseUser user =
                FirebaseAuth.getInstance().getCurrentUser();

        if (user == null) {
            renderError("Utilisateur Firebase non connecté.");
            return;
        }

        Aggregator aggregator = new Aggregator();

        loadPage(
                user.getUid(),
                null,
                aggregator
        );
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
                                List<DocumentSnapshot> documents =
                                        snapshot.getDocuments();

                                loadPage(
                                        uid,
                                        documents.get(documents.size() - 1),
                                        aggregator
                                );
                            } else {
                                Result result = aggregator.finish();

                                mainHandler.post(() -> {
                                    currentResult = result;
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
        if (currentResult == null
                || currentResult.questions.isEmpty()) {
            renderEmpty();
            return;
        }

        LinearLayout screen = baseScreen();

        TextView title = text("Points faibles", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(4)));

        TextView summary = text(
                currentResult.questions.size()
                        + " questions évaluées · "
                        + currentResult.successPercent
                        + "% réussite · faiblesse moyenne "
                        + currentResult.averageScore
                        + "/100",
                13,
                GREY,
                false
        );
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(8)));

        List<QuestionWeakness> weak =
                weakSelection(currentResult.questions);

        Button workAll = button(
                "Travailler mes points faibles (" + weak.size() + ")",
                16
        );
        workAll.setTextColor(Color.WHITE);
        workAll.setBackground(round(
                weak.isEmpty() ? PANEL2 : RED,
                dp(11)
        ));
        workAll.setEnabled(!weak.isEmpty());
        workAll.setAlpha(weak.isEmpty() ? 0.45f : 1f);
        workAll.setOnClickListener(v ->
                launch(
                        weak,
                        "Points faibles"
                )
        );
        screen.addView(workAll, fixedHeight(50));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (GroupWeakness domain : currentResult.domains) {
            list.addView(
                    groupCard(
                            domain,
                            true
                    ),
                    lp(0, dp(7), 0, 0)
            );
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

    private View groupCard(
            GroupWeakness group,
            boolean domainLevel
    ) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(11), dp(9), dp(11), dp(9));
        card.setBackground(round(PANEL, dp(11)));
        card.setClickable(true);

        TextView title = text(
                group.label,
                16,
                Color.WHITE,
                true
        );
        card.addView(title);

        TextView score = text(
                "Faiblesse "
                        + group.score
                        + "/100 · "
                        + group.successPercent
                        + "% réussite",
                13,
                scoreColor(group.score),
                true
        );
        score.setPadding(0, dp(4), 0, 0);
        card.addView(score);

        TextView detail = text(
                group.questionCount
                        + " questions · "
                        + group.weakCount
                        + " faibles · "
                        + group.priorityCount
                        + " prioritaires",
                12,
                GREY,
                false
        );
        detail.setPadding(0, dp(3), 0, 0);
        card.addView(detail);

        if (domainLevel) {
            card.setOnClickListener(v ->
                    renderThemes(group.domain)
            );
        } else {
            card.setOnClickListener(v ->
                    renderThemeDetail(
                            group.domain,
                            group.theme
                    )
            );
        }

        return card;
    }

    private void renderThemes(String domain) {
        LinearLayout screen = baseScreen();

        TextView title = text(domain, 25, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(6)));

        List<QuestionWeakness> domainQuestions =
                questionsFor(domain, null);

        List<QuestionWeakness> weak =
                weakSelection(domainQuestions);

        Button workDomain = button(
                "Travailler ce domaine (" + weak.size() + ")",
                16
        );
        workDomain.setTextColor(Color.WHITE);
        workDomain.setBackground(round(
                weak.isEmpty() ? PANEL2 : RED,
                dp(11)
        ));
        workDomain.setEnabled(!weak.isEmpty());
        workDomain.setAlpha(weak.isEmpty() ? 0.45f : 1f);
        workDomain.setOnClickListener(v ->
                launch(
                        weak,
                        domain
                )
        );
        screen.addView(workDomain, fixedHeight(50));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (GroupWeakness theme : themesFor(domain)) {
            list.addView(
                    groupCard(
                            theme,
                            false
                    ),
                    lp(0, dp(7), 0, 0)
            );
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

    private void renderThemeDetail(
            String domain,
            String theme
    ) {
        LinearLayout screen = baseScreen();

        String label = theme.isEmpty()
                ? "(Sans thème)"
                : theme;

        TextView title = text(label, 23, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(2)));

        TextView domainView = text(
                domain,
                13,
                GREY,
                false
        );
        domainView.setGravity(Gravity.CENTER);
        screen.addView(domainView, lp(0, 0, 0, dp(7)));

        List<QuestionWeakness> questions =
                questionsFor(domain, theme);

        List<QuestionWeakness> weak =
                weakSelection(questions);

        Button work = button(
                "Travailler ce thème (" + weak.size() + ")",
                16
        );
        work.setTextColor(Color.WHITE);
        work.setBackground(round(
                weak.isEmpty() ? PANEL2 : RED,
                dp(11)
        ));
        work.setEnabled(!weak.isEmpty());
        work.setAlpha(weak.isEmpty() ? 0.45f : 1f);
        work.setOnClickListener(v ->
                launch(
                        weak,
                        domain + " · " + label
                )
        );
        screen.addView(work, fixedHeight(50));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        for (QuestionWeakness q : questions) {
            list.addView(
                    questionCard(q),
                    lp(0, dp(7), 0, 0)
            );
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
        back.setOnClickListener(v -> renderThemes(domain));
        screen.addView(back, fixedHeight(52));

        activity.setContentView(screen);
    }

    private View questionCard(QuestionWeakness q) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(11), dp(8), dp(11), dp(8));
        card.setBackground(round(PANEL, dp(10)));

        TextView state = text(
                q.label()
                        + " · "
                        + q.score
                        + "/100",
                13,
                scoreColor(q.score),
                true
        );
        card.addView(state);

        TextView question = text(
                q.question.isEmpty()
                        ? "Question #" + q.row
                        : q.question,
                15,
                Color.WHITE,
                true
        );
        question.setPadding(0, dp(4), 0, 0);
        card.addView(question);

        String metrics =
                q.attempts
                        + " tentative"
                        + (q.attempts > 1 ? "s" : "")
                        + " · "
                        + q.successPercent
                        + "% réussite · "
                        + q.failures
                        + " erreur"
                        + (q.failures > 1 ? "s" : "");

        if (q.averageResponseMs > 0L) {
            metrics += " · " + duration(q.averageResponseMs);
        }

        TextView metricView = text(
                metrics,
                12,
                GREY,
                false
        );
        metricView.setPadding(0, dp(3), 0, 0);
        card.addView(metricView);

        TextView recent = text(
                q.latestPositive
                        ? "Dernière réponse : réussie"
                        : "Dernière réponse : échec",
                12,
                q.latestPositive ? GREEN : RED,
                true
        );
        recent.setPadding(0, dp(3), 0, 0);
        card.addView(recent);

        return card;
    }

    private List<GroupWeakness> themesFor(String domain) {
        Map<String, List<QuestionWeakness>> grouped =
                new TreeMap<>(
                        String.CASE_INSENSITIVE_ORDER
                );

        for (QuestionWeakness q : currentResult.questions) {
            if (!domain.equals(q.domain)) continue;

            String theme = q.theme;
            grouped.computeIfAbsent(
                    theme,
                    ignored -> new ArrayList<>()
            ).add(q);
        }

        List<GroupWeakness> result = new ArrayList<>();

        for (Map.Entry<String, List<QuestionWeakness>> entry
                : grouped.entrySet()) {
            result.add(
                    GroupWeakness.from(
                            domain,
                            entry.getKey(),
                            entry.getValue()
                    )
            );
        }

        Collections.sort(
                result,
                (a, b) -> Integer.compare(
                        b.score,
                        a.score
                )
        );

        return result;
    }

    private List<QuestionWeakness> questionsFor(
            String domain,
            String theme
    ) {
        List<QuestionWeakness> result = new ArrayList<>();

        for (QuestionWeakness q : currentResult.questions) {
            if (domain != null
                    && !domain.equals(q.domain)) {
                continue;
            }

            if (theme != null
                    && !theme.equals(q.theme)) {
                continue;
            }

            result.add(q);
        }

        Collections.sort(
                result,
                (a, b) -> {
                    int score = Integer.compare(
                            b.score,
                            a.score
                    );

                    if (score != 0) return score;

                    return Long.compare(
                            b.lastPlayedAtMs,
                            a.lastPlayedAtMs
                    );
                }
        );

        return result;
    }

    private List<QuestionWeakness> weakSelection(
            List<QuestionWeakness> source
    ) {
        List<QuestionWeakness> result = new ArrayList<>();

        for (QuestionWeakness q : source) {
            if (q.score >= WORK_THRESHOLD
                    || !q.latestPositive) {
                result.add(q);
            }
        }

        Collections.sort(
                result,
                (a, b) -> Integer.compare(
                        b.score,
                        a.score
                )
        );

        return result;
    }

    private void launch(
            List<QuestionWeakness> selected,
            String label
    ) {
        if (starter == null
                || selected == null
                || selected.isEmpty()) {
            return;
        }

        List<Long> rows = new ArrayList<>();

        for (QuestionWeakness q : selected) {
            if (q.row > 0L) rows.add(q.row);
        }

        if (!rows.isEmpty()) {
            starter.start(rows, label);
        }
    }

    private void renderEmpty() {
        LinearLayout root = baseScreen();

        TextView title = text("Points faibles", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(8)));

        TextView message = text(
                "Pas encore assez de réponses évaluées pour établir un profil.",
                17,
                GREY,
                false
        );
        message.setGravity(Gravity.CENTER);
        root.addView(message, lp(0, dp(10), 0, dp(10)));

        LinearLayout spacer = new LinearLayout(activity);
        root.addView(
                spacer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        root.addView(backButton("Retour"), fixedHeight(52));
        activity.setContentView(root);
    }

    private void renderError(String message) {
        LinearLayout root = baseScreen();

        TextView title = text("Points faibles", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0, 0, 0, dp(8)));

        TextView error = text(
                message,
                16,
                RED,
                true
        );
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

        root.addView(backButton("Retour"), fixedHeight(52));
        activity.setContentView(root);
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

    private GradientDrawable round(
            int color,
            int radius
    ) {
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
        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );
        params.setMargins(left, top, right, bottom);
        return params;
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

    private int scoreColor(int score) {
        if (score >= 70) return RED;
        if (score >= 50) return GOLD;
        if (score >= 30) return BLUE;
        return GREEN;
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

    private static int slowScore(long averageResponseMs) {
        if (averageResponseMs <= 0L) return 0;
        if (averageResponseMs < 5000L) return 0;
        if (averageResponseMs < 10000L) return 25;
        if (averageResponseMs < 20000L) return 50;
        if (averageResponseMs < 40000L) return 75;
        return 100;
    }

    private static final class Aggregator {
        private final Map<Long, Stats> byRow =
                new HashMap<>();

        void consume(QuerySnapshot snapshot) {
            for (DocumentSnapshot doc
                    : snapshot.getDocuments()) {
                consume(doc);
            }
        }

        private void consume(DocumentSnapshot doc) {
            String playType = safe(doc.get("play_type"));

            if (!"challenge_choice".equals(playType)
                    && !"challenge_mental".equals(playType)) {
                return;
            }

            long row =
                    longValue(doc.get("question_row_number"));

            if (row <= 0L) {
                row = longValue(doc.get("question_id"));
            }

            if (row <= 0L) return;

            Stats stats = byRow.get(row);

            if (stats == null) {
                stats = new Stats();
                stats.row = row;
                byRow.put(row, stats);
            }

            boolean positive;

            if ("challenge_choice".equals(playType)) {
                positive =
                        Boolean.TRUE.equals(
                                booleanValue(
                                        doc.get("is_correct")
                                )
                        );
            } else {
                positive =
                        "assimilated".equals(
                                safe(doc.get("result"))
                        );
            }

            long responseTime =
                    longValue(doc.get("response_time_ms"));

            long playedAt =
                    longValue(doc.get("client_played_at_ms"));

            Timestamp timestamp =
                    doc.getTimestamp("played_at");

            if (playedAt <= 0L
                    && timestamp != null) {
                playedAt =
                        timestamp.toDate().getTime();
            }

            stats.attempts++;
            if (positive) {
                stats.positive++;
            } else {
                stats.failures++;
            }

            if (responseTime > 0L) {
                stats.responseTotalMs += responseTime;
                stats.responseCount++;
            }

            // Requête triée du plus récent au plus ancien.
            if (stats.lastPlayedAtMs <= 0L) {
                stats.lastPlayedAtMs = playedAt;
                stats.latestPositive = positive;
                stats.domain = safe(doc.get("domain"));
                stats.theme = safe(doc.get("theme"));

                Object snapshot =
                        doc.get("question_snapshot");

                if (snapshot instanceof Map) {
                    Map<?, ?> map = (Map<?, ?>) snapshot;
                    stats.question =
                            safe(map.get("question"));

                    if (stats.domain.isEmpty()) {
                        stats.domain =
                                safe(map.get("domain"));
                    }

                    if (stats.theme.isEmpty()) {
                        stats.theme =
                                safe(map.get("theme"));
                    }
                }
            }

            if (stats.recentNewest.size() < 5) {
                stats.recentNewest.add(positive);
            }
        }

        Result finish() {
            Result result = new Result();

            int totalAttempts = 0;
            int totalPositive = 0;
            int totalScore = 0;

            for (Stats stats : byRow.values()) {
                if (stats.attempts <= 0) continue;

                QuestionWeakness q =
                        QuestionWeakness.from(stats);

                result.questions.add(q);
                totalAttempts += q.attempts;
                totalPositive += q.positive;
                totalScore += q.score;
            }

            Collections.sort(
                    result.questions,
                    (a, b) -> Integer.compare(
                            b.score,
                            a.score
                    )
            );

            result.successPercent =
                    totalAttempts == 0
                            ? 0
                            : Math.round(
                                    100f
                                            * totalPositive
                                            / totalAttempts
                            );

            result.averageScore =
                    result.questions.isEmpty()
                            ? 0
                            : Math.round(
                                    (float) totalScore
                                            / result.questions.size()
                            );

            Map<String, List<QuestionWeakness>> domains =
                    new TreeMap<>(
                            String.CASE_INSENSITIVE_ORDER
                    );

            for (QuestionWeakness q : result.questions) {
                String domain = q.domain.isEmpty()
                        ? "(Sans domaine)"
                        : q.domain;

                q.domain = domain;

                domains.computeIfAbsent(
                        domain,
                        ignored -> new ArrayList<>()
                ).add(q);
            }

            for (Map.Entry<String, List<QuestionWeakness>> entry
                    : domains.entrySet()) {
                result.domains.add(
                        GroupWeakness.from(
                                entry.getKey(),
                                null,
                                entry.getValue()
                        )
                );
            }

            Collections.sort(
                    result.domains,
                    (a, b) -> Integer.compare(
                            b.score,
                            a.score
                    )
            );

            return result;
        }
    }

    private static final class Stats {
        long row;
        String domain = "";
        String theme = "";
        String question = "";

        int attempts;
        int positive;
        int failures;

        long responseTotalMs;
        int responseCount;
        long lastPlayedAtMs;
        boolean latestPositive;

        final List<Boolean> recentNewest =
                new ArrayList<>();

        int successPercent() {
            return attempts == 0
                    ? 0
                    : Math.round(
                            100f * positive / attempts
                    );
        }

        long averageResponseMs() {
            return responseCount == 0
                    ? 0L
                    : responseTotalMs / responseCount;
        }

        int recentFailurePercent() {
            if (recentNewest.isEmpty()) return 0;

            int totalWeight = 0;
            int failureWeight = 0;

            for (int i = 0;
                    i < recentNewest.size();
                    i++) {
                int weight = 5 - i;
                totalWeight += weight;

                if (!recentNewest.get(i)) {
                    failureWeight += weight;
                }
            }

            return totalWeight == 0
                    ? 0
                    : Math.round(
                            100f
                                    * failureWeight
                                    / totalWeight
                    );
        }

        int score() {
            int overallFailure =
                    100 - successPercent();

            int recentFailure =
                    recentFailurePercent();

            int repeatedErrors =
                    Math.min(
                            100,
                            failures * 25
                    );

            int slow =
                    slowScore(
                            averageResponseMs()
                    );

            int score = Math.round(
                    overallFailure * 0.45f
                            + recentFailure * 0.30f
                            + repeatedErrors * 0.15f
                            + slow * 0.10f
            );

            if (!latestPositive) {
                score = Math.max(
                        score,
                        60
                );
            }

            return Math.max(
                    0,
                    Math.min(100, score)
            );
        }
    }

    private static final class QuestionWeakness {
        long row;
        String domain = "";
        String theme = "";
        String question = "";

        int attempts;
        int positive;
        int failures;
        int successPercent;
        int score;

        long averageResponseMs;
        long lastPlayedAtMs;
        boolean latestPositive;

        String label() {
            if (score >= 70) return "Critique";
            if (score >= 50) return "Fragile";
            if (score >= 30) return "À surveiller";
            return "Solide";
        }

        static QuestionWeakness from(Stats stats) {
            QuestionWeakness q =
                    new QuestionWeakness();

            q.row = stats.row;
            q.domain = stats.domain;
            q.theme = stats.theme;
            q.question = stats.question;
            q.attempts = stats.attempts;
            q.positive = stats.positive;
            q.failures = stats.failures;
            q.successPercent =
                    stats.successPercent();
            q.score = stats.score();
            q.averageResponseMs =
                    stats.averageResponseMs();
            q.lastPlayedAtMs =
                    stats.lastPlayedAtMs;
            q.latestPositive =
                    stats.latestPositive;

            return q;
        }
    }

    private static final class GroupWeakness {
        String domain = "";
        String theme = "";
        String label = "";

        int score;
        int successPercent;
        int questionCount;
        int weakCount;
        int priorityCount;

        static GroupWeakness from(
                String domain,
                String theme,
                List<QuestionWeakness> questions
        ) {
            GroupWeakness group =
                    new GroupWeakness();

            group.domain = domain == null ? "" : domain;
            group.theme = theme == null ? "" : theme;

            group.label =
                    theme == null
                            ? group.domain
                            : (group.theme.isEmpty()
                                    ? "(Sans thème)"
                                    : group.theme);

            int scoreTotal = 0;
            int maxScore = 0;
            int attempts = 0;
            int positive = 0;

            for (QuestionWeakness q : questions) {
                scoreTotal += q.score;
                maxScore = Math.max(
                        maxScore,
                        q.score
                );

                attempts += q.attempts;
                positive += q.positive;

                if (q.score >= WORK_THRESHOLD
                        || !q.latestPositive) {
                    group.weakCount++;
                }

                if (q.score >= 65
                        || !q.latestPositive) {
                    group.priorityCount++;
                }
            }

            group.questionCount =
                    questions.size();

            float mean =
                    questions.isEmpty()
                            ? 0f
                            : (float) scoreTotal
                            / questions.size();

            group.score =
                    Math.round(
                            mean * 0.70f
                                    + maxScore * 0.30f
                    );

            group.successPercent =
                    attempts == 0
                            ? 0
                            : Math.round(
                                    100f
                                            * positive
                                            / attempts
                            );

            return group;
        }
    }

    private static final class Result {
        final List<QuestionWeakness> questions =
                new ArrayList<>();

        final List<GroupWeakness> domains =
                new ArrayList<>();

        int successPercent;
        int averageScore;
    }
}
