package fr.culturegenerale.android.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CGANDROID001
 * - nouvelle APK indépendante de l'ancien module app/ ;
 * - CGANDROID007 : apprentissage continu sans limite de session ;
 * - CGANDROID003 : Q/R en deux étapes avec auto-évaluation binaire ;
 * - Comfortaa systématique ;
 * - P = signalement éditorial ;
 * - T = exclusion analogue locale immédiate + file Cloud/pending ;
 * - réussite / échec auto-évalués conservés dans play_history.
 */
public class TabletMainActivity extends Activity {

    // CGANDROID002 · navigation compartimentée
    private static final String[] DOMAINS = new String[]{
            "Animaux et Plantes",
            "Culture Classique",
            "Culture Générale",
            "Culture Moderne",
            "Géographie",
            "Histoire",
            "Sciences et Techniques",
            "Sport",
            "Toutes les questions"
    };

    // CGANDROID007 · ENDLESS_PLAY001
    // Le lot de 100 est purement technique.
    private static final int ENDLESS_BATCH_SIZE = 100;
    private static final int NEXT_BATCH_PREFETCH_AT = 70;
    private static final int QUESTION_PREFETCH_AHEAD = 10;

    private final int BLUE = Color.rgb(0, 86, 180);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int RED = Color.rgb(185, 0, 0);
    private final int YELLOW = Color.rgb(245, 205, 40);
    private final int DARK = Color.rgb(35, 35, 35);
    private final int GREY = Color.rgb(85, 85, 85);
    private final int LIGHT_GREY = Color.rgb(130, 130, 130);

