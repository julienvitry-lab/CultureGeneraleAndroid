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
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

public class MainActivity extends Activity {
    private static final String APP_FOLDER = "Culture Générale";
    private static final String DB_NAME = "questions_base.sqlite";
    private static final String TABLE = "questions";
    private static final String[] OFFICIAL_DOMAINS = new String[]{
            "Animaux et Plantes",
            "Culture Classique",
            "Culture Générale",
            "Culture Moderne",
            "Géographie",
            "Histoire",
            "Sciences et Techniques",
            "Sport"
    };

    private File appFolder;
    private File dbFile;
    private File imagesFolder;
    private LinearLayout root;
    private final Random random = new Random();
    private Question currentQuestion;
    private String currentDomain = null;
    private boolean propositionsVisible = false;
    private boolean mentalRevealed = false;
    private int totalAnswered = 0;
    private int mentalOk = 0;
    private int revised = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appFolder = new File(Environment.getExternalStorageDirectory(), APP_FOLDER);
        dbFile = new File(appFolder, DB_NAME);
        imagesFolder = new File(appFolder, "Images");
        showHome();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (root != null && currentQuestion == null) showHome();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);
        int code = event.getKeyCode();
        if (currentQuestion == null) return super.dispatchKeyEvent(event);

        if (!propositionsVisible) {
            if (code == KeyEvent.KEYCODE_SPACE || code == KeyEvent.KEYCODE_Q || code == KeyEvent.KEYCODE_ENTER) {
                showPropositions();
                return true;
            }
        } else {
            if (mentalRevealed) {
                if (code == KeyEvent.KEYCODE_SPACE) { finishQuestion("A"); return true; }
                if (code == KeyEvent.KEYCODE_Q) { finishQuestion("R"); return true; }
            } else {
                if (code == KeyEvent.KEYCODE_SPACE) { revealMental(); return true; }
                if (code == KeyEvent.KEYCODE_Q) { answerChoice(1); return true; }
                if (code == KeyEvent.KEYCODE_D) { answerChoice(2); return true; }
                if (code == KeyEvent.KEYCODE_K) { answerChoice(3); return true; }
                if (code == KeyEvent.KEYCODE_M) { answerChoice(4); return true; }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void setBaseScreen() {
        ScrollView scroll = new ScrollView(this);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(28, 24, 28, 24);
        root.setBackgroundColor(Color.BLACK);
        scroll.addView(root);
        setContentView(scroll);
    }

    private TextView tv(String text, int sp, int color, int gravity) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(sp);
        v.setTextColor(color);
        v.setGravity(gravity);
        v.setPadding(14, 10, 14, 10);
        return v;
    }

    private Button btn(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18);
        b.setAllCaps(false);
        b.setPadding(8, 10, 8, 10);
        return b;
    }

    private void add(View v) {
        root.addView(v, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void addGap(int h) {
        TextView gap = new TextView(this);
        root.addView(gap, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h));
    }

    private boolean hasFileAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void openManageFilesSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 200);
            }
        } catch (Exception e) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            startActivity(intent);
        }
    }

    private void showHome() {
        currentQuestion = null;
        propositionsVisible = false;
        mentalRevealed = false;
        setBaseScreen();
        add(tv("Culture Générale Android V2.0 Alpha", 28, Color.WHITE, Gravity.CENTER));
        add(tv("Version réelle · menu des mégathèmes", 17, Color.rgb(220, 220, 220), Gravity.CENTER));
        addGap(14);

        if (!hasFileAccess()) {
            add(tv("Accès fichiers Android : À autoriser", 22, Color.YELLOW, Gravity.CENTER));
            Button auth = btn("Autoriser l'accès aux fichiers");
            auth.setOnClickListener(v -> openManageFilesSettings());
            add(auth);
            return;
        }
        if (!dbFile.exists()) {
            add(tv("Base SQLite introuvable :\n" + dbFile.getAbsolutePath(), 20, Color.RED, Gravity.CENTER));
            return;
        }

        Map<String, Long> counts;
        long totalPlayable;
        long imageCount;
        try {
            counts = countByDomain();
            totalPlayable = 0;
            for (long n : counts.values()) totalPlayable += n;
            imageCount = countImages();
        } catch (Exception e) {
            add(tv("Erreur SQLite : " + e.getMessage(), 18, Color.RED, Gravity.LEFT));
            return;
        }

        add(tv("Questions jouables : " + totalPlayable + " · Images : " + imageCount, 18, Color.rgb(180, 230, 255), Gravity.CENTER));
        addGap(10);

        Button all = btn("0. Tous les domaines · " + totalPlayable);
        all.setOnClickListener(v -> startDomain(null));
        add(all);
        addGap(8);

        int n = 1;
        for (String d : OFFICIAL_DOMAINS) {
            long c = counts.containsKey(d) ? counts.get(d) : 0;
            Button b = btn(n + ". " + d + " · " + c);
            final String domain = d;
            b.setOnClickListener(v -> startDomain(domain));
            add(b);
            n++;
        }
    }

    private void startDomain(String domain) {
        currentDomain = domain;
        loadNextQuestion();
    }

    private SQLiteDatabase openDb() {
        return SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
    }

    private String playableWhere(boolean withDomain) {
        String w = "(status IS NULL OR TRIM(status)='' OR UPPER(TRIM(status))='R')";
        if (withDomain) w += " AND megatheme=?";
        return w;
    }

    private Map<String, Long> countByDomain() {
        Map<String, Long> result = new HashMap<>();
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery("SELECT megatheme, COUNT(*) FROM " + TABLE + " WHERE " + playableWhere(false) + " GROUP BY megatheme", null);
            try {
                while (c.moveToNext()) {
                    String d = normalizeDomain(c.getString(0));
                    long n = c.getLong(1);
                    Long old = result.get(d);
                    result.put(d, (old == null ? 0 : old) + n);
                }
            } finally { c.close(); }
        } finally { db.close(); }
        for (String d : OFFICIAL_DOMAINS) if (!result.containsKey(d)) result.put(d, 0L);
        return result;
    }

    private long countImages() {
        SQLiteDatabase db = openDb();
        try {
            Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + TABLE + " WHERE is_image=1", null);
            try { return c.moveToFirst() ? c.getLong(0) : 0; }
            finally { c.close(); }
        } finally { db.close(); }
    }

    private void loadNextQuestion() {
        try {
            Question q = randomQuestion(currentDomain);
            if (q == null) {
                setBaseScreen();
                add(tv("Plus aucune question jouable dans ce domaine.", 22, Color.YELLOW, Gravity.CENTER));
                Button back = btn("Retour aux domaines");
                back.setOnClickListener(v -> showHome());
                add(back);
                return;
            }
            currentQuestion = q;
            propositionsVisible = false;
            mentalRevealed = false;
            showQuestion();
        } catch (Exception e) {
            setBaseScreen();
            add(tv("Erreur chargement question :\n" + e.getMessage(), 18, Color.RED, Gravity.LEFT));
            Button back = btn("Retour aux domaines");
            back.setOnClickListener(v -> showHome());
            add(back);
        }
    }

    private Question randomQuestion(String domain) {
        SQLiteDatabase db = openDb();
        try {
            String where = playableWhere(domain != null);
            String countSql = "SELECT COUNT(*) FROM " + TABLE + " WHERE " + where;
            Cursor countCursor = domain == null ? db.rawQuery(countSql, null) : db.rawQuery(countSql, new String[]{domain});
            int count;
            try { count = countCursor.moveToFirst() ? countCursor.getInt(0) : 0; }
            finally { countCursor.close(); }
            if (count <= 0) return null;
            int offset = random.nextInt(count);
            String sql = "SELECT row_number, megatheme, theme, question, detail, proposition_a, proposition_b, proposition_c, proposition_d, correct_index, image_file, is_image " +
                    "FROM " + TABLE + " WHERE " + where + " LIMIT 1 OFFSET " + offset;
            Cursor c = domain == null ? db.rawQuery(sql, null) : db.rawQuery(sql, new String[]{domain});
            try {
                if (!c.moveToFirst()) return null;
                Question q = new Question();
                q.rowNumber = c.getLong(0);
                q.domain = normalizeDomain(c.getString(1));
                q.theme = safe(c.getString(2));
                q.question = safe(c.getString(3));
                q.detail = safe(c.getString(4));
                q.propositions[0] = safe(c.getString(5));
                q.propositions[1] = safe(c.getString(6));
                q.propositions[2] = safe(c.getString(7));
                q.propositions[3] = safe(c.getString(8));
                q.correctIndex = c.getInt(9);
                q.imageFile = safe(c.getString(10));
                q.isImage = c.getInt(11) == 1 || q.imageFile.length() > 0;
                if (q.correctIndex < 1 || q.correctIndex > 4) q.correctIndex = 1;
                return q;
            } finally { c.close(); }
        } finally { db.close(); }
    }

    private void showQuestion() {
        setBaseScreen();
        addStatsBar();
        addColored(currentQuestion.domain, Color.rgb(0, 95, 190), 22);
        addColored(currentQuestion.theme, Color.rgb(0, 135, 60), 19);
        addColored(currentQuestion.question, Color.rgb(185, 0, 0), 23);

        if (currentQuestion.isImage && showImageIfExists(currentQuestion.imageFile)) {
            // image shown
        } else if (currentQuestion.detail.length() > 0) {
            addColored(currentQuestion.detail, Color.rgb(245, 205, 40), 22, Color.BLACK);
        } else {
            addColored(" ", Color.rgb(245, 205, 40), 22, Color.BLACK);
        }
        addGap(14);
        Button show = btn("Afficher les propositions");
        show.setOnClickListener(v -> showPropositions());
        add(show);
        Button back = btn("Retour domaines");
        back.setOnClickListener(v -> showHome());
        add(back);
    }

    private void addStatsBar() {
        String s = "Répondues : " + totalAnswered + "   🧠 " + mentalOk + "   R " + revised;
        TextView bar = tv(s, 16, Color.WHITE, Gravity.CENTER);
        bar.setBackgroundColor(Color.rgb(35, 35, 35));
        add(bar);
    }

    private void addColored(String text, int bg, int sp) {
        addColored(text, bg, sp, Color.WHITE);
    }

    private void addColored(String text, int bg, int sp, int fg) {
        TextView v = tv(text == null ? "" : text, sp, fg, Gravity.CENTER);
        v.setBackgroundColor(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 6, 0, 6);
        root.addView(v, lp);
    }

    private boolean showImageIfExists(String imageName) {
        File f = resolveImage(imageName);
        if (f == null || !f.exists()) return false;
        Bitmap bitmap = decodeScaledBitmap(f, 1400, 900);
        if (bitmap == null) return false;
        ImageView img = new ImageView(this);
        img.setImageBitmap(bitmap);
        img.setAdjustViewBounds(true);
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        img.setBackgroundColor(Color.BLACK);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 620);
        lp.setMargins(0, 8, 0, 8);
        root.addView(img, lp);
        return true;
    }

    private File resolveImage(String imageName) {
        if (imageName == null) return null;
        String name = imageName.trim();
        if (name.length() == 0) return null;
        List<String> candidates = new ArrayList<>();
        candidates.add(name);
        if (!name.toLowerCase(Locale.ROOT).endsWith(".jpg") && !name.toLowerCase(Locale.ROOT).endsWith(".jpeg") && !name.toLowerCase(Locale.ROOT).endsWith(".png") && !name.toLowerCase(Locale.ROOT).endsWith(".webp")) {
            candidates.add(name + ".jpg");
            candidates.add(name + ".jpeg");
            candidates.add(name + ".png");
            candidates.add(name + ".webp");
        }
        for (String c : candidates) {
            File f = new File(imagesFolder, c);
            if (f.exists()) return f;
        }
        return new File(imagesFolder, name);
    }

    private Bitmap decodeScaledBitmap(File file, int reqW, int reqH) {
        try {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
            int sample = 1;
            while ((opts.outWidth / sample) > reqW || (opts.outHeight / sample) > reqH) sample *= 2;
            BitmapFactory.Options opts2 = new BitmapFactory.Options();
            opts2.inSampleSize = sample;
            return BitmapFactory.decodeFile(file.getAbsolutePath(), opts2);
        } catch (Exception e) {
            return null;
        }
    }

    private void showPropositions() {
        propositionsVisible = true;
        mentalRevealed = false;
        setBaseScreen();
        addStatsBar();
        addColored(currentQuestion.domain + " · " + currentQuestion.theme, Color.rgb(0, 95, 190), 19);
        addColored("Propositions", Color.rgb(185, 0, 0), 23);
        for (int i = 1; i <= 4; i++) addPropositionButton(i, false, false);
        addGap(12);
        Button mental = btn("ESPACE · Je pense connaître la réponse");
        mental.setOnClickListener(v -> revealMental());
        add(mental);
        Button retour = btn("Retour à la question");
        retour.setOnClickListener(v -> showQuestion());
        add(retour);
    }

    private void addPropositionButton(int index, boolean showResult, boolean chosenWrong) {
        String label = labelFor(index) + "  " + currentQuestion.propositions[index - 1];
        Button b = btn(label);
        if (showResult && index == currentQuestion.correctIndex) b.setBackgroundColor(Color.rgb(30, 170, 60));
        if (chosenWrong && index != currentQuestion.correctIndex) b.setBackgroundColor(Color.rgb(180, 25, 25));
        final int idx = index;
        b.setOnClickListener(v -> {
            if (!mentalRevealed) answerChoice(idx);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 7, 0, 7);
        root.addView(b, lp);
    }

    private String labelFor(int i) {
        if (i == 1) return "Q";
        if (i == 2) return "D";
        if (i == 3) return "K";
        return "M";
    }

    private void revealMental() {
        propositionsVisible = true;
        mentalRevealed = true;
        setBaseScreen();
        addStatsBar();
        addColored("Réponse mentale", Color.rgb(185, 0, 0), 23);
        for (int i = 1; i <= 4; i++) addPropositionButton(i, true, false);
        addGap(12);
        Button ok = btn("ESPACE · C'était ma réponse → Assimilée (A)");
        ok.setOnClickListener(v -> finishQuestion("A"));
        add(ok);
        Button fail = btn("Q · Ce n'était pas ma réponse → À réviser (R)");
        fail.setOnClickListener(v -> finishQuestion("R"));
        add(fail);
    }

    private void answerChoice(int index) {
        setBaseScreen();
        addStatsBar();
        addColored(index == currentQuestion.correctIndex ? "Bonne réponse, mais à réviser" : "Réponse à revoir", Color.rgb(185, 0, 0), 23);
        for (int i = 1; i <= 4; i++) addPropositionButton(i, true, i == index && i != currentQuestion.correctIndex);
        updateStatus("R");
        totalAnswered++;
        revised++;
        Button next = btn("Question suivante");
        next.setOnClickListener(v -> loadNextQuestion());
        add(next);
    }

    private void finishQuestion(String status) {
        updateStatus(status);
        totalAnswered++;
        if ("A".equals(status)) mentalOk++; else revised++;
        loadNextQuestion();
    }

    private void updateStatus(String status) {
        SQLiteDatabase db = openDb();
        try {
            db.execSQL("UPDATE " + TABLE + " SET status=? WHERE row_number=?", new Object[]{status, currentQuestion.rowNumber});
        } finally { db.close(); }
    }

    private String normalizeDomain(String raw) {
        String s = safe(raw).replace('\u00A0', ' ');
        while (s.contains("  ")) s = s.replace("  ", " ");
        if (s.equalsIgnoreCase("Culture classique")) return "Culture Classique";
        if (s.equalsIgnoreCase("Animaux et plantes")) return "Animaux et Plantes";
        if (s.equalsIgnoreCase("Sciences et techniques")) return "Sciences et Techniques";
        if (s.equalsIgnoreCase("Culture générale")) return "Culture Générale";
        if (s.equalsIgnoreCase("Culture moderne")) return "Culture Moderne";
        if (s.equalsIgnoreCase("Géographie")) return "Géographie";
        if (s.equalsIgnoreCase("Histoire")) return "Histoire";
        if (s.equalsIgnoreCase("Sport")) return "Sport";
        return s.length() == 0 ? "Culture Générale" : s;
    }

    private String safe(String s) {
        return s == null ? "" : s.trim();
    }

    private static class Question {
        long rowNumber;
        String domain;
        String theme;
        String question;
        String detail;
        String[] propositions = new String[]{"", "", "", ""};
        int correctIndex;
        String imageFile;
        boolean isImage;
    }
}
