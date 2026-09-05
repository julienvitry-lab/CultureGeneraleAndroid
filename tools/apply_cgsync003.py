#!/usr/bin/env python3
from pathlib import Path
import re

JAVA = Path('app/src/main/java/fr/culturegenerale/android/MainActivity.java')
GRADLE = Path('app/build.gradle')
WEBAPP = Path('web/public/app.js')
INDEX = Path('web/public/index.html')

for p in (JAVA, GRADLE, WEBAPP, INDEX):
    if not p.exists():
        raise SystemExit(f'ERREUR: fichier introuvable: {p}')

def method_bounds(text, signature_regex):
    m = re.search(signature_regex, text)
    if not m:
        return None
    brace = text.find('{', m.end() - 1)
    if brace < 0:
        return None
    depth = 0
    i = brace
    in_str = None
    esc = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in ('"', "'"):
                in_str = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return m.start(), i + 1
        i += 1
    return None

# WEB: timestamp each CGWEB005 edit
web = WEBAPP.read_text(encoding='utf-8')
if 'CGSYNC003_WEB_STAMP' not in web:
    imp = re.search(r'import\s*\{(?P<body>.*?)\}\s*from\s*["\'][^"\']*firebase-firestore(?:\.min)?\.js["\']\s*;', web, re.S)
    if not imp:
        raise SystemExit('ERREUR: import firebase-firestore.js introuvable dans web/public/app.js')
    body = imp.group('body')
    if re.search(r'\bserverTimestamp\b', body) is None:
        new_body = body.rstrip()
        if new_body and not new_body.rstrip().endswith(','):
            new_body += ','
        new_body += '\n  serverTimestamp\n'
        web = web[:imp.start('body')] + new_body + web[imp.end('body'):]
    fn = re.search(r'(updateQuestion\s*:\s*async\s*\(\s*\{\s*questionId\s*,\s*patch\s*\}\s*\)\s*=>\s*\{)', web)
    if not fn:
        raise SystemExit('ERREUR: fonction updateQuestion({ questionId, patch }) introuvable')
    stamp = '\n    // CGSYNC003_WEB_STAMP — seules les éditions post-migration sont écoutées par Android.\n    patch = { ...patch, cg_updated_at: serverTimestamp() };'
    web = web[:fn.end()] + stamp + web[fn.end():]
    WEBAPP.write_text(web, encoding='utf-8')
    print('OK: CGWEB005 horodate désormais chaque modification avec cg_updated_at')
else:
    print('INFO: timestamp Web CGSYNC003 déjà présent')

html = INDEX.read_text(encoding='utf-8')
html2, count = re.subn(r'src=["\'](?:\./)?app\.js(?:\?v=[^"\']*)?["\']', 'src="./app.js?v=CGSYNC003_1"', html, count=1)
if count != 1:
    raise SystemExit('ERREUR: balise app.js introuvable dans index.html')
INDEX.write_text(html2, encoding='utf-8')
print('OK: cache-bust Web -> CGSYNC003_1')

# ANDROID incremental listener
java = JAVA.read_text(encoding='utf-8')
for imp_line in ['import com.google.firebase.Timestamp;', 'import com.google.firebase.firestore.Query;']:
    if imp_line not in java:
        pkg = re.search(r'^package\s+[^;]+;\s*', java, re.M)
        if not pkg:
            raise SystemExit('ERREUR: package Java introuvable')
        java = java[:pkg.end()] + '\n' + imp_line + java[pkg.end():]

if 'CGSYNC003_PREFS' not in java:
    marker = 'private ListenerRegistration cgSync002QuestionsRegistration;'
    pos = java.find(marker)
    if pos < 0:
        raise SystemExit('ERREUR: champs CGSYNC002 introuvables')
    line_end = java.find('\n', pos)
    constants = '''\n    // CGSYNC003_INCREMENTAL_CONFIG_START\n    private static final String CGSYNC003_PREFS = "cgsync003";\n    private static final String CGSYNC003_LAST_SEC = "questions_last_sec_";\n    private static final String CGSYNC003_LAST_NANOS = "questions_last_nanos_";\n    // CGSYNC003_INCREMENTAL_CONFIG_END\n'''
    java = java[:line_end+1] + constants + java[line_end+1:]

bounds = method_bounds(java, r'private\s+synchronized\s+void\s+startCgSync002QuestionSync\s*\(\s*FirebaseUser\s+user\s*\)')
if not bounds:
    raise SystemExit('ERREUR: méthode startCgSync002QuestionSync introuvable')