    private final int ANIMALS_GREEN = Color.rgb(20, 92, 47);
    private final int CLASSIC_BLUE = Color.rgb(40, 96, 194);
    private final int GENERAL_GREEN = Color.rgb(137, 207, 104);
    private final int MODERN_ORANGE = Color.rgb(239, 126, 24);
    private final int GEO_BLUE = Color.rgb(104, 184, 223);
    private final int HISTORY_BROWN = Color.rgb(126, 77, 45);
    private final int SCIENCE_YELLOW = Color.rgb(249, 210, 38);
    private final int SPORT_RED = Color.rgb(196, 24, 26);

    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper());

    private Typeface appFont = Typeface.DEFAULT_BOLD;
    private LinearLayout root;
    private TextView statusView;

    private CgAuth auth;
    private CgSmartClient smart;
    private CgFirestore firestore;
    private CgFlags flags;
    private CgGameState game;

    private String selectedDomain = "";

    private CgQuestion current;
    private long currentShownAtMs = 0L;
    private final List<Button> answerButtons = new ArrayList<>();
    private final Map<String, Bitmap> imageCache = new HashMap<>();
    private final Set<String> imagePreloadInFlight = new HashSet<>();
    private final Map<String, CgQuestion> questionCache = new HashMap<>();
    private final Set<String> questionPreloadInFlight = new HashSet<>();
    private volatile boolean nextBatchPrefetching = false;
    private boolean answering = false;
    private String screen = "home";

    // CGANDROID004 · HISTORY_QR001
    private static final int HISTORY_MAX_EVENTS = 1000;
    private final List<CgHistoryItem> historyItems = new ArrayList<>();
    private String historyFilter = "all";

    // CGANDROID002 FIX1 · BOTTOM_BAR_LAYOUT001

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        loadFont();

        auth = new CgAuth(this);
        smart = new CgSmartClient();
        firestore = new CgFirestore();
        flags = new CgFlags(this);
        game = new CgGameState(this);

        if (auth.hasRefreshToken()) showHome();
        else showLogin();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
    }

    @Override
    public void onBackPressed() {

        // CGANDROID004 · HISTORY_NAVIGATION001
        if ("history_detail".equals(screen)) {
            renderHistory();
            return;
        }

        if ("history".equals(screen)) {
            showHome();
            return;
        }

        if ("answers".equals(screen) && current != null) {
            showQuestion(current);
            return;
        }
        if ("size".equals(screen)) {
            showMegathemes();
            return;
        }
        if ("megathemes".equals(screen)) {
            showHome();
            return;
        }
        if ("question".equals(screen) && game.hasActive()) {
            showHome();
            return;
        }
        super.onBackPressed();
    }

    private void loadFont() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appFont = getResources().getFont(R.font.comfortaa_bold);
            } else {
                appFont = Typeface.DEFAULT_BOLD;
            }
        } catch (Exception ignored) {
            appFont = Typeface.DEFAULT_BOLD;
        }
    }

    private void showLogin() {
        screen = "login";
        baseScreen();
        addTitle("Culture Générale", 34, Color.WHITE);
        addSub("Apprentissage continu · question / réponse", 18, LIGHT_GREY);
        gap(20);

        TextView intro = cardText(
                "Connexion au même compte que CGWEB. L’identification n’est demandée qu’une fois.",
                16, DARK, Color.WHITE);
        add(intro, -1, -2, 0, 0, 0, dp(14));

        EditText email = edit("Adresse e-mail",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = edit("Mot de passe",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        add(email, -1, dp(54), dp(24), 0, dp(24), dp(10));
        add(password, -1, dp(54), dp(24), 0, dp(24), dp(16));

        Button connect = button("Se connecter", BLUE, 20);
        add(connect, -1, dp(58), dp(80), 0, dp(80), dp(12));

        statusView = text("", 14, LIGHT_GREY, Gravity.CENTER);
        add(statusView, -1, -2, dp(20), 0, dp(20), 0);

        connect.setOnClickListener(v -> {
            final String e = email.getText().toString().trim();
            final String p = password.getText().toString();
            if (e.isEmpty() || p.isEmpty()) {
                status("Adresse e-mail et mot de passe requis.", RED);
                return;
            }
            connect.setEnabled(false);
            status("Connexion…", YELLOW);
            io.submit(() -> {
                try {
                    auth.signInSync(e, p);
                    final String token = auth.tokenSync();
                    flags.flushOutboxSync(firestore, token, auth.uid());
                    main.post(this::showHome);
                } catch (Exception ex) {
                    main.post(() -> {
                        connect.setEnabled(true);
                        status("Connexion impossible : " + ex.getMessage(), RED);
                    });
                }
            });
        });
    }

    private void showHome() {
        screen = "home";
        current = null;
        answering = false;
        baseScreen();

        gap(54);
        addTitle("Culture Générale", 38, Color.WHITE);
        addSub("Apprentissage continu", 20, LIGHT_GREY);
        gap(48);

        Button start = button("Démarrer", BLUE, 28);
        add(start, -1, dp(88), dp(180), 0, dp(180), dp(18));
        start.setOnClickListener(v -> showMegathemes());

        TextView helper = text("Jouer sans limite de nombre de questions", 15, LIGHT_GREY, Gravity.CENTER);
        add(helper, -1, -2, dp(40), 0, dp(40), dp(30));

        // CGANDROID004 · HISTORY_HOME_ENTRY001
        Button history = button("Historique", DARK, 21);
        history.setBackground(roundedStroke(DARK, 14, Color.WHITE, 1));
        add(history, -1, dp(62), dp(220), 0, dp(220), dp(10));
        history.setOnClickListener(v -> showHistory());

        TextView historyHelper =
                text(
                        "Consulter réussites, échecs et progression",
                        14,
                        LIGHT_GREY,
                        Gravity.CENTER
                );

        add(historyHelper, -1, -2, dp(30), 0, dp(30), 0);
    }


    /*
     * ================================================================
     * CGANDROID004 · HISTORY_QR001
     * ================================================================
     */

    private void showHistory() {

        screen = "history";
        historyFilter = "all";

        baseScreen();

        addTitle(
                "Historique",
                31,
                Color.WHITE
        );

        addSub(
                "Chargement de tes réponses…",
                16,
                LIGHT_GREY
        );

        gap(20);

        TextView loading =
                text(
                        "Lecture de l’historique Cloud…",
                        18,
                        YELLOW,
                        Gravity.CENTER
                );

        add(
                loading,
                -1,
                dp(80),
                dp(30),
                dp(20),
                dp(30),
                0
        );


        io.submit(() -> {

            try {

                String token =
                        auth.tokenSync();

                List<CgHistoryItem> loaded =
                        firestore.listPlayHistorySync(
                                token,
                                auth.uid(),
                                HISTORY_MAX_EVENTS
                        );

                main.post(() -> {

                    if (!"history".equals(screen)) {
                        return;
                    }

                    historyItems.clear();
                    historyItems.addAll(loaded);

                    renderHistory();
                });

            } catch (Exception ex) {

                main.post(() -> {

                    if (!"history".equals(screen)) {
                        return;
                    }

                    showHistoryError(
                            ex.getMessage()
                    );
                });
            }
        });
    }


    private void renderHistory() {

        screen = "history";

        baseScreen();

        addTitle(
                "Historique",
                31,
                Color.WHITE
        );

        addSub(
                "Apprentissage par question / réponse",
                16,
                LIGHT_GREY
        );

        gap(12);


        int total = historyItems.size();
        int success = 0;

        for (CgHistoryItem item : historyItems) {

            if (item.correct) {
                success++;
            }
        }

        int failures =
                total - success;

        int rate =
                total <= 0
                        ? 0
                        : Math.round(
                                success * 100f / total
                        );


        /*
         * Résumé global.
         */
        LinearLayout stats =
                new LinearLayout(this);

        stats.setOrientation(
                LinearLayout.HORIZONTAL
        );

        stats.setGravity(
                Gravity.CENTER
        );


        stats.addView(
                historyStatCard(
                        "Questions vues",
                        String.valueOf(total),
                        BLUE
                ),
                historyStatLp()
        );

        stats.addView(
                historyStatCard(
                        "Réussites",
                        String.valueOf(success),
                        GREEN
                ),
                historyStatLp()
        );

        stats.addView(
                historyStatCard(
                        "Échecs",
                        String.valueOf(failures),
                        RED
                ),
                historyStatLp()
        );

        stats.addView(
                historyStatCard(
                        "Taux",
                        rate + " %",
                        GREY
                ),
                historyStatLp()
        );


        LinearLayout.LayoutParams statsLp =
                new LinearLayout.LayoutParams(
                        -1,
                        dp(92)
                );

        statsLp.setMargins(
                0,
                dp(4),
                0,
                dp(18)
        );

        root.addView(
                stats,
                statsLp
        );


        /*
         * Filtres.
         */
        LinearLayout filters =
                new LinearLayout(this);

        filters.setOrientation(
                LinearLayout.HORIZONTAL
        );

        filters.setGravity(
                Gravity.CENTER
        );


        filters.addView(
                historyFilterButton(
                        "Tout",
                        "all",
                        BLUE
                ),
                historyFilterLp()
        );

        filters.addView(
                historyFilterButton(
                        "Réussites",
                        "success",
                        GREEN
                ),
                historyFilterLp()
        );

        filters.addView(
                historyFilterButton(
                        "Échecs",
                        "failure",
                        RED
                ),
                historyFilterLp()
        );


        LinearLayout.LayoutParams filtersLp =
                new LinearLayout.LayoutParams(
                        -1,
                        dp(58)
                );

        filtersLp.setMargins(
                0,
                0,
                0,
                dp(18)
        );

        root.addView(
                filters,
                filtersLp
        );


        if (historyItems.isEmpty()) {

            TextView empty =
                    cardText(
                            "Aucune réponse enregistrée pour le moment.",
                            18,
                            DARK,
                            Color.WHITE
                    );

            empty.setGravity(
                    Gravity.CENTER
            );

            add(
                    empty,
                    -1,
                    dp(100),
                    dp(40),
                    dp(20),
                    dp(40),
                    dp(20)
            );

        } else {

            int displayed = 0;

            for (CgHistoryItem item : historyItems) {

                if (!historyMatchesFilter(item)) {
                    continue;
                }

                addHistoryRow(item);
                displayed++;
            }


            if (displayed == 0) {

                TextView empty =
                        text(
                                "Aucune réponse dans ce filtre.",
                                17,
                                LIGHT_GREY,
                                Gravity.CENTER
                        );

                add(
                        empty,
                        -1,
                        dp(80),
                        dp(30),
                        dp(20),
                        dp(30),
                        dp(20)
                );
            }
        }


        if (
                historyItems.size()
                        >= HISTORY_MAX_EVENTS
        ) {

            TextView limit =
                    text(
                            "Affichage limité aux "
                                    + HISTORY_MAX_EVENTS
                                    + " réponses les plus récentes.",
                            13,
                            LIGHT_GREY,
                            Gravity.CENTER
                    );

            add(
                    limit,
                    -1,
                    -2,
                    dp(20),
                    dp(10),
                    dp(20),
                    dp(8)
            );
        }


        // CGANDROID005 · HARD_RESET_UI001
        Button reset =
                button(
                        "Effacer définitivement mon historique",
                        RED,
                        17
                );

        reset.setBackground(
                roundedStroke(
                        DARK,
                        14,
                        RED,
                        2
                )
        );

        add(
                reset,
                -1,
                dp(60),
                dp(120),
                dp(16),
                dp(120),
                dp(8)
        );

        reset.setOnClickListener(
                v -> confirmHardLearningReset()
        );


        Button back =
                button(
                        "Retour",
                        BLUE,
                        18
                );

        add(
                back,
                -1,
                dp(56),
                dp(140),
                dp(18),
                dp(140),
                0
        );

        back.setOnClickListener(
                v -> showHome()
        );
    }


    /*
     * ================================================================
     * CGANDROID005 · HARD_LEARNING_RESET001
     * ================================================================
     */

    private void confirmHardLearningReset() {

        new AlertDialog.Builder(this)
                .setTitle(
                        "Tout effacer ?"
                )
                .setMessage(
                        "Cette opération supprimera définitivement "
                                + "toutes les réponses déjà enregistrées, "
                                + "toutes les statistiques d’apprentissage "
                                + "et les anciennes sessions SMART.\n\n"
                                + "Cette opération est irréversible."
                )
                .setNegativeButton(
                        "Annuler",
                        null
                )
                .setPositiveButton(
                        "Continuer",
                        (dialog, which) ->
                                confirmHardLearningResetFinal()
                )
                .show();
    }


    private void confirmHardLearningResetFinal() {

        new AlertDialog.Builder(this)
                .setTitle(
                        "Confirmation définitive"
                )
                .setMessage(
                        "Après validation, l’ancien historique "
                                + "n’existera plus.\n\n"
                                + "L’apprentissage repartira réellement "
                                + "de zéro."
                )
                .setNegativeButton(
                        "Annuler",
                        null
                )
                .setPositiveButton(
                        "EFFACER DÉFINITIVEMENT",
                        (dialog, which) ->
                                performHardLearningReset()
                )
                .show();
    }


    private void performHardLearningReset() {

        screen =
                "hard_learning_reset";

        baseScreen();

        addTitle(
                "Remise à zéro",
                30,
                Color.WHITE
        );

        addSub(
                "Suppression définitive de l’ancien apprentissage…",
                16,
                YELLOW
        );


        io.submit(() -> {

            try {

                /*
                 * Toute ancienne réponse encore en attente locale
                 * est supprimée AVANT le reset serveur.
                 */
                flags.purgeHistoryOutbox();


                String token =
                        auth.tokenSync();


                JSONObject result =
                        smart.hardResetLearningSync(
                                token
                        );


                /*
                 * Aucune ancienne session locale ne doit pouvoir
                 * reprendre après le hard reset.
                 */
                game.clear();

                historyItems.clear();

                current = null;
                answering = false;

                selectedDomain = "";

                nextBatchPrefetching = false;

                synchronized (questionCache) {
                    questionCache.clear();
                }

                synchronized (questionPreloadInFlight) {
                    questionPreloadInFlight.clear();
                }

                synchronized (imageCache) {
                    imageCache.clear();
                }

                synchronized (imagePreloadInFlight) {
                    imagePreloadInFlight.clear();
                }


                int deletedHistory =
                        result.optInt(
                                "historyDeleted",
                                0
                        );

                int deletedSessions =
                        result.optInt(
                                "sessionsDeleted",
                                0
                        );


                main.post(() -> {

                    Toast.makeText(
                            this,
                            "Historique supprimé : "
                                    + deletedHistory
                                    + " réponse(s), "
                                    + deletedSessions
                                    + " ancien(s) lot(s) technique(s).",
                            Toast.LENGTH_LONG
                    ).show();


                    showHome();
                });


            } catch (Exception ex) {

                main.post(() -> {

                    new AlertDialog.Builder(this)
                            .setTitle(
                                    "Suppression incomplète"
                            )
                            .setMessage(
                                    "Le serveur n’a pas confirmé "
                                            + "l’effacement complet.\n\n"
                                            + safeHistoryText(
                                            ex.getMessage(),
                                            "Erreur inconnue."
                                    )
                            )
                            .setPositiveButton(
                                    "OK",
                                    (dialog, which) ->
                                            showHistory()
                            )
                            .show();
                });
            }
        });
    }


    private boolean historyMatchesFilter(
            CgHistoryItem item
    ) {

        if ("success".equals(historyFilter)) {
            return item.correct;
        }

        if ("failure".equals(historyFilter)) {
            return !item.correct;
        }

        return true;
    }


    private Button historyFilterButton(
            String label,
            String filter,
            int color
    ) {

        boolean selected =
                filter.equals(historyFilter);

        Button button =
                button(
                        label,
                        selected ? color : DARK,
                        16
                );

        button.setTextColor(
                Color.WHITE
        );

        button.setBackground(
                roundedStroke(
                        selected ? color : DARK,
                        12,
                        color,
                        selected ? 2 : 1
                )
        );

        button.setOnClickListener(v -> {

            historyFilter = filter;
            renderHistory();
        });

        return button;
    }


    private LinearLayout.LayoutParams
    historyFilterLp() {

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(
                        0,
                        -1,
                        1f
                );

        lp.setMargins(
                dp(5),
                0,
                dp(5),
                0
        );

        return lp;
    }


    private LinearLayout historyStatCard(
            String label,
            String value,
            int color
    ) {

        LinearLayout card =
                new LinearLayout(this);

        card.setOrientation(
                LinearLayout.VERTICAL
        );

        card.setGravity(
                Gravity.CENTER
        );

        card.setPadding(
                dp(6),
                dp(6),
                dp(6),
                dp(6)
        );

        card.setBackground(
                roundedStroke(
                        DARK,
                        13,
                        color,
                        2
                )
        );


        TextView number =
                text(
                        value,
                        23,
                        Color.WHITE,
                        Gravity.CENTER
                );

        number.setTypeface(
                appFont,
                Typeface.BOLD
        );


        TextView title =
                text(
                        label,
                        13,
                        LIGHT_GREY,
                        Gravity.CENTER
                );


        card.addView(
                number,
                new LinearLayout.LayoutParams(
                        -1,
                        0,
                        .58f
                )
        );

        card.addView(
                title,
                new LinearLayout.LayoutParams(
                        -1,
                        0,
                        .42f
                )
        );

        return card;
    }


    private LinearLayout.LayoutParams
    historyStatLp() {

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(
                        0,
                        -1,
                        1f
                );

        lp.setMargins(
                dp(4),
                0,
                dp(4),
                0
        );

        return lp;
    }


    private void addHistoryRow(
            CgHistoryItem item
    ) {

        int color =
                item.correct
                        ? GREEN
                        : RED;


        LinearLayout card =
                new LinearLayout(this);

        card.setOrientation(
                LinearLayout.VERTICAL
        );

        card.setPadding(
                dp(18),
                dp(14),
                dp(18),
                dp(14)
        );

        card.setBackground(
                roundedStroke(
                        DARK,
                        14,
                        color,
                        1
                )
        );


        String top =
                formatHistoryDate(
                        item.playedAtMs
                );

        if (
                item.domain != null &&
                !item.domain.trim().isEmpty()
        ) {

            top += "  ·  "
                    + item.domain;
        }


        TextView meta =
                text(
                        top,
                        13,
                        LIGHT_GREY,
                        Gravity.LEFT
                );

        card.addView(
                meta,
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                )
        );


        if (
                item.theme != null &&
                !item.theme.trim().isEmpty()
        ) {

            TextView theme =
                    text(
                            item.theme,
                            14,
                            YELLOW,
                            Gravity.LEFT
                    );

            LinearLayout.LayoutParams themeLp =
                    new LinearLayout.LayoutParams(
                            -1,
                            -2
                    );

            themeLp.setMargins(
                    0,
                    dp(4),
                    0,
                    0
            );

            card.addView(
                    theme,
                    themeLp
            );
        }


        TextView question =
                text(
                        safeHistoryText(
                                item.question,
                                "Question indisponible"
                        ),
                        18,
                        Color.WHITE,
                        Gravity.LEFT
                );

        LinearLayout.LayoutParams questionLp =
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                );

        questionLp.setMargins(
                0,
                dp(9),
                0,
                dp(8)
        );

        card.addView(
                question,
                questionLp
        );


        TextView answer =
                text(
                        "Réponse : "
                                + safeHistoryText(
                                        item.correctAnswer,
                                        "—"
                                ),
                        16,
                        Color.WHITE,
                        Gravity.LEFT
                );

        card.addView(
                answer,
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                )
        );


        TextView result =
                text(
                        item.correct
                                ? "✓ J’avais bon"
                                : "✕ J’avais faux",
                        16,
                        color,
                        Gravity.LEFT
                );

        result.setTypeface(
                appFont,
                Typeface.BOLD
        );

        LinearLayout.LayoutParams resultLp =
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                );

        resultLp.setMargins(
                0,
                dp(8),
                0,
                0
        );

        card.addView(
                result,
                resultLp
        );


        LinearLayout.LayoutParams cardLp =
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                );

        cardLp.setMargins(
                0,
                0,
                0,
                dp(10)
        );

        root.addView(
                card,
                cardLp
        );


        card.setOnClickListener(
                v -> showHistoryDetail(item)
        );
    }


    // CGANDROID004 FIX1 · JAVA_STRING_ESCAPE001
    private void showHistoryDetail(
            CgHistoryItem selected
    ) {

        screen = "history_detail";

        baseScreen();

        addTitle(
                "Historique de la question",
                28,
                Color.WHITE
        );

        addSub(
                safeHistoryText(
                        selected.domain,
                        ""
                ),
                15,
                LIGHT_GREY
        );

        gap(10);


        TextView question =
                cardText(
                        safeHistoryText(
                                selected.question,
                                "Question indisponible"
                        ),
                        21,
                        DARK,
                        Color.WHITE
                );

        question.setGravity(
                Gravity.CENTER
        );

        add(
                question,
                -1,
                -2,
                dp(20),
                dp(4),
                dp(20),
                dp(12)
        );


        TextView answer =
                cardText(
                        "Réponse\n\n"
                                + safeHistoryText(
                                        selected.correctAnswer,
                                        "—"
                                ),
                        22,
                        DARK,
                        Color.WHITE
                );

        answer.setGravity(
                Gravity.CENTER
        );

        add(
                answer,
                -1,
                -2,
                dp(20),
                0,
                dp(20),
                dp(20)
        );


        int attempts = 0;
        int success = 0;
        int failures = 0;


        for (CgHistoryItem item : historyItems) {

            if (!sameHistoryQuestion(
                    selected,
                    item
            )) {
                continue;
            }

            attempts++;

            if (item.correct) {
                success++;
            } else {
                failures++;
            }
        }


        LinearLayout stats =
                new LinearLayout(this);

        stats.setOrientation(
                LinearLayout.HORIZONTAL
        );


        stats.addView(
                historyStatCard(
                        "Passages",
                        String.valueOf(attempts),
                        BLUE
                ),
                historyStatLp()
        );

        stats.addView(
                historyStatCard(
                        "Réussites",
                        String.valueOf(success),
                        GREEN
                ),
                historyStatLp()
        );

        stats.addView(
                historyStatCard(
                        "Échecs",
                        String.valueOf(failures),
                        RED
                ),
                historyStatLp()
        );


        String last =
                selected.correct
                        ? "✓"
                        : "✕";


        stats.addView(
                historyStatCard(
                        "Dernière",
                        last,
                        selected.correct
                                ? GREEN
                                : RED
                ),
                historyStatLp()
        );


        LinearLayout.LayoutParams statsLp =
                new LinearLayout.LayoutParams(
                        -1,
                        dp(92)
                );

        statsLp.setMargins(
                0,
                0,
                0,
                dp(18)
        );

        root.addView(
                stats,
                statsLp
        );


        TextView historyTitle =
                text(
                        "Passages",
                        19,
                        Color.WHITE,
                        Gravity.LEFT
                );

        add(
                historyTitle,
                -1,
                -2,
                dp(4),
                0,
                dp(4),
                dp(8)
        );


        for (CgHistoryItem item : historyItems) {

            if (!sameHistoryQuestion(
                    selected,
                    item
            )) {
                continue;
            }


            int resultColor =
                    item.correct
                            ? GREEN
                            : RED;


            TextView attempt =
                    text(
                            formatHistoryDate(
                                    item.playedAtMs
                            )
                                    + "     "
                                    + (
                                    item.correct
                                            ? "✓ Réussite"
                                            : "✕ Échec"
                            ),
                            17,
                            resultColor,
                            Gravity.CENTER
                    );

            attempt.setBackground(
                    roundedStroke(
                            DARK,
                            12,
                            resultColor,
                            1
                    )
            );

            add(
                    attempt,
                    -1,
                    dp(52),
                    dp(20),
                    0,
                    dp(20),
                    dp(8)
            );
        }


        Button back =
                button(
                        "Retour à l’historique",
                        BLUE,
                        18
                );

        add(
                back,
                -1,
                dp(58),
                dp(120),
                dp(18),
                dp(120),
                0
        );

        back.setOnClickListener(
                v -> renderHistory()
        );
    }


    private boolean sameHistoryQuestion(
            CgHistoryItem a,
            CgHistoryItem b
    ) {

        if (
                a.questionId != null &&
                !a.questionId.trim().isEmpty() &&
                b.questionId != null &&
                !b.questionId.trim().isEmpty()
        ) {

            return a.questionId.equals(
                    b.questionId
            );
        }


        return safeHistoryText(
                a.question,
                ""
        ).equals(
                safeHistoryText(
                        b.question,
                        ""
                )
        );
    }


    private String safeHistoryText(
            String value,
            String fallback
    ) {

        if (
                value == null ||
                value.trim().isEmpty()
        ) {

            return fallback;
        }

        return value.trim();
    }


    private String formatHistoryDate(
            long timestamp
    ) {

        if (timestamp <= 0L) {
            return "Date inconnue";
        }

        try {

            return new SimpleDateFormat(
                    "dd/MM/yyyy · HH:mm",
                    Locale.FRANCE
            ).format(
                    new Date(timestamp)
            );

        } catch (Exception ignored) {

            return "Date inconnue";
        }
    }


    private void showHistoryError(
            String message
    ) {

        screen = "history";

        baseScreen();

        addTitle(
                "Historique",
                31,
                Color.WHITE
        );


        TextView error =
                cardText(
                        "Historique indisponible.\n\n"
                                + safeHistoryText(
                                        message,
                                        "Erreur inconnue"
                                ),
                        17,
                        DARK,
                        Color.WHITE
                );

        error.setGravity(
                Gravity.CENTER
        );

        add(
                error,
                -1,
                -2,
                dp(40),
                dp(30),
                dp(40),
                dp(20)
        );


        Button retry =
                button(
                        "Réessayer",
                        GREEN,
                        18
                );

        add(
                retry,
                -1,
                dp(58),
                dp(160),
                0,
                dp(160),
                dp(10)
        );

        retry.setOnClickListener(
                v -> showHistory()
        );


        Button back =
                button(
                        "Retour",
                        BLUE,
                        18
                );

        add(
                back,
                -1,
                dp(58),
                dp(160),
                0,
                dp(160),
                0
        );

        back.setOnClickListener(
                v -> showHome()
        );
    }


    private void showMegathemes() {
        screen = "megathemes";
        baseScreen();

        addTitle("Choix du mégathème", 31, Color.WHITE);
        gap(8);

        root.addView(domainRow(
                domainButton("Animaux et Plantes", ANIMALS_GREEN, Color.WHITE, "Animaux et Plantes"),
                domainButton("Culture Classique", CLASSIC_BLUE, Color.WHITE, "Culture Classique")));

        root.addView(domainRow(
                domainButton("Culture Générale", GENERAL_GREEN, Color.BLACK, "Culture Générale"),
                domainButton("Culture Moderne", MODERN_ORANGE, Color.BLACK, "Culture Moderne")));

        root.addView(domainRow(
                domainButton("Géographie", GEO_BLUE, Color.BLACK, "Géographie"),
                domainButton("Histoire", HISTORY_BROWN, Color.WHITE, "Histoire")));

        root.addView(domainRow(
                domainButton("Sciences et Techniques", SCIENCE_YELLOW, Color.BLACK, "Sciences et Techniques"),
                domainButton("Sport", SPORT_RED, Color.WHITE, "Sport")));

        Button all = domainButton("Toutes les questions", Color.BLACK, Color.WHITE, "");
        all.setBackground(roundedStroke(Color.BLACK, 14, Color.WHITE, 1));
        add(all, -1, dp(78), 0, dp(5), 0, dp(8));

        Button back = button("Retour", GREY, 18);
        add(back, -1, dp(54), 0, 0, 0, 0);
        back.setOnClickListener(v -> showHome());
    }

    private LinearLayout domainRow(Button left, Button right) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);

        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(0, dp(76), 1f);
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(0, dp(76), 1f);
        lp1.setMargins(0, dp(5), dp(5), dp(5));
        lp2.setMargins(dp(5), dp(5), 0, dp(5));
        row.addView(left, lp1);
        row.addView(right, lp2);
        return row;
    }

    private Button domainButton(String label, int bg, int fg, String domain) {
        Button b = button(label, bg, 21);
        b.setTextColor(fg);
        b.setBackground(roundedStroke(bg, 14, Color.WHITE, 1));
        b.setOnClickListener(v -> {
            selectedDomain = domain;
            startEndlessPlay();
        });
        return b;
    }

    private void showSizeSelection() {
        startEndlessPlay();
    }

    private void startEndlessPlay() {

        showLoading("Préparation des questions…");
        final String domain = selectedDomain;

        io.submit(() -> {
            try {
                String token = auth.tokenSync();

                flags.flushOutboxSync(
                        firestore,
                        token,
                        auth.uid()
                );

                if (flags.pendingHistoryCount() > 0) {
                    throw new Exception(
                            "Certaines réponses attendent encore leur synchronisation."
                    );
                }

                CgSmartBatch batch =
                        smart.batchSync(
                                token,
                                domain,
                                new ArrayList<>(),
                                ENDLESS_BATCH_SIZE
                        );

                if (batch.ids.isEmpty()) {
                    game.clear();
                    main.post(this::showEnd);
                    return;
                }

                String streamId =
                        "endless_" + System.currentTimeMillis();

                game.start(
                        streamId,
                        Integer.MAX_VALUE,
                        domain,
                        "active",
                        batch.ids
                );

                nextBatchPrefetching = false;
                preloadQuestionIds(
                        batch.ids,
                        QUESTION_PREFETCH_AHEAD
                );
                main.post(this::loadNextPlayable);

            } catch (Exception ex) {
                main.post(() ->
                        showFatal(
                                "Démarrage impossible",
                                friendlyNetworkMessage(ex)
                        )
                );
            }
        });
    }

    private void loadNextPlayable() {

        if (!game.hasActive()) {
            showHome();
            return;
        }

        if (game.position() >= game.batchIds().size()) {

            if (game.promoteStagedBatch()) {
                nextBatchPrefetching = false;
                preloadUpcomingQuestions();
                loadNextPlayable();
                return;
            }

            showLoading(
                    "Préparation des prochaines questions…"
            );
            requestNextBatch();
            return;
        }

        maybePrefetchNextBatch();

        final String id =
                game.batchIds().get(game.position());

        CgQuestion cached;
        synchronized (questionCache) {
            cached = questionCache.remove(id);
        }

        if (cached != null) {
            if (flags.isTExcluded(cached)) {
                game.advanceFiltered();
                loadNextPlayable();
                return;
            }
            current = cached;
            showQuestion(cached);
            return;
        }

        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                CgQuestion q =
                        firestore.getQuestionSync(
                                token,
                                auth.uid(),
                                id
                        );

                if (flags.isTExcluded(q)) {
                    game.advanceFiltered();
                    main.post(this::loadNextPlayable);
                    return;
                }

                current = q;
                main.post(() -> showQuestion(q));

            } catch (Exception ex) {
                game.advanceFiltered();
                main.post(this::loadNextPlayable);
            }
        });
    }

    private void requestNextBatch() {

        if (nextBatchPrefetching) return;
        nextBatchPrefetching = true;

        ArrayList<String> currentIds = game.batchIds();

        int position =
                Math.max(
                        0,
                        Math.min(
                                game.position(),
                                currentIds.size()
                        )
                );

        ArrayList<String> pendingIds = new ArrayList<>();
        for (int i = position; i < currentIds.size(); i++) {
            pendingIds.add(currentIds.get(i));
        }

        final String domain = selectedDomain;

        io.submit(() -> {
            try {
                String token = auth.tokenSync();

                flags.flushOutboxSync(
                        firestore,
                        token,
                        auth.uid()
                );

                if (flags.pendingHistoryCount() > 0) {
                    throw new Exception(
                            "Synchronisation des réponses en attente."
                    );
                }

                CgSmartBatch next =
                        smart.batchSync(
                                token,
                                domain,
                                pendingIds,
                                ENDLESS_BATCH_SIZE
                        );

                if (next.ids.isEmpty()) {
                    nextBatchPrefetching = false;

                    main.post(() -> {
                        if (
                                game.position()
                                        < game.batchIds().size()
                        ) {
                            return;
                        }

                        if ("complete".equals(next.status)) {
                            showEnd();
                            return;
                        }

                        showLoading(
                                "Préparation des prochaines questions…"
                        );

                        main.postDelayed(
                                this::requestNextBatch,
                                650L
                        );
                    });

                    return;
                }

                game.stageBatch(
                        "active",
                        next.ids
                );

                preloadQuestionIds(
                        next.ids,
                        QUESTION_PREFETCH_AHEAD
                );

                nextBatchPrefetching = false;

                main.post(() -> {
                    if (
                            game.position()
                                    >= game.batchIds().size()
                    ) {
                        if (game.promoteStagedBatch()) {
                            loadNextPlayable();
                        }
                    }
                });

            } catch (Exception ex) {
                nextBatchPrefetching = false;

                main.post(() -> {
                    if (
                            game.position()
                                    >= game.batchIds().size()
                    ) {
                        showFatal(
                                "Connexion interrompue",
                                friendlyNetworkMessage(ex)
                        );
                    }
                });
            }
        });
    }

    private void maybePrefetchNextBatch() {
        if (!game.hasActive()) return;
        if (game.hasStagedBatch()) return;
        if (nextBatchPrefetching) return;

        int pos = game.position();
        int size = game.batchIds().size();

        if (size < 40) return;

        int threshold =
                Math.min(
                        NEXT_BATCH_PREFETCH_AT,
                        Math.max(20, size - 20)
                );

        if (pos >= threshold) {
            requestNextBatch();
        }
    }

    private void addStatsBanner() {
        LinearLayout band = new LinearLayout(this);
        band.setOrientation(LinearLayout.HORIZONTAL);
        band.setGravity(Gravity.CENTER);
        band.setPadding(dp(5), dp(5), dp(5), dp(5));
        band.setBackground(
                roundedStroke(
                        Color.rgb(16, 16, 16),
                        14,
                        Color.WHITE,
                        1
                )
        );

        int played = game.played();
        int good = game.correct();
        int errors = Math.max(0, played - good);
        double scorePct =
                played <= 0
                        ? 0.0
                        : (good * 100.0) / played;

        band.addView(
                statCell(
                        "Mégathème",
                        selectedDomain.isEmpty()
                                ? "Toutes"
                                : selectedDomain
                ),
                statLp(1.35f)
        );

        band.addView(
                statCell(
                        "Question",
                        String.valueOf(played + 1)
                ),
                statLp(.8f)
        );

        band.addView(
                statCell(
                        "Score",
                        String.format(
                                Locale.FRANCE,
                                "%.2f %%",
                                scorePct
                        )
                ),
                statLp(.9f)
        );

        band.addView(
                statCell(
                        "Bonnes réponses",
                        String.valueOf(good)
                ),
                statLp(1.15f)
        );

        band.addView(
                statCell(
                        "Erreurs",
                        String.valueOf(errors)
                ),
                statLp(.9f)
        );

        add(band, -1, dp(70), 0, 0, 0, dp(8));
    }

    private LinearLayout.LayoutParams statLp(float weight) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, weight);
        lp.setMargins(dp(3), 0, dp(3), 0);
        return lp;
    }

    private View statCell(String label, String value) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(5), dp(4), dp(5), dp(4));

        TextView l = text(label, 11, LIGHT_GREY, Gravity.CENTER);
        TextView v = text(value, 16, Color.WHITE, Gravity.CENTER);
        box.addView(l, new LinearLayout.LayoutParams(-1, 0, .42f));
        box.addView(v, new LinearLayout.LayoutParams(-1, 0, .58f));
        return box;
    }

    private void showQuestion(CgQuestion q) {
        screen = "question";
        answering = false;
        answerButtons.clear();
        currentShownAtMs = System.currentTimeMillis();
        baseScreen();

        addStatsBanner();

        // CGANDROID002 FIX2 · BANNER_FONT_UNIFY001
        TextView theme = cardText(
                q.theme.isEmpty() ? safe(q.megatheme) : q.theme,
                23, GREEN, Color.WHITE);
        theme.setGravity(Gravity.CENTER);
        theme.setMinHeight(dp(48));
        add(theme, -1, -2, 0, 0, 0, dp(7));

        TextView question = cardText(q.question, 23, YELLOW, Color.BLACK);
        question.setGravity(Gravity.CENTER);
        question.setMinHeight(dp(70));
        add(question, -1, -2, 0, 0, 0, dp(7));

        if (!q.detail.isEmpty()) {
            TextView detail = cardText(q.detail, 23, RED, Color.WHITE);
            detail.setGravity(Gravity.CENTER);
            detail.setMinHeight(dp(54));
            add(detail, -1, -2, 0, 0, 0, dp(8));
        }

        FrameLayout imageArea = new FrameLayout(this);
        imageArea.setVisibility(View.GONE);
        imageArea.setBackground(roundedStroke(DARK, 14, Color.WHITE, 1));
        add(imageArea, -1, dp(270), dp(90), 0, dp(90), dp(8));
        if (q.hasImage()) loadImageAsync(q, imageArea);

        preloadUpcomingImages();
        addFlexSpacer();

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.CENTER);

        Button p = microButton("P");
        Button t = microButton("T");
        Button menu = button("Menu", RED, 18);
        // CGANDROID003 · REVEAL_ANSWER001
        Button proposals = button("Révéler", GREEN, 18);

        footer.addView(p, footerMicroLp());
        footer.addView(t, footerMicroLp());
        footer.addView(menu, footerLp(1.15f));
        footer.addView(proposals, footerLp(1.45f));
        root.addView(footer, footerBarLp());

        p.setOnClickListener(v -> reportProblem(q, p));
        t.setOnClickListener(v -> confirmAnalogExclusion(q));
        menu.setOnClickListener(v -> showHome());
        proposals.setOnClickListener(v -> showAnswers(q));
    }

    /*
     * CGANDROID003
     *
     * SELF_ASSESSMENT_QR001
     * QCM_UI_RETIRE001
     * REVEAL_ANSWER001
     * BINARY_SELF_EVAL001
     *
     * Les quatre propositions restent présentes dans les données
     * historiques mais ne sont plus affichées.
     *
     * La bonne réponse est extraite de :
     * q.options[q.correctIndex - 1]
     */
    private void showAnswers(CgQuestion q) {

        screen = "answers";
        answering = false;
        answerButtons.clear();
        baseScreen();

        addStatsBanner();


        String correctAnswer = "";

        if (
                q != null &&
                q.correctIndex >= 1 &&
                q.correctIndex <= 4
        ) {

            correctAnswer =
                    q.options[
                            q.correctIndex - 1
                    ];
        }


        if (
                correctAnswer == null ||
                correctAnswer.trim().isEmpty()
        ) {

            correctAnswer =
                    "Réponse indisponible";
        }


        /*
         * Zone occupant tout l'espace disponible.
         * Son contenu est centré horizontalement ET verticalement.
         */
        LinearLayout center =
                new LinearLayout(this);

        center.setOrientation(
                LinearLayout.VERTICAL
        );

        center.setGravity(
                Gravity.CENTER
        );

        center.setPadding(
                dp(60),
                dp(28),
                dp(60),
                dp(28)
        );


        LinearLayout.LayoutParams centerLp =
                new LinearLayout.LayoutParams(
                        -1,
                        0,
                        1f
                );

        root.addView(
                center,
                centerLp
        );


        TextView answerLabel =
                text(
                        "Réponse",
                        18,
                        LIGHT_GREY,
                        Gravity.CENTER
                );

        center.addView(
                answerLabel,
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                )
        );


        TextView answer =
                text(
                        correctAnswer,
                        34,
                        Color.WHITE,
                        Gravity.CENTER
                );

        answer.setTypeface(
                appFont,
                Typeface.BOLD
        );

        answer.setPadding(
                dp(18),
                dp(22),
                dp(18),
                dp(30)
        );


        LinearLayout.LayoutParams answerLp =
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                );

        answerLp.setMargins(
                0,
                dp(8),
                0,
                dp(26)
        );

        center.addView(
                answer,
                answerLp
        );


        /*
         * Les DEUX seules commandes de validation
         * visibles sur l'écran de réponse.
         */
        LinearLayout evaluationRow =
                new LinearLayout(this);

        evaluationRow.setOrientation(
                LinearLayout.HORIZONTAL
        );

        evaluationRow.setGravity(
                Gravity.CENTER
        );


        Button success =
                button(
                        "✓ J’avais bon",
                        GREEN,
                        22
                );

        Button failure =
                button(
                        "✕ J’avais faux",
                        RED,
                        22
                );


        success.setTextColor(
                Color.WHITE
        );

        failure.setTextColor(
                Color.WHITE
        );


        success.setBackground(
                roundedStroke(
                        GREEN,
                        16,
                        Color.WHITE,
                        1
                )
        );

        failure.setBackground(
                roundedStroke(
                        RED,
                        16,
                        Color.WHITE,
                        1
                )
        );


        LinearLayout.LayoutParams successLp =
                new LinearLayout.LayoutParams(
                        0,
                        dp(86),
                        1f
                );

        successLp.setMargins(
                0,
                0,
                dp(10),
                0
        );


        LinearLayout.LayoutParams failureLp =
                new LinearLayout.LayoutParams(
                        0,
                        dp(86),
                        1f
                );

        failureLp.setMargins(
                dp(10),
                0,
                0,
                0
        );


        evaluationRow.addView(
                success,
                successLp
        );

        evaluationRow.addView(
                failure,
                failureLp
        );


        LinearLayout.LayoutParams rowLp =
                new LinearLayout.LayoutParams(
                        -1,
                        -2
                );

        rowLp.setMargins(
                dp(50),
                0,
                dp(50),
                0
        );

        center.addView(
                evaluationRow,
                rowLp
        );


        /*
         * Vert :
         * la réponse mentalement formulée était correcte.
         *
         * On transmet l'index réellement correct afin de
         * conserver la compatibilité du moteur historique.
         */
        success.setOnClickListener(v -> {

            if (answering) {
                return;
            }

            success.setEnabled(false);
            failure.setEnabled(false);

            answer(
                    q,
                    q.correctIndex
            );
        });


        /*
         * Rouge :
         * la réponse mentalement formulée était incorrecte.
         *
         * choice = 0 est le nouveau marqueur interne
         * "aucune proposition QCM sélectionnée".
         */
        failure.setOnClickListener(v -> {

            if (answering) {
                return;
            }

            success.setEnabled(false);
            failure.setEnabled(false);

            answer(
                    q,
                    0
            );
        });
    }

    private LinearLayout.LayoutParams footerLp(float weight) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, weight);
        lp.setMargins(dp(4), 0, dp(4), 0);
        return lp;
    }

    private LinearLayout.LayoutParams footerMicroLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(58), -1);
        lp.setMargins(dp(4), 0, dp(4), 0);
        return lp;
    }

    private LinearLayout.LayoutParams footerBarLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(58));
        lp.setMargins(0, dp(4), 0, 0);
        return lp;
    }

    private void addFlexSpacer() {
        View spacer = new View(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));
    }

    private void loadImageAsync(CgQuestion q, FrameLayout area) {
        area.setVisibility(View.VISIBLE);

        Bitmap cached = imageCache.get(q.imageFile);
        if (cached != null) {
            area.removeAllViews();
            ImageView iv = new ImageView(this);
            iv.setImageBitmap(cached);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            iv.setBackgroundColor(Color.BLACK);
            area.addView(iv, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
            return;
        }

        TextView loading = text("Chargement de l’image…", 15, LIGHT_GREY, Gravity.CENTER);
        area.removeAllViews();
        area.addView(loading, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));

        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                Bitmap bitmap = firestore.loadImageSync(token, q.imageFile);
                imageCache.put(q.imageFile, bitmap);
                main.post(() -> {
                    if (current != q || !"question".equals(screen)) return;
                    area.removeAllViews();
                    ImageView iv = new ImageView(this);
                    iv.setImageBitmap(bitmap);
                    iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
                    iv.setBackgroundColor(Color.BLACK);
                    area.addView(iv, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
                });
            } catch (Exception ex) {
                main.post(() -> {
                    if (current != q || !"question".equals(screen)) return;
                    area.removeAllViews();
                    TextView missing = text("Image indisponible", 14, LIGHT_GREY, Gravity.CENTER);
                    area.addView(missing, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
                });
            }
        });
    }

    private void preloadUpcomingImages() {
        preloadUpcomingQuestions();
    }

    private void preloadUpcomingQuestions() {
        if (!game.hasActive()) return;

        ArrayList<String> ids = game.batchIds();
        int from = Math.min(ids.size(), game.position() + 1);
        int to = Math.min(ids.size(), from + QUESTION_PREFETCH_AHEAD);

        if (from >= to) return;
        preloadQuestionIds(new ArrayList<>(ids.subList(from, to)), QUESTION_PREFETCH_AHEAD);
    }

    private void preloadQuestionIds(List<String> ids, int limit) {
        if (ids == null || ids.isEmpty()) return;

        int max = Math.min(ids.size(), Math.max(1, limit));
        for (int i = 0; i < max; i++) {
            final String id = ids.get(i);
            if (id == null || id.isEmpty()) continue;

            synchronized (questionCache) {
                if (questionCache.containsKey(id)) continue;
            }
            synchronized (questionPreloadInFlight) {
                if (!questionPreloadInFlight.add(id)) continue;
            }

            io.submit(() -> {
                try {
                    String token = auth.tokenSync();
                    CgQuestion q = firestore.getQuestionSync(token, auth.uid(), id);

                    synchronized (questionCache) {
                        questionCache.put(id, q);
                    }

                    if (q.hasImage()) {
                        synchronized (imagePreloadInFlight) {
                            if (!imageCache.containsKey(q.imageFile)
                                    && imagePreloadInFlight.add(q.imageFile)) {
                                try {
                                    Bitmap bitmap = firestore.loadImageSync(token, q.imageFile);
                                    if (bitmap != null) imageCache.put(q.imageFile, bitmap);
                                } catch (Exception ignored) {
                                } finally {
                                    imagePreloadInFlight.remove(q.imageFile);
                                }
                            }
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    synchronized (questionPreloadInFlight) {
                        questionPreloadInFlight.remove(id);
                    }
                }
            });
        }
    }

    private void answer(CgQuestion q, int choice) {
        if (answering) return;
        answering = true;

        for (Button b : answerButtons) b.setEnabled(false);

        boolean correct = choice == q.correctIndex;

        for (int i = 0; i < answerButtons.size(); i++) {
            Button b = answerButtons.get(i);
            int idx = i + 1;
            if (idx == q.correctIndex) {
                b.setBackground(roundedStroke(GREEN, 14, Color.WHITE, 1));
            } else if (idx == choice) {
                b.setBackground(roundedStroke(RED, 14, Color.WHITE, 1));
            } else {
                b.setBackground(roundedStroke(DARK, 14, Color.WHITE, 1));
            }
        }

        long responseMs =
                Math.max(
                        0L,
                        System.currentTimeMillis() - currentShownAtMs
                );

        JSONObject event =
                historyPayload(q, choice, correct, responseMs);

        game.recordAnswer(correct);

        flags.enqueue("play_history", event);
        flushOutboxAsync();

        main.postDelayed(this::loadNextPlayable, 500L);
    }

    private JSONObject historyPayload(CgQuestion q, int choice, boolean correct, long responseMs) {
        JSONObject x = new JSONObject();
        try {
            x.put("question_id", q.id);
            try { x.put("question_row_number", Long.parseLong(q.id)); } catch (Exception ignored) { }
            x.put("client_played_at_ms", System.currentTimeMillis());
            x.put("play_type", "challenge_mental");
            x.put("game_mode", "qr");
            x.put("result", correct ? "correct" : "wrong");
            x.put("is_correct", correct);
            x.put("response_time_ms", responseMs);
            x.put("domain", q.megatheme);
            x.put("theme", q.theme);
            // CGANDROID_HISTORY_SNAPSHOT_TRUTH001
            x.put("selected_index", choice);
            x.put("correct_index", q.correctIndex);

            // CGANDROID003 · SELF_ASSESSMENT_HISTORY001
            //
            // choice == 0 signifie :
            // "J'avais faux", sans fabriquer une fausse proposition
            // A/B/C/D que l'utilisateur n'a jamais sélectionnée.
            x.put(
                    "selected_answer",
                    choice >= 1 && choice <= 4
                            ? q.options[choice - 1]
                            : ""
            );

            x.put(
                    "correct_answer",
                    q.options[
                            Math.max(
                                    0,
                                    Math.min(
                                            3,
                                            q.correctIndex - 1
                                    )
                            )
                    ]
            );

            x.put(
                    "interaction_mode",
                    "endless_self_assessment_qr"
            );
            x.put("source", BuildConfig.CG_CHANNEL);
            x.put("session_id", game.sessionId());

            JSONObject snap = new JSONObject();
            snap.put("question_id", q.id);
            snap.put("domain", q.megatheme);
            snap.put("theme", q.theme);
            snap.put("question", q.question);
            snap.put("detail", q.detail);
            snap.put("proposition_a", q.options[0]);
            snap.put("proposition_b", q.options[1]);
            snap.put("proposition_c", q.options[2]);
            snap.put("proposition_d", q.options[3]);
            snap.put("correct_index", q.correctIndex);
            snap.put("image_file", q.imageFile);
            x.put("question_snapshot", snap);
        } catch (Exception ignored) { }
        return x;
    }

    private void reportProblem(CgQuestion q, Button button) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("question_id", q.id);
            payload.put("megatheme", q.megatheme);
            payload.put("theme", q.theme);
            payload.put("question", q.question);
            payload.put("detail", q.detail);
            payload.put("note", "");
            payload.put("session_id", game.sessionId());
            payload.put("created_ms", System.currentTimeMillis());
            payload.put("state", "pending");
            payload.put("source", BuildConfig.CG_CHANNEL);
        } catch (Exception ignored) { }

        flags.enqueue("problem_reports", payload);
        button.setEnabled(false);
        game.skipCurrent();
        flushOutboxAsync();
        loadNextPlayable();
    }

    private void confirmAnalogExclusion(CgQuestion q) {
        flags.addT(q);

        JSONObject payload = new JSONObject();
        try {
            payload.put("question_id", q.id);
            payload.put("theme", q.theme);
            payload.put("question", q.question);
            payload.put("theme_key", CgFlags.comparisonKey(q.theme));
            payload.put("question_key", CgFlags.comparisonKey(q.question));
            payload.put("group_key", CgFlags.analogKey(q.theme, q.question));
            payload.put("session_id", game.sessionId());
            payload.put("created_ms", System.currentTimeMillis());
            payload.put("state", "pending");
            payload.put("source", BuildConfig.CG_CHANNEL);
        } catch (Exception ignored) { }

        flags.enqueue("analog_exclusions", payload);
        game.skipCurrent();
        flushOutboxAsync();
        loadNextPlayable();
    }

    private void flushOutboxAsync() {
        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                flags.flushOutboxSync(firestore, token, auth.uid());
            } catch (Exception ignored) { }
        });
    }

    private void showEnd() {
        screen = "end";
        game.finish();
        baseScreen();
        gap(30);

        addTitle("Parcours terminé", 32, Color.WHITE);
        gap(18);

        String domainLabel =
                selectedDomain.isEmpty()
                        ? "tous les mégathèmes"
                        : selectedDomain;

        TextView message =
                cardText(
                        "Toutes les questions actuellement à proposer "
                                + "pour "
                                + domainLabel
                                + " ont été réussies.\n\n"
                                + game.correct()
                                + " bonne(s) réponse(s) sur "
                                + game.played()
                                + " passage(s) dans ce parcours.",
                        22,
                        DARK,
                        Color.WHITE
                );

        message.setGravity(Gravity.CENTER);
        add(message, -1, -2, dp(70), 0, dp(70), dp(22));

        Button home = button("Accueil", BLUE, 22);
        add(home, -1, dp(62), dp(120), 0, dp(120), 0);
        home.setOnClickListener(v -> {
            game.clear();
            showHome();
        });
    }

    private void showLoading(String message) {
        screen = "loading";
        baseScreen();
        gap(70);
        TextView v = cardText(message, 22, DARK, Color.WHITE);
        v.setGravity(Gravity.CENTER);
        add(v, -1, dp(110), dp(100), 0, dp(100), 0);
    }

    private void showFatal(String title, String message) {
        screen = "fatal";
        baseScreen();
        addTitle(title, 28, Color.WHITE);
        TextView err = cardText(
                message == null ? "Erreur inconnue" : message,
                18, RED, Color.WHITE);
        err.setGravity(Gravity.CENTER);
        add(err, -1, -2, dp(30), dp(20), dp(30), dp(20));

        Button back = button("Retour", BLUE, 20);
        add(back, -1, dp(56), dp(100), 0, dp(100), 0);
        back.setOnClickListener(v -> showHome());
    }

    private String friendlyNetworkMessage(Exception ex) {
        String message =
                ex == null || ex.getMessage() == null
                        ? ""
                        : ex.getMessage().trim();

        String lower =
                message.toLowerCase(Locale.ROOT);

        if (
                lower.contains("timeout") ||
                lower.contains("timed out")
        ) {
            return "Le serveur met trop de temps à répondre. "
                    + "Une nouvelle tentative automatique a déjà été effectuée.";
        }

        return message.isEmpty()
                ? "Erreur réseau inconnue."
                : message;
    }


    private void baseScreen() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.BLACK);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(10), dp(14), dp(12));
        root.setBackgroundColor(Color.BLACK);

        scroll.addView(root, new ScrollView.LayoutParams(-1, -1));
        setContentView(scroll);
    }

    private void addTitle(String value, int sp, int color) {
        TextView t = text(value, sp, color, Gravity.CENTER);
        t.setTypeface(appFont, Typeface.BOLD);
        add(t, -1, -2, 0, 0, 0, dp(4));
    }

    private void addSub(String value, int sp, int color) {
        TextView t = text(value, sp, color, Gravity.CENTER);
        add(t, -1, -2, 0, 0, 0, dp(6));
    }

    private TextView text(String value, int sp, int color, int gravity) {
        TextView v = new TextView(this);
        v.setText(value == null ? "" : value);
        v.setTextSize(sp);
        v.setTextColor(color);
        v.setGravity(gravity);
        v.setTypeface(appFont);
        v.setIncludeFontPadding(false);
        v.setSingleLine(false);
        v.setHorizontallyScrolling(false);
        return v;
    }

    private TextView cardText(String value, int sp, int bg, int fg) {
        TextView v = text(value, sp, fg, Gravity.CENTER_VERTICAL);
        v.setPadding(dp(16), dp(10), dp(16), dp(10));
        v.setBackground(rounded(bg, 14));
        return v;
    }

    private EditText edit(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(LIGHT_GREY);
        e.setTextColor(Color.WHITE);
        e.setTextSize(17);
        e.setTypeface(appFont);
        e.setInputType(inputType);
        e.setPadding(dp(14), dp(8), dp(14), dp(8));
        e.setBackground(rounded(DARK, 14));
        return e;
    }

    private Button button(String label, int color, int sp) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(sp);
        b.setTypeface(appFont);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(10), dp(8), dp(10), dp(8));
        b.setBackground(rounded(color, 14));
        return b;
    }

    private Button microButton(String label) {
        Button b = button(label, DARK, 15);
        b.setTextColor(Color.WHITE);
        b.setPadding(0, 0, 0, 0);
        b.setBackground(roundedStroke(DARK, 12, Color.WHITE, 1));
        return b;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private GradientDrawable roundedStroke(int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable g = rounded(color, radiusDp);
        g.setStroke(dp(strokeDp), strokeColor);
        return g;
    }

    private void add(View v, int w, int h, int ml, int mt, int mr, int mb) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(w, h);
        lp.setMargins(ml, mt, mr, mb);
        root.addView(v, lp);
    }

    private void gap(int px) {
        View v = new View(this);
        root.addView(v, new LinearLayout.LayoutParams(1, dp(px)));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void status(String message, int color) {
        if (statusView != null) {
            statusView.setText(message);
            statusView.setTextColor(color);
        } else {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        }
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }
}

