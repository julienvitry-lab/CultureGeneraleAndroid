package fr.culturegenerale.android;

import android.text.TextUtils;
import android.text.Layout;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

public class MainActivity extends Activity {
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

    private final Set<Long> askedThisSession = new HashSet<>();
    private final List<Question> history = new ArrayList<>();
    private final List<WrongAnswer> wrongAnswers = new ArrayList<>();
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

    static class Question {
        long row;
        String domain, theme, question, detail, imageFile;
        String[] props = new String[]{"", "", "", ""};
        int correct;
        boolean isImage;
    }

    static class WrongAnswer {
        String theme, question, detail, chosenAnswer, correctAnswer;

        WrongAnswer(Question q, int chosenChoice) {
            theme = q.theme;
            question = q.question;
            detail = q.detail;
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
        int goodAnswers = classicOk + mentalOk;
        float successRate = answered <= 0 ? 0f : (goodAnswers * 100f) / answered;
        String successText = String.format(Locale.FRANCE, "%.2f%%", successRate);
        TextView stats = tv(
                "H : " + answered +
                "   B : " + successText +
                "   S : " + bestGoodStreak,
                25, Color.WHITE, Gravity.CENTER, true
        );
        stats.setSingleLine(true);
        stats.setMaxLines(1);
        stats.setEllipsize(null);
        stats.setHorizontallyScrolling(false);
        stats.setPadding(dp(3), 0, dp(3), 0);
        stats.setMinHeight(0);
        setRoundedBackground(stats, Color.rgb(24, 24, 24), 8);
        // Même taille initiale que les bandeaux de question, puis réduction si nécessaire.
        stats.setTextSize(TypedValue.COMPLEX_UNIT_SP, 27);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            stats.setAutoSizeTextTypeUniformWithConfiguration(10, 27, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        stats.post(() -> fitSingleLineLegacy(stats, stats.getText().toString(), 27, 10));
        root.addView(stats, new LinearLayout.LayoutParams(-1, cmToPx(0.85f)));
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
        root.addView(gap, new LinearLayout.LayoutParams(-1, cmToPx(0.1f)));
    }

    private TextView tv(String text, int sp, int color, int gravity, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text == null ? "" : text);
        v.setTextSize(sp + 2);
        v.setTextColor(color);
        v.setGravity(gravity);
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
        return Math.max(1, cmToPx(0.05f));
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
        baseFixed();
        add(tv("Culture Générale Android V9.4.6", 28, Color.WHITE, Gravity.CENTER, true));
        if (!hasAccess()) {
            band("Accès fichiers Android à autoriser", RED, Color.WHITE, 22, 54);
            Button b = btn("Autoriser l'accès aux fichiers", 20);
            b.setOnClickListener(v -> askAccess());
            add(b);
            return;
        }
        if (!dbFile.exists()) {
            band("Base SQLite introuvable : " + dbFile.getAbsolutePath(), RED, Color.WHITE, 18, 60);
            return;
        }
        migrateLegacyImageFlags();
        exportProblemsP(false);
	Map<String, Long> domainCounts = countDomains();

        int gap = cmToPx(0.1f); // 1 mm exactement entre les rubriques
        int halfGap = cmToPx(0.05f);

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
                Button b = btn(d + "\n(" + n + ")", 17);
                b.setSingleLine(false);
                b.setMaxLines(3);
                setRoundedBackgroundWithStroke(b, domainBandColor(d), 16, Color.WHITE, 1);
                b.setTextColor(domainBandTextColor(d));
                b.setOnClickListener(v -> startDomain(d));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1);
                if (col == 0) lp.setMargins(0, 0, halfGap, 0);
                else lp.setMargins(halfGap, 0, 0, 0);
                row.addView(b, lp);
            }

