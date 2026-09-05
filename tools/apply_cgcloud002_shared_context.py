from pathlib import Path
import re, sys

app_path = Path('web/public/app.js')
index_path = Path('web/public/index.html')
if not app_path.exists():
    raise SystemExit('ERREUR: web/public/app.js introuvable')
if not index_path.exists():
    raise SystemExit('ERREUR: web/public/index.html introuvable')

s = app_path.read_text(encoding='utf-8')

# Étendre l'import Firestore existant avec les fonctions nécessaires au bridge.
pat = re.compile(
    r'import\s*\{(?P<names>[^}]*)\}\s*from\s*["\'](?P<url>https://www\.gstatic\.com/firebasejs/[^"\']+/firebase-firestore\.js)["\'];?',
    re.S
)
m = pat.search(s)
if not m:
    raise SystemExit('ERREUR: import firebase-firestore.js introuvable dans app.js')

names = [x.strip() for x in m.group('names').replace('\n',' ').split(',') if x.strip()]
for need in ['doc', 'writeBatch', 'getCountFromServer', 'serverTimestamp']:
    if need not in names:
        names.append(need)
new_import = 'import {\n  ' + ', '.join(names) + f'\n}} from "{m.group("url")}";'
s = s[:m.start()] + new_import + s[m.end():]

marker_start = '// CGCLOUD002_SHARED_CONTEXT_BRIDGE_START'
marker_end = '// CGCLOUD002_SHARED_CONTEXT_BRIDGE_END'
bridge = r'''
// CGCLOUD002_SHARED_CONTEXT_BRIDGE_START
// CGCLOUD002 utilise volontairement l'instance Firebase déjà authentifiée
// de CGWEB001. Une seule instance Auth/Firestore pour toute la page.
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
      const id = String(
        q.document_id || q.original_id || `row_${q.row_number}`
      ).replaceAll("/", "_");
      const ref = doc(db, "users", user.uid, "questions", id);
      const data = { ...q };
      delete data.document_id;
      data.cloud_schema = 1;
      data.test_import = true;
      data.updated_at = serverTimestamp();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }
};
// CGCLOUD002_SHARED_CONTEXT_BRIDGE_END
'''.strip()

# Remplacer un ancien bridge ou l'insérer juste après getFirestore(app).
if marker_start in s and marker_end in s:
    s = re.sub(
        re.escape(marker_start) + r'.*?' + re.escape(marker_end),
        bridge,
        s,
        flags=re.S,
    )
else:
    needle = re.compile(r'(const\s+db\s*=\s*getFirestore\(app\)\s*;?)')
    if not needle.search(s):
        raise SystemExit('ERREUR: const db = getFirestore(app) introuvable dans app.js')
    s = needle.sub(r'\1\n\n' + bridge, s, count=1)

app_path.write_text(s, encoding='utf-8')

# Forcer Chrome à charger le nouveau module CGCLOUD002.
idx = index_path.read_text(encoding='utf-8')
idx, n = re.subn(
    r'<script\s+type=["\']module["\']\s+src=["\']\./cloud002\.js(?:\?[^"\']*)?["\']></script>',
    '<script type="module" src="./cloud002.js?v=SHARED2"></script>',
    idx,
)
if n == 0:
    idx = idx.replace('</body>', '  <script type="module" src="./cloud002.js?v=SHARED2"></script>\n</body>')
index_path.write_text(idx, encoding='utf-8')

print('OK: app.js partage désormais SON auth + SON Firestore avec CGCLOUD002')
print('OK: index.html -> cloud002.js?v=SHARED2')