/* ========================================================================== */
/* Réseau / Auth / API                                                        */
/* ========================================================================== */

final class CgHttp {
    private CgHttp() { }

    static JSONObject json(String method, String url, String token, JSONObject body) throws Exception {
        HttpURLConnection c = open(method, url, token, "Bearer ");
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        String text = readText(code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream());
        c.disconnect();
        if (code < 200 || code >= 300) throw new Exception(errorMessage(code, text));
        return text == null || text.trim().isEmpty() ? new JSONObject() : new JSONObject(text);
    }

    static JSONObject form(String url, Map<String,String> fields) throws Exception {
        HttpURLConnection c = open("POST", url, null, "Bearer ");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        StringBuilder body = new StringBuilder();
        for (Map.Entry<String,String> e : fields.entrySet()) {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(e.getKey(), "UTF-8"));
            body.append('=');
            body.append(URLEncoder.encode(e.getValue(), "UTF-8"));
        }
        try (OutputStream os = c.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int code = c.getResponseCode();
        String text = readText(code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream());
        c.disconnect();
        if (code < 200 || code >= 300) throw new Exception(errorMessage(code, text));
        return new JSONObject(text);
    }

    static byte[] bytes(String url, String token, boolean firebaseStorage) throws Exception {
        HttpURLConnection c = open("GET", url, null, "Bearer ");
        if (token != null && !token.isEmpty()) {
            c.setRequestProperty("Authorization", (firebaseStorage ? "Firebase " : "Bearer ") + token);
        }
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) {
            String text = readText(c.getErrorStream());
            c.disconnect();
            throw new Exception(errorMessage(code, text));
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
        }
        c.disconnect();
        return out.toByteArray();
    }

    private static HttpURLConnection open(String method, String url, String token, String authPrefix) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        // CGANDROID007 · COLD_START_GUARD001
        c.setConnectTimeout(25000);
        c.setReadTimeout(90000);
        c.setUseCaches(false);
        if (token != null && !token.isEmpty()) c.setRequestProperty("Authorization", authPrefix + token);
        return c;
    }

    private static String readText(InputStream in) throws Exception {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private static String errorMessage(int code, String text) {
        try {
            JSONObject x = new JSONObject(text == null ? "{}" : text);
            JSONObject err = x.optJSONObject("error");
            if (err != null) {
                String msg = err.optString("message", "");
                if (!msg.isEmpty()) return "HTTP " + code + " · " + msg;
            }
            String msg = x.optString("error", "");
            if (!msg.isEmpty()) return "HTTP " + code + " · " + msg;
        } catch (Exception ignored) { }
        return "HTTP " + code + (text == null || text.trim().isEmpty() ? "" : " · " + text.trim());
    }
}

