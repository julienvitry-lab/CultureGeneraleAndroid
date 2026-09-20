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
 * - Session intelligente comme unique mode de jeu ;
 * - QCM natif ;
 * - Comfortaa systématique ;
 * - P = signalement éditorial ;
 * - T = exclusion analogue locale immédiate + file Cloud/pending ;
 * - réponses QCM écrites dans play_history pour alimenter CGWEB035.
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

    private static final int[] SIZES = new int[]{20, 50, 100, 250, 500, 1000};

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
    private int selectedCount = 500;

    private CgQuestion current;
    private long currentShownAtMs = 0L;
    private final List<Button> answerButtons = new ArrayList<>();
    private final Map<String, Bitmap> imageCache = new HashMap<>();
    private final Set<String> imagePreloadInFlight = new HashSet<>();
    private boolean answering = false;
    private String screen = "home";

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
        addSub("Nouvelle version tablette · Session intelligente", 18, LIGHT_GREY);
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
        addSub("Session intelligente", 20, LIGHT_GREY);
        gap(48);

        Button start = button("Démarrer", BLUE, 28);
        add(start, -1, dp(88), dp(180), 0, dp(180), dp(18));
        start.setOnClickListener(v -> showMegathemes());

        TextView helper = text("Créer une nouvelle session", 15, LIGHT_GREY, Gravity.CENTER);
        add(helper, -1, -2, dp(40), 0, dp(40), 0);
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
            showSizeSelection();
        });
        return b;
    }

    private void showSizeSelection() {
        screen = "size";
        baseScreen();

        addTitle("Taille de la session", 31, Color.WHITE);
        addSub(selectedDomain.isEmpty() ? "Toutes les questions" : selectedDomain,
                18, LIGHT_GREY);
        gap(20);

        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);

        for (int i = 0; i < SIZES.length; i++) {
            int size = SIZES[i];
            Button b = button(String.valueOf(size), size == selectedCount ? BLUE : GREY, 24);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(82), 1f);
            lp.setMargins(dp(6), dp(6), dp(6), dp(6));
            if (i < 3) row1.addView(b, lp); else row2.addView(b, lp);
            b.setOnClickListener(v -> {
                selectedCount = size;
                startSmartSession();
            });
        }

        root.addView(row1);
        root.addView(row2);

        gap(18);
        TextView hint = text("Le choix lance directement la session intelligente.",
                14, LIGHT_GREY, Gravity.CENTER);
        add(hint, -1, -2, dp(20), 0, dp(20), dp(20));

        Button back = button("Retour", GREY, 18);
        add(back, -1, dp(54), dp(100), 0, dp(100), 0);
        back.setOnClickListener(v -> showMegathemes());
    }

    private void startSmartSession() {
        showLoading("Création de la session intelligente…");
        final int target = selectedCount;
        final String domain = selectedDomain;

        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                flags.flushOutboxSync(firestore, token, auth.uid());
                CgSmartSession session = smart.startSync(token, target, domain);
                if (session.ids.isEmpty()) throw new Exception("Aucune question reçue du moteur SMART.");
                game.start(session.sessionId, target, domain, session.status, session.ids);
                main.post(this::loadNextPlayable);
            } catch (Exception ex) {
                main.post(() -> showFatal("Session impossible", ex.getMessage()));
            }
        });
    }

    private void loadNextPlayable() {
        if (!game.hasActive()) {
            showHome();
            return;
        }

        if (game.played() >= game.target()) {
            showEnd();
            return;
        }

        if (game.position() >= game.batchIds().size()) {
            if (!"active".equals(game.serverStatus())) {
                showEnd();
                return;
            }
            requestNextBatch();
            return;
        }

        final String id = game.batchIds().get(game.position());
        showLoading("Question " + (game.played() + 1) + " / " + game.target());

        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                CgQuestion q = firestore.getQuestionSync(token, auth.uid(), id);
                if (flags.isTExcluded(q)) {
                    game.advanceWithoutPlaying();
                    main.post(this::loadNextPlayable);
                    return;
                }
                current = q;
                main.post(() -> showQuestion(q));
            } catch (Exception ex) {
                game.advanceWithoutPlaying();
                main.post(() -> {
                    Toast.makeText(this,
                            "Question " + id + " ignorée : " + ex.getMessage(),
                            Toast.LENGTH_LONG).show();
                    loadNextPlayable();
                });
            }
        });
    }

    private void requestNextBatch() {
        showLoading("Préparation du lot suivant…");
        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                flags.flushOutboxSync(firestore, token, auth.uid());
                CgSmartSession s = smart.nextSync(token, game.sessionId());
                if (s.ids.isEmpty()) {
                    game.setServerStatus(s.status);
                    main.post(this::showEnd);
                    return;
                }
                game.setBatch(s.status, s.ids);
                main.post(this::loadNextPlayable);
            } catch (Exception ex) {
                main.post(() -> showFatal("Lot suivant impossible", ex.getMessage()));
            }
        });
    }

    private void addStatsBanner() {
        LinearLayout band = new LinearLayout(this);
        band.setOrientation(LinearLayout.HORIZONTAL);
        band.setGravity(Gravity.CENTER);
        band.setPadding(dp(5), dp(5), dp(5), dp(5));
        band.setBackground(roundedStroke(Color.rgb(16, 16, 16), 14, Color.WHITE, 1));

        int played = game.played();
        int good = game.correct();
        int errors = Math.max(0, played - good);
        double scorePct = played <= 0 ? 0.0 : (good * 100.0) / played;

        band.addView(statCell("Mégathème",
                        selectedDomain.isEmpty() ? "Toutes" : selectedDomain),
                statLp(1.35f));
        band.addView(statCell("Progression",
                        (played + 1) + " / " + game.target()),
                statLp(1f));
        band.addView(statCell("Score",
                        String.format(Locale.FRANCE, "%.2f %%", scorePct)),
                statLp(.9f));
        band.addView(statCell("Bonnes réponses", String.valueOf(good)), statLp(1.15f));
        band.addView(statCell("Erreurs", String.valueOf(errors)), statLp(.9f));

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
        Button proposals = button("Propositions", GREEN, 18);

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

    private void showAnswers(CgQuestion q) {
        screen = "answers";
        answering = false;
        answerButtons.clear();
        baseScreen();

        addStatsBanner();

        TextView question = cardText(q.question, 19, YELLOW, Color.BLACK);
        question.setGravity(Gravity.CENTER);
        question.setMinHeight(dp(60));
        add(question, -1, -2, 0, 0, 0, dp(10));

        for (int i = 0; i < 4; i++) {
            final int choice = i + 1;
            String label = q.options[i] == null ? "" : q.options[i];
            Button b = button(label, GREY, 20);
            b.setGravity(Gravity.CENTER);
            b.setPadding(dp(16), dp(8), dp(16), dp(8));
            b.setMinHeight(dp(78));
            b.setBackground(roundedStroke(GREY, 14, Color.WHITE, 1));
            add(b, -1, -2, 0, 0, 0, dp(8));
            answerButtons.add(b);
            b.setOnClickListener(v -> answer(q, choice));
        }

        addFlexSpacer();

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.CENTER);

        Button p = microButton("P");
        Button t = microButton("T");
        Button menu = button("Menu", RED, 17);
        Button back = button("Retour question", BLUE, 17);

        footer.addView(p, footerMicroLp());
        footer.addView(t, footerMicroLp());
        footer.addView(menu, footerLp(1.15f));
        footer.addView(back, footerLp(1.25f));
        root.addView(footer, footerBarLp());

        p.setOnClickListener(v -> reportProblem(q, p));
        t.setOnClickListener(v -> confirmAnalogExclusion(q));
        menu.setOnClickListener(v -> showHome());
        back.setOnClickListener(v -> showQuestion(q));
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
        if (!game.hasActive()) return;

        final int from = game.position() + 1;
        final int to = Math.min(game.batchIds().size(), from + 3);

        for (int i = from; i < to; i++) {
            final String id = game.batchIds().get(i);

            io.submit(() -> {
                try {
                    String token = auth.tokenSync();
                    CgQuestion next = firestore.getQuestionSync(token, auth.uid(), id);
                    if (!next.hasImage()) return;

                    synchronized (imagePreloadInFlight) {
                        if (imageCache.containsKey(next.imageFile)) return;
                        if (!imagePreloadInFlight.add(next.imageFile)) return;
                    }

                    try {
                        Bitmap bitmap = firestore.loadImageSync(token, next.imageFile);
                        if (bitmap != null) imageCache.put(next.imageFile, bitmap);
                    } finally {
                        synchronized (imagePreloadInFlight) {
                            imagePreloadInFlight.remove(next.imageFile);
                        }
                    }
                } catch (Exception ignored) {
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
            if (idx == q.correctIndex) b.setBackground(roundedStroke(GREEN, 14, Color.WHITE, 1));
            else if (idx == choice) b.setBackground(roundedStroke(RED, 14, Color.WHITE, 1));
            else b.setBackground(roundedStroke(DARK, 14, Color.WHITE, 1));
        }

        long responseMs = Math.max(0L, System.currentTimeMillis() - currentShownAtMs);
        JSONObject event = historyPayload(q, choice, correct, responseMs);
        game.recordAnswer(correct);

        io.submit(() -> {
            try {
                String token = auth.tokenSync();
                firestore.createDocumentSync(token, auth.uid(), "play_history", event);
            } catch (Exception ex) {
                flags.enqueue("play_history", event);
            }
            try { Thread.sleep(900); } catch (InterruptedException ignored) { }
            main.post(this::loadNextPlayable);
        });
    }

    private JSONObject historyPayload(CgQuestion q, int choice, boolean correct, long responseMs) {
        JSONObject x = new JSONObject();
        try {
            x.put("question_id", q.id);
            try { x.put("question_row_number", Long.parseLong(q.id)); } catch (Exception ignored) { }
            x.put("client_played_at_ms", System.currentTimeMillis());
            x.put("play_type", "challenge_choice");
            x.put("game_mode", "qcm");
            x.put("result", correct ? "correct" : "wrong");
            x.put("is_correct", correct);
            x.put("response_time_ms", responseMs);
            x.put("domain", q.megatheme);
            x.put("theme", q.theme);
            x.put("selected_answer", q.options[Math.max(0, Math.min(3, choice - 1))]);
            x.put("correct_answer", q.options[Math.max(0, Math.min(3, q.correctIndex - 1))]);
            x.put("source", BuildConfig.CG_CHANNEL);
            x.put("session_id", game.sessionId());
            JSONObject snap = new JSONObject();
            snap.put("domain", q.megatheme);
            snap.put("theme", q.theme);
            snap.put("question", q.question);
            snap.put("detail", q.detail);
            x.put("question_snapshot", snap);
        } catch (Exception ignored) { }
        return x;
    }

    private void reportProblem(CgQuestion q, Button button) {
        final EditText note = edit("Précision facultative",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        note.setMinLines(3);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Signaler la question (P)")
                .setMessage("Le signalement n’exclut pas la question du jeu. Il sera destiné au traitement dans CGWEB.")
                .setView(note)
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Signaler", null)
                .create();

        dialog.setOnShowListener(v -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v2 -> {
                JSONObject payload = new JSONObject();
                try {
                    payload.put("question_id", q.id);
                    payload.put("megatheme", q.megatheme);
                    payload.put("theme", q.theme);
                    payload.put("question", q.question);
                    payload.put("detail", q.detail);
                    payload.put("note", note.getText().toString().trim());
                    payload.put("session_id", game.sessionId());
                    payload.put("created_ms", System.currentTimeMillis());
                    payload.put("state", "pending");
                    payload.put("source", BuildConfig.CG_CHANNEL);
                } catch (Exception ignored) { }

                flags.enqueue("problem_reports", payload);
                button.setText("P✓");
                button.setTextColor(YELLOW);
                dialog.dismiss();
                Toast.makeText(this, "Signalement P enregistré.", Toast.LENGTH_SHORT).show();
                flushOutboxAsync();
            });
        });
        dialog.show();
    }

    private void confirmAnalogExclusion(CgQuestion q) {
        new AlertDialog.Builder(this)
                .setTitle("Exclure ce contenu analogue (T) ?")
                .setMessage("Même thème + même libellé normalisé. Le détail n’entre pas dans la comparaison.")
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Exclure", (d, which) -> {
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
                    game.advanceWithoutPlaying();
                    Toast.makeText(this,
                            "Questions analogues exclues sur cette tablette.",
                            Toast.LENGTH_SHORT).show();
                    flushOutboxAsync();
                    loadNextPlayable();
                })
                .show();
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
        addTitle("Session terminée", 32, Color.WHITE);
        gap(18);

        TextView score = cardText(
                game.correct() + " bonne(s) réponse(s) sur " + game.played() + " question(s).",
                24, DARK, Color.WHITE);
        score.setGravity(Gravity.CENTER);
        add(score, -1, dp(100), dp(80), 0, dp(80), dp(22));

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
        c.setConnectTimeout(20000);
        c.setReadTimeout(45000);
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
    CgSmartSession startSync(String token, int count, String domain) throws Exception {
        JSONObject body = new JSONObject();
        body.put("cgweb035", true);
        body.put("mode", "smartLongStart");
        body.put("count", count);
        body.put("batchSize", 50);
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

    int pendingCount() {
        try { return new JSONArray(prefs.getString(K_OUTBOX, "[]")).length(); }
        catch (Exception ignored) { return 0; }
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
                .putInt("position", 0)
                .putString("batch", toJson(ids))
                .apply();
    }

    boolean hasActive() { return prefs.getBoolean("active", false); }
    String sessionId() { return prefs.getString("session", ""); }
    int target() { return prefs.getInt("target", 0); }
    int played() { return prefs.getInt("played", 0); }
    int correct() { return prefs.getInt("correct", 0); }
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
                .putInt("position", 0)
                .apply();
    }

    void recordAnswer(boolean correct) {
        prefs.edit()
                .putInt("played", played() + 1)
                .putInt("correct", correct() + (correct ? 1 : 0))
                .putInt("position", position() + 1)
                .apply();
    }

    void advanceWithoutPlaying() {
        prefs.edit().putInt("position", position() + 1).apply();
    }

    void finish() { prefs.edit().putBoolean("active", false).apply(); }
    void clear() { prefs.edit().clear().apply(); }

    private static String toJson(List<String> ids) {
        JSONArray a = new JSONArray();
        if (ids != null) for (String id : ids) a.put(id);
        return a.toString();
    }
}
