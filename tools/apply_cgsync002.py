from pathlib import Path
import re

JAVA = Path("app/src/main/java/fr/culturegenerale/android/MainActivity.java")
GRADLE = Path("app/build.gradle")

if not JAVA.exists():
    raise SystemExit("ERREUR: MainActivity.java introuvable")
if not GRADLE.exists():
    raise SystemExit("ERREUR: app/build.gradle introuvable")

s = JAVA.read_text(encoding="utf-8")

START = "// CGSYNC002_QUESTIONS_SYNC_START"

if START in s:
    print("INFO: CGSYNC002 est déjà présent dans MainActivity.java")
else:
    imports = [
        "import android.content.ContentValues;",
        "import com.google.firebase.auth.FirebaseAuth;",
        "import com.google.firebase.auth.FirebaseUser;",
        "import com.google.firebase.firestore.DocumentChange;",
        "import com.google.firebase.firestore.DocumentSnapshot;",
        "import com.google.firebase.firestore.FirebaseFirestore;",
        "import com.google.firebase.firestore.ListenerRegistration;",
        "import java.util.concurrent.ExecutorService;",
        "import java.util.concurrent.Executors;",
    ]

    pkg = re.search(r'^package\s+[^;]+;\s*', s, re.M)
    if not pkg:
        raise SystemExit("ERREUR: déclaration package introuvable")

    insert_at = pkg.end()
    missing = [imp for imp in imports if imp not in s]
    if missing:
        s = s[:insert_at] + "\n" + "\n".join(missing) + "\n" + s[insert_at:]

    fields = '''
    // CGSYNC002_QUESTIONS_SYNC_START
    // Synchronisation du CONTENU des questions Firestore -> SQLite Android.
    // Le statut reste géré exclusivement par SYNCLOUD001.
    private ListenerRegistration cgSync002QuestionsRegistration;
    private String cgSync002QuestionsUid = "";
    private final ExecutorService cgSync002QuestionsExecutor =
            Executors.newSingleThreadExecutor();

    private final FirebaseAuth.AuthStateListener cgSync002AuthStateListener = firebaseAuth -> {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        if (user == null) {
            stopCgSync002QuestionSync();
        } else {
            startCgSync002QuestionSync(user);
        }
    };
    // CGSYNC002_QUESTIONS_SYNC_END
'''.strip("\n")

    m = re.search(r'(\s*private\s+String\s+phase\s*=\s*"home"\s*;)', s)
    if m:
        pos = m.end()
        s = s[:pos] + "\n\n" + fields + s[pos:]
    else:
        m = re.search(r'public\s+class\s+MainActivity\s+extends\s+Activity\s*\{', s)
        if not m:
            raise SystemExit("ERREUR: ouverture MainActivity introuvable")
        pos = m.end()
        s = s[:pos] + "\n\n" + fields + "\n" + s[pos:]

    def method_bounds(text, sig_re):
        mm = re.search(sig_re, text)
        if not mm:
            return None
        brace = text.find("{", mm.end() - 1)
        if brace < 0:
            return None
        depth = 0
        i = brace
        while i < len(text):
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return brace, i
            i += 1
        return None

    bounds = method_bounds(
        s,
        r'@Override\s+public\s+void\s+onCreate\s*\(\s*Bundle\s+\w+\s*\)'
    )
    if not bounds:
        raise SystemExit("ERREUR: onCreate introuvable")
    b0, b1 = bounds
    body = s[b0+1:b1]
    hook = "FirebaseAuth.getInstance().addAuthStateListener(cgSync002AuthStateListener);"
    if hook not in body:
        body = body.rstrip() + "\n        " + hook + "\n    "
        s = s[:b0+1] + body + s[b1:]

    cleanup = '''
        try {
            FirebaseAuth.getInstance().removeAuthStateListener(cgSync002AuthStateListener);
        } catch (Exception ignored) { }
        stopCgSync002QuestionSync();
        cgSync002QuestionsExecutor.shutdownNow();
'''.strip("\n")

    bounds = method_bounds(
        s,
        r'@Override\s+(?:public|protected)\s+void\s+onDestroy\s*\(\s*\)'
    )
    if bounds:
        b0, b1 = bounds
        body = s[b0+1:b1]
        if "cgSync002QuestionsExecutor.shutdownNow()" not in body:
            body = body.rstrip() + "\n" + cleanup + "\n    "
            s = s[:b0+1] + body + s[b1:]
    else:
        anchor = re.search(r'\n\s*private\s+void\s+loadFont\s*\(', s)
        if not anchor:
            anchor = re.search(r'\n\s*private\s+', s)
        if not anchor:
            raise SystemExit("ERREUR: point insertion onDestroy introuvable")

        destroy = '''
    @Override
    protected void onDestroy() {
        try {
            FirebaseAuth.getInstance().removeAuthStateListener(cgSync002AuthStateListener);
        } catch (Exception ignored) { }
        stopCgSync002QuestionSync();
        cgSync002QuestionsExecutor.shutdownNow();
        super.onDestroy();
    }

'''
        s = s[:anchor.start()+1] + destroy + s[anchor.start()+1:]

    methods = '''
    // CGSYNC002_CONTENT_METHODS_START

    private synchronized void startCgSync002QuestionSync(FirebaseUser user) {
        if (user == null) return;

        String uid = safe(user.getUid());
        if (uid.isEmpty()) return;

        if (cgSync002QuestionsRegistration != null &&
                uid.equals(cgSync002QuestionsUid)) {
            return;
        }

        stopCgSync002QuestionSync();
        cgSync002QuestionsUid = uid;

        cgSync002QuestionsRegistration = FirebaseFirestore.getInstance()
                .collection("users")
                .document(uid)
                .collection("questions")
                .addSnapshotListener((snapshot, error) -> {
                    if (error != null || snapshot == null) return;
                    if (!hasAccess() || dbFile == null || !dbFile.exists()) return;

                    final List<DocumentSnapshot> changedDocs = new ArrayList<>();

                    for (DocumentChange change : snapshot.getDocumentChanges()) {
                        if (change.getType() == DocumentChange.Type.REMOVED) {
                            continue;
                        }
                        changedDocs.add(change.getDocument());
                    }

                    if (changedDocs.isEmpty()) return;

                    cgSync002QuestionsExecutor.execute(() -> {
                        int matchedRows = 0;
                        SQLiteDatabase db = null;

                        try {
                            db = openDb();
                            db.beginTransaction();

                            for (DocumentSnapshot document : changedDocs) {
                                matchedRows += applyCgSync002QuestionToSqlite(db, document);
                            }

                            db.setTransactionSuccessful();
                        } catch (Exception ignored) {
                            // Le Cloud ne doit jamais empêcher de jouer.
                        } finally {
                            if (db != null) {
                                try {
                                    if (db.inTransaction()) db.endTransaction();
                                } catch (Exception ignored) { }
                                try {
                                    db.close();
                                } catch (Exception ignored) { }
                            }
                        }

                        if (matchedRows > 0 && "home".equals(phase)) {
                            runOnUiThread(() -> {
                                if ("home".equals(phase)) showHome();
                            });
                        }
                    });
                });
    }

    private synchronized void stopCgSync002QuestionSync() {
        if (cgSync002QuestionsRegistration != null) {
            try {
                cgSync002QuestionsRegistration.remove();
            } catch (Exception ignored) { }
            cgSync002QuestionsRegistration = null;
        }
        cgSync002QuestionsUid = "";
    }

    private int applyCgSync002QuestionToSqlite(
            SQLiteDatabase db,
            DocumentSnapshot document
    ) {
        if (db == null || document == null) return 0;

        String documentId = safe(document.getId());
        if (documentId.isEmpty()) return 0;

        ContentValues values = new ContentValues();

        cgSync002Put(values, document, "megatheme");
        cgSync002Put(values, document, "theme");
        cgSync002Put(values, document, "question");
        cgSync002Put(values, document, "detail");
        cgSync002Put(values, document, "proposition_a");
        cgSync002Put(values, document, "proposition_b");
        cgSync002Put(values, document, "proposition_c");
        cgSync002Put(values, document, "proposition_d");
        cgSync002Put(values, document, "correct_index");
        cgSync002Put(values, document, "url_quizypedia");
        cgSync002Put(values, document, "url_internet");
        cgSync002Put(values, document, "image_file");
        cgSync002Put(values, document, "non_trouve");
        cgSync002Put(values, document, "is_image");

        // IMPORTANT : ne pas toucher au statut.
        if (values.size() == 0) return 0;

        int changed = db.update(
                TABLE,
                values,
                "CAST(original_id AS TEXT)=?",
                new String[]{documentId}
        );

        if (changed == 0 && document.contains("row_number")) {
            Object row = document.get("row_number");
            if (row != null) {
                changed = db.update(
                        TABLE,
                        values,
                        "CAST(row_number AS TEXT)=?",
                        new String[]{String.valueOf(row)}
                );
            }
        }

        return changed;
    }

    private void cgSync002Put(
            ContentValues values,
            DocumentSnapshot document,
            String field
    ) {
        if (!document.contains(field)) return;

        Object value = document.get(field);

        if (value == null) {
            values.putNull(field);
        } else if (value instanceof Boolean) {
            values.put(field, ((Boolean) value) ? 1 : 0);
        } else if (value instanceof Integer) {
            values.put(field, (Integer) value);
        } else if (value instanceof Long) {
            values.put(field, (Long) value);
        } else if (value instanceof Double) {
            values.put(field, (Double) value);
        } else if (value instanceof Float) {
            values.put(field, (Float) value);
        } else {
            values.put(field, String.valueOf(value));
        }
    }

    // CGSYNC002_CONTENT_METHODS_END

'''

    anchor = re.search(r'\n\s*private\s+void\s+migrateLegacyImageFlags\s*\(', s)
    if not anchor:
        anchor = re.search(r'\n\s*private\s+int\s+exportProblemsP\s*\(', s)
    if not anchor:
        raise SystemExit("ERREUR: point insertion méthodes CGSYNC002 introuvable")

    s = s[:anchor.start()+1] + methods + s[anchor.start()+1:]

    clean = re.sub(r'//.*', '', s)
    clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.S)
    clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', clean)
    clean = re.sub(r"'(?:\\.|[^'\\])*'", "''", clean)

    if clean.count("{") != clean.count("}"):
        raise SystemExit(
            f"ERREUR: accolades déséquilibrées "
            f"{clean.count('{')} / {clean.count('}')}"
        )

    JAVA.write_text(s, encoding="utf-8")
    print("OK: MainActivity.java enrichi avec CGSYNC002")

