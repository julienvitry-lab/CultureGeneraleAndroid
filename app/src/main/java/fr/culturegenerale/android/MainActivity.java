package fr.culturegenerale.android;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
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

    private File appFolder, dbFile, imagesFolder;
    private LinearLayout screenRoot;
    private LinearLayout root;
    private LinearLayout bottomBar;
    private Typeface appFont = Typeface.DEFAULT_BOLD;
    private final Button[] choiceButtons = new Button[4];
    private PopupWindow transientPopup;
    private final Random random = new Random();
    private Question current;
    private String currentDomain = null;
    private String phase = "home";

    private final Set<Long> askedThisSession = new HashSet<>();
    private final List<Question> history = new ArrayList<>();
    private int historyIndex = -1;

    private int answered = 0;
    private int mentalOk = 0;
    private int revised = 0;
    private int goodStreak = 0;
    private int bestGoodStreak = 0;
    private int mentalStreak = 0;
    private int bestMentalStreak = 0;

    static class Question {
        long row;
        String domain, theme, question, detail, imageFile;
        String[] props = new String[]{"", "", "", ""};
        int correct;
        boolean isImage;
    }

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        appFolder = new File(Environment.getExternalStorageDirectory(), APP_FOLDER);
        dbFile = new File(appFolder, DB_NAME);
        imagesFolder = new File(appFolder, "Images");
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
        root.setPadding(dp(10), dp(6), dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        scroll.addView(root);
        screenRoot.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

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
        root.setPadding(dp(10), dp(6), dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        screenRoot.addView(root, new LinearLayout.LayoutParams(-1, 0, 1));

        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setGravity(Gravity.CENTER);
        bottomBar.setVisibility(View.GONE);
        screenRoot.addView(bottomBar, new LinearLayout.LayoutParams(-1, cmToPx(2.0f)));
        setContentView(screenRoot);
    }

    private TextView tv(String text, int sp, int color, int gravity, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text == null ? "" : text);
        v.setTextSize(sp + 2);
        v.setTextColor(color);
        v.setGravity(gravity);
        v.setPadding(dp(8), dp(5), dp(8), dp(5));
        v.setTypeface(appFont);
        v.setIncludeFontPadding(false);
        return v;
    }

    private Button btn(String text, int sp) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(sp + 2);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(8), dp(8), dp(8), dp(8));
        b.setTypeface(appFont);
        b.setTextColor(Color.WHITE);
        b.setBackground(roundedBackground(GREY, 16));
        return b;
    }

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private void setRoundedBackground(View view, int color, int radiusDp) {
        view.setBackground(roundedBackground(color, radiusDp));
    }

    private void add(View v) { root.addView(v, new LinearLayout.LayoutParams(-1, -2)); }
    private void add(View v, int heightDp) { root.addView(v, new LinearLayout.LayoutParams(-1, dp(heightDp))); }

    private void band(String text, int color, int textColor, int sp, int minHeightDp) {
        TextView v = tv(text, sp, textColor, Gravity.CENTER, true);
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(3), 0, dp(3));
        v.setMinHeight(dp(minHeightDp));
        root.addView(v, lp);
    }

    private void singleLineBand(String text, int color, int textColor, int maxSp, int minSp, int minHeightDp) {
        TextView v = tv(text, maxSp - 2, textColor, Gravity.CENTER, true);
        int innerMargin = cmToPx(0.5f); // 5 mm autour du texte
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setSingleLine(true);
        v.setMaxLines(1);
        v.setHorizontallyScrolling(false);
        v.setMinHeight(dp(minHeightDp));
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(3), 0, dp(3));
        root.addView(v, lp);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.setAutoSizeTextTypeUniformWithConfiguration(minSp, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
        } else {
            v.post(() -> fitSingleLineLegacy(v, text, maxSp, minSp));
        }
    }

    private void upperBand(String text, int color, int textColor, int sp, int minHeightDp) {
        TextView v = tv(text, sp, textColor, Gravity.CENTER, true);
        int innerMargin = cmToPx(0.5f); // 5 mm en haut, bas, gauche et droite
        v.setPadding(innerMargin, innerMargin, innerMargin, innerMargin);
        v.setMinHeight(dp(minHeightDp));
        setRoundedBackground(v, color, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(3), 0, dp(3));
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
        baseScrollable();
        add(tv("Culture Générale Android V9.2", 28, Color.WHITE, Gravity.CENTER, true));
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
        Button all = btn("Tous les domaines", 21);
        all.setOnClickListener(v -> startDomain(null));
        add(all);
        for (String d : DOMAINS) {
            Button b = btn(d, 20);
            b.setOnClickListener(v -> startDomain(d));
            add(b);
        }
    }

    private Map<String, Long> countDomains() {
        Map<String, Long> map = new HashMap<>();
        for (String d : DOMAINS) map.put(d, 0L);
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery("SELECT megatheme, COUNT(*) FROM " + TABLE + " WHERE " + playableWhere(false) + " GROUP BY megatheme", null);
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

    private String playableWhere(boolean domain) {
        String w = "(status IS NULL OR TRIM(status)='' OR UPPER(TRIM(status))='R')";
        if (domain) w += " AND LOWER(TRIM(megatheme))=LOWER(TRIM(?))";
        return w;
    }

    private void startDomain(String domain) {
        currentDomain = domain;
        answered = mentalOk = revised = goodStreak = bestGoodStreak = mentalStreak = bestMentalStreak = 0;
        askedThisSession.clear();
        history.clear();
        historyIndex = -1;
        nextQuestion();
    }

    private void nextQuestion() {
        try {
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
        for (int tries = 0; tries < 30; tries++) {
            q = loadRandom(domain);
            if (q == null) return null;
            if (!askedThisSession.contains(q.row)) return q;
        }
        return q;
    }

    private Question loadRandom(String domain) {
        SQLiteDatabase db = openDb();
        try {
            String where = playableWhere(domain != null);
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
        singleLineBand(current.domain + " · " + current.theme, BLUE, Color.WHITE, 23, 10, 48);
        singleLineBand(current.question, RED, Color.WHITE, 25, 8, 58);
        if (current.detail.length() > 0) {
            upperBand(current.detail, YELLOW, Color.BLACK, 21, 62);
        }
        if (current.isImage) {
            showImageCentered();
        } else {
            Space spacer = new Space(this);
            root.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1));
        }
        setQuestionBottomBar();
    }

    private void showChoices() {
        phase = "choices";
        baseFixed();
        for (int i = 1; i <= 4; i++) {
            final int idx = i;
            Button b = btn(current.props[i - 1], 22);
            setRoundedBackground(b, GREY, 18);
            b.setTextColor(Color.WHITE);
            b.setOnClickListener(v -> answerChoice(idx));
            choiceButtons[i - 1] = b;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1);
            lp.setMargins(0, dp(5), 0, dp(5));
            root.addView(b, lp);
        }
        setChoicesBottomBar();
    }

    private void revealMental() {
        phase = "reveal";
        baseFixed();
        for (int i = 1; i <= 4; i++) {
            Button b = btn(current.props[i - 1], 22);
            b.setEnabled(false);
            b.setTextColor(Color.WHITE);
            setRoundedBackground(b, i == current.correct ? Color.rgb(0, 165, 65) : GREY, 18);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1);
            lp.setMargins(0, dp(5), 0, dp(5));
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
            if (i == current.correct) setRoundedBackground(b, Color.rgb(0, 165, 65), 18);
            else if (i == chosenChoice) setRoundedBackground(b, Color.rgb(190, 25, 25), 18);
            else setRoundedBackground(b, GREY, 18);
        }
        setBottomBarEnabled(false);
        // La couleur des propositions constitue désormais l'unique retour visuel.
    }

    private void setQuestionBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("Signaler", RED, v -> showProblemMenu());
        addBottomButton("Statistiques", BLUE, v -> showStatsMenu());
        addBottomButton("Propositions", GREEN, v -> showChoices());
    }

    private void setChoicesBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("Signaler", RED, v -> showProblemMenu());
        addBottomButton("Statistiques", BLUE, v -> showStatsMenu());
        addBottomButton("Révéler", GREEN, v -> revealMental());
    }

    private void setRevealBottomBar() {
        bottomBar.setVisibility(View.VISIBLE);
        bottomBar.removeAllViews();
        addBottomButton("À revoir", RED, v -> finish("R"));
        addBottomButton("Statistiques", BLUE, v -> showStatsMenu());
        addBottomButton("Assimilée", GREEN, v -> finish("A"));
    }

    private void addBottomButton(String text, int color, View.OnClickListener listener) {
        Button b = btn(text, 16);
        setRoundedBackground(b, color, 16);
        b.setTextColor(Color.WHITE);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1);
        lp.setMargins(dp(3), dp(3), dp(3), dp(3));
        bottomBar.addView(b, lp);
    }

    private void setBottomBarEnabled(boolean enabled) {
        if (bottomBar == null) return;
        for (int i = 0; i < bottomBar.getChildCount(); i++) {
            bottomBar.getChildAt(i).setEnabled(enabled);
        }
    }

    private void showTransientMessage(String message, int color) {
        if (transientPopup != null && transientPopup.isShowing()) transientPopup.dismiss();
        TextView label = tv(message, 18, Color.WHITE, Gravity.CENTER, true);
        label.setPadding(dp(22), dp(12), dp(22), dp(12));
        setRoundedBackground(label, color, 16);
        transientPopup = new PopupWindow(label, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, false);
        transientPopup.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        transientPopup.setOutsideTouchable(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) transientPopup.setElevation(dp(10));
        transientPopup.showAtLocation(screenRoot, Gravity.CENTER, 0, 0);
        screenRoot.postDelayed(() -> {
            if (transientPopup != null && transientPopup.isShowing()) transientPopup.dismiss();
        }, 750);
    }

    private void showProblemMenu() {
        final AlertDialog dialog = new AlertDialog.Builder(this).create();
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(10), dp(10), dp(10), dp(10));
        setRoundedBackground(panel, DARK, 20);

        TextView title = tv("Signaler", 20, Color.WHITE, Gravity.CENTER, true);
        panel.addView(title, new LinearLayout.LayoutParams(-1, dp(44)));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        String[] codes = new String[]{"P", "I", "T"};
        String[] labels = new String[]{"Problème général", "Problème image", "Thème à exclure"};
        String[] messages = new String[]{"Problème général noté", "Problème d'image noté", "Thème à exclure noté"};
        for (int i = 0; i < 3; i++) {
            final int idx = i;
            Button b = btn(codes[i] + "\n" + labels[i], 14);
            setRoundedBackground(b, RED, 16);
            b.setTextColor(Color.WHITE);
            b.setOnClickListener(v -> {
                dialog.dismiss();
                flagAndNext(codes[idx], messages[idx]);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, cmToPx(2.0f), 1);
            lp.setMargins(dp(4), dp(4), dp(4), dp(4));
            row.addView(b, lp);
        }
        panel.addView(row, new LinearLayout.LayoutParams(-1, -2));

        dialog.setView(panel);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setOnShowListener(d -> {
            Window w = dialog.getWindow();
            if (w != null) {
                w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                w.setLayout(getResources().getDisplayMetrics().widthPixels - dp(20), ViewGroup.LayoutParams.WRAP_CONTENT);
            }
        });
        dialog.show();
    }

    private void showStatsMenu() {
        String message;
        try {
            message = "Session\n" +
                    "Répondues : " + answered + "\n" +
                    "Assimilées mentalement : " + mentalOk + "\n" +
                    "À revoir : " + revised + "\n" +
                    "Série juste : " + goodStreak + " / record " + bestGoodStreak + "\n" +
                    "Série mentale : " + mentalStreak + " / record " + bestMentalStreak + "\n" +
                    "Historique : " + (historyIndex + 1) + " / " + history.size() + "\n\n" +
                    "Base\n" +
                    "A : " + countStatus("A") + "   R : " + countStatus("R") + "\n" +
                    "P : " + countStatus("P") + "   I : " + countStatus("I") + "\n" +
                    "T : " + countStatus("T") + "   X : " + countStatus("X");
        } catch (Exception e) {
            message = "Statistiques base indisponibles : " + e.getMessage();
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("Statistiques")
                .setMessage(message)
                .setPositiveButton("Fermer", null)
                .setNegativeButton("Fin de partie", (dialog, which) -> showEndScreen());

        if ("choices".equals(phase) || "reveal".equals(phase) || "result".equals(phase)) {
            builder.setNeutralButton("Revoir la question", (dialog, which) -> showQuestion());
        } else if (historyIndex > 0) {
            builder.setNeutralButton("Question précédente", (dialog, which) -> previousQuestion());
        }
        builder.show();
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
        band("Répondues : " + answered + "\nAssimilées mentalement : " + mentalOk + "\nÀ revoir : " + revised + "\nSérie juste : " + goodStreak + " / record " + bestGoodStreak + "\nSérie mentale : " + mentalStreak + " / record " + bestMentalStreak, DARK, Color.WHITE, 21, 150);
        try {
            band("Base actuelle\nA : " + countStatus("A") + "   R : " + countStatus("R") + "   P : " + countStatus("P") + "   I : " + countStatus("I") + "   T : " + countStatus("T") + "   X : " + countStatus("X"), BLUE, Color.WHITE, 18, 100);
        } catch (Exception e) {
            band("Statistiques base indisponibles : " + e.getMessage(), DARK, Color.WHITE, 16, 70);
        }
        if (current != null) {
            Button resume = btn("Reprendre la partie", 20);
            resume.setOnClickListener(v -> showQuestion());
            add(resume);
        }
        Button newGame = btn("Nouvelle partie", 20);
        newGame.setOnClickListener(v -> showHome());
        add(newGame);
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
        updateStatus(status);
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
        screenRoot.postDelayed(this::nextQuestion, 350);
    }

    private void answerChoice(int choice) {
        answered++;
        revised++;
        if (choice == current.correct) {
            goodStreak++;
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
        } else {
            goodStreak = 0;
        }
        mentalStreak = 0;
        updateStatus("R");
        showChoiceResult(choice);
        screenRoot.postDelayed(this::nextQuestion, 900);
    }

    private void finish(String status) {
        answered++;
        if ("A".equals(status)) {
            mentalOk++;
            goodStreak++;
            mentalStreak++;
            if (goodStreak > bestGoodStreak) bestGoodStreak = goodStreak;
            if (mentalStreak > bestMentalStreak) bestMentalStreak = mentalStreak;
        } else {
            revised++;
            goodStreak = 0;
            mentalStreak = 0;
        }
        updateStatus(status);
        nextQuestion();
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
            Toast.makeText(this, "Pas de question précédente", Toast.LENGTH_SHORT).show();
        }
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