final class CgAuth {
    private static final String PREF = "cgandroid001_auth";
    private static final String K_TOKEN = "id_token";
    private static final String K_REFRESH = "refresh_token";
    private static final String K_UID = "uid";
    private static final String K_EXPIRES = "expires_at";
    private static final String K_EMAIL = "email";

    private final SharedPreferences prefs;

    CgAuth(Context context) {
        prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    boolean hasRefreshToken() { return !prefs.getString(K_REFRESH, "").isEmpty(); }
    String uid() { return prefs.getString(K_UID, ""); }

    void signInSync(String email, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email);
        body.put("password", password);
        body.put("returnSecureToken", true);
        JSONObject r = CgHttp.json(
                "POST",
                "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + BuildConfig.FIREBASE_API_KEY,
                null,
                body);
        save(r.optString("idToken"), r.optString("refreshToken"), r.optString("localId"),
                parseLong(r.optString("expiresIn"), 3600L), email);
        if (uid().isEmpty()) throw new Exception("UID Firebase absent après connexion.");
    }

    synchronized String tokenSync() throws Exception {
        String token = prefs.getString(K_TOKEN, "");
        long expires = prefs.getLong(K_EXPIRES, 0L);
        if (!token.isEmpty() && System.currentTimeMillis() < expires - 60000L) return token;

        String refresh = prefs.getString(K_REFRESH, "");
        if (refresh.isEmpty()) throw new Exception("Session Firebase expirée : reconnecte-toi.");

        Map<String,String> form = new HashMap<>();
        form.put("grant_type", "refresh_token");
        form.put("refresh_token", refresh);
        JSONObject r = CgHttp.form(
                "https://securetoken.googleapis.com/v1/token?key=" + BuildConfig.FIREBASE_API_KEY,
                form);
        String newToken = r.optString("id_token");
        String newRefresh = r.optString("refresh_token", refresh);
        String newUid = r.optString("user_id", uid());
        long seconds = parseLong(r.optString("expires_in"), 3600L);
        save(newToken, newRefresh, newUid, seconds, prefs.getString(K_EMAIL, ""));
        return newToken;
    }

