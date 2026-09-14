package fr.culturegenerale.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.text.method.ScrollingMovementMethod;
import android.widget.TextView;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class CgCrashTrace001 {
    private static final String FILE_NAME = "cgdiag001_last_crash.txt";
    private static volatile boolean installed = false;

    private CgCrashTrace001() { }

    static void install(Activity activity) {
        if (activity == null) return;

        final Context appContext = activity.getApplicationContext();

        if (!installed) {
            installed = true;
            final Thread.UncaughtExceptionHandler previous =
                    Thread.getDefaultUncaughtExceptionHandler();

            Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
                try {
                    saveCrash(appContext, thread, throwable);
                } catch (Throwable ignored) { }

                if (previous != null) {
                    previous.uncaughtException(thread, throwable);
                } else {
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                }
            });
        }

        new Handler(Looper.getMainLooper()).postDelayed(
                () -> showPreviousCrash(activity),
                700L
        );
    }

    private static void saveCrash(
            Context context,
            Thread thread,
            Throwable throwable
    ) throws Exception {
        File file = new File(context.getFilesDir(), FILE_NAME);

        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);

        pw.println("CGDIAG001 · CRASH_TRACE001");
        pw.println("Date : " + new SimpleDateFormat(
                "yyyy-MM-dd HH:mm:ss.SSS Z",
                Locale.US
        ).format(new Date()));
        pw.println("Thread : " + (thread == null ? "?" : thread.getName()));
        pw.println();

        if (throwable != null) {
            throwable.printStackTrace(pw);
        } else {
            pw.println("Throwable null");
        }

        pw.flush();

        try (FileWriter writer = new FileWriter(file, false)) {
            writer.write(sw.toString());
        }
    }

    private static void showPreviousCrash(Activity activity) {
        if (activity == null || activity.isFinishing()) return;

        File file = new File(activity.getFilesDir(), FILE_NAME);
        if (!file.exists() || file.length() == 0L) return;

        final String text;
        try {
            byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
            text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return;
        }

        TextView view = new TextView(activity);
        int pad = (int) (16 * activity.getResources().getDisplayMetrics().density);
        view.setPadding(pad, pad, pad, pad);
        view.setText(text);
        view.setTextSize(12f);
        view.setTextIsSelectable(true);
        view.setMovementMethod(new ScrollingMovementMethod());

        new AlertDialog.Builder(activity)
                .setTitle("Crash détecté · CGDIAG001")
                .setView(view)
                .setPositiveButton("COPIER", (dialog, which) -> {
                    ClipboardManager cm = (ClipboardManager)
                            activity.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(
                                ClipData.newPlainText("CGDIAG001 crash", text)
                        );
                    }
                })
                .setNeutralButton("EFFACER", (dialog, which) -> {
                    try {
                        file.delete();
                    } catch (Exception ignored) { }
                })
                .setNegativeButton("FERMER", null)
                .show();
    }
}
