package fr.culturegenerale.android.tablet;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;

/**
 * CGANDROID013 · IMAGE_DISK_CACHE001
 * Private, persistent image cache. This is not getCacheDir(), which Android
 * may evict at any time; the 180 MiB / 600-file cap is enforced here.
 */
final class CgImageDiskCache {

    private static final int MAX_EDGE = 1600;
    private static final long MAX_BYTES = 180L * 1024L * 1024L;
    private static final int MAX_FILES = 600;
    private final File directory;

    CgImageDiskCache(Context context, String uid) {
        directory = new File(
                context.getFilesDir(),
                "cgandroid013_images_" + hash(uid == null ? "" : uid)
        );
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IllegalStateException("Impossible de créer le cache image local.");
        }
    }

    synchronized Bitmap get(String imageId) {
        if (imageId == null || imageId.trim().isEmpty()) return null;
        File file = new File(directory, hash(imageId.trim()) + ".img");
        if (!file.isFile() || file.length() <= 0L) return null;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (bitmap == null) {
            // A partial or invalid file must never poison later attempts.
            file.delete();
            return null;
        }
        file.setLastModified(System.currentTimeMillis());
        return bitmap;
    }

    /** Persist and return the screen-sized version of the downloaded bitmap. */
    synchronized Bitmap put(String imageId, Bitmap original) {
        if (original == null || imageId == null || imageId.trim().isEmpty()) {
            return original;
        }
        Bitmap scaled = resize(original);
        File target = new File(directory, hash(imageId.trim()) + ".img");
        File partial = new File(directory, target.getName() + ".part");
        try {
            Bitmap.CompressFormat format = scaled.hasAlpha()
                    ? Bitmap.CompressFormat.PNG
                    : Bitmap.CompressFormat.JPEG;
            try (FileOutputStream output = new FileOutputStream(partial)) {
                if (!scaled.compress(format, format == Bitmap.CompressFormat.JPEG ? 87 : 100, output)) {
                    throw new IllegalStateException("Impossible d'encoder l'image.");
                }
                output.flush();
                output.getFD().sync();
            }
            if (target.exists() && !target.delete()) {
                throw new IllegalStateException("Ancienne image non remplaçable.");
            }
            if (!partial.renameTo(target)) {
                throw new IllegalStateException("Écriture atomique de l'image impossible.");
            }
            trim();
        } catch (Exception ignored) {
            // No partial file is ever considered a cached image.
            partial.delete();
            // The downloaded bitmap remains usable even if storage is full.
        }
        return scaled;
    }

    private static Bitmap resize(Bitmap original) {
        int w = original.getWidth();
        int h = original.getHeight();
        if (w <= 0 || h <= 0 || Math.max(w, h) <= MAX_EDGE) return original;
        float ratio = (float) MAX_EDGE / (float) Math.max(w, h);
        return Bitmap.createScaledBitmap(
                original,
                Math.max(1, Math.round(w * ratio)),
                Math.max(1, Math.round(h * ratio)),
                true
        );
    }

    private void trim() {
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".img"));
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long bytes = 0L;
        for (File f : files) bytes += f.length();
        int count = files.length;
        for (File f : files) {
            if (count <= MAX_FILES && bytes <= MAX_BYTES) break;
            long length = f.length();
            if (f.delete()) {
                count--;
                bytes -= length;
            }
        }
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 15, 16));
                hex.append(Character.forDigit(b & 15, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