    void clear() { prefs.edit().clear().apply(); }

    private void save(String token, String refresh, String uid, long expiresSeconds, String email) {
        prefs.edit()
                .putString(K_TOKEN, token == null ? "" : token)
                .putString(K_REFRESH, refresh == null ? "" : refresh)
                .putString(K_UID, uid == null ? "" : uid)
                .putString(K_EMAIL, email == null ? "" : email)
                .putLong(K_EXPIRES, System.currentTimeMillis() + Math.max(60L, expiresSeconds) * 1000L)
                .apply();
    }

    private static long parseLong(String value, long fallback) {
        try { return Long.parseLong(value); } catch (Exception ignored) { return fallback; }
    }
}

final class CgSmartClient {

    // CGANDROID005 · HARD_LEARNING_RESET001
    JSONObject hardResetLearningSync(
            String token
    ) throws Exception {

        JSONObject body =
                new JSONObject();

        body.put(
                "cgweb035",
                true
        );

        body.put(
                "mode",
                "hardResetLearning"
        );


        JSONObject response =
                CgHttp.json(
                        "POST",
                        BuildConfig.SMART_API_URL,
                        token,
                        body
                );


        if (
                !response.optBoolean(
                        "ok",
                        false
                )
        ) {

            throw new Exception(
                    response.optString(
                            "error",
                            "Réinitialisation refusée."
                    )
            );
        }


        return response;
    }


