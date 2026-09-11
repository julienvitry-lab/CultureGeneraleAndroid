package fr.culturegenerale.android;

import android.content.Context;
import android.util.Log;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class CgImage004Prefetcher {
    private static final String TAG = "CGIMAGE004";
    private static final int MAX_PARALLEL = 3;

    private static final Object LOCK = new Object();
    private static final ArrayDeque<String> QUEUE = new ArrayDeque<>();
    private static final Set<String> QUEUED_OR_RUNNING = new HashSet<>();
    private static int running = 0;

    private CgImage004Prefetcher() {}

    public static void enqueue(Context context, List<String> storagePaths) {
        if (context == null || storagePaths == null || storagePaths.isEmpty()) return;
        Context appContext = context.getApplicationContext();

        synchronized (LOCK) {
            for (String raw : storagePaths) {
                String path = raw == null ? "" : raw.trim();
                if (!CgImage001Cache.isCloudPath(path)) continue;

                java.io.File cached = CgImage001Cache.cachedFile(appContext, path);
                if (cached.exists() && cached.length() > 0) continue;

                if (QUEUED_OR_RUNNING.add(path)) {
                    QUEUE.addLast(path);
                }
            }
        }
        pump(appContext);
    }

    private static void pump(Context context) {
        while (true) {
            final String path;

            synchronized (LOCK) {
                if (running >= MAX_PARALLEL || QUEUE.isEmpty()) return;
                path = QUEUE.removeFirst();
                running++;
            }

            CgImage001Cache.ensureCached(context, path, (file, error) -> {
                synchronized (LOCK) {
                    running = Math.max(0, running - 1);
                    QUEUED_OR_RUNNING.remove(path);
                }

                if (error != null) {
                    Log.w(TAG, "Préchargement impossible : " + path + " · "
                            + String.valueOf(error.getMessage()));
                } else {
                    Log.i(TAG, "Préchargée : " + path);
                }

                pump(context);
            });
        }
    }
}
