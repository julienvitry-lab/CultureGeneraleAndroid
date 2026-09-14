package fr.culturegenerale.android;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
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

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class CgSpacedRepetition001 {
    private static final int PAGE_SIZE = 1000;
    private static final long DAY_MS = 24L * 60L * 60L * 1000L;

    interface Starter { void start(List<Long> rows, String label); }

    private static final ExecutorService EXECUTOR =
            Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(() -> {
                    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                    r.run();
                }, "CGLEARN002-Spaced");
                t.setDaemon(true);
                return t;
            });

    private final Activity activity;
    private final Typeface font;
    private final Starter starter;
    private final Runnable onBack;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Item> dueItems = new ArrayList<>();
    private long nextFutureDueAtMs = 0L;

    private final int BG = Color.rgb(20, 24, 31);
    private final int PANEL = Color.rgb(37, 43, 54);
    private final int PANEL2 = Color.rgb(49, 57, 70);
    private final int RED = Color.rgb(185, 0, 0);
    private final int GREEN = Color.rgb(0, 135, 60);
    private final int GREY = Color.rgb(165, 172, 184);

    private CgSpacedRepetition001(Activity activity, Typeface font, Starter starter, Runnable onBack) {
        this.activity = activity;
        this.font = font == null ? Typeface.DEFAULT : font;
        this.starter = starter;
        this.onBack = onBack;
    }

    static void show(Activity activity, Typeface font, Starter starter, Runnable onBack) {
        CgSpacedRepetition001 x = new CgSpacedRepetition001(activity, font, starter, onBack);
        x.renderLoading();
        x.loadSchedule();
    }

    private void renderLoading() {
        LinearLayout root = base();
        TextView title = text("À réviser", 29, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0,0,0,dp(8)));
        TextView info = text("Calcul des échéances depuis l'historique de jeu…", 15, GREY, false);
        info.setGravity(Gravity.CENTER);
        root.addView(info, lp(0,0,0,dp(8)));
        TextView rules = text("Erreur / À revoir : 1 j · Découverte réussie : 3 j · Connue : 7 j · Maîtrisée : 30 j · Maîtrisée+ : 60 j", 13, GREY, false);
        rules.setGravity(Gravity.CENTER);
        root.addView(rules, lp(0,0,0,dp(8)));
        root.addView(new LinearLayout(activity), new LinearLayout.LayoutParams(-1,0,1f));
        root.addView(backButton("Retour"), fixed(52));
        activity.setContentView(root);
    }

    private void loadSchedule() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) { renderError("Utilisateur Firebase non connecté."); return; }
        loadPage(user.getUid(), null, new Aggregator());
    }

    private void loadPage(String uid, DocumentSnapshot last, Aggregator agg) {
        Query q = FirebaseFirestore.getInstance()
                .collection("users").document(uid).collection("play_history")
                .orderBy("client_played_at_ms", Query.Direction.DESCENDING)
                .limit(PAGE_SIZE);
        if (last != null) q = q.startAfter(last);

        q.get().addOnSuccessListener(EXECUTOR, snap -> {
            agg.consume(snap);
            if (snap.size() >= PAGE_SIZE) {
                List<DocumentSnapshot> docs = snap.getDocuments();
                loadPage(uid, docs.get(docs.size()-1), agg);
            } else {
                Result result = agg.finish();
                main.post(() -> renderResult(result));
            }
        }).addOnFailureListener(EXECUTOR, e ->
                main.post(() -> renderError("Révisions indisponibles : " + safe(e.getMessage()))));
    }

    private void renderResult(Result result) {
        dueItems.clear();
        dueItems.addAll(result.due);
        nextFutureDueAtMs = result.nextFutureDueAtMs;
        if (dueItems.isEmpty()) renderNoDue(result.questionCount);
        else renderDomains();
    }

    private void renderNoDue(int count) {
        LinearLayout root = base();
        TextView title = text("À réviser", 29, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0,0,0,dp(8)));
        TextView ok = text("Aucune révision échue", 22, GREEN, true);
        ok.setGravity(Gravity.CENTER);
        root.addView(ok, lp(0,dp(8),0,dp(8)));
        TextView c = text(count + " question" + (count>1?"s":"") + " planifiée" + (count>1?"s":""), 15, GREY, false);
        c.setGravity(Gravity.CENTER);
        root.addView(c, lp(0,0,0,dp(8)));
        if (nextFutureDueAtMs > 0L) {
            TextView next = text("Prochaine échéance : " + formatDate(nextFutureDueAtMs), 16, Color.WHITE, true);
            next.setGravity(Gravity.CENTER);
            root.addView(next, lp(0,dp(8),0,dp(8)));
        }
        root.addView(new LinearLayout(activity), new LinearLayout.LayoutParams(-1,0,1f));
        root.addView(backButton("Retour"), fixed(52));
        activity.setContentView(root);
    }

    private void renderDomains() {
        LinearLayout screen = base();
        TextView title = text("À réviser", 29, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0,0,0,dp(6)));
        TextView subtitle = text(dueItems.size() + " question" + (dueItems.size()>1?"s":"") + " arrivée" + (dueItems.size()>1?"s":"") + " à échéance", 15, GREY, false);
        subtitle.setGravity(Gravity.CENTER);
        screen.addView(subtitle, lp(0,0,0,dp(8)));

        Button all = button("Toutes les révisions (" + dueItems.size() + ")", 17);
        all.setTextColor(Color.WHITE);
        all.setBackground(round(RED, dp(11)));
        all.setOnClickListener(v -> launch(null, null, "Toutes les révisions"));
        screen.addView(all, fixed(50));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        Map<String,Integer> counts = new LinkedHashMap<>();
        for (Item i : dueItems) {
            String d = i.domain.isEmpty() ? "(Sans domaine)" : i.domain;
            counts.put(d, counts.getOrDefault(d, 0) + 1);
        }
        for (Map.Entry<String,Integer> e : counts.entrySet()) {
            String domain = e.getKey();
            Button b = button(domain + " (" + e.getValue() + ")", 16);
            b.setTextColor(Color.WHITE);
            b.setBackground(round(PANEL, dp(10)));
            b.setOnClickListener(v -> renderThemes(domain));
            list.addView(b, lp(0,dp(6),0,0));
        }
        screen.addView(scroll, new LinearLayout.LayoutParams(-1,0,1f));
        screen.addView(backButton("Retour"), fixed(52));
        activity.setContentView(screen);
    }

    private void renderThemes(String domain) {
        LinearLayout screen = base();
        TextView title = text(domain, 25, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, lp(0,0,0,dp(6)));

        List<Item> domainItems = filter(domain, null);
        TextView subtitle = text(domainItems.size() + " révision" + (domainItems.size()>1?"s":"") + " due" + (domainItems.size()>1?"s":""), 14, GREY, false);
        subtitle.setGravity(Gravity.CENTER);
        screen.addView(subtitle, lp(0,0,0,dp(8)));

        Button all = button("Tout le domaine (" + domainItems.size() + ")", 17);
        all.setTextColor(Color.WHITE);
        all.setBackground(round(RED, dp(11)));
        all.setOnClickListener(v -> launch(domain, null, domain));
        screen.addView(all, fixed(50));

        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);

        Map<String,Integer> counts = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (Item i : domainItems) {
            String t = i.theme.isEmpty() ? "(Sans thème)" : i.theme;
            counts.put(t, counts.getOrDefault(t, 0) + 1);
        }
        for (Map.Entry<String,Integer> e : counts.entrySet()) {
            String themeLabel = e.getKey();
            Button b = button(themeLabel + " (" + e.getValue() + ")", 16);
            b.setTextColor(Color.WHITE);
            b.setBackground(round(PANEL, dp(10)));
            b.setOnClickListener(v -> {
                String raw = "(Sans thème)".equals(themeLabel) ? "" : themeLabel;
                launch(domain, raw, domain + " · " + themeLabel);
            });
            list.addView(b, lp(0,dp(6),0,0));
        }
        screen.addView(scroll, new LinearLayout.LayoutParams(-1,0,1f));
        Button back = button("Retour aux domaines", 16);
        back.setTextColor(Color.WHITE);
        back.setBackground(round(PANEL2, dp(11)));
        back.setOnClickListener(v -> renderDomains());
        screen.addView(back, fixed(52));
        activity.setContentView(screen);
    }

    private void launch(String domain, String theme, String label) {
        List<Item> selected = filter(domain, theme);
        List<Long> rows = new ArrayList<>();
        for (Item i : selected) rows.add(i.row);
        if (starter != null) starter.start(rows, label);
    }

    private List<Item> filter(String domain, String theme) {
        List<Item> out = new ArrayList<>();
        for (Item i : dueItems) {
            if (domain != null && !domain.equals(i.domain)) continue;
            if (theme != null && !theme.equals(i.theme)) continue;
            out.add(i);
        }
        return out;
    }

    private void renderError(String message) {
        LinearLayout root = base();
        TextView title = text("À réviser", 29, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(0,0,0,dp(8)));
        TextView error = text(message, 16, RED, true);
        error.setGravity(Gravity.CENTER);
        root.addView(error, lp(0,dp(12),0,dp(12)));
        root.addView(new LinearLayout(activity), new LinearLayout.LayoutParams(-1,0,1f));
        root.addView(backButton("Retour"), fixed(52));
        activity.setContentView(root);
    }

    private LinearLayout base() {
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12),dp(12),dp(12),dp(8));
        root.setBackgroundColor(BG);
        return root;
    }

    private Button backButton(String label) {
        Button b = button(label, 17);
        b.setTextColor(Color.WHITE);
        b.setBackground(round(PANEL2, dp(11)));
        b.setOnClickListener(v -> { if (onBack != null) onBack.run(); });
        return b;
    }

    private TextView text(String v, int sp, int color, boolean bold) {
        TextView tv = new TextView(activity);
        tv.setText(v); tv.setTextSize(sp); tv.setTextColor(color);
        tv.setTypeface(font, bold ? Typeface.BOLD : Typeface.NORMAL);
        return tv;
    }

    private Button button(String v, int sp) {
        Button b = new Button(activity);
        b.setText(v); b.setTextSize(sp); b.setTypeface(font, Typeface.BOLD); b.setAllCaps(false);
        return b;
    }

    private GradientDrawable round(int color, int radius) {
        GradientDrawable gd = new GradientDrawable(); gd.setColor(color); gd.setCornerRadius(radius); return gd;
    }

    private LinearLayout.LayoutParams lp(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.setMargins(l,t,r,b); return p;
    }

    private LinearLayout.LayoutParams fixed(int dp) { return new LinearLayout.LayoutParams(-1, dp(dp)); }
    private int dp(int v) { return Math.round(v * activity.getResources().getDisplayMetrics().density); }
    private String formatDate(long ms) { return new SimpleDateFormat("dd/MM/yyyy", Locale.FRANCE).format(new Date(ms)); }
    private static String safe(Object v) { return v == null ? "" : String.valueOf(v).trim(); }
    private static long longValue(Object v) { if (v instanceof Number) return ((Number)v).longValue(); try { return Long.parseLong(safe(v)); } catch(Exception e) { return 0L; } }
    private static Boolean booleanValue(Object v) { return v instanceof Boolean ? (Boolean)v : null; }

    private static final class Aggregator {
        private final Map<Long,Stats> byRow = new HashMap<>();
        void consume(QuerySnapshot snap) { for (DocumentSnapshot d : snap.getDocuments()) consume(d); }
        private void consume(DocumentSnapshot d) {
            String type = safe(d.get("play_type"));
            if (!"challenge_choice".equals(type) && !"challenge_mental".equals(type)) return;
            long row = longValue(d.get("question_row_number"));
            if (row <= 0L) row = longValue(d.get("question_id"));
            if (row <= 0L) return;
            Stats s = byRow.get(row);
            if (s == null) { s = new Stats(); s.row = row; byRow.put(row, s); }
            long played = longValue(d.get("client_played_at_ms"));
            Timestamp ts = d.getTimestamp("played_at");
            if (played <= 0L && ts != null) played = ts.toDate().getTime();
            boolean positive = "challenge_choice".equals(type)
                    ? Boolean.TRUE.equals(booleanValue(d.get("is_correct")))
                    : "assimilated".equals(safe(d.get("result")));
            s.attempts++;
            if (positive) s.positive++;
            if (s.lastPlayedAtMs <= 0L) {
                s.lastPlayedAtMs = played;
                s.latestPositive = positive;
                s.domain = safe(d.get("domain"));
                s.theme = safe(d.get("theme"));
            }
            if (s.recentNewest.size() < 3) s.recentNewest.add(positive);
        }
        Result finish() {
            long now = System.currentTimeMillis();
            List<Item> due = new ArrayList<>();
            long next = 0L;
            for (Stats s : byRow.values()) {
                if (s.attempts <= 0 || s.lastPlayedAtMs <= 0L) continue;
                int days = s.intervalDays();
                long dueAt = s.lastPlayedAtMs + days * DAY_MS;
                Item i = new Item();
                i.row = s.row; i.domain = s.domain; i.theme = s.theme;
                i.successPercent = s.successPercent(); i.dueAtMs = dueAt;
                if (dueAt <= now) { i.overdueMs = now - dueAt; due.add(i); }
                else if (next == 0L || dueAt < next) next = dueAt;
            }
            Collections.sort(due, (a,b) -> {
                int x = Long.compare(b.overdueMs, a.overdueMs);
                if (x != 0) return x;
                x = Integer.compare(a.successPercent, b.successPercent);
                return x != 0 ? x : Long.compare(a.row, b.row);
            });
            Result r = new Result(); r.due = due; r.nextFutureDueAtMs = next; r.questionCount = byRow.size(); return r;
        }
    }

    private static final class Stats {
        long row, lastPlayedAtMs; String domain = "", theme = ""; int attempts, positive; boolean latestPositive;
        final List<Boolean> recentNewest = new ArrayList<>();
        int successPercent() { return attempts == 0 ? 0 : Math.round(100f * positive / attempts); }
        boolean lastTwoPositive() { return recentNewest.size() >= 2 && recentNewest.get(0) && recentNewest.get(1); }
        boolean lastThreePositive() { return recentNewest.size() >= 3 && recentNewest.get(0) && recentNewest.get(1) && recentNewest.get(2); }
        int intervalDays() {
            int success = successPercent();
            if (!latestPositive) return 1;
            if (attempts <= 1) return 3;
            if (success < 60) return 1;
            if (attempts >= 5 && success >= 90 && lastThreePositive()) return 60;
            if (attempts >= 3 && success >= 80 && lastTwoPositive()) return 30;
            return 7;
        }
    }

    private static final class Item { long row, dueAtMs, overdueMs; String domain = "", theme = ""; int successPercent; }
    private static final class Result { List<Item> due = new ArrayList<>(); long nextFutureDueAtMs; int questionCount; }
}