    CgSmartBatch batchSync(
            String token,
            String domain,
            List<String> excludeIds,
            int batchSize
    ) throws Exception {

        JSONObject body = new JSONObject();
        body.put("cgweb035", true);
        body.put("mode", "learningBatch");
        body.put("batchSize", Math.max(1, Math.min(100, batchSize)));
        body.put("domain", domain == null ? "" : domain);
        body.put("forceRefresh", true);

        JSONArray excluded = new JSONArray();
        if (excludeIds != null) {
            for (String id : excludeIds) {
                if (id != null && !id.trim().isEmpty()) {
                    excluded.put(id.trim());
                }
            }
        }
        body.put("excludeIds", excluded);

        Exception last = null;

        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                JSONObject response =
                        CgHttp.json(
                                "POST",
                                BuildConfig.SMART_API_URL,
                                token,
                                body
                        );
                return parseBatch(response);
            } catch (Exception ex) {
                last = ex;
                if (attempt == 0 && isTransientNetworkError(ex)) {
                    try {
                        Thread.sleep(900L);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw ex;
                    }
                    continue;
                }
                throw ex;
            }
        }

        throw last == null
                ? new Exception("Réponse serveur indisponible.")
                : last;
    }

    private static boolean isTransientNetworkError(Exception ex) {
        String message =
                ex == null || ex.getMessage() == null
                        ? ""
                        : ex.getMessage().toLowerCase(Locale.ROOT);

        return (
                message.contains("timeout") ||
                message.contains("timed out") ||
                message.contains("http 429") ||
                message.contains("http 500") ||
                message.contains("http 502") ||
                message.contains("http 503") ||
                message.contains("http 504")
        );
    }

    private CgSmartBatch parseBatch(JSONObject response) throws Exception {
        if (!response.optBoolean("ok", false)) {
            throw new Exception(
                    response.optString(
                            "error",
                            "Réponse d’apprentissage invalide."
                    )
            );
        }

        JSONObject batch = response.optJSONObject("batch");
        if (batch == null) throw new Exception("Objet batch absent.");

        CgSmartBatch out = new CgSmartBatch();
        out.status = batch.optString("status", "active");
        out.learningRound = batch.optInt("learningRound", 0);

        JSONArray rows = batch.optJSONArray("rows");
        if (rows != null) {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject q = rows.optJSONObject(i);
                if (q == null) continue;

                String id = q.optString("id", "");
                if (id.isEmpty()) id = q.optString("questionId", "");
                if (id.isEmpty()) {
                    long row = q.optLong("row", 0L);
                    if (row > 0L) id = String.valueOf(row);
                }

                if (!id.isEmpty() && !out.ids.contains(id)) {
                    out.ids.add(id);
                }
            }
        }

        return out;
    }


    CgSmartSession startSync(String token, int count, String domain) throws Exception {
        JSONObject body = new JSONObject();
        body.put("cgweb035", true);
        body.put("mode", "smartLongStart");
        body.put("count", count);
        body.put("batchSize", 100);
        body.put("duePct", 40);
        body.put("weakPct", 35);
        body.put("unseenPct", 25);
        body.put("domain", domain == null ? "" : domain);
        body.put("forceRefresh", true);
        return parse(CgHttp.json("POST", BuildConfig.SMART_API_URL, token, body));
    }

    CgSmartSession nextSync(String token, String sessionId) throws Exception {
        JSONObject body = new JSONObject();
        body.put("cgweb035", true);
        body.put("mode", "smartLongNext");
        body.put("sessionId", sessionId);
        body.put("forceRefresh", true);
        return parse(CgHttp.json("POST", BuildConfig.SMART_API_URL, token, body));
    }

    private CgSmartSession parse(JSONObject response) throws Exception {
        if (!response.optBoolean("ok", false)) throw new Exception(response.optString("error", "Réponse SMART invalide."));
        JSONObject s = response.optJSONObject("session");
        if (s == null) throw new Exception("Objet session absent.");
        CgSmartSession out = new CgSmartSession();
        out.sessionId = s.optString("sessionId", "");
        out.status = s.optString("status", "active");
        JSONArray rows = s.optJSONArray("currentBatch");
        if (rows != null) {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject q = rows.optJSONObject(i);
                if (q == null) continue;
                String id = q.optString("id", "");
                if (id.isEmpty()) id = q.optString("questionId", "");
                if (id.isEmpty()) {
                    long row = q.optLong("row", 0L);
                    if (row > 0L) id = String.valueOf(row);
                }
                if (!id.isEmpty() && !out.ids.contains(id)) out.ids.add(id);
            }
        }
        return out;
    }
}

