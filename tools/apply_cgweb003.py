from pathlib import Path
import re

app_path = Path('web/public/app.js')
index_path = Path('web/public/index.html')
if not app_path.exists():
    raise SystemExit('ERREUR: web/public/app.js introuvable')
if not index_path.exists():
    raise SystemExit('ERREUR: web/public/index.html introuvable')

s = app_path.read_text(encoding='utf-8')

# Étendre l'import Firestore existant avec les fonctions de pagination / détail.
pat = re.compile(
    r'import\s*\{(?P<names>[^}]*)\}\s*from\s*["\'](?P<url>https://www\.gstatic\.com/firebasejs/[^"\']+/firebase-firestore\.js)["\'];?',
    re.S,
)
m = pat.search(s)
if not m:
    raise SystemExit('ERREUR: import firebase-firestore.js introuvable dans app.js')

names = [x.strip() for x in m.group('names').replace('\n',' ').split(',') if x.strip()]
for need in [
    'doc','writeBatch','getCountFromServer','serverTimestamp',
    'query','orderBy','documentId','limit','startAfter','getDocs','getDoc'
]:
    if need not in names:
        names.append(need)
new_import = 'import {\n  ' + ', '.join(names) + f'\n}} from "{m.group("url")}";'
s = s[:m.start()] + new_import + s[m.end():]

start = '// CGCLOUD002_SHARED_CONTEXT_BRIDGE_START'
end = '// CGCLOUD002_SHARED_CONTEXT_BRIDGE_END'
bridge = r'''
// CGCLOUD002_SHARED_CONTEXT_BRIDGE_START
// Contexte Firebase unique partagé par CGWEB001 / CGCLOUD002 / CGWEB003.
window.CGWEB001 = {
  getUser: () => auth.currentUser,

  countQuestions: async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const ref = collection(db, "users", user.uid, "questions");
    const snap = await getCountFromServer(ref);
    return snap.data().count;
  },

  importQuestions: async (questions) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    if (!Array.isArray(questions) || questions.length !== 100) {
      throw new Error("L'import CGCLOUD002 doit contenir exactement 100 questions.");
    }

    const batch = writeBatch(db);
    for (const q of questions) {
      const id = String(q.document_id || q.original_id || `row_${q.row_number}`).replaceAll("/", "_");
      const ref = doc(db, "users", user.uid, "questions", id);
      const data = { ...q };
      delete data.document_id;
      data.cloud_schema = 1;
      data.test_import = true;
      data.updated_at = serverTimestamp();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  },

  listQuestionsPage: async ({ afterId = null, pageSize = 20 } = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const size = Math.max(1, Math.min(Number(pageSize) || 20, 100));
    const ref = collection(db, "users", user.uid, "questions");
    const q = afterId
      ? query(ref, orderBy(documentId()), startAfter(String(afterId)), limit(size))
      : query(ref, orderBy(documentId()), limit(size));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      items,
      lastId: snap.docs.length ? snap.docs[snap.docs.length - 1].id : null,
      size: snap.size,
    };
  },

  getQuestion: async (questionId) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const snap = await getDoc(doc(db, "users", user.uid, "questions", String(questionId)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
};
// CGCLOUD002_SHARED_CONTEXT_BRIDGE_END
'''.strip()

if start in s and end in s:
    s = re.sub(re.escape(start) + r'.*?' + re.escape(end), bridge, s, flags=re.S)
else:
    needle = re.compile(r'(const\s+db\s*=\s*getFirestore\(app\)\s*;?)')
    if not needle.search(s):
        raise SystemExit('ERREUR: const db = getFirestore(app) introuvable dans app.js')
    s = needle.sub(r'\1\n\n' + bridge, s, count=1)

app_path.write_text(s, encoding='utf-8')

idx = index_path.read_text(encoding='utf-8')
# Retirer une éventuelle ancienne version CGWEB003.
idx = re.sub(
    r'\s*<script\s+type=["\']module["\']\s+src=["\']\./cgweb003\.js(?:\?[^"\']*)?["\']></script>',
    '', idx
)
# Insérer après CGCLOUD002 pour garder une progression lisible.
tag = '  <script type="module" src="./cgweb003.js?v=CGWEB003_1"></script>\n'
cloud_pat = re.compile(r'(<script\s+type=["\']module["\']\s+src=["\']\./cloud002\.js(?:\?[^"\']*)?["\']></script>)')
m2 = cloud_pat.search(idx)
if m2:
    idx = idx[:m2.end()] + '\n' + tag.rstrip('\n') + idx[m2.end():]
else:
    idx = idx.replace('</body>', tag + '</body>')
index_path.write_text(idx, encoding='utf-8')

print('OK: bridge Firebase enrichi pour CGWEB003')
print('OK: index.html -> cgweb003.js?v=CGWEB003_1')