start, end = bounds
new_method = '''private synchronized void startCgSync002QuestionSync(FirebaseUser user) {
        // CGSYNC003_INCREMENTAL_START
        if (user == null) return;

        String uid = safe(user.getUid());
        if (uid.isEmpty()) return;

        if (cgSync002QuestionsRegistration != null && uid.equals(cgSync002QuestionsUid)) return;

        stopCgSync002QuestionSync();
        cgSync002QuestionsUid = uid;

        final android.content.SharedPreferences cgSync003Prefs =
                getSharedPreferences(CGSYNC003_PREFS, MODE_PRIVATE);
        final long sinceSeconds = cgSync003Prefs.getLong(CGSYNC003_LAST_SEC + uid, 0L);
        final int sinceNanos = cgSync003Prefs.getInt(CGSYNC003_LAST_NANOS + uid, 0);
        final Timestamp since = new Timestamp(sinceSeconds, sinceNanos);

        // Les documents CGIMPORT001 n'ont pas cg_updated_at : ils sont exclus du snapshot initial.
        cgSync002QuestionsRegistration = FirebaseFirestore.getInstance()
                .collection("users")
                .document(uid)
                .collection("questions")
                .whereGreaterThan("cg_updated_at", since)
                .orderBy("cg_updated_at", Query.Direction.ASCENDING)
                .addSnapshotListener((snapshot, error) -> {
                    if (error != null || snapshot == null) return;
                    if (!hasAccess() || dbFile == null || !dbFile.exists()) return;

                    final List<DocumentSnapshot> changedDocs = new ArrayList<>();
                    long maxSeconds = sinceSeconds;
                    int maxNanos = sinceNanos;

                    for (DocumentChange change : snapshot.getDocumentChanges()) {
                        if (change.getType() == DocumentChange.Type.REMOVED) continue;
                        DocumentSnapshot document = change.getDocument();
                        Timestamp updatedAt = document.getTimestamp("cg_updated_at");
                        if (updatedAt == null) continue;
                        changedDocs.add(document);
                        long sec = updatedAt.getSeconds();
                        int nanos = updatedAt.getNanoseconds();
                        if (sec > maxSeconds || (sec == maxSeconds && nanos > maxNanos)) {
                            maxSeconds = sec;
                            maxNanos = nanos;
                        }
                    }

                    if (changedDocs.isEmpty()) return;
                    final long checkpointSeconds = maxSeconds;
                    final int checkpointNanos = maxNanos;

                    cgSync002QuestionsExecutor.execute(() -> {
                        int matchedRows = 0;
                        SQLiteDatabase db = null;
                        boolean committed = false;
                        try {
                            db = openDb();
                            db.beginTransaction();
                            for (DocumentSnapshot document : changedDocs) {
                                matchedRows += applyCgSync002QuestionToSqlite(db, document);
                            }
                            db.setTransactionSuccessful();
                            committed = true;
                        } catch (Exception ignored) {
                            // Le Cloud ne doit jamais empêcher de jouer.
                        } finally {
                            if (db != null) {
                                try { if (db.inTransaction()) db.endTransaction(); } catch (Exception ignored) { }
                                try { db.close(); } catch (Exception ignored) { }
                            }
                        }

                        if (committed) {
                            cgSync003Prefs.edit()
                                    .putLong(CGSYNC003_LAST_SEC + uid, checkpointSeconds)
                                    .putInt(CGSYNC003_LAST_NANOS + uid, checkpointNanos)
                                    .apply();
                        }

                        if (matchedRows > 0 && "home".equals(phase)) {
                            runOnUiThread(() -> { if ("home".equals(phase)) showHome(); });
                        }
                    });
                });
        // CGSYNC003_INCREMENTAL_END
    }'''
java = java[:start] + new_method + java[end:]
JAVA.write_text(java, encoding='utf-8')
print('OK: Android écoute uniquement les questions modifiées après migration')

# Version Android
s = GRADLE.read_text(encoding='utf-8')
m = re.search(r'\bversionCode\s+(\d+)', s)
if not m:
    raise SystemExit('ERREUR: versionCode introuvable')
old = int(m.group(1)); new = old + 1
s = s[:m.start(1)] + str(new) + s[m.end(1):]
m = re.search(r"\bversionName\s+['\"]([^'\"]+)['\"]", s)
if not m:
    raise SystemExit('ERREUR: versionName introuvable')
quote = "'" if "'" in m.group(0) else '"'
s = s[:m.start()] + f'versionName {quote}9.5.3-cgsync003{quote}' + s[m.end():]
GRADLE.write_text(s, encoding='utf-8')
print(f'OK: versionCode {old} -> {new}')
print('OK: versionName -> 9.5.3-cgsync003')

for p, token in [
    (JAVA, 'CGSYNC003_INCREMENTAL_START'),
    (JAVA, '.whereGreaterThan("cg_updated_at", since)'),
    (WEBAPP, 'CGSYNC003_WEB_STAMP'),
    (WEBAPP, 'serverTimestamp()'),
    (INDEX, 'CGSYNC003_1'),
]:
    if token not in p.read_text(encoding='utf-8'):
        raise SystemExit(f'ERREUR contrôle: {token} absent de {p}')

print('\n=== CGSYNC003 PATCH OK ===')
print('217 576 documents importés : exclus du snapshot initial Android.')
print('Seules les futures modifications CGWEB005 seront synchronisées.')