final class CgSmartBatch {
    String status = "active";
    int learningRound = 0;
    final ArrayList<String> ids = new ArrayList<>();
}


final class CgSmartSession {
    String sessionId = "";
    String status = "active";
    final ArrayList<String> ids = new ArrayList<>();
}

/* ========================================================================== */
/* Firestore REST                                                             */
/* ========================================================================== */

final class CgFirestore {

    CgQuestion getQuestionSync(String token, String uid, String id) throws Exception {
        String url = "https://firestore.googleapis.com/v1/projects/" + enc(BuildConfig.FIREBASE_PROJECT_ID) +
                "/databases/(default)/documents/users/" + enc(uid) + "/questions/" + enc(id);
        JSONObject doc = CgHttp.json("GET", url, token, null);
        JSONObject f = doc.optJSONObject("fields");
        if (f == null) throw new Exception("Question Firestore sans fields.");

        CgQuestion q = new CgQuestion();
        q.id = id;
        q.megatheme = str(f, "megatheme");
        q.theme = str(f, "theme");
        q.question = str(f, "question");
        q.detail = str(f, "detail");
        q.options[0] = str(f, "proposition_a");
        q.options[1] = str(f, "proposition_b");
        q.options[2] = str(f, "proposition_c");
        q.options[3] = str(f, "proposition_d");
        q.correctIndex = integer(f, "correct_index");
        q.imageFile = str(f, "image_file");
        q.isImage = boolish(f, "is_image") || !q.imageFile.isEmpty();
        if (q.question.isEmpty()) throw new Exception("Libellé de question vide.");
        if (q.correctIndex < 1 || q.correctIndex > 4) throw new Exception("correct_index invalide.");
        return q;
    }

    /*
     * CGANDROID004 · HISTORY_FIRESTORE_READ001
     *
     * Lecture directe de users/<uid>/play_history
     * avec pagination Firestore REST.
     */
    List<CgHistoryItem> listPlayHistorySync(
            String token,
            String uid,
            int maxItems
    ) throws Exception {

        List<CgHistoryItem> out =
                new ArrayList<>();

        String pageToken = "";

        while (
                out.size() < maxItems
        ) {

            int pageSize =
                    Math.min(
                            100,
                            maxItems - out.size()
                    );


            String url =
                    "https://firestore.googleapis.com/v1/projects/"
                            + enc(
                            BuildConfig.FIREBASE_PROJECT_ID
                    )
                            + "/databases/(default)/documents/users/"
                            + enc(uid)
                            + "/play_history"
                            + "?pageSize="
                            + pageSize
                            + "&orderBy=client_played_at_ms%20desc";


            if (
                    pageToken != null &&
                    !pageToken.isEmpty()
            ) {

                url +=
                        "&pageToken="
                                + enc(pageToken);
            }


            JSONObject response =
                    CgHttp.json(
                            "GET",
                            url,
                            token,
                            null
                    );


            JSONArray documents =
                    response.optJSONArray(
                            "documents"
                    );


            if (
                    documents == null ||
                    documents.length() == 0
            ) {

                break;
            }


            for (
                    int i = 0;
                    i < documents.length()
                            && out.size() < maxItems;
                    i++
            ) {

                JSONObject document =
                        documents.optJSONObject(i);

                if (document == null) {
                    continue;
                }


                JSONObject fields =
                        document.optJSONObject(
                                "fields"
                        );

                if (fields == null) {
                    continue;
                }


                /*
                 * HISTORY_QR001 ne retient que les événements
                 * réellement évaluables.
                 */
                JSONObject correctField =
                        fields.optJSONObject(
                                "is_correct"
                        );

                if (
                        correctField == null ||
                        !correctField.has(
                                "booleanValue"
                        )
                ) {

                    continue;
                }


                CgHistoryItem item =
                        new CgHistoryItem();


                item.playedAtMs =
                        longish(
                                fields,
                                "client_played_at_ms"
                        );

                item.correct =
                        boolish(
                                fields,
                                "is_correct"
                        );

                item.questionId =
                        str(
                                fields,
                                "question_id"
                        );

                item.domain =
                        str(
                                fields,
                                "domain"
                        );

                item.theme =
                        str(
                                fields,
                                "theme"
                        );

                item.correctAnswer =
                        str(
                                fields,
                                "correct_answer"
                        );

                item.interactionMode =
                        str(
                                fields,
                                "interaction_mode"
                        );


                JSONObject snapshotValue =
                        fields.optJSONObject(
                                "question_snapshot"
                        );

                JSONObject snapshotFields =
                        null;


                if (snapshotValue != null) {

                    JSONObject mapValue =
                            snapshotValue.optJSONObject(
                                    "mapValue"
                            );

                    if (mapValue != null) {

                        snapshotFields =
                                mapValue.optJSONObject(
                                        "fields"
                                );
                    }
                }


                if (snapshotFields != null) {

                    if (
                            item.questionId == null ||
                            item.questionId.isEmpty()
                    ) {

                        item.questionId =
                                str(
                                        snapshotFields,
                                        "question_id"
                                );
                    }


                    item.question =
                            str(
                                    snapshotFields,
                                    "question"
                            );


                    if (
                            item.domain == null ||
                            item.domain.isEmpty()
                    ) {

                        item.domain =
                                str(
                                        snapshotFields,
                                        "domain"
                                );
                    }


                    if (
                            item.theme == null ||
                            item.theme.isEmpty()
                    ) {

                        item.theme =
                                str(
                                        snapshotFields,
                                        "theme"
                                );
                    }


                    /*
                     * Compatibilité avec anciens événements
                     * qui auraient le snapshot mais pas
                     * correct_answer au niveau racine.
                     */
                    if (
                            item.correctAnswer == null ||
                            item.correctAnswer.isEmpty()
                    ) {

                        int correctIndex =
                                integer(
                                        snapshotFields,
                                        "correct_index"
                                );


                        String answerKey = "";

                        switch (correctIndex) {

                            case 1:
                                answerKey =
                                        "proposition_a";
                                break;

                            case 2:
                                answerKey =
                                        "proposition_b";
                                break;

                            case 3:
                                answerKey =
                                        "proposition_c";
                                break;

                            case 4:
                                answerKey =
                                        "proposition_d";
                                break;

                            default:
                                break;
                        }


                        if (!answerKey.isEmpty()) {

                            item.correctAnswer =
                                    str(
                                            snapshotFields,
                                            answerKey
                                    );
                        }
                    }
                }


                out.add(item);
            }


            pageToken =
                    response.optString(
                            "nextPageToken",
                            ""
                    );


            if (pageToken.isEmpty()) {
                break;
            }
        }


        return out;
    }


