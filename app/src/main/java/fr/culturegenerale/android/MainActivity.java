package fr.culturegenerale.android;

import android.text.TextUtils;
import android.text.Layout;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.PopupWindow;

import java.io.File;
import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String APP_VERSION = "V10.0.0";
    private static final String APP_FOLDER = "Culture Générale";
    private static final String DB_NAME = "questions_base.sqlite";
    private static final String TABLE = "questions";
    private static final String[] DOMAINS = new String[]{
            "Animaux et Plantes", "Culture Classique", "Culture Générale", "Culture Moderne",
            "Géographie", "Histoire", "Sciences et Techniques", "Sport"
    };
    private static final String[] IMG_EXT = new String[]{".jpg", ".jpeg", ".png", ".webp", ".bmp"};
    private final int BLUE = Color.rgb(0, 86, 180);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int RED = Color.rgb(185, 0, 0);
    private final int YELLOW = Color.rgb(245, 205, 40);
    private final int DARK = Color.rgb(35, 35, 35);
    private final int GREY = Color.rgb(85, 85, 85);
    private final int LIGHT_GREY = Color.rgb(130, 130, 130);
    private final int NAVY = Color.rgb(18, 45, 92);

    private File appFolder, dbFile, imagesFolder, problemsFile;
    private LinearLayout screenRoot;
    private LinearLayout root;
    private LinearLayout bottomBar;
    private LinearLayout actionPanelHost;
    private Typeface appFont = Typeface.DEFAULT_BOLD;
    private final Button[] choiceButtons = new Button[4];
    private PopupWindow transientPopup;
    private final Random random = new Random();
    private Question current;
    private String currentDomain = null;
    private String phase = "home";
    private String phaseBeforeEnd = "question";
    private String gameMode = "challenge";
    private String revisionMode = "normal";
    private String revisionDomain = null;
    private String revisionStartTheme = "";
    private final List<Question> revisionQuestions = new ArrayList<>();
    private int revisionIndex = 0;
    private boolean revisionAnswerVisible = false;
    private int wrongAnswerPageIndex = 0;
    private final List<Question> trioQuestions = new ArrayList<>();
    private int trioPageIndex = 0;
    private boolean trioAnswerVisible = false;
    private WrongAnswer trioSourceWrongAnswer = null;
    private String trioReturnMode = "wrong";

    private final Set<Long> askedThisSession = new HashSet<>();
    private final List<Question> history = new ArrayList<>();
    private final List<WrongAnswer> wrongAnswers = new ArrayList<>();
    private final Map<String, Question> goodThemesThisSession = new LinkedHashMap<>();
    private int historyIndex = -1;

    private int answered = 0;
    private int mentalOk = 0;
    private int classicOk = 0;
    private int revised = 0;
    private int goodStreak = 0;
    private int classicStreak = 0;
    private int bestGoodStreak = 0;
    private int mentalStreak = 0;
    private int bestMentalStreak = 0;
    private int lastQuestionsPopupAt = 0;
    private int lastMentalPopupAt = 0;
    private int lastCombinedPopupAt = 0;
    private long remainingInCurrentDomain = 0;

    // Préchargement léger pour fluidifier les transitions sans modifier la logique de jeu.
    private volatile Question prefetchedNextQuestion = null;
    private volatile List<Question> prefetchedRelatedQuestions = null;
    private volatile String prefetchedRelatedThemeKey = "";
    private volatile String prefetchedRelatedQuestionKey = "";

    static class Question {
        long row;
        String domain, theme, question, detail, imageFile;
        String[] props = new String[]{"", "", "", ""};
        int correct;
        boolean isImage;
    }

    static class WrongAnswer {
        long row;
        String theme, question, detail, chosenAnswer, correctAnswer, imageFile;
        boolean isImage;

        WrongAnswer(Question q, int chosenChoice) {
            row = q.row;
            theme = q.theme;
            question = q.question;
            detail = q.detail;
            imageFile = q.imageFile;
            isImage = q.isImage;
            if (chosenChoice >= 1 && chosenChoice <= 4) chosenAnswer = q.props[chosenChoice - 1];
            else chosenAnswer = "";
            if (q.correct >= 1 && q.correct <= 4) correctAnswer = q.props[q.correct - 1];
            else correctAnswer = "";
        }
    }

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        appFolder = new File(Environment.getExternalStorageDirectory(), APP_FOLDER);
        dbFile = new File(appFolder, DB_NAME);
        imagesFolder = new File(appFolder, "Images");
        problemsFile = new File(appFolder, "PROBLEMES_P.csv");
        loadFont();
        showHome();
    }

    @Override public void onResume() {
        super.onResume();
        if ("home".equals(phase)) showHome();
    }

    @Override public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Les vues utilisent des poids et des tailles adaptatives : elles se redimensionnent
        // sans redémarrer la partie lors du passage paysage / portrait.
        if (transientPopup != null && transientPopup.isShowing()) transientPopup.dismiss();
    }

    private void loadFont() {
        try {
            appFont = getResources().getFont(R.font.comfortaa_bold);
        } catch (Exception e) {
            appFont = Typeface.DEFAULT_BOLD;
            Toast.makeText(this, "Erreur : la police Comfortaa intégrée n'a pas été trouvée", Toast.LENGTH_LONG).show();
        }
    }

    private void baseScrollable() {
        screenRoot = new LinearLayout(this);
        screenRoot.setOrientation(LinearLayout.VERTICAL);
        screenRoot.setBackgroundColor(Color.BLACK);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(10), 0, dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        scroll.addView(root);
        screenRoot.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        createActionPanelHost();

        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setGravity(Gravity.CENTER);
        bottomBar.setVisibility(View.GONE);
        screenRoot.addView(bottomBar, new LinearLayout.LayoutParams(-1, cmToPx(2.0f)));
        setContentView(screenRoot);
    }

    private void baseFixed() {
        screenRoot = new LinearLayout(this);
        screenRoot.setOrientation(LinearLayout.VERTICAL);
        screenRoot.setBackgroundColor(Color.BLACK);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(10), 0, dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        screenRoot.addView(root, new LinearLayout.LayoutParams(-1, 0, 1));

        createActionPanelHost();

        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setGravity(Gravity.CENTER);
        bottomBar.setVisibility(View.GONE);
        screenRoot.addView(bottomBar, new LinearLayout.LayoutParams(-1, cmToPx(2.0f)));
        setContentView(screenRoot);
    }

    private void createActionPanelHost() {
        actionPanelHost = new LinearLayout(this);
        actionPanelHost.setOrientation(LinearLayout.HORIZONTAL);
        actionPanelHost.setGravity(Gravity.RIGHT | Gravity.BOTTOM);
        actionPanelHost.setBackgroundColor(Color.BLACK);
        actionPanelHost.setVisibility(View.GONE);
        screenRoot.addView(actionPanelHost, new LinearLayout.LayoutParams(-1, -2));
    }

    private void hideActionPanel() {
        if (actionPanelHost == null) return;
        actionPanelHost.removeAllViews();
        actionPanelHost.setVisibility(View.GONE);
    }

    private void addCompactStatsBar() {
        LinearLayout statsRow = new LinearLayout(this);
        statsRow.setOrientation(LinearLayout.HORIZONTAL);
        statsRow.setGravity(Gravity.CENTER);

        int gap = cmToPx(0.2f);
        addStatsCell(statsRow, String.valueOf(remainingInCurrentDomain), 0, gap / 2);
        addStatsCell(statsRow, String.valueOf(bestGoodStreak), gap / 2, gap / 2);
        addStatsCell(statsRow, String.valueOf(goodStreak), gap / 2, 0);

        root.addView(statsRow, new LinearLayout.LayoutParams(-1, cmToPx(0.85f)));
    }

    private void addStatsCell(LinearLayout row, String text, int leftMargin, int rightMargin) {
        TextView cell = tv(text, 25, Color.WHITE, Gravity.CENTER, true);
        cell.setSingleLine(true);
        cell.setMaxLines(1);
        cell.setEllipsize(null);
        cell.setHorizontallyScrolling(false);
        cell.setPadding(dp(3), 0, dp(3), 0);
        cell.setMinHeight(0);
        setRoundedBackground(cell, Color.rgb(24, 24, 24), 8);
        cell.setTextSize(TypedValue.COMPLEX_UNIT_SP, 27);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            cell.setAutoSizeTextTypeUniformWithConfiguration(10, 27, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        cell.post(() -> fitSingleLineLegacy(cell, cell.getText().toString(), 27, 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1);
        lp.setMargins(leftMargin, 0, rightMargin, 0);
        row.addView(cell, lp);
    }

    private long countRemaining(String domain) {
        SQLiteDatabase db = openDb();
        try {
            String where = availableWhere(domain != null);
            String[] args = domain == null ? null : new String[]{domain};
            Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + TABLE + " WHERE " + where, args);
            try { return c.moveToFirst() ? c.getLong(0) : 0; }
            finally { c.close(); }
        } finally { db.close(); }
    }

    private long[] countMainStatuses() {
        long[] values = new long[]{0, 0, 0, 0};
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery(
                    "SELECT " +
                    "SUM(CASE WHEN UPPER(TRIM(status))='A' THEN 1 ELSE 0 END), " +
                    "SUM(CASE WHEN UPPER(TRIM(status))='R' THEN 1 ELSE 0 END), " +
                    "SUM(CASE WHEN UPPER(TRIM(status))='P' THEN 1 ELSE 0 END), " +
                    "SUM(CASE WHEN UPPER(TRIM(status))='T' THEN 1 ELSE 0 END) " +
                    "FROM " + TABLE,
                    null
            );
            try {
                if (c.moveToFirst()) {
                    for (int i = 0; i < 4; i++) values[i] = c.isNull(i) ? 0 : c.getLong(i);
                }
            } finally { c.close(); }
        } finally { db.close(); }
        return values;
    }

    private void addOneMillimeterGap() {
        Space gap = new Space(this);
        root.addView(gap, new LinearLayout.LayoutParams(-1, cmToPx(0.2f)));
    }

    private TextView tv(String text, int sp, int color, int gravity, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text == null ? "" : text);
        v.setTextSize(sp + 2);
        v.setTextColor(color);
        v.setGravity(Gravity.CENTER);
        v.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        v.setPadding(dp(4), dp(2), dp(4), dp(2));
        v.setTypeface(appFont);
        v.setIncludeFontPadding(false);
        configureNoWordSplit(v);
        return v;
    }

    private Button btn(String text, int sp) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(sp + 2);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        b.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        b.setIncludeFontPadding(false);
        b.setPadding(dp(4), dp(4), dp(4), dp(4));
        b.setTypeface(appFont);
        b.setTextColor(Color.WHITE);
        configureNoWordSplit(b);
        b.setBackground(roundedBackgroundWithStroke(GREY, 16, Color.WHITE, 1));
        return b;
    }


    private void configureNoWordSplit(TextView v) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            v.setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE);
            v.setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE);
        }
    }

    private int halfBandGapPx() {
        return Math.max(1, cmToPx(0.10f));
    }

    private int compactBandPaddingPx() {
        return Math.max(dp(3), cmToPx(0.25f));
    }

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private void setRoundedBackground(View view, int color, int radiusDp) {
        view.setBackground(roundedBackgroundWithStroke(color, radiusDp, Color.WHITE, 1));
    }

    private GradientDrawable roundedBackgroundWithStroke(int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable drawable = roundedBackground(color, radiusDp);
        drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private void setRoundedBackgroundWithStroke(View view, int color, int radiusDp, int strokeColor, int strokeDp) {
        view.setBackground(roundedBackgroundWithStroke(color, radiusDp, strokeColor, strokeDp));
    }

    private void add(View v) { root.addView(v, new LinearLayout.LayoutParams(-1, -2)); }
    private void add(View v, int heightDp) { root.addView(v, new LinearLayout.LayoutParams(-1, dp(heightDp))); }

    private void band(String text, int color, int textColor, int sp, int minHeightDp) {
        TextView v = tv(text, sp, textColor, Gravity.CENTER, true);
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        int gap = halfBandGapPx();
        lp.setMargins(0, gap, 0, gap);
        v.setMinHeight(dp(minHeightDp));
        root.addView(v, lp);
    }

    private void singleLineBand(String text, int color, int textColor, int maxSp, int minSp, int minHeightDp) {
        singleLineBand(text, color, textColor, maxSp, minSp, minHeightDp, halfBandGapPx(), halfBandGapPx());
    }

    private void singleLineBand(String text, int color, int textColor, int maxSp, int minSp, int minHeightDp, int topMarginPx, int bottomMarginPx) {
        TextView v = tv(text, maxSp - 2, textColor, Gravity.CENTER, true);
        int innerMargin = compactBandPaddingPx(); // marges internes réduites
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setSingleLine(true);
        v.setMaxLines(1);
        v.setHorizontallyScrolling(false);
        v.setMinHeight(dp(minHeightDp));
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, topMarginPx, 0, bottomMarginPx);
        root.addView(v, lp);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.setAutoSizeTextTypeUniformWithConfiguration(minSp, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
        } else {
            v.post(() -> fitSingleLineLegacy(v, text, maxSp, minSp));
        }
    }

    private void upperBand(String text, int color, int textColor, int sp, int minHeightDp) {
        TextView v = tv(text, sp, textColor, Gravity.CENTER, true);
        int innerMargin = compactBandPaddingPx(); // marges internes réduites
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setMinHeight(dp(minHeightDp));
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        int gap = halfBandGapPx();
        lp.setMargins(0, gap, 0, gap);
        root.addView(v, lp);
    }

    private void fitSingleLineLegacy(TextView v, String text, int maxSp, int minSp) {
        int available = v.getWidth() - v.getPaddingLeft() - v.getPaddingRight();
        if (available <= 0) return;
        float size = maxSp;
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        while (size > minSp && v.getPaint().measureText(text == null ? "" : text) > available) {
            size -= 1f;
            v.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        }
    }

    private boolean hasAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        if (Build.VERSION.SDK_INT >= 23) return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        return true;
    }

    private void askAccess() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else if (Build.VERSION.SDK_INT >= 23) {
                requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 100);
            }
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
        }
    }

    private SQLiteDatabase openDb() { return SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE); }

    private void showHome() {
        phase = "home";
        current = null;
        gameMode = "home";
        baseFixed();
        add(tv("Culture Générale", 34, Color.WHITE, Gravity.CENTER, true));

        if (!hasAccess()) {
            band("Accès fichiers Android à autoriser", RED, Color.WHITE, 24, 54);
            Button permission = btn("Autoriser l'accès aux fichiers", 22);
            permission.setOnClickListener(v -> askAccess());
            add(permission);
            return;
        }
        if (!dbFile.exists()) {
            band("Base SQLite introuvable : " + dbFile.getAbsolutePath(),
                    RED, Color.WHITE, 20, 60);
            return;
        }

        migrateLegacyImageFlags();
        exportProblemsP(false);

        Space topSpace = new Space(this);
        root.addView(topSpace, new LinearLayout.LayoutParams(-1, 0, 1));

        Button challenge = btn("DÉFI\nQuestions aléatoires", 25);
        challenge.setSingleLine(false);
        challenge.setMaxLines(3);
        setRoundedBackgroundWithStroke(challenge, GREEN, 18, Color.WHITE, 1);
        challenge.setTextColor(Color.WHITE);
        challenge.setOnClickListener(v -> showChallengeDomains());
        LinearLayout.LayoutParams challengeLp =
                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));
        challengeLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.25f));
        root.addView(challenge, challengeLp);

        Button revision = btn("RÉVISION\nQuestions dans l'ordre", 25);
        revision.setSingleLine(false);
        revision.setMaxLines(3);
        setRoundedBackgroundWithStroke(revision, BLUE, 18, Color.WHITE, 1);
        revision.setTextColor(Color.WHITE);
        revision.setOnClickListener(v -> showRevisionModeChoice());
        LinearLayout.LayoutParams revisionLp =
                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));
        revisionLp.setMargins(0, cmToPx(0.25f), 0, cmToPx(0.2f));
        root.addView(revision, revisionLp);

        Space bottomSpace = new Space(this);
        root.addView(bottomSpace, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void showChallengeDomains() {
        phase = "challenge_domains";
        gameMode = "challenge";
        baseFixed();
        add(tv("Mode Défi", 32, Color.WHITE, Gravity.CENTER, true));

        Map<String, Long> domainCounts = countDomains();
        int gap = cmToPx(0.2f);
        int halfGap = cmToPx(0.10f);

        LinearLayout selector = new LinearLayout(this);
        selector.setOrientation(LinearLayout.VERTICAL);
        selector.setGravity(Gravity.CENTER);
        root.addView(selector, new LinearLayout.LayoutParams(-1, 0, 1));

        for (int rowIndex = 0; rowIndex < 4; rowIndex++) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER);

            for (int col = 0; col < 2; col++) {
                String d = DOMAINS[rowIndex * 2 + col];
                long n = domainCounts.getOrDefault(d, 0L);
                Button b = btn(d + "\n(" + n + ")", 22);
                b.setSingleLine(false);
                b.setMaxLines(3);
                setRoundedBackgroundWithStroke(
                        b, domainBandColor(d), 16, Color.WHITE, 1);
                b.setTextColor(domainBandTextColor(d));
                b.setOnClickListener(v -> startDomain(d));
                LinearLayout.LayoutParams lp =
                        new LinearLayout.LayoutParams(0, -1, 1);
                if (col == 0) lp.setMargins(0, 0, halfGap, 0);
                else lp.setMargins(halfGap, 0, 0, 0);
                row.addView(b, lp);
            }

            selector.addView(row, new LinearLayout.LayoutParams(-1, 0, 1));
            if (rowIndex < 3) {
                Space verticalGap = new Space(this);
                selector.addView(verticalGap,
                        new LinearLayout.LayoutParams(-1, gap));
            }
        }

        long total = 0;
        for (long value : domainCounts.values()) total += value;
        Button all = btn("Tous les domaines\n(" + total + ")", 25);
        all.setSingleLine(false);
        all.setMaxLines(3);
        setRoundedBackgroundWithStroke(all, Color.BLACK, 16, Color.WHITE, 1);
        all.setTextColor(Color.WHITE);
        all.setOnClickListener(v -> startDomain(null));
        LinearLayout.LayoutParams allLp =
                new LinearLayout.LayoutParams(-1, cmToPx(2.0f));
        allLp.setMargins(0, gap, 0, 0);
        selector.addView(all, allLp);

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> showHome());
        LinearLayout.LayoutParams backLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        backLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.2f));
        root.addView(back, backLp);
    }

    private void showRevisionModeChoice() {
        phase = "revision_mode";
        gameMode = "revision";
        baseFixed();
        add(tv("Mode Révision", 32, Color.WHITE, Gravity.CENTER, true));

        Space top = new Space(this);
        root.addView(top, new LinearLayout.LayoutParams(-1, 0, 1));

        Button normal = btn("NORMAL\nToute la base", 25);
        normal.setSingleLine(false);
        normal.setMaxLines(3);
        setRoundedBackgroundWithStroke(normal, GREEN, 18, Color.WHITE, 1);
        normal.setOnClickListener(v -> {
            revisionMode = "normal";
            showRevisionDomains();
        });
        LinearLayout.LayoutParams normalLp =
                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));
        normalLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.25f));
        root.addView(normal, normalLp);

        Button ultimate = btn("ULTIMATE\nQuestions encore disponibles", 25);
        ultimate.setSingleLine(false);
        ultimate.setMaxLines(3);
        setRoundedBackgroundWithStroke(ultimate, NAVY, 18, Color.WHITE, 1);
        ultimate.setOnClickListener(v -> {
            revisionMode = "ultimate";
            showRevisionDomains();
        });
        LinearLayout.LayoutParams ultimateLp =
                new LinearLayout.LayoutParams(-1, cmToPx(3.0f));
        ultimateLp.setMargins(0, cmToPx(0.25f), 0, cmToPx(0.2f));
        root.addView(ultimate, ultimateLp);

        Space bottom = new Space(this);
        root.addView(bottom, new LinearLayout.LayoutParams(-1, 0, 1));

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> showHome());
        root.addView(back, new LinearLayout.LayoutParams(-1, cmToPx(1.0f)));
    }

    private void showRevisionDomains() {
        phase = "revision_domains";
        baseScrollable();
        add(tv("Révision " +
                ("ultimate".equals(revisionMode) ? "Ultimate" : "Normale"),
                30, Color.WHITE, Gravity.CENTER, true));

        for (String domain : DOMAINS) {
            Button b = btn(domain, 23);
            setRoundedBackgroundWithStroke(
                    b, domainBandColor(domain), 16, Color.WHITE, 1);
            b.setTextColor(domainBandTextColor(domain));
            b.setOnClickListener(v -> {
                revisionDomain = domain;
                showRevisionLetters();
            });
            LinearLayout.LayoutParams lp =
                    new LinearLayout.LayoutParams(-1, cmToPx(1.6f));
            lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
            root.addView(b, lp);
        }

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> showRevisionModeChoice());
        LinearLayout.LayoutParams backLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        backLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.2f));
        root.addView(back, backLp);
    }

    private void showRevisionLetters() {
        phase = "revision_letters";
        baseFixed();
        add(tv(revisionDomain, 30, Color.WHITE, Gravity.CENTER, true));
        band("Choisissez la première lettre du thème",
                DARK, Color.WHITE, 20, 54);

        List<String> themes = loadOrderedRevisionThemes(revisionDomain, revisionMode);
        Map<String, Boolean> letters = new java.util.LinkedHashMap<>();
        for (String theme : themes) letters.put(themeInitial(theme), true);

        LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setGravity(Gravity.CENTER);
        root.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1));

        List<String> letterList = new ArrayList<>(letters.keySet());
        int index = 0;
        while (index < letterList.size()) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER);

            for (int col = 0; col < 5; col++) {
                if (index >= letterList.size()) {
                    Space empty = new Space(this);
                    row.addView(empty, new LinearLayout.LayoutParams(0, -1, 1));
                    continue;
                }
                String letter = letterList.get(index++);
                Button b = btn(letter, 22);
                b.setOnClickListener(v -> showRevisionThemes(letter));
                LinearLayout.LayoutParams lp =
                        new LinearLayout.LayoutParams(0, -1, 1);
                lp.setMargins(dp(3), dp(3), dp(3), dp(3));
                row.addView(b, lp);
            }
            grid.addView(row, new LinearLayout.LayoutParams(-1, 0, 1));
        }

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> showRevisionDomains());
        root.addView(back, new LinearLayout.LayoutParams(-1, cmToPx(1.0f)));
    }

    private void showRevisionThemes(String initial) {
        phase = "revision_themes";
        baseScrollable();
        add(tv("Thèmes commençant par " + initial,
                28, Color.WHITE, Gravity.CENTER, true));

        List<String> themes = loadOrderedRevisionThemes(revisionDomain, revisionMode);
        for (String theme : themes) {
            if (!initial.equals(themeInitial(theme))) continue;
            Button b = btn(theme, 22);
            b.setSingleLine(false);
            b.setMaxLines(Integer.MAX_VALUE);
            setRoundedBackgroundWithStroke(b, GREEN, 14, Color.WHITE, 1);
            b.setOnClickListener(v -> startRevisionAtTheme(theme));
            LinearLayout.LayoutParams lp =
                    new LinearLayout.LayoutParams(-1, cmToPx(1.8f));
            lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
            root.addView(b, lp);
        }

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> showRevisionLetters());
        LinearLayout.LayoutParams backLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        backLp.setMargins(0, cmToPx(0.2f), 0, cmToPx(0.2f));
        root.addView(back, backLp);
    }

    private String revisionWhereClause() {
        if ("ultimate".equals(revisionMode)) {
            return "(status IS NULL OR TRIM(status)='' OR " +
                    "UPPER(TRIM(status)) NOT IN ('M','P','T','X'))";
        }
        return "1=1";
    }

    private List<String> loadOrderedRevisionThemes(String domain, String mode) {
        List<String> themes = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT theme FROM " + TABLE +
                            " WHERE LOWER(TRIM(megatheme))=LOWER(TRIM(?))" +
                            " AND " + revisionWhereClause() +
                            " ORDER BY row_number",
                    new String[]{domain}
            );
            while (c.moveToNext()) {
                String theme = safe(c.getString(0)).trim();
                if (theme.isEmpty()) continue;
                String key = comparisonKey(theme);
                if (seen.add(key)) themes.add(theme);
            }
        } finally {
            if (c != null) c.close();
            db.close();
        }
        return themes;
    }

    private String themeInitial(String theme) {
        String value = safe(theme).trim();
        if (value.isEmpty()) return "#";
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        if (normalized.isEmpty()) return "#";
        char first = Character.toUpperCase(normalized.charAt(0));
        return Character.isLetter(first) ? String.valueOf(first) : "#";
    }

    private void startRevisionAtTheme(String theme) {
        revisionStartTheme = theme;
        revisionQuestions.clear();
        revisionQuestions.addAll(loadRevisionSequence(
                revisionDomain, theme, revisionMode));

        if (revisionQuestions.isEmpty()) {
            baseScrollable();
            band("Aucune question disponible à partir de ce thème",
                    RED, Color.WHITE, 22, 70);
            Button back = btn("Retour", 22);
            back.setOnClickListener(v -> showRevisionThemes(themeInitial(theme)));
            add(back);
            return;
        }

        revisionIndex = 0;
        revisionAnswerVisible = false;
        gameMode = "revision";
        showRevisionQuestion();
    }

    private List<Question> loadRevisionSequence(
            String domain, String startTheme, String mode) {
        List<Question> list = new ArrayList<>();
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT row_number, megatheme, theme, question, detail, " +
                            "proposition_a, proposition_b, proposition_c, proposition_d, " +
                            "correct_index, image_file, is_image FROM " + TABLE +
                            " WHERE LOWER(TRIM(megatheme))=LOWER(TRIM(?))" +
                            " AND " + revisionWhereClause() +
                            " ORDER BY row_number",
                    new String[]{domain}
            );

            boolean started = false;
            String startKey = comparisonKey(startTheme);
            while (c.moveToNext()) {
                String theme = safe(c.getString(2));
                if (!started && startKey.equals(comparisonKey(theme))) started = true;
                if (!started) continue;
                list.add(questionFromCursor(c));
            }
        } finally {
            if (c != null) c.close();
            db.close();
        }
        return list;
    }

    private void showRevisionQuestion() {
        phase = "revision_question";
        gameMode = "revision";
        baseFixed();

        if (revisionQuestions.isEmpty() ||
                revisionIndex < 0 || revisionIndex >= revisionQuestions.size()) {
            showRevisionThemes(themeInitial(revisionStartTheme));
            return;
        }

        Question q = revisionQuestions.get(revisionIndex);
        current = q;

        upperBand(q.theme, GREEN, Color.WHITE, 25, 48);
        TextView themeView = (TextView) root.getChildAt(root.getChildCount() - 1);
        themeView.setSingleLine(false);
        themeView.setMaxLines(3);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            themeView.setAutoSizeTextTypeUniformWithConfiguration(
                    14, 25, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        upperBand(q.question, RED, Color.WHITE, 25, 58);
        TextView questionView = (TextView) root.getChildAt(root.getChildCount() - 1);
        questionView.setSingleLine(false);
        questionView.setMaxLines(3);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            questionView.setAutoSizeTextTypeUniformWithConfiguration(
                    14, 25, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        if (q.isImage) {
            addRevisionImage(q.imageFile);
        } else if (!q.detail.trim().isEmpty()) {
            addRevisionDetail(q.detail);
        } else {
            Space middle = new Space(this);
            root.addView(middle, new LinearLayout.LayoutParams(-1, 0, 1));
        }

        if (revisionAnswerVisible) {
            addRevisionAnswer(q);
            addRevisionAssimilateButton(q);
        } else {
            addRevisionHiddenAnswerSpace();
        }

        addRevisionPager();
        setContentView(screenRoot);
    }

    private void addRevisionDetail(String detail) {
        FrameLayout host = new FrameLayout(this);
        host.setBackgroundColor(Color.BLACK);

        TextView detailView = tv(detail, 22, Color.BLACK, Gravity.CENTER, true);
        detailView.setPadding(cmToPx(0.2f), cmToPx(0.5f),
                cmToPx(0.2f), cmToPx(0.5f));
        detailView.setSingleLine(false);
        detailView.setMaxLines(Integer.MAX_VALUE);
        detailView.setGravity(Gravity.CENTER);
        detailView.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        setRoundedBackgroundWithStroke(
                detailView, YELLOW, 14, Color.WHITE, 1);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            detailView.setAutoSizeTextTypeUniformWithConfiguration(
                    18, 24, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        FrameLayout.LayoutParams detailLp =
                new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        host.addView(detailView, detailLp);
        root.addView(host, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void addRevisionImage(String imageFileName) {
        FrameLayout area = new FrameLayout(this);
        area.setBackgroundColor(Color.BLACK);
        File file = imageFile(imageFileName);
        Bitmap bitmap = file != null && file.exists() ? decode(file) : null;

        if (bitmap == null) {
            TextView missing = tv("Image introuvable",
                    20, Color.WHITE, Gravity.CENTER, true);
            area.addView(missing,
                    new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        } else {
            ImageView image = new ImageView(this);
            image.setImageBitmap(bitmap);
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            area.addView(image,
                    new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        }
        root.addView(area, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void addRevisionAnswer(Question q) {
        String answer = q.correct >= 1 && q.correct <= 4
                ? q.props[q.correct - 1] : "";
        TextView answerView = tv(answer, 22, Color.WHITE, Gravity.CENTER, true);
        answerView.setSingleLine(false);
        answerView.setMaxLines(4);
        setRoundedBackgroundWithStroke(
                answerView, GREEN, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.6f));
        lp.setMargins(dp(10), halfBandGapPx(),
                dp(10), halfBandGapPx());
        screenRoot.addView(answerView, lp);
    }

    private void addRevisionAssimilateButton(Question q) {
        Button assimilate = btn(
                isQuestionMentallyAssimilated(q.row) ? "Déjà assimilée" : "Assimiler",
                22);
        setRoundedBackgroundWithStroke(
                assimilate, NAVY, 14, Color.WHITE, 1);
        assimilate.setEnabled(!isQuestionMentallyAssimilated(q.row));
        assimilate.setOnClickListener(v -> assimilateRevisionQuestion(q));

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        lp.setMargins(dp(10), 0, dp(10), cmToPx(0.2f));
        screenRoot.addView(assimilate, lp);
    }

    private void addRevisionHiddenAnswerSpace() {
        Space answer = new Space(this);
        screenRoot.addView(answer,
                new LinearLayout.LayoutParams(-1,
                        cmToPx(1.6f) + (2 * halfBandGapPx())));
        Space assimilate = new Space(this);
        screenRoot.addView(assimilate,
                new LinearLayout.LayoutParams(-1,
                        cmToPx(1.0f) + cmToPx(0.2f)));
    }

    private boolean isQuestionMentallyAssimilated(long row) {
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT status FROM " + TABLE +
                            " WHERE row_number=? LIMIT 1",
                    new String[]{String.valueOf(row)}
            );
            return c.moveToFirst() &&
                    "M".equalsIgnoreCase(safe(c.getString(0)).trim());
        } finally {
            if (c != null) c.close();
            db.close();
        }
    }

    private void assimilateRevisionQuestion(Question q) {
        updateStatusForRow("M", q.row);

        if ("ultimate".equals(revisionMode)) {
            revisionQuestions.remove(revisionIndex);
            if (revisionQuestions.isEmpty()) {
                showRevisionThemes(themeInitial(revisionStartTheme));
                return;
            }
            if (revisionIndex >= revisionQuestions.size()) {
                revisionIndex = revisionQuestions.size() - 1;
            }
        } else if (revisionIndex < revisionQuestions.size() - 1) {
            revisionIndex++;
        }

        revisionAnswerVisible = false;
        showRevisionQuestion();
    }

    private void addRevisionPager() {
        LinearLayout pager = new LinearLayout(this);
        pager.setOrientation(LinearLayout.HORIZONTAL);
        pager.setGravity(Gravity.CENTER);
        int gap = cmToPx(0.2f);

        Button previous = btn("←", 22);
        previous.setVisibility(revisionIndex > 0 ? View.VISIBLE : View.INVISIBLE);
        previous.setOnClickListener(v -> {
            if (revisionIndex <= 0) return;
            revisionIndex--;
            revisionAnswerVisible = true;
            showRevisionQuestion();
        });

        TextView position = tv(
                (revisionIndex + 1) + " / " + revisionQuestions.size(),
                22, Color.WHITE, Gravity.CENTER, true);
        setRoundedBackgroundWithStroke(
                position, DARK, 14, Color.WHITE, 1);

        Button next = btn("→", 22);
        boolean atLast = revisionIndex >= revisionQuestions.size() - 1;
        next.setVisibility(atLast && revisionAnswerVisible
                ? View.INVISIBLE : View.VISIBLE);
        next.setOnClickListener(v -> {
            if (!revisionAnswerVisible) {
                revisionAnswerVisible = true;
            } else if (revisionIndex < revisionQuestions.size() - 1) {
                revisionIndex++;
                revisionAnswerVisible = false;
            }
            showRevisionQuestion();
        });

        LinearLayout.LayoutParams leftLp =
                new LinearLayout.LayoutParams(0, cmToPx(1.25f), 1);
        leftLp.setMargins(0, 0, gap / 2, 0);
        pager.addView(previous, leftLp);

        LinearLayout.LayoutParams centerLp =
                new LinearLayout.LayoutParams(0, cmToPx(1.25f), 1);
        centerLp.setMargins(gap / 2, 0, gap / 2, 0);
        pager.addView(position, centerLp);

        LinearLayout.LayoutParams rightLp =
                new LinearLayout.LayoutParams(0, cmToPx(1.25f), 1);
        rightLp.setMargins(gap / 2, 0, 0, 0);
        pager.addView(next, rightLp);

        screenRoot.addView(pager,
                new LinearLayout.LayoutParams(-1, cmToPx(1.25f)));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);

        Button back = btn("Retour", 22);
        back.setOnClickListener(v ->
                showRevisionThemes(themeInitial(revisionStartTheme)));
        Button end = btn("Fin", 22);
        setRoundedBackgroundWithStroke(end, BLUE, 14, Color.WHITE, 1);
        end.setOnClickListener(v -> showHome());

        LinearLayout.LayoutParams actionLeft =
                new LinearLayout.LayoutParams(0, cmToPx(1.0f), 1);
        actionLeft.setMargins(0, cmToPx(0.2f), gap / 2, cmToPx(0.2f));
        actions.addView(back, actionLeft);

        LinearLayout.LayoutParams actionRight =
                new LinearLayout.LayoutParams(0, cmToPx(1.0f), 1);
        actionRight.setMargins(gap / 2, cmToPx(0.2f), 0, cmToPx(0.2f));
        actions.addView(end, actionRight);

        screenRoot.addView(actions,
                new LinearLayout.LayoutParams(-1, cmToPx(1.4f)));
    }

    private Map<String, Long> countDomains() {
        Map<String, Long> map = new HashMap<>();
        for (String d : DOMAINS) map.put(d, 0L);
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery("SELECT megatheme, COUNT(*) FROM " + TABLE + " WHERE " + availableWhere(false) + " GROUP BY megatheme", null);
            try {
                while (c.moveToNext()) {
                    String d = normalize(c.getString(0));
                    long n = c.getLong(1);
                    map.put(d, (map.containsKey(d) ? map.get(d) : 0) + n);
                }
            } finally { c.close(); }
        } finally { db.close(); }
        return map;
    }

    private long countSql(String sql) {
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery(sql, null);
            try { return c.moveToFirst() ? c.getLong(0) : 0; }
            finally { c.close(); }
        } finally { db.close(); }
    }

    private String availableWhere(boolean domain) {
    // Questions réellement disponibles : non assimilées mentalement et non exclues.
    // Les questions posées classiquement restent disponibles, mais ne sont reprises
    // qu'après épuisement des questions jamais posées.
    String w = "(status IS NULL OR TRIM(status)='' OR UPPER(TRIM(status)) NOT IN ('M','P','T','X'))";
    if (domain) w += " AND LOWER(TRIM(megatheme))=LOWER(TRIM(?))";
    return w;
}

    private String playableWhere(boolean domain) {
    // Pot recyclable : utilisé uniquement lorsque toutes les questions jamais posées
    // du mégathème ont été vues. M, P, T et X restent exclues.
    return availableWhere(domain);
}

    private String neverAskedWhere(boolean domain) {
    // Priorité absolue : tirer uniquement les questions jamais posées.
    // Les questions déjà vues ne reviennent qu'après épuisement de ce stock.
    String w = "(status IS NULL OR TRIM(status)='')";
    if (domain) w += " AND LOWER(TRIM(megatheme))=LOWER(TRIM(?))";
    return w;
}

    private void startDomain(String domain) {
        gameMode = "challenge";
        currentDomain = domain;
        answered = mentalOk = classicOk = revised = goodStreak = classicStreak = bestGoodStreak = mentalStreak = bestMentalStreak = 0;
        lastQuestionsPopupAt = 0;
        lastMentalPopupAt = 0;
        lastCombinedPopupAt = 0;
        remainingInCurrentDomain = countRemaining(currentDomain);
        askedThisSession.clear();
        history.clear();
        wrongAnswers.clear();
        goodThemesThisSession.clear();
        historyIndex = -1;
        prefetchedNextQuestion = null;
        prefetchedRelatedQuestions = null;
        prefetchedRelatedThemeKey = "";
        prefetchedRelatedQuestionKey = "";
        nextQuestion();
    }

    private void nextQuestion() {
        try {
            // Recalcul uniquement au moment du tirage d'une nouvelle question :
            // R = questions disponibles non assimilées mentalement, hors P/T/X.
            remainingInCurrentDomain = countRemaining(currentDomain);
            Question q = takePrefetchedNextQuestion();
            if (q == null) q = loadFreshQuestion(currentDomain);
            if (q == null) {
                baseScrollable();
                band("Aucune question jouable", RED, Color.WHITE, 24, 70);
                Button b = btn("Nouvelle partie", 20);
                b.setOnClickListener(v -> showHome());
                add(b);
                return;
            }
            current = q;
            askedThisSession.add(q.row);
            if (historyIndex < history.size() - 1) {
                while (history.size() > historyIndex + 1) history.remove(history.size() - 1);
            }
            history.add(q);
            historyIndex = history.size() - 1;
            showQuestion();
            startBackgroundPreloadForCurrentQuestion();
        } catch (Exception e) {
            baseScrollable();
            band("Erreur : " + e.getMessage(), RED, Color.WHITE, 18, 90);
            Button b = btn("Nouvelle partie", 20);
            b.setOnClickListener(v -> showHome());
            add(b);
        }
    }

    private synchronized Question takePrefetchedNextQuestion() {
        Question q = prefetchedNextQuestion;
        prefetchedNextQuestion = null;
        if (q != null && askedThisSession.contains(q.row)) return null;
        return q;
    }

    private void startBackgroundPreloadForCurrentQuestion() {
        final Question snapshot = current;
        final String domainSnapshot = currentDomain;
        if (snapshot == null || screenRoot == null) return;

        // Un seul préchargement léger, décalé après l'affichage. On évite ainsi deux
        // lectures SQLite concurrentes pendant que l'utilisateur ouvre les propositions.
        screenRoot.postDelayed(() -> new Thread(() -> {
            try {
                Question next = loadFreshQuestion(domainSnapshot);
                synchronized (MainActivity.this) {
                    if (current == snapshot && next != null && !askedThisSession.contains(next.row)) {
                        prefetchedNextQuestion = next;
                    }
                }
            } catch (Exception ignored) { }
        }).start(), 700);
    }

    private synchronized List<Question> takePrefetchedRelatedQuestions(String theme, String question) {
        return null;
    }

    private Question loadFreshQuestion(String domain) {
        Question q = null;

        // Phase 1 : tant qu'il existe des questions jamais posées, on ne tire que celles-là.
        for (int tries = 0; tries < 60; tries++) {
            q = loadRandom(domain, true);
            if (q == null) break;
            if (!askedThisSession.contains(q.row)) return q;
        }

        // Phase 2 : lorsque toutes les questions jamais posées ont été vues,
        // on remet dans le pot les questions classiques / à revoir, mais jamais M/P/T/X.
        for (int tries = 0; tries < 60; tries++) {
            q = loadRandom(domain, false);
            if (q == null) return null;
            if (!askedThisSession.contains(q.row)) return q;
        }
        return q;
    }

    private Question loadRandom(String domain) {
        return loadRandom(domain, false);
    }

    private Question loadRandom(String domain, boolean onlyNeverAsked) {
        SQLiteDatabase db = openDb();
        try {
            String where = onlyNeverAsked ? neverAskedWhere(domain != null) : playableWhere(domain != null);
            String[] args = domain == null ? null : new String[]{domain};
            Cursor cc = db.rawQuery("SELECT COUNT(*) FROM " + TABLE + " WHERE " + where, args);
            int count;
            try { count = cc.moveToFirst() ? cc.getInt(0) : 0; }
            finally { cc.close(); }
            if (count <= 0) return null;
            int offset = random.nextInt(count);
            String sql = "SELECT row_number, megatheme, theme, question, detail, proposition_a, proposition_b, proposition_c, proposition_d, correct_index, image_file, is_image " +
                    "FROM " + TABLE + " WHERE " + where + " LIMIT 1 OFFSET " + offset;
            Cursor c = db.rawQuery(sql, args);
            try {
                if (!c.moveToFirst()) return null;
                Question q = new Question();
                q.row = c.getLong(0);
                q.domain = normalize(c.getString(1));
                q.theme = safe(c.getString(2));
                q.question = safe(c.getString(3));
                q.detail = safe(c.getString(4));
                for (int i = 0; i < 4; i++) q.props[i] = safe(c.getString(5 + i));
                q.correct = c.getInt(9);
                if (q.correct < 1 || q.correct > 4) q.correct = 1;
                q.imageFile = safe(c.getString(10));
                q.isImage = c.getInt(11) == 1 || q.imageFile.length() > 0;
                return q;
            } finally { c.close(); }
        } finally { db.close(); }
    }

    private void showQuestion() {
    phase = "question";
    baseFixed();
    addCompactStatsBar();
    addOneMillimeterGap();

    // Bandeau vert
    upperBand(current.theme, GREEN, Color.WHITE, 25, 48);
    TextView themeView = (TextView) root.getChildAt(root.getChildCount() - 1);
    themeView.setSingleLine(false);
    themeView.setMaxLines(3);
    themeView.setAutoSizeTextTypeWithDefaults(TextView.AUTO_SIZE_TEXT_TYPE_UNIFORM);
    themeView.setAutoSizeTextTypeUniformWithConfiguration(11, 25, 1, TypedValue.COMPLEX_UNIT_SP);

    // Bandeau rouge
    upperBand(current.question, RED, Color.WHITE, 25, 58);
    TextView questionView = (TextView) root.getChildAt(root.getChildCount() - 1);
    questionView.setSingleLine(false);
    questionView.setMaxLines(3);
    questionView.setAutoSizeTextTypeWithDefaults(TextView.AUTO_SIZE_TEXT_TYPE_UNIFORM);
    questionView.setAutoSizeTextTypeUniformWithConfiguration(11, 25, 1, TypedValue.COMPLEX_UNIT_SP);

    // Bandeau jaune
    if (current.detail.length() > 0) {
        upperBand(current.detail, YELLOW, Color.BLACK, 25, 62);
        TextView detailView = (TextView) root.getChildAt(root.getChildCount() - 1);
        detailView.setSingleLine(false);
        detailView.setMaxLines(Integer.MAX_VALUE);
        detailView.setAutoSizeTextTypeWithDefaults(TextView.AUTO_SIZE_TEXT_TYPE_UNIFORM);
        detailView.setAutoSizeTextTypeUniformWithConfiguration(12, 25, 1, TypedValue.COMPLEX_UNIT_SP);
    }

    // Image ou espace
    if (current.isImage) {
        showImageCentered();
    } else {
        Space spacer = new Space(this);
        root.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    // Barre du bas
    setQuestionBottomBar();
}


    private void showChoices() {
        phase = "choices";
        baseFixed();
        addCompactStatsBar();
        addOneMillimeterGap();
        for (int i = 1; i <= 4; i++) {
            final int idx = i;
            Button b = btn(current.props[i - 1], 22);
            setRoundedBackgroundWithStroke(b, GREY, 18, Color.WHITE, 1);
            b.setTextColor(Color.WHITE);
            b.setOnClickListener(v -> answerChoice(idx));
            choiceButtons[i - 1] = b;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1);
            lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
            root.addView(b, lp);
        }
        setChoicesBottomBar();
    }

    private void revealMental() {
        phase = "reveal";
        baseFixed();
        addCompactStatsBar();
        addOneMillimeterGap();
        for (int i = 1; i <= 4; i++) {
            Button b = btn(current.props[i - 1], 22);
            b.setEnabled(false);
            b.setTextColor(Color.WHITE);
            setRoundedBackgroundWithStroke(b, i == current.correct ? Color.rgb(0, 165, 65) : GREY, 18, Color.WHITE, 1);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1);
            lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
            root.addView(b, lp);
        }
        setRevealBottomBar();
    }

    private void showChoiceResult(int chosenChoice) {
        phase = "result";
        for (int i = 1; i <= 4; i++) {
            Button b = choiceButtons[i - 1];
            if (b == null) continue;
            b.setEnabled(false);
            if (i == current.correct) setRoundedBackgroundWithStroke(b, Color.rgb(0, 165, 65), 18, Color.WHITE, 1);
            else if (i == chosenChoice) setRoundedBackgroundWithStroke(b, Color.rgb(190, 25, 25), 18, Color.WHITE, 1);
            else setRoundedBackgroundWithStroke(b, GREY, 18, Color.WHITE, 1);
        }
        setBottomBarEnabled(false);
        // La couleur des propositions constitue désormais l'unique retour visuel.
    }

    private void setQuestionBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("Menu", RED, v -> showMainMenu());
        addBottomButton("←", BLUE, v -> goBackFromGameScreen());
        addBottomButton("Propositions", GREEN, v -> showChoices());
    }

    private void setChoicesBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("Menu", RED, v -> showMainMenu());
        addBottomButton("←", BLUE, v -> showQuestion());
        addBottomButton("Révéler", GREEN, v -> revealMental());
    }

    private void setRevealBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("À revoir", RED, v -> finish("R"));
        addBottomButton("Menu", BLUE, v -> showMainMenu());
        addBottomButton("Assimilée", GREEN, v -> finish("M"));
    }

    private void addBottomButton(String text, int color, View.OnClickListener listener) {
        Button b = btn(text, 17);
        setRoundedBackground(b, color, 16);
        b.setTextColor(Color.WHITE);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1);
        lp.setMargins(halfBandGapPx(), halfBandGapPx(), halfBandGapPx(), halfBandGapPx());
        bottomBar.addView(b, lp);
    }

    private void setBottomBarEnabled(boolean enabled) {
        if (bottomBar == null) return;
        for (int i = 0; i < bottomBar.getChildCount(); i++) {
            bottomBar.getChildAt(i).setEnabled(enabled);
        }
    }

    private void showTransientMessage(String message, int color) {
    // Désactivé volontairement
}

    private void goBackFromGameScreen() {
        hideActionPanel();
        if ("choices".equals(phase) || "reveal".equals(phase) || "result".equals(phase)) {
            showQuestion();
        } else if (historyIndex > 0) {
            previousQuestion();
        } else {
            showHome();
        }
    }

    private void showProblemMenu() {
        if (actionPanelHost != null && actionPanelHost.getVisibility() == View.VISIBLE &&
                "problem".equals(actionPanelHost.getTag())) {
            hideActionPanel();
            return;
        }
        LinearLayout panel = createRightActionPanel();
        addActionPanelButton(panel, "P - Problème ponctuel", RED, cmToPx(1.0f), v -> {
            hideActionPanel();
            flagAndNext("P", "Problème noté");
        });
        addActionPanelButton(panel, "T - Contenu analogue", RED, cmToPx(1.0f), v -> {
            hideActionPanel();
            flagAndNext("T", "Contenu analogue exclu");
        });
        showActionPanel(panel, "problem", 0);
    }

    private void showMainMenu() {
        if (actionPanelHost != null && actionPanelHost.getVisibility() == View.VISIBLE &&
                "menu".equals(actionPanelHost.getTag())) {
            hideActionPanel();
            return;
        }

        LinearLayout panel = createRightActionPanel();

        addActionPanelButton(panel, "Fin de partie", RED, cmToPx(1.0f), v -> {
            hideActionPanel();
            showEndScreen();
        });

        addActionPanelButton(panel, "Signaler", GREY, cmToPx(1.0f), v -> {
            showSignalSubmenu();
        });

        addActionPanelButton(panel, "Assimiler", NAVY, cmToPx(1.0f), v -> {
            showAssimilateSubmenu();
        });

        showActionPanel(panel, "menu", 0);
    }

    private void showSignalSubmenu() {
        LinearLayout panel = createRightActionPanel();

        addActionPanelButton(panel, "Contenu analogue", RED, cmToPx(1.0f), v -> {
            hideActionPanel();
            flagAndNext("T", "Contenu analogue exclu");
        });

        addActionPanelButton(panel, "Problème ponctuel", RED, cmToPx(1.0f), v -> {
            hideActionPanel();
            flagAndNext("P", "Problème noté");
        });

        addActionPanelButton(panel, "Retour", GREY, cmToPx(1.0f), v -> showMainMenu());
        showActionPanel(panel, "signal_submenu", 0);
    }

    private void showAssimilateSubmenu() {
        LinearLayout panel = createRightActionPanel();

        addActionPanelButton(panel, "Mauvaises réponses", GREY, cmToPx(1.0f), v -> {
            hideActionPanel();
            showWrongAnswersScreen();
        });

        addActionPanelButton(panel, "Bonnes réponses", GREEN, cmToPx(1.0f), v -> {
            hideActionPanel();
            showGoodAnswersScreen();
        });

        addActionPanelButton(panel, "Retour", GREY, cmToPx(1.0f), v -> showMainMenu());
        showActionPanel(panel, "assimilate_submenu", 0);
    }

    private LinearLayout createRightActionPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(4), dp(4), dp(4), dp(4));
        setRoundedBackground(panel, DARK, 18);
        return panel;
    }

    private void addActionPanelButton(LinearLayout panel, String text, int color, int heightPx, View.OnClickListener listener) {
        Button b = btn(text, 18);
        b.setSingleLine(true);
        b.setMaxLines(1);
        b.setGravity(Gravity.CENTER);
        b.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        setRoundedBackground(b, color, 15);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, heightPx);
        lp.setMargins(halfBandGapPx(), halfBandGapPx(), halfBandGapPx(), halfBandGapPx());
        panel.addView(b, lp);
    }

    private void showRightActionPanel(LinearLayout panel, String tag) {
        showActionPanel(panel, tag, 2);
    }

    private void showActionPanel(LinearLayout panel, String tag, int columnIndex) {
        hideActionPanel();
        if (actionPanelHost == null) return;
        LinearLayout.LayoutParams panelLp = new LinearLayout.LayoutParams(-1, -2);
        panelLp.setMargins(dp(10), 0, dp(10), halfBandGapPx());
        actionPanelHost.addView(panel, panelLp);
        actionPanelHost.setTag(tag);
        actionPanelHost.setVisibility(View.VISIBLE);
    }

    private void showStatsMenu() {
        String message;
        try {
            message = "Base en temps réel\n" +
                    "Assimilées mentales (M) : " + countStatus("M") + "\n" +
                    "À revoir (R) : " + countStatus("R") + "\n" +
                    "Problèmes (P) : " + countStatus("P") + "\n" +
                    "Contenus analogues exclus (T) : " + countStatus("T") + "\n" +
                    "Exclusions manuelles (X) : " + countStatus("X");
        } catch (Exception e) {
            message = "Statistiques base indisponibles : " + e.getMessage();
        }

        new AlertDialog.Builder(this)
                .setTitle("Statistiques détaillées")
                .setMessage(message)
                .setPositiveButton("Fermer", null)
                .show();
    }

    private void showImageCentered() {
        FrameLayout imageArea = new FrameLayout(this);
        imageArea.setBackgroundColor(Color.BLACK);
        imageArea.setPadding(dp(6), dp(6), dp(6), dp(6));
        LinearLayout.LayoutParams areaLp = new LinearLayout.LayoutParams(-1, 0, 1);
        areaLp.setMargins(0, dp(4), 0, dp(4));
        root.addView(imageArea, areaLp);

        File f = imageFile(current.imageFile);
        Bitmap bm = (f != null && f.exists()) ? decode(f) : null;
        if (bm == null) {
            TextView missing = tv("Image introuvable : " + current.imageFile, 18, Color.WHITE, Gravity.CENTER, true);
            setRoundedBackground(missing, RED, 14);
            FrameLayout.LayoutParams missingLp = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
            missingLp.setMargins(dp(12), dp(12), dp(12), dp(12));
            imageArea.addView(missing, missingLp);
            return;
        }

        ImageView iv = new ImageView(this);
        iv.setImageBitmap(bm);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        iv.setBackgroundColor(Color.BLACK);
        FrameLayout.LayoutParams ivLp = new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER);
        imageArea.addView(iv, ivLp);
    }

    private File imageFile(String name) {
        if (name == null || name.trim().length() == 0) return null;
        String n = name.trim();
        File direct = new File(imagesFolder, n);
        if (direct.exists()) return direct;
        String lower = n.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".bmp")) return direct;
        for (String ext : IMG_EXT) {
            File f = new File(imagesFolder, n + ext);
            if (f.exists()) return f;
        }
        return direct;
    }

    private Bitmap decode(File f) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getAbsolutePath(), o);
            int sample = 1;
            while ((o.outWidth / sample) > 1300 || (o.outHeight / sample) > 760) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            return BitmapFactory.decodeFile(f.getAbsolutePath(), o2);
        } catch (Exception e) { return null; }
    }

    private void showEndScreen() {
        if (!"end".equals(phase) && !"wrong_answers".equals(phase) && !"wrong_detail".equals(phase) && !"good_answers".equals(phase)) {
            phaseBeforeEnd = phase;
        }
        phase = "end";
        baseFixed();

        band("Score : " + goodStreak, DARK, Color.WHITE, 26, 64);

        Space flexibleSpace = new Space(this);
        root.addView(flexibleSpace, new LinearLayout.LayoutParams(-1, 0, 1));

        Button good = btn("Bonnes réponses", 26);
        good.setOnClickListener(v -> showGoodAnswersScreen());
        addEndButton(good, false);

        Button wrong = btn("Mauvaises réponses", 26);
        wrong.setOnClickListener(v -> showWrongAnswersScreen());
        addEndButton(wrong, true);

        Button resume = btn("Reprendre la partie", 26);
        resume.setOnClickListener(v -> resumeGame());
        addEndButton(resume, true);

        Button newGame = btn("Nouvelle partie", 26);
        newGame.setOnClickListener(v -> showHome());
        addEndButton(newGame, true);

        Button quit = btn("Quitter la partie", 26);
        setRoundedBackground(quit, RED, 16);
        quit.setOnClickListener(v -> finishAffinity());
        addEndButton(quit, true);
    }

    private void resumeGame() {
        if (current == null) {
            showHome();
            return;
        }
        if ("choices".equals(phaseBeforeEnd)) showChoices();
        else if ("reveal".equals(phaseBeforeEnd)) revealMental();
        else showQuestion();
    }

    private void addEndButton(Button button, boolean addTopGap) {
        button.setGravity(Gravity.CENTER);
        button.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, addTopGap ? cmToPx(0.5f) : 0, 0, 0);
        root.addView(button, lp);
    }

    private void rememberGoodTheme(Question q) {
        if (q == null || q.theme == null || q.theme.trim().isEmpty()) return;
        String key = comparisonKey(q.theme);
        // Une nouvelle bonne réponse replace le thème en tête de la consultation.
        goodThemesThisSession.remove(key);
        goodThemesThisSession.put(key, q);
    }

    private void showGoodAnswersScreen() {
        phase = "good_answers";
        baseScrollable();

        List<Question> themes = new ArrayList<>(goodThemesThisSession.values());
        java.util.Collections.reverse(themes);

        if (themes.isEmpty()) {
            reviewBand("Aucun thème disponible issu d'une bonne réponse dans cette session",
                    DARK, Color.WHITE);
        } else {
            for (Question q : themes) {
                Button themeButton = btn(q.theme, 22);
                themeButton.setGravity(Gravity.CENTER);
                themeButton.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
                themeButton.setSingleLine(false);
                themeButton.setMaxLines(Integer.MAX_VALUE);
                setRoundedBackgroundWithStroke(themeButton, GREEN, 14, Color.WHITE, 1);
                themeButton.setTextColor(Color.WHITE);
                themeButton.setOnClickListener(v -> {
                    trioReturnMode = "good";
                    showGoodAnswerDetailPage(q);
                });

                LinearLayout.LayoutParams lp =
                        new LinearLayout.LayoutParams(-1, cmToPx(2.0f));
                lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
                root.addView(themeButton, lp);
            }
        }

        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        Button finishButton = btn("Fin de partie", 22);
        setRoundedBackgroundWithStroke(finishButton, BLUE, 14, Color.WHITE, 1);
        finishButton.setTextColor(Color.WHITE);
        finishButton.setOnClickListener(v -> showEndScreen());
        LinearLayout.LayoutParams finishLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        finishLp.setMargins(dp(10), 0, dp(10), cmToPx(0.2f));
        bottomBar.addView(finishButton, finishLp);
    }

    private boolean hasAvailableThemeQuestion(Question q) {
        if (q == null) return false;
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT 1 FROM " + TABLE +
                            " WHERE (status IS NULL OR TRIM(status)='' OR " +
                            "UPPER(TRIM(status)) NOT IN ('M','P','T','X'))" +
                            " AND LOWER(TRIM(theme))=LOWER(TRIM(?))" +
                            " AND LOWER(TRIM(question))=LOWER(TRIM(?)) LIMIT 1",
                    new String[]{safe(q.theme), safe(q.question)}
            );
            return c.moveToFirst();
        } finally {
            if (c != null) c.close();
            db.close();
        }
    }

    private void showGoodAnswerDetailPage(Question q) {
        WrongAnswer synthetic = new WrongAnswer(q, q.correct);
        trioReturnMode = "good";
        showWrongAnswerDetailPage(synthetic);
    }

    private void showWrongAnswersScreen() {
        if (wrongAnswers.isEmpty()) {
            phase = "wrong_answers";
            baseScrollable();
            reviewBand("Aucune mauvaise réponse dans cette session", DARK, Color.WHITE);
            Button back = btn("Fin de partie", 22);
            back.setOnClickListener(v -> showEndScreen());
            add(back);
            return;
        }
        showWrongAnswerPage(0);
    }

    private void showWrongAnswerPage(int pageIndex) {
        phase = "wrong_answers";
        int maxIndex = wrongAnswers.size() - 1;
        wrongAnswerPageIndex = Math.max(0, Math.min(pageIndex, maxIndex));
        WrongAnswer w = wrongAnswers.get(maxIndex - wrongAnswerPageIndex);

        screenRoot = new LinearLayout(this);
        screenRoot.setOrientation(LinearLayout.VERTICAL);
        screenRoot.setBackgroundColor(Color.BLACK);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        FrameLayout centeredHost = new FrameLayout(this);
        centeredHost.setBackgroundColor(Color.BLACK);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(10), dp(8), dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        FrameLayout.LayoutParams rootLp = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        centeredHost.addView(root, rootLp);
        scroll.addView(centeredHost, new ScrollView.LayoutParams(-1, -1));
        screenRoot.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        TextView theme = tv(w.theme == null || w.theme.trim().isEmpty() ? "Sans thème" : w.theme,
                24, Color.WHITE, Gravity.CENTER, true);
        theme.setSingleLine(false);
        theme.setMaxLines(Integer.MAX_VALUE);
        theme.setGravity(Gravity.CENTER);
        theme.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        theme.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(theme, GREEN, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams themeLp = new LinearLayout.LayoutParams(-1, -2);
        themeLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        root.addView(theme, themeLp);

        reviewBand(w.question, RED, Color.WHITE);
        addWrongAnswerPrimary(w);

        // Toute la zone de consultation ouvre la page du trio.
        View.OnClickListener openTrio = v -> {
            trioReturnMode = "wrong";
            showWrongAnswerDetailPage(w);
        };
        root.setClickable(true);
        root.setOnClickListener(openTrio);
        centeredHost.setClickable(true);
        centeredHost.setOnClickListener(openTrio);
        theme.setOnClickListener(openTrio);

        LinearLayout pager = new LinearLayout(this);
        pager.setOrientation(LinearLayout.HORIZONTAL);
        pager.setGravity(Gravity.CENTER);
        pager.setPadding(dp(10), 0, dp(10), 0);
        int gap = cmToPx(0.2f);
        int pagerHeight = cmToPx(1.20f);

        Button previous = btn("←", 22);
        setRoundedBackgroundWithStroke(previous, GREY, 14, Color.WHITE, 1);
        previous.setOnClickListener(v -> showWrongAnswerPage(wrongAnswerPageIndex - 1));
        if (wrongAnswerPageIndex == 0) previous.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams previousLp = new LinearLayout.LayoutParams(0, pagerHeight, 1);
        previousLp.setMargins(0, 0, gap / 2, 0);
        pager.addView(previous, previousLp);

        TextView position = tv((wrongAnswerPageIndex + 1) + " / " + wrongAnswers.size(),
                22, Color.WHITE, Gravity.CENTER, true);
        position.setSingleLine(true);
        position.setGravity(Gravity.CENTER);
        position.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        setRoundedBackgroundWithStroke(position, DARK, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams positionLp = new LinearLayout.LayoutParams(0, pagerHeight, 1);
        positionLp.setMargins(gap / 2, 0, gap / 2, 0);
        pager.addView(position, positionLp);

        Button next = btn("→", 22);
        setRoundedBackgroundWithStroke(next, GREY, 14, Color.WHITE, 1);
        next.setOnClickListener(v -> showWrongAnswerPage(wrongAnswerPageIndex + 1));
        if (wrongAnswerPageIndex == maxIndex) next.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams nextLp = new LinearLayout.LayoutParams(0, pagerHeight, 1);
        nextLp.setMargins(gap / 2, 0, 0, 0);
        pager.addView(next, nextLp);

        LinearLayout.LayoutParams pagerLp = new LinearLayout.LayoutParams(-1, -2);
        pagerLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        screenRoot.addView(pager, pagerLp);

        Button fixedBack = btn("Fin de partie", 22);
        setRoundedBackgroundWithStroke(fixedBack, BLUE, 14, Color.WHITE, 1);
        fixedBack.setOnClickListener(v -> showEndScreen());
        fixedBack.setMinHeight(dp(54));
        LinearLayout.LayoutParams fixedLp = new LinearLayout.LayoutParams(-1, -2);
        fixedLp.setMargins(dp(10), halfBandGapPx(), dp(10), halfBandGapPx());
        screenRoot.addView(fixedBack, fixedLp);

        actionPanelHost = new LinearLayout(this);
        actionPanelHost.setVisibility(View.GONE);
        bottomBar = new LinearLayout(this);
        bottomBar.setVisibility(View.GONE);
        setContentView(screenRoot);
    }

    private void showWrongAnswerDetailPage(WrongAnswer w) {
        if (!"good".equals(trioReturnMode)) trioReturnMode = "wrong";
        phase = "wrong_detail";
        trioSourceWrongAnswer = w;
        trioQuestions.clear();
        trioPageIndex = 0;
        trioAnswerVisible = false;
        showTrioLoadingPage(w);

        new Thread(() -> {
            List<Question> loaded = new ArrayList<>();
            try {
                if (w.theme != null && !w.theme.trim().isEmpty()) {
                    for (Question q : loadThemeQuestionQuestions(w.theme, w.question)) {
                        if ("good".equals(trioReturnMode) || q.row != w.row) loaded.add(q);
                    }
                }
            } catch (Exception ignored) { }
            final List<Question> ready = loaded;
            runOnUiThread(() -> {
                if (!"wrong_detail".equals(phase) || trioSourceWrongAnswer != w) return;
                trioQuestions.clear();
                trioQuestions.addAll(ready);
                trioPageIndex = 0;
                trioAnswerVisible = false;
                showTrioQuestionPage();
            });
        }).start();
    }

    private void showTrioLoadingPage(WrongAnswer w) {
        screenRoot = new LinearLayout(this);
        screenRoot.setOrientation(LinearLayout.VERTICAL);
        screenRoot.setBackgroundColor(Color.BLACK);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(10), dp(8), dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        screenRoot.addView(root, new LinearLayout.LayoutParams(-1, 0, 1));
        reviewBand("Chargement des questions associées…", DARK, Color.WHITE);
        addTrioBottomNavigation(false);
        setContentView(screenRoot);
    }

    private void showTrioQuestionPage() {
        if (!"wrong_detail".equals(phase)) return;

        screenRoot = new LinearLayout(this);
        screenRoot.setOrientation(LinearLayout.VERTICAL);
        screenRoot.setBackgroundColor(Color.BLACK);

        if (trioQuestions.isEmpty()) {
            root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setGravity(Gravity.CENTER);
            root.setPadding(dp(10), dp(8), dp(10), dp(8));
            root.setBackgroundColor(Color.BLACK);
            screenRoot.addView(root, new LinearLayout.LayoutParams(-1, 0, 1));
            reviewBand("Aucune autre question disponible dans ce trio", DARK, Color.WHITE);
            addTrioBottomNavigation(false);
            setContentView(screenRoot);
            return;
        }

        Question q = trioQuestions.get(trioPageIndex);

        LinearLayout anchoredTop = new LinearLayout(this);
        anchoredTop.setOrientation(LinearLayout.VERTICAL);
        anchoredTop.setPadding(dp(10), 0, dp(10), 0);
        anchoredTop.setBackgroundColor(Color.BLACK);

        TextView fixedTheme = tv(
                q.theme == null || q.theme.trim().isEmpty() ? "Sans thème" : q.theme,
                22, Color.WHITE, Gravity.CENTER, true);
        fixedTheme.setSingleLine(false);
        fixedTheme.setMaxLines(Integer.MAX_VALUE);
        fixedTheme.setGravity(Gravity.CENTER);
        fixedTheme.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        fixedTheme.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(fixedTheme, GREEN, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams themeLp =
                new LinearLayout.LayoutParams(-1, -2);
        themeLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        anchoredTop.addView(fixedTheme, themeLp);

        TextView fixedQuestion = tv(q.question, 22, Color.WHITE, Gravity.CENTER, true);
        fixedQuestion.setSingleLine(false);
        fixedQuestion.setMaxLines(Integer.MAX_VALUE);
        fixedQuestion.setGravity(Gravity.CENTER);
        fixedQuestion.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        fixedQuestion.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(fixedQuestion, RED, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams questionLp =
                new LinearLayout.LayoutParams(-1, -2);
        questionLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        anchoredTop.addView(fixedQuestion, questionLp);

        screenRoot.addView(anchoredTop, new LinearLayout.LayoutParams(-1, -2));

        // Zone fixe propre à la question courante. Elle est reconstruite à chaque
        // changement de question, mais reste identique entre son temps 1 et son temps 2.
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(10), 0, dp(10), dp(6));
        root.setBackgroundColor(Color.BLACK);
        screenRoot.addView(root, new LinearLayout.LayoutParams(-1, 0, 1));

        // La zone centrale occupe toute la hauteur encore disponible.
        // Le détail jaune appartient uniquement à la question courante et reste
        // identique entre son temps 1 et son temps 2.
        if (!q.isImage && q.detail != null && !q.detail.trim().isEmpty()) {
            addStableTrioDetailBand(q.detail);
        } else if (q.isImage) {
            addFixedTrioImage(q.imageFile);
        } else {
            Space emptyMiddle = new Space(this);
            root.addView(emptyMiddle, new LinearLayout.LayoutParams(-1, 0, 1));
        }

        // Partie basse ancrée : réponse, Assimiler, navigation puis Retour/Fin.
        // La zone basse existe toujours avec exactement les mêmes vues et dimensions.
        // Au temps 1, elles sont simplement invisibles. Le bandeau jaune ne peut donc
        // plus changer de niveau entre les deux temps d'une même question.
        addTrioTimeTwoStage(q, trioAnswerVisible);

        addTrioPager();
        addTrioBottomNavigation(true);
        setContentView(screenRoot);
    }

    private void addFixedTrioImage(String imageFileName) {
        FrameLayout area = new FrameLayout(this);
        area.setBackgroundColor(Color.BLACK);
        area.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(area, DARK, 14, Color.WHITE, 1);

        File f = imageFile(imageFileName);
        Bitmap bm = f != null && f.exists() ? decode(f) : null;
        if (bm == null) {
            TextView missing = tv("Image introuvable : " + safe(imageFileName),
                    18, Color.WHITE, Gravity.CENTER, true);
            area.addView(missing, new FrameLayout.LayoutParams(
                    -1, -1, Gravity.CENTER));
        } else {
            ImageView image = new ImageView(this);
            image.setImageBitmap(bm);
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            area.addView(image, new FrameLayout.LayoutParams(
                    -1, -1, Gravity.CENTER));
        }

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(-1, 0, 1);
        lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        root.addView(area, lp);
    }

    private void addTrioTimeTwoStage(Question q, boolean visible) {
        String answer = q.correct >= 1 && q.correct <= 4
                ? q.props[q.correct - 1] : "";

        TextView answerBand = tv(answer, 22, Color.WHITE, Gravity.CENTER, true);
        answerBand.setSingleLine(false);
        answerBand.setMaxLines(4);
        answerBand.setGravity(Gravity.CENTER);
        answerBand.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        answerBand.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(answerBand, GREEN, 14, Color.WHITE, 1);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            answerBand.setAutoSizeTextTypeUniformWithConfiguration(
                    18, 24, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        LinearLayout.LayoutParams answerLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.65f));
        answerLp.setMargins(dp(10), halfBandGapPx(), dp(10), halfBandGapPx());
        screenRoot.addView(answerBand, answerLp);

        Button assimilate = btn("Assimiler", 22);
        setRoundedBackgroundWithStroke(assimilate, NAVY, 14, Color.WHITE, 1);
        assimilate.setTextColor(Color.WHITE);

        if (visible) {
            assimilate.setOnClickListener(v -> assimilateTrioQuestion(q, assimilate));
        }

        LinearLayout.LayoutParams assimilateLp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        assimilateLp.setMargins(dp(10), 0, dp(10), cmToPx(0.2f));
        screenRoot.addView(assimilate, assimilateLp);

        int visibility = visible ? View.VISIBLE : View.INVISIBLE;
        answerBand.setVisibility(visibility);
        assimilate.setVisibility(visibility);
    }

    private void assimilateTrioQuestion(Question q, Button assimilate) {
        assimilate.setEnabled(false);

        int removedIndex = trioPageIndex;
        if (removedIndex >= 0 && removedIndex < trioQuestions.size()
                && trioQuestions.get(removedIndex).row == q.row) {
            trioQuestions.remove(removedIndex);
        } else {
            for (int i = 0; i < trioQuestions.size(); i++) {
                if (trioQuestions.get(i).row == q.row) {
                    trioQuestions.remove(i);
                    removedIndex = i;
                    break;
                }
            }
        }

        if (trioQuestions.isEmpty()) {
            trioPageIndex = 0;
            trioAnswerVisible = false;
            if ("good".equals(trioReturnMode)) {
                goodThemesThisSession.remove(comparisonKey(q.theme));
            }
        } else {
            trioPageIndex = Math.min(removedIndex, trioQuestions.size() - 1);
            trioAnswerVisible = false;
        }

        showTrioQuestionPage();

        if (remainingInCurrentDomain > 0) remainingInCurrentDomain--;
        new Thread(() -> updateStatusForRow("M", q.row)).start();
    }

    private void addFixedTrioAnswerBand(String answer) {
        TextView v = tv(answer, 22, Color.WHITE, Gravity.CENTER, true);
        v.setSingleLine(false);
        v.setMaxLines(4);
        v.setGravity(Gravity.CENTER);
        v.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        v.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(v, GREEN, 14, Color.WHITE, 1);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.setAutoSizeTextTypeUniformWithConfiguration(
                    18, 24, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(-1, cmToPx(1.65f));
        lp.setMargins(dp(10), halfBandGapPx(), dp(10), halfBandGapPx());
        screenRoot.addView(v, lp);
    }

    private void addTrioAssimilateButton(Question q) {
        Button assimilate = btn("Assimiler", 22);
        setRoundedBackgroundWithStroke(assimilate, NAVY, 14, Color.WHITE, 1);
        assimilate.setTextColor(Color.WHITE);
        assimilate.setOnClickListener(v -> {
            assimilate.setEnabled(false);

            int removedIndex = trioPageIndex;
            if (removedIndex >= 0 && removedIndex < trioQuestions.size()
                    && trioQuestions.get(removedIndex).row == q.row) {
                trioQuestions.remove(removedIndex);
            } else {
                for (int i = 0; i < trioQuestions.size(); i++) {
                    if (trioQuestions.get(i).row == q.row) {
                        trioQuestions.remove(i);
                        removedIndex = i;
                        break;
                    }
                }
            }

            // Même enchaînement que la flèche droite au temps 2 :
            // la question courante est retirée puis la question suivante apparaît au temps 1.
            if (trioQuestions.isEmpty()) {
                trioPageIndex = 0;
                trioAnswerVisible = false;
                if ("good".equals(trioReturnMode)) {
                    goodThemesThisSession.remove(comparisonKey(q.theme));
                }
            } else {
                trioPageIndex = Math.min(removedIndex, trioQuestions.size() - 1);
                trioAnswerVisible = false;
            }

            showTrioQuestionPage();

            if (remainingInCurrentDomain > 0) remainingInCurrentDomain--;
            new Thread(() -> updateStatusForRow("M", q.row)).start();
        });

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, cmToPx(1.0f));
        lp.setMargins(dp(10), 0, dp(10), cmToPx(0.2f));
        screenRoot.addView(assimilate, lp);
    }

    private void addStableTrioDetailBand(String detail) {
        // L'ancrage du bandeau jaune est prioritaire sur son centrage.
        // Le conteneur occupe toute la zone centrale, mais le bandeau jaune est
        // accroché en bas de cette zone, donc toujours au même niveau aux temps 1 et 2.
        FrameLayout anchorHost = new FrameLayout(this);
        anchorHost.setBackgroundColor(Color.BLACK);

        TextView v = tv(detail == null ? "" : detail, 22,
                Color.BLACK, Gravity.CENTER, true);

        int horizontalPadding = cmToPx(0.2f);
        int verticalPadding = cmToPx(0.5f);
        v.setPadding(horizontalPadding, verticalPadding,
                horizontalPadding, verticalPadding);
        v.setSingleLine(false);
        v.setMaxLines(Integer.MAX_VALUE);
        v.setGravity(Gravity.CENTER);
        v.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        setRoundedBackgroundWithStroke(v, YELLOW, 14, Color.WHITE, 1);

        // Taille nominale identique aux autres bandeaux.
        // Réduction seulement pour les textes exceptionnellement longs.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.setAutoSizeTextTypeUniformWithConfiguration(
                    18, 24, 1, TypedValue.COMPLEX_UNIT_SP);
        }

        FrameLayout.LayoutParams bandLp =
                new FrameLayout.LayoutParams(-1, -2,
                        Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        bandLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        anchorHost.addView(v, bandLp);

        LinearLayout.LayoutParams hostLp =
                new LinearLayout.LayoutParams(-1, 0, 1);
        root.addView(anchorHost, hostLp);
    }

    private void addTrioPager() {
        LinearLayout pager = new LinearLayout(this);
        pager.setOrientation(LinearLayout.HORIZONTAL);
        pager.setGravity(Gravity.CENTER);
        pager.setPadding(dp(10), 0, dp(10), 0);
        int gap = cmToPx(0.2f);
        int height = cmToPx(1.20f);

        Button previous = btn("←", 22);
        setRoundedBackgroundWithStroke(previous, GREY, 14, Color.WHITE, 1);
        previous.setOnClickListener(v -> {
            if (trioPageIndex <= 0) return;
            trioPageIndex--;
            trioAnswerVisible = true;
            showTrioQuestionPage();
        });
        if (trioPageIndex == 0) previous.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams previousLp = new LinearLayout.LayoutParams(0, height, 1);
        previousLp.setMargins(0, 0, gap / 2, 0);
        pager.addView(previous, previousLp);

        TextView position = tv((trioPageIndex + 1) + " / " + trioQuestions.size(),
                22, Color.WHITE, Gravity.CENTER, true);
        position.setSingleLine(true);
        setRoundedBackgroundWithStroke(position, DARK, 14, Color.WHITE, 1);
        LinearLayout.LayoutParams positionLp = new LinearLayout.LayoutParams(0, height, 1);
        positionLp.setMargins(gap / 2, 0, gap / 2, 0);
        pager.addView(position, positionLp);

        Button next = btn("→", 22);
        setRoundedBackgroundWithStroke(next, GREY, 14, Color.WHITE, 1);
        next.setOnClickListener(v -> {
            if (!trioAnswerVisible) {
                trioAnswerVisible = true;
                showTrioQuestionPage();
            } else if (trioPageIndex < trioQuestions.size() - 1) {
                trioPageIndex++;
                trioAnswerVisible = false;
                showTrioQuestionPage();
            }
        });
        if (trioAnswerVisible && trioPageIndex == trioQuestions.size() - 1) next.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams nextLp = new LinearLayout.LayoutParams(0, height, 1);
        nextLp.setMargins(gap / 2, 0, 0, 0);
        pager.addView(next, nextLp);

        LinearLayout.LayoutParams pagerLp = new LinearLayout.LayoutParams(-1, -2);
        pagerLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        screenRoot.addView(pager, pagerLp);
    }

    private void addTrioBottomNavigation(boolean normalDisplay) {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(10), 0, dp(10), 0);

        Button back = btn("Retour", 22);
        back.setOnClickListener(v -> {
            if ("good".equals(trioReturnMode)) {
                if (trioSourceWrongAnswer != null && trioQuestions.isEmpty()) {
                    goodThemesThisSession.remove(comparisonKey(trioSourceWrongAnswer.theme));
                }
                showGoodAnswersScreen();
            } else {
                showWrongAnswerPage(wrongAnswerPageIndex);
            }
        });
        Button end = btn("Fin", 22);
        setRoundedBackgroundWithStroke(end, BLUE, 14, Color.WHITE, 1);
        end.setOnClickListener(v -> showEndScreen());

        int navGap = cmToPx(0.2f);
        int navHeight = cmToPx(1.0f);
        LinearLayout.LayoutParams backLp = new LinearLayout.LayoutParams(0, navHeight, 1);
        backLp.setMargins(0, 0, navGap / 2, 0);
        LinearLayout.LayoutParams endLp = new LinearLayout.LayoutParams(0, navHeight, 1);
        endLp.setMargins(navGap / 2, 0, 0, 0);
        nav.addView(back, backLp);
        nav.addView(end, endLp);
        LinearLayout.LayoutParams navLp = new LinearLayout.LayoutParams(-1, -2);
        navLp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        screenRoot.addView(nav, navLp);
    }

    private void addWrongAnswerPrimary(WrongAnswer w) {
        if (w.detail != null && w.detail.length() > 0) {
            reviewBand(w.detail, YELLOW, Color.BLACK);
        }
        if (w.isImage) reviewImageBand(w.imageFile);
        addTwoMillimeterGap();
        reviewWrongAndCorrectAnswers(w.chosenAnswer, w.correctAnswer);
    }

    private void appendAvailableTrio(WrongAnswer w, List<Question> related) {
        boolean hasOtherAvailable = false;
        for (Question q : related) {
            if (q.row != w.row) {
                hasOtherAvailable = true;
                break;
            }
        }
        if (!hasOtherAvailable) return;

        boolean firstRelated = true;
        for (Question q : related) {
            if (q.row == w.row) continue;
            if (!firstRelated) addReviewBlockGap();
            firstRelated = false;

            if (q.detail != null && q.detail.length() > 0) {
                reviewBandWithMargins(q.detail, YELLOW, Color.BLACK, 0, 0);
            }
            if (q.isImage) reviewImageBand(q.imageFile);
            addTwoMillimeterGap();
            String answer = "";
            if (q.correct >= 1 && q.correct <= 4) answer = q.props[q.correct - 1];
            reviewBandWithMargins(answer, GREEN, Color.WHITE, 0, 0);
        }
    }

    private void addTwoMillimeterGap() {
        Space gap = new Space(this);
        root.addView(gap, new LinearLayout.LayoutParams(-1, cmToPx(0.2f)));
    }

    private void reviewWrongAndCorrectAnswers(String wrongAnswer, String correctAnswer) {
        String wrong = wrongAnswer == null || wrongAnswer.trim().length() == 0
                ? "Aucune réponse donnée" : wrongAnswer.trim();
        String correct = correctAnswer == null ? "" : correctAnswer.trim();

        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setGravity(Gravity.CENTER);
        int twoMillimeters = cmToPx(0.2f);
        outer.setPadding(twoMillimeters, twoMillimeters, twoMillimeters, twoMillimeters);
        setRoundedBackgroundWithStroke(outer, Color.rgb(24, 24, 24), 14, Color.WHITE, 1);

        TextView wrongView = tv(wrong, 22, Color.WHITE, Gravity.CENTER, true);
        wrongView.setSingleLine(false);
        wrongView.setMaxLines(Integer.MAX_VALUE);
        wrongView.setMinHeight(dp(48));
        wrongView.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(wrongView, Color.rgb(190, 25, 25), 11, Color.WHITE, 1);
        outer.addView(wrongView, new LinearLayout.LayoutParams(-1, -2));

        Space innerGap = new Space(this);
        outer.addView(innerGap, new LinearLayout.LayoutParams(-1, twoMillimeters));

        TextView correctView = tv(correct, 22, Color.WHITE, Gravity.CENTER, true);
        correctView.setSingleLine(false);
        correctView.setMaxLines(Integer.MAX_VALUE);
        correctView.setMinHeight(dp(48));
        correctView.setPadding(compactBandPaddingPx(), compactBandPaddingPx(),
                compactBandPaddingPx(), compactBandPaddingPx());
        setRoundedBackgroundWithStroke(correctView, Color.rgb(0, 135, 60), 11, Color.WHITE, 1);
        outer.addView(correctView, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, 0);
        root.addView(outer, lp);
    }

    private void addReviewHorizontalSeparator() {
        FrameLayout separatorArea = new FrameLayout(this);
        separatorArea.setBackgroundColor(Color.BLACK);
        View line = new View(this);
        line.setBackgroundColor(Color.WHITE);
        FrameLayout.LayoutParams lineLp = new FrameLayout.LayoutParams(-1, dp(2), Gravity.CENTER);
        separatorArea.addView(line, lineLp);
        root.addView(separatorArea, new LinearLayout.LayoutParams(-1, cmToPx(0.5f)));
    }

    private void addReviewBlockGap() {
        Space gap = new Space(this);
        root.addView(gap, new LinearLayout.LayoutParams(-1, cmToPx(0.5f)));
    }

    private void reviewBand(String text, int color, int textColor) {
        int gap = halfBandGapPx();
        reviewBandWithMargins(text, color, textColor, gap, gap);
    }

    private void reviewBandWithMargins(String text, int color, int textColor,
                                       int topMarginPx, int bottomMarginPx) {
        TextView v = tv(text, 22, textColor, Gravity.CENTER, true);
        int innerMargin = compactBandPaddingPx();
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setSingleLine(false);
        v.setMaxLines(Integer.MAX_VALUE);
        v.setMinHeight(dp(54));
        v.setGravity(Gravity.CENTER);
        v.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, topMarginPx, 0, bottomMarginPx);
        root.addView(v, lp);
    }

    private void reviewImageBand(String imageFile) {
        if (imageFile == null || imageFile.trim().length() == 0) return;

        FrameLayout imageArea = new FrameLayout(this);
        imageArea.setBackgroundColor(Color.BLACK);
        int innerMargin = compactBandPaddingPx();
        imageArea.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        setRoundedBackground(imageArea, DARK, 14);

        LinearLayout.LayoutParams areaLp = new LinearLayout.LayoutParams(-1, cmToPx(5.8f));
        int gap = halfBandGapPx();
        areaLp.setMargins(0, gap, 0, gap);
        root.addView(imageArea, areaLp);

        File f = imageFile(imageFile);
        Bitmap bm = (f != null && f.exists()) ? decode(f) : null;
        if (bm == null) {
            TextView missing = tv("Image introuvable : " + imageFile, 22, Color.WHITE, Gravity.CENTER, true);
            setRoundedBackground(missing, RED, 14);
            FrameLayout.LayoutParams missingLp = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
            missingLp.setMargins(dp(6), dp(6), dp(6), dp(6));
            imageArea.addView(missing, missingLp);
            return;
        }

        ImageView iv = new ImageView(this);
        iv.setImageBitmap(bm);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        iv.setBackgroundColor(Color.BLACK);
        FrameLayout.LayoutParams ivLp = new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER);
        imageArea.addView(iv, ivLp);
    }

    private List<Question> loadThemeQuestionQuestions(String theme, String question) {
        List<Question> list = loadThemeQuestionQuestionsFast(theme, question);
        if (!list.isEmpty()) return list;

        // Secours pour les rares lignes contenant des espaces insécables ou retours ligne atypiques.
        return loadThemeQuestionQuestionsCompatibility(theme, question);
    }

    private List<Question> loadThemeQuestionQuestionsFast(String theme, String question) {
        List<Question> list = new ArrayList<>();
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT row_number, megatheme, theme, question, detail, " +
                            "proposition_a, proposition_b, proposition_c, proposition_d, " +
                            "correct_index, image_file, is_image " +
                            "FROM " + TABLE +
                            " WHERE (status IS NULL OR TRIM(status)='' OR " +
                            "UPPER(TRIM(status)) NOT IN ('M','P','T','X'))" +
                            " AND LOWER(TRIM(theme))=LOWER(TRIM(?))" +
                            " AND LOWER(TRIM(question))=LOWER(TRIM(?))" +
                            " ORDER BY row_number",
                    new String[]{safe(theme), safe(question)}
            );
            while (c.moveToNext()) list.add(questionFromCursor(c));
        } finally {
            if (c != null) c.close();
            db.close();
        }
        return list;
    }

    private List<Question> loadThemeQuestionQuestionsCompatibility(String theme, String question) {
        List<Question> list = new ArrayList<>();
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT row_number, megatheme, theme, question, detail, " +
                            "proposition_a, proposition_b, proposition_c, proposition_d, " +
                            "correct_index, image_file, is_image " +
                            "FROM " + TABLE +
                            " WHERE (status IS NULL OR TRIM(status)='' OR " +
                            "UPPER(TRIM(status)) NOT IN ('M','P','T','X')) ORDER BY row_number",
                    null
            );
            String targetTheme = comparisonKey(theme);
            String targetQuestion = comparisonKey(question);
            while (c.moveToNext()) {
                if (!targetTheme.equals(comparisonKey(c.getString(2)))) continue;
                if (!targetQuestion.equals(comparisonKey(c.getString(3)))) continue;
                list.add(questionFromCursor(c));
            }
        } finally {
            if (c != null) c.close();
            db.close();
        }
        return list;
    }

    private Question questionFromCursor(Cursor c) {
        Question q = new Question();
        q.row = c.getLong(0);
        q.domain = normalize(c.getString(1));
        q.theme = safe(c.getString(2));
        q.question = safe(c.getString(3));
        q.detail = safe(c.getString(4));
        for (int i = 0; i < 4; i++) q.props[i] = safe(c.getString(5 + i));
        q.correct = c.getInt(9);
        if (q.correct < 1 || q.correct > 4) q.correct = 1;
        q.imageFile = safe(c.getString(10));
        q.isImage = c.getInt(11) == 1 || q.imageFile.length() > 0;
        return q;
    }

    private long countStatus(String status) {
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + TABLE + " WHERE UPPER(TRIM(status))=?", new String[]{status});
            try { return c.moveToFirst() ? c.getLong(0) : 0; }
            finally { c.close(); }
        } finally { db.close(); }
    }