            selector.addView(row, new LinearLayout.LayoutParams(-1, 0, 1));
            Space verticalGap = new Space(this);
            selector.addView(verticalGap, new LinearLayout.LayoutParams(-1, gap));
        }

        long total = 0;
        for (long v : domainCounts.values()) total += v;
        Button all = btn("Tous les domaines\n(" + total + ")", 20);
        all.setSingleLine(false);
        all.setMaxLines(3);
        setRoundedBackgroundWithStroke(all, Color.BLACK, 16, Color.WHITE, 1);
        all.setTextColor(Color.WHITE);
        all.setOnClickListener(v -> startDomain(null));
        selector.addView(all, new LinearLayout.LayoutParams(-1, 0, 1));
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
        currentDomain = domain;
        answered = mentalOk = classicOk = revised = goodStreak = classicStreak = bestGoodStreak = mentalStreak = bestMentalStreak = 0;
        lastQuestionsPopupAt = 0;
        lastMentalPopupAt = 0;
        lastCombinedPopupAt = 0;
        remainingInCurrentDomain = countRemaining(currentDomain);
        askedThisSession.clear();
        history.clear();
        wrongAnswers.clear();
        historyIndex = -1;
        nextQuestion();
    }

    private void nextQuestion() {
        try {
            // Recalcul uniquement au moment du tirage d'une nouvelle question :
            // R = questions disponibles non assimilées mentalement, hors P/T/X.
            remainingInCurrentDomain = countRemaining(currentDomain);
            Question q = loadFreshQuestion(currentDomain);
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
        } catch (Exception e) {
            baseScrollable();
            band("Erreur : " + e.getMessage(), RED, Color.WHITE, 18, 90);
            Button b = btn("Nouvelle partie", 20);
            b.setOnClickListener(v -> showHome());
            add(b);
        }
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
        addBottomButton("Signaler", RED, v -> showProblemMenu());
        addBottomButton("Menu", BLUE, v -> showMainMenu());
        addBottomButton("Propositions", GREEN, v -> showChoices());
    }

    private void setChoicesBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("Signaler", RED, v -> showProblemMenu());
        addBottomButton("Menu", BLUE, v -> showMainMenu());
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
        Button b = btn(text, 16);
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

    private void showProblemMenu() {
        if (actionPanelHost != null && actionPanelHost.getVisibility() == View.VISIBLE &&
                "problem".equals(actionPanelHost.getTag())) {
            hideActionPanel();
            return;
        }
        LinearLayout panel = createRightActionPanel();
        addActionPanelButton(panel, "P\nProblème ponctuel", RED, cmToPx(2.0f), v -> {
            hideActionPanel();
            flagAndNext("P", "Problème noté");
        });
        addActionPanelButton(panel, "T\nContenu analogue", RED, cmToPx(2.0f), v -> {
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

        if ("choices".equals(phase) || "reveal".equals(phase) || "result".equals(phase)) {
            addActionPanelButton(panel, "Revoir la question", GREY, cmToPx(1.45f), v -> {
                hideActionPanel();
                showQuestion();
            });
        } else if (historyIndex > 0) {
            addActionPanelButton(panel, "Question précédente", GREY, cmToPx(1.45f), v -> {
                hideActionPanel();
                previousQuestion();
            });
        }

        addActionPanelButton(panel, "Fin de partie", RED, cmToPx(1.45f), v -> {
            hideActionPanel();
            showEndScreen();
        });
        showActionPanel(panel, "menu", 1);
    }

    private LinearLayout createRightActionPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(4), dp(4), dp(4), dp(4));
        setRoundedBackground(panel, DARK, 18);
        return panel;
    }

    private void addActionPanelButton(LinearLayout panel, String text, int color, int heightPx, View.OnClickListener listener) {
        Button b = btn(text, 14);
        b.setSingleLine(false);
        b.setMaxLines(2);
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
        int safeColumn = Math.max(0, Math.min(2, columnIndex));
        for (int i = 0; i < 3; i++) {
            if (i == safeColumn) {
                LinearLayout.LayoutParams panelLp = new LinearLayout.LayoutParams(0, -2, 1);
                panelLp.setMargins(halfBandGapPx(), 0, halfBandGapPx(), halfBandGapPx());
                actionPanelHost.addView(panel, panelLp);
            } else {
                Space space = new Space(this);
                actionPanelHost.addView(space, new LinearLayout.LayoutParams(0, 1, 1));
            }
        }
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
        phase = "end";
        baseScrollable();
        band("Fin de partie", RED, Color.WHITE, 26, 72);
        band("Répondues : " + answered +
                "\nAssimilées mentalement : " + mentalOk +
                "\nÀ revoir : " + revised +
                "\nSérie juste : " + goodStreak + " / record " + bestGoodStreak +
                "\nSérie mentale : " + mentalStreak + " / record " + bestMentalStreak,
                DARK, Color.WHITE, 21, 150);

        int exportedProblems = exportProblemsP(false);
        if (exportedProblems >= 0) {
            band(exportedProblems + " problème" + (exportedProblems > 1 ? "s" : "") +
                            " P répertorié" + (exportedProblems > 1 ? "s" : "") +
                            " et envoyé" + (exportedProblems > 1 ? "s" : "") +
                            " vers PROBLEMES_P.csv",
                    BLUE, Color.WHITE, 18, 76);
        } else {
            band("Le fichier PROBLEMES_P.csv n'a pas pu être actualisé", RED, Color.WHITE, 17, 70);
        }

        Button wrong = btn("Mauvaises réponses" + (wrongAnswers.isEmpty() ? "" : " (" + wrongAnswers.size() + ")"), 20);
        wrong.setOnClickListener(v -> showWrongAnswersScreen());
        addEndButton(wrong);

        if (current != null) {
            Button resume = btn("Reprendre la partie", 20);
            resume.setOnClickListener(v -> showQuestion());
            addEndButton(resume);
        }
        Button newGame = btn("Commencer une nouvelle partie", 20);
        newGame.setOnClickListener(v -> showHome());
        addEndButton(newGame);

        Button quit = btn("Quitter la partie", 20);
        setRoundedBackground(quit, RED, 16);
        quit.setOnClickListener(v -> finishAffinity());
        addEndButton(quit);
    }

    private void addEndButton(Button button) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, halfBandGapPx(), 0, halfBandGapPx());
        root.addView(button, lp);
    }


    private void showWrongAnswersScreen() {
        phase = "wrong_answers";
        baseScrollable();
        reviewBand("Mauvaises réponses", RED, Color.WHITE);

        if (wrongAnswers.isEmpty()) {
            reviewBand("Aucune mauvaise réponse dans cette session", DARK, Color.WHITE);
        } else {
            for (int i = wrongAnswers.size() - 1; i >= 0; i--) {
                WrongAnswer w = wrongAnswers.get(i);
                addClickableThemeBand(w.theme, w.question);
                reviewBand(w.question, RED, Color.WHITE);
                if (w.detail != null && w.detail.length() > 0) {
                    reviewBand(w.detail, YELLOW, Color.BLACK);
                }
                reviewBand("Réponse donnée : " + w.chosenAnswer + "\nBonne réponse : " + w.correctAnswer,
                        DARK, Color.WHITE);
            }
        }

        Button back = btn("Retour fin de partie", 20);
        back.setOnClickListener(v -> showEndScreen());
        addEndButton(back);

        Button newGame = btn("Commencer une nouvelle partie", 20);
        newGame.setOnClickListener(v -> showHome());
        addEndButton(newGame);
    }

    private void reviewBand(String text, int color, int textColor) {
        TextView v = tv(text, 22, textColor, Gravity.CENTER, true);
        int innerMargin = compactBandPaddingPx();
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setSingleLine(false);
        v.setMaxLines(Integer.MAX_VALUE);
        v.setMinHeight(dp(54));
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        int gap = halfBandGapPx();
        lp.setMargins(0, gap, 0, gap);
        root.addView(v, lp);
    }

    private void addClickableThemeBand(String theme, String question) {
        TextView v = tv(theme, 22, Color.WHITE, Gravity.CENTER, true);
        int innerMargin = compactBandPaddingPx();
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setSingleLine(false);
        v.setMaxLines(Integer.MAX_VALUE);
        v.setMinHeight(dp(54));
        setRoundedBackground(v, GREEN, 14);
        v.setOnClickListener(view -> showThemeQuestionReview(theme, question));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        int gap = halfBandGapPx();
        lp.setMargins(0, gap, 0, gap);
        root.addView(v, lp);
    }

    private void showThemeQuestionReview(String theme, String question) {
        phase = "theme_question_review";
        baseScrollable();
        reviewBand("Duo thème-question", GREEN, Color.WHITE);
        reviewBand(theme, GREEN, Color.WHITE);
        reviewBand(question, RED, Color.WHITE);
        List<Question> questions = loadThemeQuestionQuestions(theme, question);
        if (questions.isEmpty()) {
            reviewBand("Aucune question trouvée pour ce duo thème-question", DARK, Color.WHITE);
        } else {
            for (Question q : questions) {
                if (q.detail != null && q.detail.length() > 0) {
                    reviewBand(q.detail, YELLOW, Color.BLACK);
                }
                String answer = "";
                if (q.correct >= 1 && q.correct <= 4) answer = q.props[q.correct - 1];
                reviewBand("Réponse : " + answer, DARK, Color.WHITE);
            }
        }

        Button back = btn("Retour mauvaises réponses", 20);
        back.setOnClickListener(v -> showWrongAnswersScreen());
        addEndButton(back);

        Button end = btn("Fin de partie", 20);
        end.setOnClickListener(v -> showEndScreen());
        addEndButton(end);
    }

    private List<Question> loadThemeQuestionQuestions(String theme, String question) {
        List<Question> list = new ArrayList<>();
        SQLiteDatabase db = openDb();
        Cursor c = null;
        try {
            c = db.rawQuery(
                    "SELECT row_number, megatheme, theme, question, detail, proposition_a, proposition_b, proposition_c, proposition_d, correct_index, image_file, is_image " +
                            "FROM " + TABLE + " ORDER BY row_number",
                    null
            );
            String targetTheme = comparisonKey(theme);
            String targetQuestion = comparisonKey(question);
            while (c.moveToNext()) {
                if (!targetTheme.equals(comparisonKey(c.getString(2)))) continue;
                if (!targetQuestion.equals(comparisonKey(c.getString(3)))) continue;
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
                list.add(q);
            }
        } finally {
            if (c != null) c.close();
            db.close();
        }
        return list;
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
    screenRoot.postDelayed(this::nextQuestion, 350);
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
        if (answered <= 0 || answered % 100 != 0 || answered == lastQuestionsPopupAt) {
            return false;
        }

        lastQuestionsPopupAt = answered;
        final String popupTitle = "Questions posées";
        final String popupMessage = answered + " questions posées dans cette session. Continuer ?";

        screenRoot.post(() -> {
            new AlertDialog.Builder(this)
                    .setTitle(popupTitle)
                    .setMessage(popupMessage)
                    .setCancelable(false)
                    .setPositiveButton("OUI", (dialog, which) -> nextQuestion())
                    .setNegativeButton("NON", (dialog, which) -> showEndScreen())
                    .show();
        });
        return true;
    }

    private void continueAfterAnswer() {
        if (!showMilestonePopupIfNeeded()) nextQuestion();
    }

    private void answerChoice(int choice) {
        answered++;
        revised++;
        // Toute réponse par propositions relève du classique et coupe la série mentale.
        mentalStreak = 0;
        if (choice == current.correct) {
            classicOk++;
            classicStreak++;
            goodStreak++;
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
        } else {
            wrongAnswers.add(new WrongAnswer(current, choice));
            classicStreak = 0;
            goodStreak = 0;
        }
        updateStatus("R");
        showChoiceResult(choice);
        screenRoot.postDelayed(this::continueAfterAnswer, 900);
    }

    private void finish(String status) {
        answered++;
        if ("M".equals(status)) {
            mentalOk++;
            goodStreak++;
            mentalStreak++;
            classicStreak = 0;
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
            if (mentalStreak > bestMentalStreak) bestMentalStreak = mentalStreak;
        } else {
            revised++;
            goodStreak = 0;
            classicStreak = 0;
            mentalStreak = 0;
        }
        updateStatus(status);
        continueAfterAnswer();
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