g = GRADLE.read_text(encoding="utf-8")

m = re.search(r'\bversionCode\s+(\d+)', g)
if m:
    old = int(m.group(1))
    new = old + 1
    g = g[:m.start(1)] + str(new) + g[m.end(1):]
    print(f"OK: versionCode {old} -> {new}")
else:
    print("ATTENTION: versionCode introuvable")

m = re.search(r"\bversionName\s+['\"]([^'\"]+)['\"]", g)
if m:
    quote = "'" if "'" in m.group(0) else '"'
    replacement = f"versionName {quote}9.5.2-cgsync002{quote}"
    g = g[:m.start()] + replacement + g[m.end():]
    print("OK: versionName -> 9.5.2-cgsync002")
else:
    print("ATTENTION: versionName introuvable")

GRADLE.write_text(g, encoding="utf-8")

s2 = JAVA.read_text(encoding="utf-8")
required = [
    "CGSYNC002_QUESTIONS_SYNC_START",
    "startCgSync002QuestionSync",
    'collection("questions")',
    "applyCgSync002QuestionToSqlite",
    "CAST(original_id AS TEXT)=?",
]
for token in required:
    if token not in s2:
        raise SystemExit(f"ERREUR: contrôle absent: {token}")

print()
print("=== CGSYNC002 PATCH OK ===")
print("Firestore questions -> SQLite Android")
print("Statut exclu : SYNCLOUD001 reste inchangé.")
