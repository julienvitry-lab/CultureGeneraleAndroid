package fr.culturegenerale.android;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

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

    private File appFolder, dbFile, imagesFolder;
    private LinearLayout root;
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
        showHome();
    }

    @Override public void onResume() {
        super.onResume();
        if ("home".equals(phase)) showHome();
    }

    private void base() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(10), dp(6), dp(10), dp(8));
        root.setBackgroundColor(Color.BLACK);
        scroll.addView(root);
        setContentView(scroll);
    }

    private TextView tv(String text, int sp, int color, int gravity, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text == null ? "" : text);
        v.setTextSize(sp);
        v.setTextColor(color);
        v.setGravity(gravity);
        v.setPadding(dp(8), dp(5), dp(8), dp(5));
        if (bold) v.setTypeface(null, 1);
        return v;
    }

    private Button btn(String text, int sp) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(sp);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(8), dp(8), dp(8), dp(8));
        return b;
    }

    private void add(View v) { root.addView(v, new LinearLayout.LayoutParams(-1, -2)); }
    private void add(View v, int heightDp) { root.addView(v, new LinearLayout.LayoutParams(-1, dp(heightDp))); }

    private void band(String text, int color, int textColor, int sp, int minHeightDp) {
        TextView v = tv(text, sp, textColor, Gravity.CENTER, true);
        v.setBackgroundColor(color);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(3), 0, dp(3));
        v.setMinHeight(dp(minHeightDp));
        root.addView(v, lp);
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
        base();
        add(tv("Culture Générale Android V4.0 Alpha", 28, Color.WHITE, Gravity.CENTER, true));
        add(tv("Session sans répétition · retour arrière · P/I/T", 17, Color.LTGRAY, Gravity.CENTER, true));
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
        Map<String, Long> counts = countDomains();
        long total = 0;
        for (long n : counts.values()) total += n;
        long images = countSql("SELECT COUNT(*) FROM " + TABLE + " WHERE is_image=1");
        add(tv("Questions jouables : " + total + " · Images : " + images, 18, Color.rgb(160, 220, 255), Gravity.CENTER, true));
        Button all = btn("0. Tous les domaines · " + total, 21);
        all.setOnClickListener(v -> startDomain(null));
        add(all);
        for (int i = 0; i < DOMAINS.length; i++) {
            String d = DOMAINS[i];
            long c = counts.containsKey(d) ? counts.get(d) : 0;
            Button b = btn((i + 1) + ". " + d + " · " + c, 20);
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
                base();
                band("Aucune question jouable", RED, Color.WHITE, 24, 70);
                Button b = btn("Retour domaines", 20);
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
            base();
            band("Erreur : " + e.getMessage(), RED, Color.WHITE, 18, 90);
            Button b = btn("Retour domaines", 20);
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

    private void stats() {
        String s = "Répondues : " + answered + "   🧠 " + mentalOk + "   R " + revised + "   Série " + goodStreak + "/" + bestGoodStreak + "   Mental " + mentalStreak + "/" + bestMentalStreak + "   Historique " + (historyIndex + 1) + "/" + history.size();
        TextView v = tv(s, 15, Color.WHITE, Gravity.CENTER, true);
        v.setBackgroundColor(DARK);
        add(v);
    }

    private void showQuestion() {
        phase = "question";
        base();
        stats();
        band(current.domain, BLUE, Color.WHITE, 22, 46);
        band(current.theme, GREEN, Color.WHITE, 20, 44);
        band(current.question, RED, Color.WHITE, 24, 58);
        if (current.isImage && showImage()) {
            // image shown
        } else {
            band(current.detail.length() == 0 ? " " : current.detail, YELLOW, Color.BLACK, 22, 90);
        }
        Button b = btn("Afficher les propositions", 20);
        b.setOnClickListener(v -> showChoices(false, 0));
        add(b);
        addFlagButtons();
        Button prev = btn("Question précédente", 17);
        prev.setOnClickListener(v -> previousQuestion());
        add(prev);
        Button ret = btn("Retour domaines", 17);
        ret.setOnClickListener(v -> showHome());
        add(ret);
    }

    private boolean showImage() {
        File f = imageFile(current.imageFile);
        if (f == null || !f.exists()) return false;
        Bitmap bm = decode(f);
        if (bm == null) return false;
        ImageView iv = new ImageView(this);
        iv.setImageBitmap(bm);
        iv.setAdjustViewBounds(true);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        iv.setBackgroundColor(Color.BLACK);
        add(iv, 300);
        return true;
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

    private void showChoices(boolean reveal, int wrongChoice) {
        phase = reveal ? "reveal" : "choices";
        base();
        stats();
        band(reveal ? "Réponse révélée" : "Propositions", RED, Color.WHITE, 24, 55);
        for (int i = 1; i <= 4; i++) {
            Button b = btn(label(i) + " · " + current.props[i - 1], 22);
            if (reveal && i == current.correct) b.setBackgroundColor(Color.rgb(0, 165, 65));
            if (wrongChoice == i && wrongChoice != current.correct) b.setBackgroundColor(Color.rgb(190, 25, 25));
            final int idx = i;
            b.setOnClickListener(v -> {
                if (!reveal) answerChoice(idx);
            });
            add(b, 78);
        }
        if (!reveal) {
            Button mental = btn("Je pense connaître la réponse", 20);
            mental.setOnClickListener(v -> showChoices(true, 0));
            add(mental);
        } else {
            Button ok = btn("C'était ma réponse → A", 20);
            ok.setOnClickListener(v -> finish("A"));
            add(ok);
            Button ko = btn("Ce n'était pas ma réponse → R", 20);
            ko.setOnClickListener(v -> finish("R"));
            add(ko);
        }
        addFlagButtons();
        Button back = btn("Revoir la question", 17);
        back.setOnClickListener(v -> showQuestion());
        add(back);
    }

    private void addFlagButtons() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button p = btn("P", 15);
        p.setOnClickListener(v -> flagAndNext("P", "Problème noté"));
        Button i = btn("I", 15);
        i.setOnClickListener(v -> flagAndNext("I", "Image à revoir notée"));
        Button t = btn("T", 15);
        t.setOnClickListener(v -> flagAndNext("T", "Thème à exclure noté"));
        row.addView(p, new LinearLayout.LayoutParams(0, dp(44), 1));
        row.addView(i, new LinearLayout.LayoutParams(0, dp(44), 1));
        row.addView(t, new LinearLayout.LayoutParams(0, dp(44), 1));
        root.addView(row, new LinearLayout.LayoutParams(-1, -2));
    }

    private void flagAndNext(String status, String msg) {
        updateStatus(status);
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
        root.postDelayed(this::nextQuestion, 350);
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
        showChoices(true, choice);
        root.postDelayed(this::nextQuestion, 650);
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

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN || current == null) return super.dispatchKeyEvent(e);
        int k = e.getKeyCode();
        if ("question".equals(phase)) {
            if (k == KeyEvent.KEYCODE_SPACE || k == KeyEvent.KEYCODE_Q) { showChoices(false, 0); return true; }
            if (k == KeyEvent.KEYCODE_ENTER) { previousQuestion(); return true; }
            if (k == KeyEvent.KEYCODE_P) { flagAndNext("P", "Problème noté"); return true; }
            if (k == KeyEvent.KEYCODE_I) { flagAndNext("I", "Image à revoir notée"); return true; }
            if (k == KeyEvent.KEYCODE_T) { flagAndNext("T", "Thème à exclure noté"); return true; }
        } else if ("choices".equals(phase)) {
            if (k == KeyEvent.KEYCODE_SPACE) { showChoices(true, 0); return true; }
            if (k == KeyEvent.KEYCODE_Q) { answerChoice(1); return true; }
            if (k == KeyEvent.KEYCODE_D) { answerChoice(2); return true; }
            if (k == KeyEvent.KEYCODE_K) { answerChoice(3); return true; }
            if (k == KeyEvent.KEYCODE_M) { answerChoice(4); return true; }
            if (k == KeyEvent.KEYCODE_ENTER) { showQuestion(); return true; }
        } else if ("reveal".equals(phase)) {
            if (k == KeyEvent.KEYCODE_SPACE) { finish("A"); return true; }
            if (k == KeyEvent.KEYCODE_Q) { finish("R"); return true; }
            if (k == KeyEvent.KEYCODE_ENTER) { showQuestion(); return true; }
        }
        return super.dispatchKeyEvent(e);
    }

    private String label(int i) { return i == 1 ? "Q" : i == 2 ? "D" : i == 3 ? "K" : "M"; }
    private String safe(String s) { return s == null ? "" : s.trim(); }
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
