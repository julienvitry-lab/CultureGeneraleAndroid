package fr.culturegenerale.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class CgPlayHistoryUi001 {
    private static final int LIMIT = 100;

    private final Activity activity;
    private final Typeface font;
    private final Runnable onBack;
    private final List<Entry> allEntries = new ArrayList<>();

    private LinearLayout listHost;
    private TextView summary;
    private TextView status;
    private Button filterAll, filterChoice, filterMental, filterRevision;
    private String activeFilter = "all";

    private final int BG = Color.rgb(20, 24, 31);
    private final int PANEL = Color.rgb(37, 43, 54);
    private final int PANEL2 = Color.rgb(49, 57, 70);
    private final int BLUE = Color.rgb(0, 102, 204);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int RED = Color.rgb(185, 0, 0);
    private final int GOLD = Color.rgb(219, 176, 55);
    private final int GREY = Color.rgb(165, 172, 184);

    private CgPlayHistoryUi001(Activity activity, Typeface font, Runnable onBack) {
        this.activity = activity;
        this.font = font == null ? Typeface.DEFAULT : font;
        this.onBack = onBack;
    }

    static void show(Activity activity, Typeface font, Runnable onBack) {
        new CgPlayHistoryUi001(activity, font, onBack).render();
    }

    private void render() {
        LinearLayout screen = new LinearLayout(activity);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setPadding(dp(12), dp(12), dp(12), dp(8));
        screen.setBackgroundColor(BG);

        TextView title = text("Historique de jeu", 28, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0, 0, 0, dp(6)));

        summary = text("Chargement…", 15, GREY, false);
        summary.setGravity(Gravity.CENTER);
        screen.addView(summary, lp(0, 0, 0, dp(8)));

        HorizontalScrollView filterScroll = new HorizontalScrollView(activity);
        filterScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout filters = new LinearLayout(activity);
        filters.setOrientation(LinearLayout.HORIZONTAL);

        filterAll = filterButton("Tous", "all");
        filterChoice = filterButton("QCM", "challenge_choice");
        filterMental = filterButton("Mental", "challenge_mental");
        filterRevision = filterButton("Révision", "revision_reveal");

        filters.addView(filterAll, filterLp());
        filters.addView(filterChoice, filterLp());
        filters.addView(filterMental, filterLp());
        filters.addView(filterRevision, filterLp());
        filterScroll.addView(filters);
        screen.addView(filterScroll, lp(0, 0, 0, dp(8)));

        status = text("Connexion à Firestore…", 14, GREY, false);
        status.setGravity(Gravity.CENTER);
        screen.addView(status, lp(0, 0, 0, dp(6)));

        ScrollView scroll = new ScrollView(activity);
        listHost = new LinearLayout(activity);
        listHost.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(listHost);
        screen.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        Button back = button("Retour", 18);
        back.setTextColor(Color.WHITE);
        back.setBackground(round(PANEL2, dp(12)));
        back.setOnClickListener(v -> {
            if (onBack != null) onBack.run();
        });
        screen.addView(back, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        activity.setContentView(screen);
        updateFilterButtons();
        load();
    }

    private void load() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            status.setText("Utilisateur Firebase non connecté.");
            return;
        }

        FirebaseFirestore.getInstance()
                .collection("users")
                .document(user.getUid())
                .collection("play_history")
                .orderBy("client_played_at_ms", Query.Direction.DESCENDING)
                .limit(LIMIT)
                .get()
                .addOnSuccessListener(snapshot -> {
                    allEntries.clear();
                    for (DocumentSnapshot doc : snapshot.getDocuments()) {
                        allEntries.add(Entry.from(doc));
                    }
                    updateSummary();
                    applyFilter();
                })
                .addOnFailureListener(error ->
                        status.setText("Historique indisponible : " + safe(error.getMessage())));
    }

    private void updateSummary() {
        int qcm = 0, correct = 0, mental = 0, revision = 0;

        for (Entry e : allEntries) {
            if ("challenge_choice".equals(e.playType)) {
                qcm++;
                if (Boolean.TRUE.equals(e.isCorrect)) correct++;
            } else if ("challenge_mental".equals(e.playType)) {
                mental++;
            } else if ("revision_reveal".equals(e.playType)) {
                revision++;
            }
        }

        String qcmPart = qcm == 0
                ? "0 QCM"
                : qcm + " QCM · " + Math.round((100.0 * correct) / qcm) + "% juste";

        summary.setText(allEntries.size() + " événements · "
                + qcmPart + " · " + mental + " mental · " + revision + " révision");
    }

    private void applyFilter() {
        listHost.removeAllViews();
        int shown = 0;

        for (Entry e : allEntries) {
            if (!"all".equals(activeFilter) && !activeFilter.equals(e.playType)) continue;
            listHost.addView(entryView(e), lp(0, 0, 0, dp(8)));
            shown++;
        }

        if (allEntries.isEmpty()) {
            status.setText("Aucun historique disponible. Joue quelques questions puis reviens ici.");
        } else if (shown == 0) {
            status.setText("Aucun événement pour ce filtre.");
        } else {
            status.setText(shown + " événement" + (shown > 1 ? "s" : "")
                    + " affiché" + (shown > 1 ? "s" : "")
                    + " · 100 derniers maximum");
        }
    }

    private View entryView(Entry e) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        card.setBackground(round(PANEL, dp(12)));
        card.setClickable(true);

        card.addView(text(formatDate(e.playedAtMs) + " · " + typeLabel(e),
                14, typeColor(e), true));

        String domainTheme = join(" › ", e.domain, e.theme);
        if (!domainTheme.isEmpty()) {
            TextView line = text(domainTheme, 13, GREY, false);
            line.setPadding(0, dp(4), 0, 0);
            card.addView(line);
        }

        TextView q = text(e.question.isEmpty() ? "(question sans texte)" : e.question,
                17, Color.WHITE, true);
        q.setPadding(0, dp(6), 0, 0);
        q.setMaxLines(3);
        card.addView(q);

        String result = resultLabel(e);
        if (!result.isEmpty()) {
            TextView r = text(result, 14, resultColor(e), true);
            r.setPadding(0, dp(7), 0, 0);
            card.addView(r);
        }

        if (e.responseTimeMs > 0L) {
            TextView t = text("Temps : " + duration(e.responseTimeMs), 12, GREY, false);
            t.setPadding(0, dp(3), 0, 0);
            card.addView(t);
        }

        card.setOnClickListener(v -> showDetail(e));
        return card;
    }

    private void showDetail(Entry e) {
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(8), dp(16), dp(8));

        addDetail(content, "Date", formatDate(e.playedAtMs));
        addDetail(content, "Mode", typeLabel(e));
        addDetail(content, "Domaine", e.domain);
        addDetail(content, "Thème", e.theme);
        addDetail(content, "Question", e.question);

        if ("challenge_choice".equals(e.playType)) {
            addDetail(content, "Réponse donnée", e.selectedAnswer);
            addDetail(content, "Bonne réponse", e.correctAnswer);
            addDetail(content, "Résultat", resultLabel(e));
        } else if ("challenge_mental".equals(e.playType)) {
            addDetail(content, "Évaluation", resultLabel(e));
        } else if ("revision_reveal".equals(e.playType)) {
            addDetail(content, "Réponse", e.correctAnswer);
            addDetail(content, "Mode Révision", e.revisionMode);
        }

        if (e.responseTimeMs > 0L) {
            addDetail(content, "Temps de réponse", duration(e.responseTimeMs));
        }
        if (!e.detail.isEmpty()) addDetail(content, "Détail", e.detail);

        ScrollView scroll = new ScrollView(activity);
        scroll.addView(content);

        new AlertDialog.Builder(activity)
                .setTitle("Détail de l'historique")
                .setView(scroll)
                .setPositiveButton("Fermer", null)
                .show();
    }

    private void addDetail(LinearLayout host, String label, String value) {
        if (value == null || value.trim().isEmpty()) return;
        TextView l = text(label, 12, Color.DKGRAY, true);
        l.setPadding(0, dp(8), 0, 0);
        host.addView(l);
        TextView v = text(value, 16, Color.BLACK, false);
        v.setTextIsSelectable(true);
        host.addView(v);
    }

    private Button filterButton(String label, String filter) {
        Button b = button(label, 15);
        b.setOnClickListener(v -> {
            activeFilter = filter;
            updateFilterButtons();
            applyFilter();
        });
        return b;
    }

    private void updateFilterButtons() {
        styleFilter(filterAll, "all");
        styleFilter(filterChoice, "challenge_choice");
        styleFilter(filterMental, "challenge_mental");
        styleFilter(filterRevision, "revision_reveal");
    }

    private void styleFilter(Button button, String filter) {
        button.setTextColor(Color.WHITE);
        button.setBackground(round(filter.equals(activeFilter) ? BLUE : PANEL2, dp(12)));
    }

    private LinearLayout.LayoutParams filterLp() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(105), dp(46));
        p.setMargins(0, 0, dp(8), 0);
        return p;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView tv = new TextView(activity);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        tv.setTypeface(font, bold ? Typeface.BOLD : Typeface.NORMAL);
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

    private GradientDrawable round(int color, int radiusPx) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(color);
        gd.setCornerRadius(radiusPx);
        return gd;
    }

    private LinearLayout.LayoutParams lp(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(l, t, r, b);
        return p;
    }

    private String typeLabel(Entry e) {
        if ("challenge_choice".equals(e.playType)) return "Défi · QCM";
        if ("challenge_mental".equals(e.playType)) return "Défi · Mental";
        if ("revision_reveal".equals(e.playType)) return "Révision";
        return e.playType.isEmpty() ? "Historique" : e.playType;
    }

    private int typeColor(Entry e) {
        if ("revision_reveal".equals(e.playType)) return BLUE;
        if ("challenge_mental".equals(e.playType)) return GOLD;
        return GREEN;
    }

    private String resultLabel(Entry e) {
        if ("challenge_choice".equals(e.playType)) {
            if (Boolean.TRUE.equals(e.isCorrect)) return "Correct";
            if (Boolean.FALSE.equals(e.isCorrect)) return "Faux";
            return "";
        }
        if ("challenge_mental".equals(e.playType)) {
            if ("assimilated".equals(e.result)) return "Assimilée";
            if ("review".equals(e.result)) return "À revoir";
            return e.result;
        }
        if ("revision_reveal".equals(e.playType)) return "Réponse révélée";
        return e.result;
    }

    private int resultColor(Entry e) {
        if ("challenge_choice".equals(e.playType)) {
            return Boolean.TRUE.equals(e.isCorrect) ? GREEN : RED;
        }
        if ("challenge_mental".equals(e.playType)) {
            return "assimilated".equals(e.result) ? GREEN : GOLD;
        }
        return BLUE;
    }

    private String duration(long ms) {
        if (ms < 1000L) return ms + " ms";
        if (ms < 60000L) return String.format(Locale.FRANCE, "%.1f s", ms / 1000.0);
        return (ms / 60000L) + " min " + ((ms % 60000L) / 1000L) + " s";
    }

    private String formatDate(long millis) {
        if (millis <= 0L) return "Date inconnue";
        return new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE)
                .format(new Date(millis));
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private static String join(String sep, String... values) {
        StringBuilder out = new StringBuilder();
        for (String value : values) {
            String clean = safe(value);
            if (clean.isEmpty()) continue;
            if (out.length() > 0) out.append(sep);
            out.append(clean);
        }
        return out.toString();
    }

    private static String safe(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static long longValue(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        try { return Long.parseLong(safe(value)); }
        catch (Exception ignored) { return 0L; }
    }

    private static Boolean booleanValue(Object value) {
        return value instanceof Boolean ? (Boolean) value : null;
    }

    private static final class Entry {
        long playedAtMs;
        String playType = "";
        String result = "";
        Boolean isCorrect;
        long responseTimeMs;
        String domain = "";
        String theme = "";
        String question = "";
        String detail = "";
        String selectedAnswer = "";
        String correctAnswer = "";
        String revisionMode = "";

        static Entry from(DocumentSnapshot doc) {
            Entry e = new Entry();
            e.playType = safe(doc.get("play_type"));
            e.result = safe(doc.get("result"));
            e.isCorrect = booleanValue(doc.get("is_correct"));
            e.responseTimeMs = longValue(doc.get("response_time_ms"));
            e.domain = safe(doc.get("domain"));
            e.theme = safe(doc.get("theme"));
            e.selectedAnswer = safe(doc.get("selected_answer"));
            e.correctAnswer = safe(doc.get("correct_answer"));
            e.revisionMode = safe(doc.get("revision_mode"));

            Object snap = doc.get("question_snapshot");
            if (snap instanceof java.util.Map) {
                java.util.Map<?, ?> map = (java.util.Map<?, ?>) snap;
                e.question = safe(map.get("question"));
                e.detail = safe(map.get("detail"));
            }

            Timestamp ts = doc.getTimestamp("played_at");
            e.playedAtMs = ts != null
                    ? ts.toDate().getTime()
                    : longValue(doc.get("client_played_at_ms"));
            return e;
        }
    }
}
