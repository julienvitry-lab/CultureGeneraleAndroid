package fr.culturegenerale.android;

import android.content.Context;

import com.google.firebase.storage.FirebaseStorage;
import com.google.firebase.storage.StorageReference;

import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * CGIMAGE001 · cache automatique des images de questions Firebase Storage.
 *
 * Firebase Storage est la source officielle. Le téléphone / la tablette ne
 * conserve qu'une copie dans Context.getCacheDir(), donc supprimable par
 * Android sans affecter les données métier.
 */
public final class CgImage001Cache {
    private static final String CACHE_DIR = "cgimage001";
    private static final long MAX_CACHE_BYTES = 128L * 1024L * 1024L;
    private static final long TARGET_CACHE_BYTES = 112L * 1024L * 1024L;

    public interface Callback {
        void onComplete(File file, Exception error);
    }

    private static final Map<String, List<Callback>> WAITERS = new ConcurrentHashMap<>();

    private CgImage001Cache() { }

    public static boolean isCloudPath(String value) {
        if (value == null) return false;
        String path = value.trim();
        return path.startsWith("users/") && path.contains("/question-images/");
    }

    public static File cachedFile(Context context, String storagePath) {
        File dir = new File(context.getCacheDir(), CACHE_DIR);
        if (!dir.exists()) dir.mkdirs();
        String ext = extension(storagePath);
        return new File(dir, sha256(storagePath) + ext);
    }

    public static void ensureCached(Context context, String storagePath, Callback callback) {
        if (context == null || !isCloudPath(storagePath)) {
            if (callback != null) callback.onComplete(null, new IllegalArgumentException("Chemin Storage invalide"));
            return;
        }

        Context appContext = context.getApplicationContext();
        File target = cachedFile(appContext, storagePath);
        if (target.exists() && target.length() > 0) {
            target.setLastModified(System.currentTimeMillis());
            if (callback != null) callback.onComplete(target, null);
            return;
        }

        final boolean leader;
        synchronized (WAITERS) {
            List<Callback> callbacks = WAITERS.get(storagePath);
            if (callbacks == null) {
                callbacks = new ArrayList<>();
                WAITERS.put(storagePath, callbacks);
                leader = true;
            } else {
                leader = false;
            }
            if (callback != null) callbacks.add(callback);
        }
        if (!leader) return;

        File parent = target.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        File temp = new File(target.getAbsolutePath() + ".part");
        if (temp.exists()) temp.delete();

        try {
            StorageReference ref = FirebaseStorage.getInstance().getReference().child(storagePath);
            ref.getFile(temp)
                    .addOnSuccessListener(snapshot -> {
                        Exception error = null;
                        File result = target;
                        try {
                            if (target.exists()) target.delete();
                            if (!temp.renameTo(target)) {
                                throw new IllegalStateException("Impossible de finaliser le cache image");
                            }
                            target.setLastModified(System.currentTimeMillis());
                            prune(appContext);
                        } catch (Exception e) {
                            error = e;
                            result = null;
                            temp.delete();
                        }
                        finish(storagePath, result, error);
                    })
                    .addOnFailureListener(error -> {
                        temp.delete();
                        finish(storagePath, null, error);
                    });
        } catch (Exception error) {
            temp.delete();
            finish(storagePath, null, error);
        }
    }

    private static void finish(String storagePath, File file, Exception error) {
        List<Callback> callbacks;
        synchronized (WAITERS) {
            callbacks = WAITERS.remove(storagePath);
        }
        if (callbacks == null) return;
        for (Callback callback : callbacks) {
            try {
                callback.onComplete(file, error);
            } catch (Exception ignored) { }
        }
    }

    private static String extension(String value) {
        if (value == null) return ".img";
        String clean = value.toLowerCase();
        int slash = clean.lastIndexOf('/');
        int dot = clean.lastIndexOf('.');
        if (dot > slash && dot >= 0 && clean.length() - dot <= 6) {
            return clean.substring(dot);
        }
        return ".img";
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(String.valueOf(value).getBytes("UTF-8"));
            StringBuilder out = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) out.append(String.format(java.util.Locale.US, "%02x", b & 0xff));
            return out.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(String.valueOf(value).hashCode());
        }
    }

    private static void prune(Context context) {
        try {
            File dir = new File(context.getCacheDir(), CACHE_DIR);
            File[] files = dir.listFiles(file -> file.isFile() && !file.getName().endsWith(".part"));
            if (files == null || files.length == 0) return;

            long total = 0L;
            List<File> ordered = new ArrayList<>();
            for (File file : files) {
                total += Math.max(0L, file.length());
                ordered.add(file);
            }
            if (total <= MAX_CACHE_BYTES) return;

            ordered.sort(Comparator.comparingLong(File::lastModified));
            for (File file : ordered) {
                if (total <= TARGET_CACHE_BYTES) break;
                long size = Math.max(0L, file.length());
                if (file.delete()) total -= size;
            }
        } catch (Exception ignored) { }
    }
}
