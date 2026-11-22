package fr.culturegenerale.android.tablet;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** CGANDROID026: read-only access to the user's legacy image library. */
final class CgLocalImageLibrary {
    private final Context context;
    private final ContentResolver resolver;
    private final Uri tree;
    private final boolean refresh;
    private final Map<String, String> files = new HashMap<>();
    private final Map<String, String> folded = new HashMap<>();
    private final Map<String, String> byQuestion = new HashMap<>();
    private final Set<String> ambiguousQuestions = new HashSet<>();
    private boolean indexed;
    private int imageCount;
    private String problem = "";

    CgLocalImageLibrary(Context context, Uri tree, boolean refresh) {
        this.context = context.getApplicationContext();
        this.resolver = context.getContentResolver();
        this.tree = tree;
        this.refresh = refresh;
    }

    private Uri document(String id) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, id);
    }

    private static final class Entry {
        String id, name, mime;
        Entry(String id, String name, String mime) {
            this.id = id; this.name = name; this.mime = mime;
        }
        boolean directory() { return DocumentsContract.Document.MIME_TYPE_DIR.equals(mime); }
    }

    private List<Entry> children(String parent) {
        List<Entry> result = new ArrayList<>();
        Uri uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parent);
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE};
        try (Cursor c = resolver.query(uri, columns, null, null, null)) {
            if (c == null) throw new IllegalStateException("Dossier inaccessible");
            while (c.moveToNext()) result.add(new Entry(c.getString(0), c.getString(1), c.getString(2)));
        }
        return result;
    }

    private static void unique(Map<String, String> map, String key, String id) {
        String old = map.get(key);
        if (old == null) map.put(key, id);
        else if (!old.equals(id)) map.put(key, "");
    }

    private void scan(String parent, String prefix, int depth) {
        if (depth > 12) return;
        for (Entry e : children(parent)) {
            if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("Indexation interrompue");
            if (e.name == null || e.id == null) continue;
            String relative = prefix + e.name;
            if (e.directory()) {
                scan(e.id, relative + "/", depth + 1);
            } else {
                if (!CgLegacyImageNormalizer.looksLikeImageReference(e.name)) continue;
                unique(files, relative, e.id);
                unique(files, e.name, e.id);
                unique(folded, relative.toLowerCase(Locale.ROOT), e.id);
                unique(folded, e.name.toLowerCase(Locale.ROOT), e.id);
                imageCount++;
            }
        }
    }

    private static String cleanReference(String raw) {
        String value = CgLegacyImageNormalizer.normalizeReference(raw);
        if (value.isEmpty()) return "";
        int query = value.indexOf('?');
        if (query >= 0) value = value.substring(0, query);
        int hash = value.indexOf('#');
        if (hash >= 0) value = value.substring(0, hash);
        return Uri.decode(value).replace('\\', '/').trim();
    }

    private String find(String raw) {
        String ref = cleanReference(raw);
        if (ref.isEmpty()) return null;
        int folder = ref.toLowerCase(Locale.ROOT).lastIndexOf("/images/");
        String relative = folder >= 0 ? ref.substring(folder + 8) : ref;
        if (relative.toLowerCase(Locale.ROOT).startsWith("images/")) relative = relative.substring(7);
        String name = relative.substring(relative.lastIndexOf('/') + 1);
        for (String key : new String[]{relative, name}) {
            String id = files.get(key);
            if (id != null && !id.isEmpty()) return id;
            id = folded.get(key.toLowerCase(Locale.ROOT));
            if (id != null && !id.isEmpty()) return id;
        }
        return null;
    }

    private void copy(String id, File target) throws Exception {
        try (InputStream in = resolver.openInputStream(document(id));
             FileOutputStream out = new FileOutputStream(target)) {
            if (in == null) throw new IllegalStateException("Fichier inaccessible");
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                out.write(buffer, 0, n);
            }
        }
    }

    // The migration uses original_id (row_number fallback) as Firestore ID.
    // Read an isolated snapshot, never modify the legacy database or its WAL.
    private void readLegacy(Map<String, String> siblings) throws Exception {
        String dbId = siblings.get("questions_base.sqlite");
        if (dbId == null) return;
        File dir = File.createTempFile("cg26-", ".tmp", context.getCacheDir());
        if (!dir.delete() || !dir.mkdir()) throw new IllegalStateException("Cache indisponible");
        File dbFile = new File(dir, "questions_base.sqlite");
        try {
            copy(dbId, dbFile);
            String wal = siblings.get("questions_base.sqlite-wal");
            if (wal != null) copy(wal, new File(dir, "questions_base.sqlite-wal"));
            try (SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getPath(), null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
                Set<String> columns = new HashSet<>();
                try (Cursor c = db.rawQuery("PRAGMA table_info(questions)", null)) {
                    while (c.moveToNext()) columns.add(c.getString(1));
                }
                if (!columns.contains("original_id") && !columns.contains("row_number")) return;
                String original = "NULLIF(TRIM(CAST(original_id AS TEXT)), '')";
                String row = "NULLIF(TRIM(CAST(row_number AS TEXT)), '')";
                String id = columns.contains("original_id") ? original : row;
                if (columns.contains("original_id") && columns.contains("row_number"))
                    id = "COALESCE(" + original + "," + row + ")";
                List<String> refs = new ArrayList<>();
                for (String name : new String[]{"image_file","image_filename","image_path","image",
                        "image_source_url","image_thumb_file","detail","details","filename"}) {
                    if (columns.contains(name)) refs.add(name);
                }
                if (refs.isEmpty()) return;
                StringBuilder sql = new StringBuilder("SELECT ").append(id);
                for (String ref : refs) sql.append(", \"").append(ref).append("\"");
                sql.append(" FROM questions");
                try (Cursor c = db.rawQuery(sql.toString(), null)) {
                    while (c.moveToNext()) {
                        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                        String qid = c.getString(0);
                        if (qid == null || ambiguousQuestions.contains(qid)) continue;
                        String match = null;
                        for (int i = 1; i < c.getColumnCount(); i++) {
                            String value = c.getString(i);
                            if (!CgLegacyImageNormalizer.looksLikeImageReference(value)) continue;
                            String file = find(value);
                            if (file != null) { match = file; break; }
                        }
                        if (match == null) continue;
                        String previous = byQuestion.get(qid);
                        if (previous != null && !previous.equals(match)) {
                            byQuestion.remove(qid);
                            ambiguousQuestions.add(qid);
                        } else byQuestion.put(qid, match);
                    }
                }
            }
        } finally {
            File[] all = dir.listFiles();
            if (all != null) for (File f : all) f.delete();
            dir.delete();
        }
    }

    synchronized String warm() {
        if (indexed) return summary();
        if (!refresh && readSavedIndex()) {
            indexed = true;
            return summary();
        }
        try {
            String root = DocumentsContract.getTreeDocumentId(tree);
            Map<String, String> siblings = new HashMap<>();
            String images = null;
            for (Entry e : children(root)) {
                if ("Images".equalsIgnoreCase(e.name) && e.directory()) images = e.id;
                else if (!e.directory()) siblings.put(e.name, e.id);
            }
            if (images == null) {
                problem = "Sélectionne le dossier Culture Générale contenant Images et questions_base.sqlite.";
            } else {
                scan(images, "", 0);
                try { readLegacy(siblings); }
                catch (Exception e) {
                    byQuestion.clear();
                    problem = "Base historique non lisible : seuls les noms directs seront recherchés.";
                    android.util.Log.w("CGANDROID026", "Legacy image index unavailable", e);
                }
            }
        } catch (Exception e) {
            files.clear(); folded.clear(); byQuestion.clear(); imageCount = 0;
            problem = "Bibliothèque inaccessible. Sélectionne à nouveau le dossier.";
            android.util.Log.w("CGANDROID026", "Image library unavailable", e);
        }
        indexed = true;
        if (problem.isEmpty() && imageCount > 0) saveIndex();
        return summary();
    }

    // Persist the small filename/ID index, never duplicate the 55,000 images.
    // Explicit folder selection always rebuilds it after a library update.
    private android.util.AtomicFile indexFile() {
        return new android.util.AtomicFile(new File(context.getFilesDir(),
                "cg26-image-index-" + Integer.toHexString(tree.toString().hashCode()) + ".bin"));
    }

    private static void readMap(DataInputStream in, Map<String, String> map) throws Exception {
        int size = in.readInt();
        if (size < 0 || size > 1000000) throw new IllegalStateException("Index invalide");
        for (int i = 0; i < size; i++) map.put(in.readUTF(), in.readUTF());
    }

    private static void writeMap(DataOutputStream out, Map<String, String> map) throws Exception {
        out.writeInt(map.size());
        for (Map.Entry<String, String> e : map.entrySet()) {
            out.writeUTF(e.getKey());
            out.writeUTF(e.getValue());
        }
    }

    private boolean readSavedIndex() {
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(indexFile().openRead()))) {
            if (in.readInt() != 2601 || !tree.toString().equals(in.readUTF())) return false;
            imageCount = in.readInt();
            if (imageCount <= 0 || imageCount > 1000000) throw new IllegalStateException("Index invalide");
            readMap(in, files);
            readMap(in, folded);
            readMap(in, byQuestion);
            return true;
        } catch (Exception e) {
            files.clear(); folded.clear(); byQuestion.clear(); imageCount = 0;
            return false;
        }
    }

    private void saveIndex() {
        android.util.AtomicFile file = indexFile();
        FileOutputStream raw = null;
        try {
            raw = file.startWrite();
            DataOutputStream out = new DataOutputStream(new BufferedOutputStream(raw));
            out.writeInt(2601);
            out.writeUTF(tree.toString());
            out.writeInt(imageCount);
            writeMap(out, files);
            writeMap(out, folded);
            writeMap(out, byQuestion);
            out.flush();
            file.finishWrite(raw);
        } catch (Exception e) {
            if (raw != null) file.failWrite(raw);
        }
    }

    private String summary() {
        return imageCount + " images locales · " + byQuestion.size() + " liens historiques"
                + (problem.isEmpty() ? "" : "\n" + problem);
    }

    Bitmap load(String questionId, String imageReference) {
        String doc;
        synchronized (this) {
            warm();
            doc = find(imageReference);
            if (doc == null && questionId != null) doc = byQuestion.get(questionId);
        }
        if (doc == null) return null;
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            try (InputStream in = resolver.openInputStream(document(doc))) {
                if (in == null) return null;
                BitmapFactory.decodeStream(in, null, options);
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return null;
            int sample = 1;
            while (Math.max(options.outWidth, options.outHeight) / sample > 1600) sample *= 2;
            options.inSampleSize = sample;
            options.inJustDecodeBounds = false;
            try (InputStream in = resolver.openInputStream(document(doc))) {
                return in == null ? null : BitmapFactory.decodeStream(in, null, options);
            }
        } catch (Exception e) {
            return null;
        }
    }
}
