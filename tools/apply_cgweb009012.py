#!/usr/bin/env python3
from pathlib import Path
import re

INDEX = Path('web/public/index.html')
APP = Path('web/public/app.js')
CG6 = Path('web/public/cgweb006.js')
JS = Path('web/public/cgweb009012.js')
CSS = Path('web/public/cgweb009012.css')
MANIFEST = Path('web/public/cgweb012_index/manifest.json')

for p in (INDEX,APP,CG6,JS,CSS,MANIFEST):
    if not p.exists():
        raise SystemExit(f'ERREUR : fichier introuvable : {p}')

# APP.JS : imports + API CGWEB009 / CGWEB010
app = APP.read_text(encoding='utf-8')
imports = list(re.finditer(
    r'import\s*\{(?P<body>.*?)\}\s*from\s*(?P<q>["\'])(?P<src>[^"\']*firebase-firestore[^"\']*)(?P=q)\s*;',
    app, re.S
))
if not imports:
    raise SystemExit('ERREUR : import Firebase Firestore introuvable.')
imp = imports[0]
body = imp.group('body')
present = set(re.findall(r'\b[A-Za-z_$][A-Za-z0-9_$]*\b', body))
missing = [x for x in ('setDoc','deleteDoc') if x not in present]
if missing:
    nb = body.rstrip()
    if nb and not nb.endswith(','): nb += ','
    nb += '\n  ' + ', '.join(missing) + '\n'
    app = app[:imp.start('body')] + nb + app[imp.end('body'):]
    print('OK : imports Firestore ajoutés :', ', '.join(missing))

if 'CGWEB009_010_BRIDGE_START' not in app:
    app += r'''

// CGWEB009_010_BRIDGE_START
window.CGWEB009_API = {
  prefixField: async (field, prefix, maxResults = 100) => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    const allowed = new Set(["question","detail","proposition_a","proposition_b","proposition_c","proposition_d"]);
    if (!allowed.has(field)) throw new Error("Champ de recherche non autorisé.");
    const text = String(prefix || "").trim();
    if (!text) return [];
    const ref = collection(db,"users",u.uid,"questions");
    const q = query(ref,orderBy(field),startAt(text),endAt(text+"\uf8ff"),limit(Math.min(Math.max(Number(maxResults)||100,1),100)));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({id:d.id,...d.data()}));
  }
};

window.CGWEB010_API = {
  create: async payload => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    let id = String(payload?.requested_id || "").trim();
    if (!id) id = String(Date.now());
    const ref = doc(db,"users",u.uid,"questions",id);
    const existing = await getDoc(ref);
    if (existing.exists()) throw new Error("Cet ID existe déjà.");
    const clean = {...(payload||{})};
    delete clean.requested_id;
    await setDoc(ref,{...clean,original_id:id,row_number:Number.isFinite(Number(id))?Number(id):id,cg_created_at:serverTimestamp(),cg_updated_at:serverTimestamp()});
    return id;
  },
  remove: async questionId => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    const id = String(questionId||"").trim();
    if (!id) throw new Error("ID manquant.");
    await setDoc(doc(db,"users",u.uid,"question_tombstones",id),{question_id:id,deleted_at:serverTimestamp(),source:"CGWEB010"});
    await deleteDoc(doc(db,"users",u.uid,"questions",id));
    return true;
  }
};
// CGWEB009_010_BRIDGE_END
'''
    print('OK : bridges CGWEB009 + CGWEB010 ajoutés')
APP.write_text(app, encoding='utf-8')

# CGWEB006 : expose render/state, taille de page dynamique, tri local
cg6 = CG6.read_text(encoding='utf-8')
if 'CGWEB009_012_EXPOSE_START' not in cg6:
    if 'function render(rows){' not in cg6:
        raise SystemExit('ERREUR : function render(rows) introuvable dans cgweb006.js')
    cg6 = cg6.replace('function render(rows){','function render(rows){if(typeof window.CGWEB011_sortRows==="function")rows=window.CGWEB011_sortRows(rows);',1)
    cg6 = cg6.replace('pageSize:50','pageSize:(window.CGWEB011_pageSize||50)',1)
    cg6 = cg6.replace('(res.rows||[]).length<50','(res.rows||[]).length<(window.CGWEB011_pageSize||50)',1)
    cg6 += r'''

// CGWEB009_012_EXPOSE_START
window.CGWEB006_render = render;
window.CGWEB006_state = state;
window.CGWEB011_rerender = () => render(state.rows || []);
if (typeof window.CGWEB006_reload !== "function") {
  window.CGWEB006_reload = async (reset = true) => { await load(Boolean(reset)); };
}
// CGWEB009_012_EXPOSE_END
'''
    print('OK : moteur CGWEB006 exposé aux modules 009-012')
CG6.write_text(cg6, encoding='utf-8')

# INDEX : cache bust + CSS/JS
index = INDEX.read_text(encoding='utf-8')
index,n = re.subn(r'src=(["\'])(?:\./)?app\.js(?:\?v=[^"\']*)?\1','src="./app.js?v=CGWEB012_1"',index,count=1)
if not n: raise SystemExit('ERREUR : app.js introuvable dans index.html')
index,n = re.subn(r'src=(["\'])(?:\./)?cgweb006\.js(?:\?v=[^"\']*)?\1','src="./cgweb006.js?v=CGWEB012_1"',index,count=1)
if not n: raise SystemExit('ERREUR : cgweb006.js introuvable dans index.html')

if 'cgweb009012.css' not in index:
    p = index.lower().rfind('</head>')
    if p < 0: raise SystemExit('ERREUR : </head> introuvable')
    index = index[:p] + '\n<link rel="stylesheet" href="./cgweb009012.css?v=CGWEB012_1">\n' + index[p:]
if 'cgweb009012.js' not in index:
    p = index.lower().rfind('</body>')
    if p < 0: raise SystemExit('ERREUR : </body> introuvable')
    index = index[:p] + '\n<script type="module" src="./cgweb009012.js?v=CGWEB012_1"></script>\n' + index[p:]
INDEX.write_text(index, encoding='utf-8')

checks = {
    'bridge':'CGWEB009_010_BRIDGE_START' in APP.read_text(encoding='utf-8'),
    'expose':'CGWEB009_012_EXPOSE_START' in CG6.read_text(encoding='utf-8'),
    'page size':'CGWEB011_pageSize' in CG6.read_text(encoding='utf-8'),
    'app cache':'app.js?v=CGWEB012_1' in INDEX.read_text(encoding='utf-8'),
    'cg6 cache':'cgweb006.js?v=CGWEB012_1' in INDEX.read_text(encoding='utf-8'),
    'bundle js':'cgweb009012.js?v=CGWEB012_1' in INDEX.read_text(encoding='utf-8'),
    'bundle css':'cgweb009012.css?v=CGWEB012_1' in INDEX.read_text(encoding='utf-8'),
}
bad = [k for k,v in checks.items() if not v]
if bad: raise SystemExit('ERREUR contrôles : ' + ', '.join(bad))

print('==================================================')
print(' CGWEB009 + CGWEB010 + CGWEB011 + CGWEB012 OK')
print('==================================================')
print('Recherche avancée + ajout/suppression + ergonomie + plein texte prêts.')