private void flagAndNext(String status, String msg) {
    if ("T".equals(status)) {
        int affected = updateAnalogousQuestionsToT();
        long totalT = countStatus("T");
        // Toast supprimé
    } else {
        updateStatus(status);
        exportProblemsP(false);
        long totalP = countStatus("P");
        // Toast supprimé
    }
    screenRoot.postDelayed(this::nextQuestion, 150);
}

    private int updateAnalogousQuestionsToT() {
        SQLiteDatabase db = openDb();
        Cursor c = null;
        SQLiteStatement update = null;
        int newlyExcluded = 0;
        String targetTheme = comparisonKey(current.theme);
        String targetQuestion = comparisonKey(current.question);

        try {
            db.beginTransaction();
            // Une exclusion T concerne toutes les lignes ayant le même thème
            // et la même question. Le détail n'entre plus dans la comparaison.
            c = db.rawQuery(
                    "SELECT row_number, theme, question, status FROM " + TABLE,
                    null
            );
            update = db.compileStatement("UPDATE " + TABLE + " SET status='T' WHERE row_number=?");

            while (c.moveToNext()) {
                if (!targetTheme.equals(comparisonKey(c.getString(1)))) continue;
                if (!targetQuestion.equals(comparisonKey(c.getString(2)))) continue;

                String existingStatus = safe(c.getString(3)).toUpperCase(Locale.ROOT);
                if ("X".equals(existingStatus) || "T".equals(existingStatus)) continue;

                update.clearBindings();
                update.bindLong(1, c.getLong(0));
                newlyExcluded += update.executeUpdateDelete();
            }

            db.setTransactionSuccessful();
            return newlyExcluded;
        } finally {
            if (c != null) c.close();
            if (update != null) update.close();
            if (db.inTransaction()) db.endTransaction();
            db.close();
        }
    }

    private String comparisonKey(String value) {
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

    private boolean showMilestonePopupIfNeeded() {
        return false;
    }

    private void continueAfterAnswer() {
        nextQuestion();
    }

    private void answerChoice(int choice) {
        answered++;
        revised++;
        mentalStreak = 0;
        final Question answeredQuestion = current;

        showChoiceResult(choice);

        if (choice == answeredQuestion.correct) {
            classicOk++;
            classicStreak++;
            goodStreak++;
            rememberGoodTheme(answeredQuestion);
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
            new Thread(() -> {
                updateStatusForRow("R", answeredQuestion.row);
                runOnUiThread(() -> screenRoot.postDelayed(this::continueAfterAnswer, 250));
            }).start();
        } else {
            wrongAnswers.add(new WrongAnswer(answeredQuestion, choice));
            classicStreak = 0;
            goodStreak = 0;
            new Thread(() -> updateStatusForRow("R", answeredQuestion.row)).start();
            screenRoot.postDelayed(this::continueAfterAnswer, 450);
        }
    }

    private void finish(String status) {
        answered++;
        final Question answeredQuestion = current;
        if ("M".equals(status)) {
            mentalOk++;
            goodStreak++;
            mentalStreak++;
            rememberGoodTheme(answeredQuestion);
            classicStreak = 0;
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
            if (mentalStreak > bestMentalStreak) bestMentalStreak = mentalStreak;
            new Thread(() -> {
                updateStatusForRow(status, answeredQuestion.row);
                runOnUiThread(this::continueAfterAnswer);
            }).start();
        } else {
            revised++;
            goodStreak = 0;
            classicStreak = 0;
            mentalStreak = 0;
            wrongAnswers.add(new WrongAnswer(answeredQuestion, 0));
            new Thread(() -> {
                updateStatusForRow(status, answeredQuestion.row);
                runOnUiThread(this::continueAfterAnswer);
            }).start();
        }
    }

    private void updateStatusForRow(String status, long rowNumber) {
        SQLiteDatabase db = openDb();
        try {
            db.execSQL("UPDATE " + TABLE + " SET status=? WHERE row_number=?",
                    new Object[]{status, rowNumber});
        } finally {
            db.close();
        }
    }

    private void updateStatus(String status) {
        SQLiteDatabase db = openDb();
        try { db.execSQL("UPDATE " + TABLE + " SET status=? WHERE row_number=?", new Object[]{status, current.row}); }
        finally { db.close(); }
    }

	private void previousQuestion() {
    if (historyIndex > 0) {
        historyIndex--;
        current = history.get(historyIndex);
        showQuestion();
    } else {
        // Toast supprimé
    }
}

    private void migrateLegacyImageFlags() {
        SQLiteDatabase db = openDb();
        try {
            db.execSQL("UPDATE " + TABLE + " SET status='P' WHERE UPPER(TRIM(status))='I'");
        } finally {
            db.close();
        }
    }

    private int exportProblemsP(boolean notifyUser) {
        int exported = 0;
        SQLiteDatabase db = openDb();
        Cursor c = null;
        BufferedWriter writer = null;
        try {
            if (!appFolder.exists() && !appFolder.mkdirs()) {
                throw new Exception("Impossible de créer le dossier " + appFolder.getAbsolutePath());
            }
            c = db.rawQuery(
                    "SELECT row_number, original_id, megatheme, theme, question, detail, " +
                    "proposition_a, proposition_b, proposition_c, proposition_d, correct_index, " +
                    "url_quizypedia, url_internet, image_file, non_trouve, status, is_image " +
                    "FROM " + TABLE + " WHERE UPPER(TRIM(status))='P' ORDER BY row_number",
                    null
            );

            writer = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(problemsFile, false), "UTF-8"));
            writer.write('\uFEFF');
            writer.write("row_number;original_id;megatheme;theme;question;detail;proposition_a;proposition_b;proposition_c;proposition_d;correct_index;url_quizypedia;url_internet;image_file;non_trouve;status;is_image");
            writer.newLine();

            while (c.moveToNext()) {
                StringBuilder line = new StringBuilder();
                for (int i = 0; i < c.getColumnCount(); i++) {
                    if (i > 0) line.append(';');
                    line.append(csv(c.isNull(i) ? "" : c.getString(i)));
                }
                writer.write(line.toString());
                writer.newLine();
                exported++;
            }
            writer.flush();

            if (notifyUser) {
                Toast.makeText(
                        this,
                        exported + " signalement(s) exporté(s) dans " + problemsFile.getAbsolutePath(),
                        Toast.LENGTH_LONG
                ).show();
            }
            return exported;
        } catch (Exception e) {
            if (notifyUser) {
                Toast.makeText(this, "Échec de l'export : " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
            return -1;
        } finally {
            try { if (writer != null) writer.close(); } catch (Exception ignored) { }
            if (c != null) c.close();
            db.close();
        }
    }

    private String csv(String value) {
        String s = value == null ? "" : value;
        return "\"" + s.replace("\"", "\"\"").replace("\r", " ").replace("\n", " ") + "\"";
    }

    private int domainBandColor(String domain) {
        String d = normalize(domain);
        if ("Animaux et Plantes".equals(d)) return Color.rgb(20, 85, 45);
        if ("Sport".equals(d)) return Color.rgb(190, 25, 25);
        if ("Histoire".equals(d)) return Color.rgb(115, 72, 42);
        if ("Géographie".equals(d)) return Color.rgb(105, 190, 235);
        if ("Culture Classique".equals(d)) return Color.rgb(30, 90, 190);
        if ("Culture Moderne".equals(d)) return Color.rgb(235, 130, 30);
        if ("Culture Générale".equals(d)) return Color.rgb(135, 205, 105);
        if ("Sciences et Techniques".equals(d)) return Color.rgb(245, 205, 40);
        return BLUE;
    }

    private int domainBandTextColor(String domain) {
        String d = normalize(domain);
        if ("Géographie".equals(d) || "Culture Moderne".equals(d) ||
                "Culture Générale".equals(d) || "Sciences et Techniques".equals(d)) {
            return Color.BLACK;
        }
        return Color.WHITE;
    }

    private String safe(String s) { return s == null ? "" : s.trim(); }
    private int cmToPx(float cm) {
        float ydpi = getResources().getDisplayMetrics().ydpi;
        return Math.round((cm / 2.54f) * ydpi);
    }

    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + 0.5f); }
    private String normalize(String raw) {
        String s = safe(raw).replace('\u00A0', ' ');
        while (s.contains("  ")) s = s.replace("  ", " ");
        if (s.equalsIgnoreCase("Culture classique")) return "Culture Classique";
        if (s.equalsIgnoreCase("Culture générale")) return "Culture Générale";
        if (s.equalsIgnoreCase("Culture moderne")) return "Culture Moderne";
        if (s.equalsIgnoreCase("Animaux et plantes")) return "Animaux et Plantes";
        if (s.equalsIgnoreCase("Sciences et techniques")) return "Sciences et Techniques";
        if (s.equalsIgnoreCase("géographie")) return "Géographie";
        if (s.equalsIgnoreCase("histoire")) return "Histoire";
        if (s.equalsIgnoreCase("sport")) return "Sport";
        return s.length() == 0 ? "Culture Générale" : s;
    }
}
