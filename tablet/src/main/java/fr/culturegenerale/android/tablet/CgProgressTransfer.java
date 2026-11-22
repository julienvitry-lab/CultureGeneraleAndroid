package fr.culturegenerale.android.tablet;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.system.Os;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

/** CGANDROID021: local, account-bound backup. Never exports authentication. */
final class CgProgressTransfer {
    private static final String DB = "cgandroid012_local_learning.db";
    private static final String[] PREFS = {"cgandroid001_flags", "cgandroid001_game"};
    private static final String DB_ENTRY = "learning.db", PREF_ENTRY = "progress.json";
    private static final long DB_LIMIT = 1024L * 1024 * 1024;
    private static final long PREF_LIMIT = 32L * 1024 * 1024;
    private static File root(Context c) throws IOException {
        File d = new File(c.getFilesDir(), "cgandroid021_backups");
        if (!d.isDirectory() && !d.mkdirs()) throw new IOException("Dossier de sauvegarde inaccessible");
        return d;
    }
    private static File newDir(Context c) throws IOException {
        return newDir(c,"backup-");
    }
    private static File newDir(Context c,String prefix) throws IOException {
        File d = new File(root(c), prefix + System.currentTimeMillis() + "-" + UUID.randomUUID());
        if (!d.mkdir()) throw new IOException("Impossible de créer la sauvegarde");
        return d;
    }
    private static void copy(InputStream in, OutputStream out, long max) throws IOException {
        byte[] b = new byte[65536]; long n = 0; int k;
        while ((k = in.read(b)) != -1) { n += k; if (n > max) throw new IOException("Fichier trop volumineux"); out.write(b,0,k); }
    }
    private static void copyFile(File src, File dst, long limit) throws IOException {
        try (InputStream in = new FileInputStream(src); FileOutputStream out = new FileOutputStream(dst)) {
            copy(in,out,limit); out.getFD().sync();
        }
    }
    private static void atomicWrite(File f, byte[] b) throws Exception {
        File t = new File(f.getParentFile(), f.getName()+".tmp");
        try (FileOutputStream out = new FileOutputStream(t)) { out.write(b); out.getFD().sync(); }
        Os.rename(t.getAbsolutePath(), f.getAbsolutePath());
    }
    private static String readString(File f, long max) throws IOException {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copy(in,out,max); return new String(out.toByteArray(),StandardCharsets.UTF_8);
        }
    }
    private static JSONObject capturePrefs(Context c, String uid) throws Exception {
        JSONObject state = new JSONObject(); state.put("format",1); state.put("uid",uid);
        for (String name : PREFS) {
            JSONObject values = new JSONObject();
            for (Map.Entry<String,?> v : c.getSharedPreferences(name,Context.MODE_PRIVATE).getAll().entrySet()) {
                Object raw = v.getValue(); JSONObject p = new JSONObject();
                if (raw instanceof Set) { p.put("type","set"); p.put("value",new JSONArray((Set<?>)raw)); }
                else if (raw instanceof String) { p.put("type","string"); p.put("value",raw); }
                else if (raw instanceof Integer) { p.put("type","int"); p.put("value",raw); }
                else if (raw instanceof Long) { p.put("type","long"); p.put("value",raw); }
                else if (raw instanceof Boolean) { p.put("type","bool"); p.put("value",raw); }
                else if (raw instanceof Float) { p.put("type","float"); p.put("value",raw); }
                else throw new IOException("Type de préférence inconnu");
                values.put(v.getKey(),p);
            }
            state.put(name,values);
        }
        return state;
    }
    private static void applyPrefs(Context c, JSONObject state, boolean validateOnly) throws Exception {
        for (String name : PREFS) {
            JSONObject vals = state.getJSONObject(name);
            SharedPreferences.Editor ed = c.getSharedPreferences(name,Context.MODE_PRIVATE).edit().clear();
            Iterator<String> keys = vals.keys();
            while(keys.hasNext()) {
                String k=keys.next(); JSONObject p=vals.getJSONObject(k);
                switch(p.getString("type")) {
                    case "string": ed.putString(k,p.getString("value")); break;
                    case "int": ed.putInt(k,p.getInt("value")); break;
                    case "long": ed.putLong(k,p.getLong("value")); break;
                    case "bool": ed.putBoolean(k,p.getBoolean("value")); break;
                    case "float": ed.putFloat(k,(float)p.getDouble("value")); break;
                    case "set": JSONArray a=p.getJSONArray("value"); Set<String> set=new HashSet<>(); for(int i=0;i<a.length();i++) set.add(a.getString(i)); ed.putStringSet(k,set); break;
                    default: throw new IOException("Type de préférence invalide");
                }
            }
            if (!validateOnly && !ed.commit()) throw new IOException("Écriture des préférences impossible");
        }
    }
    private static long validate(Context c, File dir, String uid) throws Exception {
        JSONObject prefs = new JSONObject(readString(new File(dir,PREF_ENTRY),PREF_LIMIT));
        if(prefs.getInt("format")!=1 || uid.isEmpty() || !uid.equals(prefs.getString("uid"))) throw new IOException("Sauvegarde d'un autre compte ou format inconnu");
        applyPrefs(c,prefs,true);
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(new File(dir,DB_ENTRY).getAbsolutePath(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
            try (Cursor q=db.rawQuery("PRAGMA quick_check",null)) { if(!q.moveToFirst() || !"ok".equals(q.getString(0))) throw new IOException("Base SQLite endommagée"); }
            if(db.getVersion()!=3) throw new IOException("Version SQLite non compatible");
            try(Cursor q=db.rawQuery("SELECT value FROM meta WHERE key='uid'",null)) { if(!q.moveToFirst() || !uid.equals(q.getString(0))) throw new IOException("Compte de la base incompatible"); }
            for(String table:new String[]{"learning","attempts","recent_themes","session_served","meta"}) {
                try(Cursor q=db.rawQuery("SELECT COUNT(*) FROM "+table,null)){ if(!q.moveToFirst()) throw new IOException("Table absente"); }
            }
            try(Cursor q=db.rawQuery("SELECT COUNT(*) FROM questions",null)) { if(!q.moveToFirst() || q.getLong(0)==0) throw new IOException("Catalogue vide"); return q.getLong(0); }
        }
    }
    private static void snapshot(Context c,CgLocalEngine engine,String uid,File dir) throws Exception {
        synchronized(engine) {
            SQLiteDatabase db=engine.getWritableDatabase();
            File snap=new File(dir,DB_ENTRY);
            if(snap.exists()) throw new IOException("Instantané déjà présent");
            // FIX1: SQLite produces a transactionally consistent standalone copy.
            // A PERSIST rollback journal may be nonempty even when no write is active.
            try {
                db.execSQL("VACUUM INTO ?",new Object[]{snap.getAbsolutePath()});
                if(!snap.isFile() || snap.length()==0 || snap.length()>DB_LIMIT)
                    throw new IOException("Instantané SQLite invalide");
                try(RandomAccessFile f=new RandomAccessFile(snap,"rw")){ f.getFD().sync(); }
            } finally { engine.close(); }
            atomicWrite(new File(dir,PREF_ENTRY),capturePrefs(c,uid).toString().getBytes(StandardCharsets.UTF_8));
        }
        validate(c,dir,uid);
    }
    private static void pack(File dir, OutputStream destination) throws Exception {
        try(ZipOutputStream out=new ZipOutputStream(new BufferedOutputStream(destination))) {
            for(String name:new String[]{DB_ENTRY,PREF_ENTRY}) {
                out.putNextEntry(new ZipEntry(name)); try(InputStream in=new FileInputStream(new File(dir,name))){copy(in,out,name.equals(DB_ENTRY)?DB_LIMIT:PREF_LIMIT);} out.closeEntry();
            }
        }
    }
    private static void unpack(InputStream source,File dir) throws Exception {
        Set<String> seen=new HashSet<>();
        try(ZipInputStream in=new ZipInputStream(new BufferedInputStream(source))) {
            ZipEntry e; while((e=in.getNextEntry())!=null) {
                String name=e.getName(); if((!DB_ENTRY.equals(name)&&!PREF_ENTRY.equals(name))||!seen.add(name)||e.isDirectory()) throw new IOException("Archive invalide");
                try(FileOutputStream out=new FileOutputStream(new File(dir,name))){copy(in,out,name.equals(DB_ENTRY)?DB_LIMIT:PREF_LIMIT);out.getFD().sync();} in.closeEntry();
            }
        }
        if(seen.size()!=2) throw new IOException("Archive incomplète");
    }
    private static File marker(Context c) throws Exception { return new File(root(c),"restore.pending"); }
    private static void install(Context c,File dir) throws Exception {
        File dest=c.getDatabasePath(DB), temp=new File(dest.getParentFile(),DB+".cg021tmp");
        copyFile(new File(dir,DB_ENTRY),temp,DB_LIMIT);
        // The engine is closed and a validated rollback snapshot exists.
        for(String suffix:new String[]{"-wal","-shm","-journal"}) { File f=new File(dest.getPath()+suffix); if(f.exists()&&!f.delete()) throw new IOException("Journal inaccessible"); }
        Os.rename(temp.getAbsolutePath(),dest.getAbsolutePath());
        applyPrefs(c,new JSONObject(readString(new File(dir,PREF_ENTRY),PREF_LIMIT)),false);
    }
    static void recover(Context c) throws Exception {
        File pending=marker(c); if(!pending.exists()) return;
        String name=readString(pending,1024).trim(); if(!name.matches("backup-[0-9]+-[0-9a-f-]+")) throw new IOException("Marqueur de récupération invalide");
        File backup=new File(root(c),name); JSONObject state=new JSONObject(readString(new File(backup,PREF_ENTRY),PREF_LIMIT));
        validate(c,backup,state.getString("uid")); install(c,backup);
        if(!pending.delete()) throw new IOException("Récupération à finaliser");
    }
    static long export(Context c,CgLocalEngine engine,String uid,OutputStream destination) throws Exception {
        File dir=newDir(c,"stage-"); try { snapshot(c,engine,uid,dir); long count=validate(c,dir,uid); pack(dir,destination); return count; }
        finally { deleteStage(dir); }
    }
    static long importProgress(Context c,CgLocalEngine engine,String uid,InputStream source) throws Exception {
        File stage=newDir(c,"stage-"); File backup=null;
        try {
            unpack(source,stage); long count=validate(c,stage,uid);
            synchronized(engine) {
                File pending=marker(c); if(pending.exists()) throw new IOException("Récupération en attente");
                backup=newDir(c); snapshot(c,engine,uid,backup);
                atomicWrite(pending,backup.getName().getBytes(StandardCharsets.UTF_8));
                try {
                    install(c,stage);
                    if(!pending.delete()) throw new IOException("Impossible de finaliser la restauration");
                } catch(Exception e) { try { recover(c); } catch(Exception recovery) { e.addSuppressed(recovery); } throw e; }
            }
            return count;
        } finally { deleteStage(stage); }
    }
    static void exportLastBackup(Context c,String uid,OutputStream destination) throws Exception {
        File[] dirs=root(c).listFiles(f->f.isDirectory()&&f.getName().startsWith("backup-"));
        if(dirs==null||dirs.length==0) throw new IOException("Aucune sauvegarde précédente");
        Arrays.sort(dirs,(a,b)->Long.compare(b.lastModified(),a.lastModified()));
        File selected=null;
        for(File dir:dirs) { try { validate(c,dir,uid); selected=dir; break; } catch(Exception ignored){} }
        if(selected==null) throw new IOException("Aucune sauvegarde valide pour ce compte");
        pack(selected,destination);
    }
    private static void deleteStage(File dir) {
        File[] files=dir.listFiles(); if(files!=null) for(File f:files) f.delete(); dir.delete();
    }
}