    private static long longish(
            JSONObject fields,
            String key
    ) {

        String value =
                str(
                        fields,
                        key
                );

        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return 0L;
        }
    }


    void createDocumentSync(String token, String uid, String collection, JSONObject payload) throws Exception {
        String url = "https://firestore.googleapis.com/v1/projects/" + enc(BuildConfig.FIREBASE_PROJECT_ID) +
                "/databases/(default)/documents/users/" + enc(uid) + "/" + enc(collection);
        JSONObject body = new JSONObject();
        body.put("fields", encodeMap(payload));
        CgHttp.json("POST", url, token, body);
    }

    Bitmap loadImageSync(String token, String raw) throws Exception {
        if (raw == null || raw.trim().isEmpty()) throw new Exception("image_file vide");
        String value = raw.trim();
        byte[] data;
        if (value.startsWith("http://") || value.startsWith("https://")) {
            data = CgHttp.bytes(value, null, false);
        } else {
            String bucket = BuildConfig.FIREBASE_STORAGE_BUCKET;
            String path = value;
            if (value.startsWith("gs://")) {
                String rest = value.substring(5);
                int slash = rest.indexOf('/');
                if (slash > 0) {
                    bucket = rest.substring(0, slash);
                    path = rest.substring(slash + 1);
                }
            }
            String url = "https://firebasestorage.googleapis.com/v0/b/" + enc(bucket) + "/o/" + enc(path) + "?alt=media";
            data = CgHttp.bytes(url, token, true);
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length);
        if (bitmap == null) throw new Exception("Image illisible.");
        return bitmap;
    }

    private static String str(JSONObject fields, String key) {
        JSONObject v = fields.optJSONObject(key);
        if (v == null) return "";
        if (v.has("stringValue")) return v.optString("stringValue", "");
        if (v.has("integerValue")) return v.optString("integerValue", "");
        if (v.has("doubleValue")) return String.valueOf(v.optDouble("doubleValue", 0));
        if (v.has("booleanValue")) return String.valueOf(v.optBoolean("booleanValue", false));
        return "";
    }

    private static int integer(JSONObject fields, String key) {
        String s = str(fields, key);
        try { return Integer.parseInt(s); } catch (Exception ignored) { return 0; }
    }

    private static boolean boolish(JSONObject fields, String key) {
        JSONObject v = fields.optJSONObject(key);
        if (v == null) return false;
        if (v.has("booleanValue")) return v.optBoolean("booleanValue", false);
        String s = str(fields, key);
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static JSONObject encodeMap(JSONObject input) throws Exception {
        JSONObject out = new JSONObject();
        Iterator<String> keys = input.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            out.put(key, encodeValue(input.opt(key)));
        }
        return out;
    }

    private static JSONObject encodeValue(Object value) throws Exception {
        JSONObject out = new JSONObject();
        if (value == null || value == JSONObject.NULL) {
            out.put("nullValue", "NULL_VALUE");
        } else if (value instanceof Boolean) {
            out.put("booleanValue", value);
        } else if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
            out.put("integerValue", String.valueOf(value));
        } else if (value instanceof Float || value instanceof Double) {
            out.put("doubleValue", ((Number) value).doubleValue());
        } else if (value instanceof JSONObject) {
            JSONObject map = new JSONObject();
            map.put("fields", encodeMap((JSONObject) value));
            out.put("mapValue", map);
        } else {
            out.put("stringValue", String.valueOf(value));
        }
        return out;
    }

    private static String enc(String value) { return Uri.encode(value == null ? "" : value, ""); }
}

/*
 * CGANDROID004 · HISTORY_QR_MODEL001
 */
final class CgHistoryItem {

    long playedAtMs = 0L;

    boolean correct = false;

    String questionId = "";
    String domain = "";
    String theme = "";
    String question = "";
    String correctAnswer = "";
    String interactionMode = "";
}


final class CgQuestion {
    String id = "";
    String megatheme = "";
    String theme = "";
    String question = "";
    String detail = "";
    final String[] options = new String[]{"", "", "", ""};
    int correctIndex = 0;
    String imageFile = "";
    boolean isImage = false;
    boolean hasImage() { return isImage && imageFile != null && !imageFile.trim().isEmpty(); }
}

/* ========================================================================== */
/* P / T / Outbox                                                             */
/* ========================================================================== */

final class CgFlags {
    private static final String PREF = "cgandroid001_flags";
    private static final String K_T = "analog_t_keys";
    private static final String K_OUTBOX = "outbox";
    private final SharedPreferences prefs;

    CgFlags(Context context) { prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    static String comparisonKey(String value) {
        String s = value == null ? "" : value;
        s = s.replace('\u00A0', ' ')
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .trim()
                .toLowerCase(Locale.ROOT);
        while (s.contains("  ")) s = s.replace("  ", " ");
        return s;
    }

    static String analogKey(String theme, String question) {
        return comparisonKey(theme) + "\n" + comparisonKey(question);
    }

    void addT(CgQuestion q) {
        Set<String> existing = new HashSet<>(prefs.getStringSet(K_T, new HashSet<>()));
        existing.add(analogKey(q.theme, q.question));
        prefs.edit().putStringSet(K_T, existing).apply();
    }

    boolean isTExcluded(CgQuestion q) {
        Set<String> set = prefs.getStringSet(K_T, new HashSet<>());
        return set.contains(analogKey(q.theme, q.question));
    }

    synchronized void enqueue(String collection, JSONObject payload) {
        try {
            JSONArray a = new JSONArray(prefs.getString(K_OUTBOX, "[]"));
            JSONObject item = new JSONObject();
            item.put("collection", collection);
            item.put("payload", payload);
            a.put(item);
            prefs.edit().putString(K_OUTBOX, a.toString()).apply();
        } catch (Exception ignored) { }
    }

    /*
     * CGANDROID005 · OUTBOX_HISTORY_PURGE001
     *
     * Supprime uniquement les événements play_history
     * encore en attente.
     *
     * Les signalements / exclusions P/T sont conservés.
     */
    synchronized int purgeHistoryOutbox() {

        int removed = 0;

        try {

            JSONArray source =
                    new JSONArray(
                            prefs.getString(
                                    K_OUTBOX,
                                    "[]"
                            )
                    );

            JSONArray remaining =
                    new JSONArray();


            for (
                    int i = 0;
                    i < source.length();
                    i++
            ) {

                JSONObject item =
                        source.optJSONObject(i);

                if (item == null) {
                    continue;
                }


                if (
                        "play_history".equals(
                                item.optString(
                                        "collection",
                                        ""
                                )
                        )
                ) {

                    removed++;
                    continue;
                }


                remaining.put(item);
            }


            prefs.edit()
                    .putString(
                            K_OUTBOX,
                            remaining.toString()
                    )
                    .apply();


        } catch (Exception ignored) { }


        return removed;
    }


    int pendingCount() {
        try { return new JSONArray(prefs.getString(K_OUTBOX, "[]")).length(); }
        catch (Exception ignored) { return 0; }
    }

    int pendingHistoryCount() {
        int count = 0;
        try {
            JSONArray a =
                    new JSONArray(
                            prefs.getString(K_OUTBOX, "[]")
                    );

            for (int i = 0; i < a.length(); i++) {
                JSONObject item = a.optJSONObject(i);
                if (item == null) continue;

                if (
                        "play_history".equals(
                                item.optString("collection", "")
                        )
                ) {
                    count++;
                }
            }
        } catch (Exception ignored) { }
        return count;
    }


    synchronized void flushOutboxSync(CgFirestore firestore, String token, String uid) {
        try {
            JSONArray source = new JSONArray(prefs.getString(K_OUTBOX, "[]"));
            JSONArray remaining = new JSONArray();
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item == null) continue;
                try {
                    firestore.createDocumentSync(
                            token,
                            uid,
                            item.optString("collection", ""),
                            item.optJSONObject("payload") == null ? new JSONObject() : item.optJSONObject("payload"));
                } catch (Exception ex) {
                    remaining.put(item);
                }
            }
            prefs.edit().putString(K_OUTBOX, remaining.toString()).apply();
        } catch (Exception ignored) { }
    }
}

/* ========================================================================== */
/* Reprise locale                                                             */
/* ========================================================================== */

final class CgGameState {
    private static final String PREF = "cgandroid001_game";
    private final SharedPreferences prefs;

    CgGameState(Context context) { prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    void start(String sessionId, int target, String domain, String status, List<String> ids) {
        prefs.edit().clear()
                .putBoolean("active", true)
                .putString("session", sessionId == null ? "" : sessionId)
                .putInt("target", target)
                .putString("domain", domain == null ? "" : domain)
                .putString("server_status", status == null ? "active" : status)
                .putInt("played", 0)
                .putInt("correct", 0)
                .putInt("consumed", 0)
                .putInt("position", 0)
                .putString("batch", toJson(ids))
                .putString("staged_batch", "[]")
                .putString("staged_status", "")
                .apply();
    }

    boolean hasActive() { return prefs.getBoolean("active", false); }
    String sessionId() { return prefs.getString("session", ""); }
    int target() { return prefs.getInt("target", 0); }
    int played() { return prefs.getInt("played", 0); }
    int correct() { return prefs.getInt("correct", 0); }
    int consumed() {
        return prefs.contains("consumed") ? prefs.getInt("consumed", 0) : played();
    }
    int position() { return prefs.getInt("position", 0); }
    String serverStatus() { return prefs.getString("server_status", "active"); }
    void setServerStatus(String status) { prefs.edit().putString("server_status", status == null ? "" : status).apply(); }

    ArrayList<String> batchIds() {
        ArrayList<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString("batch", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String x = a.optString(i, "");
                if (!x.isEmpty()) out.add(x);
            }
        } catch (Exception ignored) { }
        return out;
    }

    void setBatch(String status, List<String> ids) {
        prefs.edit()
                .putString("server_status", status == null ? "active" : status)
                .putString("batch", toJson(ids))
                .putString("staged_batch", "[]")
                .putString("staged_status", "")
                .putInt("position", 0)
                .apply();
    }

    void stageBatch(String status, List<String> ids) {
        prefs.edit()
                .putString("staged_status", status == null ? "active" : status)
                .putString("staged_batch", toJson(ids))
                .apply();
    }

    boolean hasStagedBatch() {
        try {
            return new JSONArray(prefs.getString("staged_batch", "[]")).length() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    boolean promoteStagedBatch() {
        ArrayList<String> staged = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString("staged_batch", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String x = a.optString(i, "");
                if (!x.isEmpty()) staged.add(x);
            }
        } catch (Exception ignored) { }

        if (staged.isEmpty()) return false;

        String status = prefs.getString("staged_status", "active");
        prefs.edit()
                .putString("server_status", status)
                .putString("batch", toJson(staged))
                .putInt("position", 0)
                .putString("staged_batch", "[]")
                .putString("staged_status", "")
                .apply();
        return true;
    }

    void recordAnswer(boolean correct) {
        prefs.edit()
                .putInt("played", played() + 1)
                .putInt("correct", correct() + (correct ? 1 : 0))
                .putInt("consumed", consumed() + 1)
                .putInt("position", position() + 1)
                .apply();
    }

    void skipCurrent() {
        prefs.edit()
                .putInt("consumed", consumed() + 1)
                .putInt("position", position() + 1)
                .apply();
    }

    void advanceFiltered() {
        prefs.edit().putInt("position", position() + 1).apply();
    }

    void advanceWithoutPlaying() {
        skipCurrent();
    }

    void finish() { prefs.edit().putBoolean("active", false).apply(); }
    void clear() { prefs.edit().clear().apply(); }

    private static String toJson(List<String> ids) {
        JSONArray a = new JSONArray();
        if (ids != null) for (String id : ids) a.put(id);
        return a.toString();
    }
}
