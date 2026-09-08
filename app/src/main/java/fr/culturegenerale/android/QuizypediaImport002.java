package fr.culturegenerale.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.WriteBatch;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CGIMPORT002 - Import direct d'une page Quizypedia.
 *
 * Pipeline : URL -> fiches -> champs -> QCM -> aperçu -> SQLite + Firestore.
 * La logique d'extraction est dérivée du script historique
 * EXTRACTION_FICHES_QUIZYPEDIA_V7.py fourni par l'utilisateur.
 */
public final class QuizypediaImport002 {
    private QuizypediaImport002() {}

    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    private static final Pattern HEADER = Pattern.compile("^(.+?)\\s*[\\(\\[]\\s*(\\d+)\\s*/\\s*(\\d+)\\s*[\\)\\]]\\s*$");
    private static final Set<String> STOP = new HashSet<>();
    static {
        Collections.addAll(STOP, "navigation", "communaute", "soutenir le projet", "resultats et classements");
    }

    public static void show(Activity activity, File dbFile) {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(activity, 16);
        box.setPadding(pad, pad, pad, pad);

        EditText url = edit(activity, "URL Quizypedia");
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        box.addView(url);

        EditText megatheme = edit(activity, "Mégathème (auto si déjà connu)");
        box.addView(megatheme);

        EditText theme = edit(activity, "Thème (auto depuis la page/URL)");
        box.addView(theme);

        TextView note = text(activity,
                "CGIMPORT002 analyse la page puis génère des QCM à partir des champs des fiches. " +
                "Aucune question n'est ajoutée avant validation de l'aperçu.");
        box.addView(note);

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Import Quizypedia")
                .setView(box)
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Analyser", null)
                .create();

        dialog.setOnShowListener(x -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String u = clean(url.getText().toString());
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                url.setError("Adresse URL requise");
                return;
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            note.setText("Analyse en cours…");
            analyse(activity, dbFile, u, clean(megatheme.getText().toString()), clean(theme.getText().toString()), dialog);
        }));
        dialog.show();
    }

    private static void analyse(Activity activity, File dbFile, String url, String megaHint, String themeHint, AlertDialog sourceDialog) {
        EXEC.execute(() -> {
            try {
                Result r = fetchAndBuild(dbFile, url, megaHint, themeHint);
                activity.runOnUiThread(() -> {
                    sourceDialog.dismiss();
                    showPreview(activity, dbFile, r);
                });
            } catch (Exception e) {
                activity.runOnUiThread(() -> {
                    sourceDialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    Toast.makeText(activity, "Import Quizypedia : " + safeMsg(e), Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private static Result fetchAndBuild(File dbFile, String url, String megaHint, String themeHint) throws Exception {
        Document doc = Jsoup.connect(url)
                .userAgent("Mozilla/5.0 (Android) AppleWebKit/537.36 Chrome/124 Safari/537.36")
                .header("Accept-Language", "fr-FR,fr;q=0.9")
                .timeout(45000)
                .followRedirects(true)
                .get();

        List<String> lines = extractLines(doc);
        List<Fiche> fiches = parseFiches(lines);
        if (fiches.isEmpty()) throw new IllegalStateException("Aucune fiche détectée sur cette page");

        String theme = !clean(themeHint).isEmpty() ? clean(themeHint) : inferTheme(doc, url);
        String megatheme = !clean(megaHint).isEmpty() ? clean(megaHint) : inferMegatheme(dbFile, theme);
        List<QuestionDraft> drafts = buildQuestions(fiches, url, megatheme, theme);
        if (drafts.isEmpty()) {
            throw new IllegalStateException("Fiches trouvées (" + fiches.size() + ") mais pas assez de valeurs comparables pour créer des QCM à 4 choix");
        }

        Result r = new Result();
        r.url = url;
        r.effectiveUrl = doc.location();
        r.theme = theme;
        r.megatheme = megatheme;
        r.fiches = fiches;
        r.questions = drafts;
        return r;
    }

    private static List<String> extractLines(Document doc) {
        List<String> out = new ArrayList<>();
        Set<String> seenConsecutive = new HashSet<>();
        Elements els = doc.select("h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,label,strong,b,div[class*=fiche],div[class*=card]");
        String last = "";
        for (Element e : els) {
            String s = clean(e.ownText());
            if (s.isEmpty()) s = clean(e.text());
            if (s.isEmpty() || s.equals(last)) continue;
            if (s.length() > 600) continue;
            out.add(s);
            last = s;
        }
        if (out.size() < 20 && doc.body() != null) {
            for (String s : doc.body().wholeText().split("\\R+")) {
                s = clean(s);
                if (!s.isEmpty() && !s.equals(last)) { out.add(s); last = s; }
            }
        }
        return prepareHeaders(out);
    }

    private static List<String> prepareHeaders(List<String> lines) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String s = clean(lines.get(i));
            if (HEADER.matcher(s).matches()) { out.add(s); continue; }
            if (i + 1 < lines.size() && lines.get(i + 1).matches("^[\\(\\[]\\s*\\d+\\s*/\\s*\\d+\\s*[\\)\\]]$")) {
                out.add(s + " " + clean(lines.get(++i))); continue;
            }
            out.add(s);
        }
        return out;
    }

    private static List<Fiche> parseFiches(List<String> lines) {
        List<Fiche> out = new ArrayList<>();
        Fiche current = null;
        Integer expectedTotal = null;
        for (String line : lines) {
            String key = norm(line);
            if (current != null && (STOP.contains(key) || line.startsWith("Contenus ©"))) break;
            Matcher m = HEADER.matcher(line);
            if (m.matches()) {
                String name = clean(m.group(1));
                int num = Integer.parseInt(m.group(2));
                int total = Integer.parseInt(m.group(3));
                if (badHeader(name)) continue;
                if (expectedTotal != null && total != expectedTotal) continue;
                expectedTotal = total;
                if (current != null) out.add(current);
                current = new Fiche(name, num, total);
                continue;
            }
            if (current != null && !isNoise(line)) current.lines.add(line);
        }
        if (current != null) out.add(current);
        for (Fiche f : out) f.fields = parseFields(f.lines);
        return out;
    }

    private static Map<String,String> parseFields(List<String> lines) {
        Map<String,String> fields = new LinkedHashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            String s = clean(lines.get(i));
            int p = s.indexOf(':');
            if (p > 0 && p < 65 && p < s.length() - 1) {
                putField(fields, s.substring(0,p), s.substring(p+1));
                continue;
            }
            // Heuristique V7 : une ligne courte de type label suivie d'une valeur.
            if (s.length() <= 55 && i + 1 < lines.size()) {
                String nxt = clean(lines.get(i+1));
                if (looksLikeLabel(s) && !nxt.isEmpty() && !HEADER.matcher(nxt).matches()) {
                    putField(fields, s, nxt);
                    i++;
                    continue;
                }
            }
            // Cas "Label Valeur" pour les labels usuels.
            String[] labels = {"Auteur","Auteurs","Titre","Pays","Ville","Région","Date","Année","Naissance","Décès","Lieu","Nationalité","Profession","Fonction","Genre","Type","Période","Créateur","Réalisateur","Compositeur","Interprète","Acteur","Actrice","Personnage","Série","Album","Sport","Club","Équipe","Langue","Surnom","Population","Superficie","Altitude","Monnaie","Devise","Origine","Famille","Ordre","Classe","Espèce","Couleur","Record","Vainqueur","Finaliste","Score","Résultat","Particularité"};
            for (String lab : labels) {
                if (s.toLowerCase(Locale.ROOT).startsWith(lab.toLowerCase(Locale.ROOT) + " ")) {
                    putField(fields, lab, s.substring(lab.length()));
                    break;
                }
            }
        }
        return fields;
    }

    private static boolean looksLikeLabel(String s) {
        if (s.length() < 2 || s.length() > 55) return false;
        if (s.endsWith(".") || s.endsWith("?") || s.matches(".*\\d{3,}.*")) return false;
        int words = s.split("\\s+").length;
        return words <= 6 && Character.isUpperCase(s.charAt(0));
    }

    private static void putField(Map<String,String> fields, String label, String value) {
        label = clean(label).replaceAll("[|]+", " ");
        value = clean(value).replaceAll("[|]+", " ");
        if (label.isEmpty() || value.isEmpty() || value.length() > 350) return;
        fields.putIfAbsent(label, value);
    }

    private static List<QuestionDraft> buildQuestions(List<Fiche> fiches, String url, String mega, String theme) {
        Map<String,List<ValueRef>> byLabel = new LinkedHashMap<>();
        for (Fiche f : fiches) {
            for (Map.Entry<String,String> e : f.fields.entrySet()) {
                String label = clean(e.getKey());
                String value = clean(e.getValue());
                if (label.isEmpty() || value.isEmpty()) continue;
                byLabel.computeIfAbsent(norm(label), k -> new ArrayList<>()).add(new ValueRef(label, value, f));
            }
        }

        List<QuestionDraft> out = new ArrayList<>();
        Set<String> dedup = new HashSet<>();
        for (List<ValueRef> refs : byLabel.values()) {
            List<String> unique = new ArrayList<>();
            for (ValueRef r : refs) if (!containsIgnoreCase(unique, r.value)) unique.add(r.value);
            if (unique.size() < 4) continue;

            for (ValueRef r : refs) {
                List<String> distractors = new ArrayList<>();
                for (String v : unique) if (!v.equalsIgnoreCase(r.value)) distractors.add(v);
                Collections.sort(distractors, Comparator.comparingInt(v -> Math.abs((r.fiche.name + r.label + v).hashCode())));
                if (distractors.size() < 3) continue;

                String qtext = questionText(r.label, r.fiche.name);
                String dk = norm(qtext) + "|" + norm(r.value);
                if (!dedup.add(dk)) continue;

                List<String> props = new ArrayList<>();
                props.add(r.value);
                props.add(distractors.get(0)); props.add(distractors.get(1)); props.add(distractors.get(2));
                int correct = Math.floorMod((qtext + r.value).hashCode(), 4);
                Collections.swap(props, 0, correct);

                QuestionDraft q = new QuestionDraft();
                q.megatheme = mega;
                q.theme = theme;
                q.question = qtext;
                q.detail = detailText(r.fiche);
                q.a = props.get(0); q.b = props.get(1); q.c = props.get(2); q.d = props.get(3);
                q.correctIndex = correct;
                q.url = url;
                out.add(q);
            }
        }
        return out;
    }

    private static String questionText(String label, String ficheName) {
        String l = clean(label);
        String lower = l.toLowerCase(Locale.ROOT);
        if (lower.startsWith("date") || lower.startsWith("année") || lower.startsWith("naissance") || lower.startsWith("décès"))
            return "Quelle est la " + lower + " de « " + ficheName + " » ?";
        if (lower.startsWith("auteur") || lower.startsWith("créateur") || lower.startsWith("réalisateur") || lower.startsWith("compositeur") || lower.startsWith("vainqueur"))
            return "Qui est indiqué comme " + lower + " pour « " + ficheName + " » ?";
        return "Quel est le champ « " + l + " » pour « " + ficheName + " » ?";
    }

    private static String detailText(Fiche f) {
        StringBuilder sb = new StringBuilder(f.name);
        for (Map.Entry<String,String> e : f.fields.entrySet()) {
            if (sb.length() > 0) sb.append(" | ");
            sb.append(e.getKey()).append(" | ").append(e.getValue());
        }
        if (sb.length() > 1800) return sb.substring(0, 1800);
        return sb.toString();
    }

    private static String inferTheme(Document doc, String url) {
        Element h1 = doc.selectFirst("h1");
        if (h1 != null) {
            String s = clean(h1.text());
            if (!s.isEmpty() && s.length() <= 120) return s.replaceFirst("(?i)^quiz\\s*[:\\-]?\\s*", "");
        }
        String path = url.replaceAll("[?#].*$", "").replaceAll("/+$", "");
        int p = path.lastIndexOf('/');
        String slug = p >= 0 ? path.substring(p+1) : path;
        try { slug = java.net.URLDecoder.decode(slug, "UTF-8"); } catch (Exception ignored) {}
        return clean(slug.replace('-', ' '));
    }

    private static String inferMegatheme(File dbFile, String theme) {
        if (dbFile == null || !dbFile.exists() || clean(theme).isEmpty()) return "";
        SQLiteDatabase db = null; Cursor c = null;
        try {
            db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            c = db.rawQuery("SELECT megatheme, COUNT(*) n FROM questions WHERE LOWER(TRIM(theme))=LOWER(TRIM(?)) GROUP BY megatheme ORDER BY n DESC LIMIT 1", new String[]{theme});
            if (c.moveToFirst()) return clean(c.getString(0));
        } catch (Exception ignored) {} finally { if (c != null) c.close(); if (db != null) db.close(); }
        return "";
    }

    private static void showPreview(Activity activity, File dbFile, Result r) {
        LinearLayout box = new LinearLayout(activity); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(activity,16),dp(activity,8),dp(activity,16),dp(activity,8));
        TextView stats = text(activity, r.fiches.size() + " fiche(s) détectée(s) · " + r.questions.size() + " question(s) générée(s)"); box.addView(stats);
        EditText mega = edit(activity, "Mégathème"); mega.setText(r.megatheme); box.addView(mega);
        EditText theme = edit(activity, "Thème"); theme.setText(r.theme); box.addView(theme);
        QuestionDraft s = r.questions.get(0);
        TextView sample = text(activity, "Exemple :\n\n" + s.question + "\nA. " + s.a + "\nB. " + s.b + "\nC. " + s.c + "\nD. " + s.d + "\n\nBonne réponse : " + (s.correctIndex + 1));
        sample.setTextColor(Color.DKGRAY); box.addView(sample);

        ScrollView sv = new ScrollView(activity); sv.addView(box);
        AlertDialog dlg = new AlertDialog.Builder(activity)
                .setTitle("Aperçu CGIMPORT002")
                .setView(sv)
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Importer", null)
                .create();
        dlg.setOnShowListener(x -> dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String m = clean(mega.getText().toString()), t = clean(theme.getText().toString());
            if (m.isEmpty()) { mega.setError("Mégathème requis"); return; }
            if (t.isEmpty()) { theme.setError("Thème requis"); return; }
            for (QuestionDraft q : r.questions) { q.megatheme = m; q.theme = t; }
            dlg.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            importNow(activity, dbFile, r.questions, dlg);
        }));
        dlg.show();
    }

    private static void importNow(Activity activity, File dbFile, List<QuestionDraft> questions, AlertDialog dlg) {
        EXEC.execute(() -> {
            try {
                ImportResult result = insertLocal(dbFile, questions);
                activity.runOnUiThread(() -> {
                    dlg.dismiss();
                    Toast.makeText(activity, result.inserted + " question(s) ajoutée(s) localement", Toast.LENGTH_LONG).show();
                });
                uploadCloud(questions, result.ids);
            } catch (Exception e) {
                activity.runOnUiThread(() -> {
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    Toast.makeText(activity, "Échec import : " + safeMsg(e), Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private static ImportResult insertLocal(File dbFile, List<QuestionDraft> questions) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        ImportResult r = new ImportResult();
        db.beginTransaction();
        try {
            long row = 0;
            Cursor c = db.rawQuery("SELECT COALESCE(MAX(row_number),0) FROM questions", null);
            if (c.moveToFirst()) row = c.getLong(0); c.close();
            for (QuestionDraft q : questions) {
                // Évite de réimporter exactement la même question depuis la même URL.
                Cursor d = db.rawQuery("SELECT 1 FROM questions WHERE TRIM(question)=? AND TRIM(url_quizypedia)=? LIMIT 1", new String[]{q.question, q.url});
                boolean exists = d.moveToFirst(); d.close();
                if (exists) continue;
                String id = "cgimp2_" + UUID.randomUUID().toString().replace("-", "");
                ContentValues cv = new ContentValues();
                cv.put("row_number", ++row); cv.put("original_id", id); cv.put("megatheme", q.megatheme); cv.put("theme", q.theme);
                cv.put("question", q.question); cv.put("detail", q.detail); cv.put("proposition_a", q.a); cv.put("proposition_b", q.b); cv.put("proposition_c", q.c); cv.put("proposition_d", q.d);
                cv.put("correct_index", q.correctIndex); cv.put("url_quizypedia", q.url); cv.put("url_internet", ""); cv.put("image_file", ""); cv.put("non_trouve", 0); cv.put("status", ""); cv.put("is_image", 0);
                long ins = db.insertOrThrow("questions", null, cv);
                if (ins >= 0) { r.inserted++; r.ids.add(id); q.rowNumber = row; }
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); db.close(); }
        return r;
    }

    private static void uploadCloud(List<QuestionDraft> questions, List<String> ids) {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null || ids.isEmpty()) return;
        FirebaseFirestore fs = FirebaseFirestore.getInstance();
        int idPos = 0;
        WriteBatch batch = fs.batch(); int batchCount = 0;
        for (QuestionDraft q : questions) {
            if (q.rowNumber <= 0 || idPos >= ids.size()) continue;
            String id = ids.get(idPos++);
            Map<String,Object> m = new HashMap<>();
            m.put("row_number", q.rowNumber); m.put("megatheme", q.megatheme); m.put("theme", q.theme); m.put("question", q.question); m.put("detail", q.detail);
            m.put("proposition_a", q.a); m.put("proposition_b", q.b); m.put("proposition_c", q.c); m.put("proposition_d", q.d); m.put("correct_index", q.correctIndex);
            m.put("url_quizypedia", q.url); m.put("url_internet", ""); m.put("image_file", ""); m.put("non_trouve", 0); m.put("is_image", 0); m.put("status", "");
            m.put("cg_revision", 1L); m.put("cg_writer", "android-cgimport002"); m.put("cg_updated_at", FieldValue.serverTimestamp());
            batch.set(fs.collection("users").document(user.getUid()).collection("questions").document(id), m);
            batchCount++;
            if (batchCount >= 400) { batch.commit(); batch = fs.batch(); batchCount = 0; }
        }
        if (batchCount > 0) batch.commit();
    }

    private static EditText edit(Activity a, String hint) { EditText e = new EditText(a); e.setHint(hint); e.setTextSize(17); e.setSingleLine(true); return e; }
    private static TextView text(Activity a, String s) { TextView t = new TextView(a); t.setText(s); t.setTextSize(16); t.setPadding(0,dp(a,8),0,dp(a,8)); return t; }
    private static int dp(Activity a, int v) { return Math.round(v * a.getResources().getDisplayMetrics().density); }
    private static String clean(String s) { return s == null ? "" : s.replace('\u00a0',' ').replaceAll("\\s+", " ").trim(); }
    private static String norm(String s) { return java.text.Normalizer.normalize(clean(s), java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim(); }
    private static boolean badHeader(String s) { String k = norm(s); return k.startsWith("quizypedia") || k.startsWith("connexion") || k.startsWith("duels") || k.startsWith("defi") || k.startsWith("master quiz") || k.startsWith("publie le") || k.startsWith("trouver "); }
    private static boolean isNoise(String s) { String k = norm(s); return k.equals("confirmer") || k.equals("annuler") || k.equals("fermer") || k.equals("quitter la partie") || k.equals("continuer a jouer"); }
    private static boolean containsIgnoreCase(List<String> xs, String x) { for (String s : xs) if (s.equalsIgnoreCase(x)) return true; return false; }
    private static String safeMsg(Exception e) { String s = e.getMessage(); return s == null || s.trim().isEmpty() ? e.getClass().getSimpleName() : s; }

    private static final class Fiche { final String name; final int num,total; final List<String> lines = new ArrayList<>(); Map<String,String> fields = new LinkedHashMap<>(); Fiche(String n,int a,int b){name=n;num=a;total=b;} }
    private static final class ValueRef { final String label,value; final Fiche fiche; ValueRef(String l,String v,Fiche f){label=l;value=v;fiche=f;} }
    private static final class QuestionDraft { String megatheme,theme,question,detail,a,b,c,d,url; int correctIndex; long rowNumber; }
    private static final class Result { String url,effectiveUrl,theme,megatheme; List<Fiche> fiches; List<QuestionDraft> questions; }
    private static final class ImportResult { int inserted=0; final List<String> ids = new ArrayList<>(); }
}
