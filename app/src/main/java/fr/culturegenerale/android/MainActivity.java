package fr.culturegenerale.android;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private TextView statusView;
    private TextView detailView;
    private static final String APP_FOLDER = "Culture Générale";
    private static final String DB_NAME = "questions_base.sqlite";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        runCheck();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (statusView != null) runCheck();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(32, 32, 32, 32);
        root.setBackgroundColor(Color.BLACK);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Culture Générale Android V0.1");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(21);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(0, 28, 0, 18);
        root.addView(statusView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button permButton = new Button(this);
        permButton.setText("Autoriser l'accès aux fichiers");
        permButton.setTextSize(18);
        permButton.setOnClickListener(v -> openManageFilesSettings());
        root.addView(permButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button retryButton = new Button(this);
        retryButton.setText("Relancer le test");
        retryButton.setTextSize(18);
        retryButton.setOnClickListener(v -> runCheck());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        retryParams.setMargins(0, 18, 0, 18);
        root.addView(retryButton, retryParams);

        detailView = new TextView(this);
        detailView.setTextColor(Color.rgb(210, 210, 210));
        detailView.setTextSize(16);
        detailView.setGravity(Gravity.LEFT);
        detailView.setPadding(0, 20, 0, 0);
        root.addView(detailView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(scroll);
    }

    private boolean hasFileAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
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

    private void runCheck() {
        StringBuilder log = new StringBuilder();
        File folder = new File(Environment.getExternalStorageDirectory(), APP_FOLDER);
        File dbFile = new File(folder, DB_NAME);
        File imagesFolder = new File(folder, "Images");

        log.append("Dossier attendu :\n").append(folder.getAbsolutePath()).append("\n\n");
        log.append("Accès fichiers Android : ").append(hasFileAccess() ? "OK" : "À autoriser").append("\n");
        log.append("Dossier Culture Générale : ").append(folder.exists() ? "OK" : "INTROUVABLE").append("\n");
        log.append("Base SQLite : ").append(dbFile.exists() ? "OK" : "INTROUVABLE").append("\n");
        log.append("Dossier Images : ").append(imagesFolder.exists() ? "OK" : "INTROUVABLE").append("\n");

        if (!hasFileAccess()) {
            statusView.setText("Autorisation fichiers nécessaire");
            detailView.setText(log.toString() + "\nClique sur le bouton d'autorisation, puis active l'accès complet aux fichiers pour Culture Générale.");
            return;
        }
        if (!dbFile.exists()) {
            statusView.setText("Base SQLite introuvable");
            detailView.setText(log.toString());
            return;
        }

        try {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
            List<String> tables = new ArrayList<>();
            Cursor tableCursor = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", null);
            while (tableCursor.moveToNext()) tables.add(tableCursor.getString(0));
            tableCursor.close();

            String table = tables.contains("questions") ? "questions" : (tables.isEmpty() ? "" : tables.get(0));
            long total = -1;
            long playable = -1;
            String columns = "";
            if (!table.isEmpty()) {
                total = simpleCount(db, "SELECT COUNT(*) FROM " + quote(table));
                columns = getColumns(db, table);
                if (columns.toLowerCase().contains("statut")) {
                    playable = simpleCount(db, "SELECT COUNT(*) FROM " + quote(table) + " WHERE statut IS NULL OR TRIM(statut)='' OR UPPER(TRIM(statut))='R'");
                }
            }
            db.close();

            statusView.setText("SQLite lu avec succès ✅");
            log.append("\nTables trouvées : ").append(tables).append("\n");
            log.append("Table testée : ").append(table.isEmpty() ? "aucune" : table).append("\n");
            log.append("Colonnes : ").append(columns).append("\n");
            if (total >= 0) log.append("Nombre total de lignes : ").append(total).append("\n");
            if (playable >= 0) log.append("Questions jouables estimées : ").append(playable).append("\n");
            log.append("\nV0.1 validée si tu vois ce message sur la tablette.");
            detailView.setText(log.toString());
        } catch (Exception e) {
            statusView.setText("Erreur lecture SQLite ❌");
            log.append("\nErreur : ").append(e.getClass().getSimpleName()).append("\n").append(e.getMessage());
            detailView.setText(log.toString());
        }
    }

    private long simpleCount(SQLiteDatabase db, String sql) {
        Cursor c = db.rawQuery(sql, null);
        try {
            return c.moveToFirst() ? c.getLong(0) : -1;
        } finally {
            c.close();
        }
    }

    private String getColumns(SQLiteDatabase db, String table) {
        StringBuilder sb = new StringBuilder();
        Cursor c = db.rawQuery("PRAGMA table_info(" + quote(table) + ")", null);
        try {
            while (c.moveToNext()) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(c.getString(1));
            }
        } finally {
            c.close();
        }
        return sb.toString();
    }

    private String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }
}
