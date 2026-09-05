import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, collection, doc, writeBatch, getCountFromServer, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const cfg = await fetch('/__/firebase/init.json', { cache: 'no-store' }).then(r => {
  if (!r.ok) throw new Error(`Configuration Firebase indisponible (${r.status})`);
  return r.json();
});
// Réutiliser l'application Firebase principale de CGWEB001 afin de partager
// exactement la même session Authentication et le même Firestore.
const cgApp = getApps().length ? getApp() : initializeApp(cfg);
const auth = getAuth(cgApp);
const db = getFirestore(cgApp);

let currentUser = null;
let loadedPayload = null;

const panel = document.createElement('section');
panel.id = 'cgcloud002-panel';
panel.innerHTML = `
  <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#65d6ff">CGCLOUD002</div>
  <div style="font-size:20px;font-weight:800;margin-top:4px">100 questions test</div>
  <div id="cg2-auth" style="opacity:.8;margin-top:4px">Connexion Firebase en attente…</div>
  <div id="cg2-count" style="margin-top:10px;font-weight:700">Questions Cloud : —</div>
  <label style="display:block;margin-top:12px;font-weight:700">1. Choisir le fichier JSON généré dans Downloads</label>
  <input id="cg2-file" type="file" accept="application/json,.json" style="width:100%;margin-top:6px" />
  <div id="cg2-file-info" style="font-size:13px;opacity:.8;margin-top:5px">Aucun fichier sélectionné</div>
  <button id="cg2-import" disabled style="width:100%;margin-top:12px;padding:11px 14px;border:0;border-radius:10px;font-weight:800;cursor:pointer;background:#5ad7ff;color:#06131f">2. Importer les 100 questions dans Firestore</button>
  <button id="cg2-refresh" style="width:100%;margin-top:8px;padding:9px 14px;border:1px solid rgba(255,255,255,.25);border-radius:10px;font-weight:700;cursor:pointer;background:transparent;color:white">Vérifier le compteur Cloud</button>
  <div id="cg2-status" style="margin-top:10px;min-height:20px;font-size:13px"></div>
`;
Object.assign(panel.style, {
  position: 'fixed', right: '14px', bottom: '14px', zIndex: '99999',
  width: 'min(390px, calc(100vw - 28px))', boxSizing: 'border-box',
  padding: '16px', borderRadius: '16px', color: 'white',
  background: 'linear-gradient(145deg, rgba(11,39,69,.97), rgba(14,77,112,.97))',
  border: '1px solid rgba(108,214,255,.45)', boxShadow: '0 18px 60px rgba(0,0,0,.45)',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif'
});
document.body.appendChild(panel);

const $ = id => document.getElementById(id);
const status = (msg, ok = true) => {
  $('cg2-status').textContent = msg;
  $('cg2-status').style.color = ok ? '#8ff0b5' : '#ffb0b0';
};

async function refreshCount() {
  if (!currentUser) {
    $('cg2-count').textContent = 'Questions Cloud : non connecté';
    return;
  }
  try {
    const ref = collection(db, 'users', currentUser.uid, 'questions');
    const snap = await getCountFromServer(ref);
    $('cg2-count').textContent = `Questions Cloud : ${snap.data().count}`;
  } catch (e) {
    $('cg2-count').textContent = 'Questions Cloud : erreur';
    status(`Lecture Firestore impossible : ${e.message}`, false);
  }
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  $('cg2-auth').textContent = user ? `Firebase connecté : ${user.email || user.uid}` : 'Connecte-toi d’abord avec CGWEB001.';
  $('cg2-import').disabled = !(user && loadedPayload);
  refreshCount();
});

$('cg2-file').addEventListener('change', async event => {
  loadedPayload = null;
  $('cg2-import').disabled = true;
  const file = event.target.files?.[0];
  if (!file) {
    $('cg2-file-info').textContent = 'Aucun fichier sélectionné';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.schema !== 'CGCLOUD002.questions.v1' || !Array.isArray(payload.questions)) {
      throw new Error('Ce fichier n’est pas un export CGCLOUD002 valide.');
    }
    if (payload.questions.length !== 100) {
      throw new Error(`Le fichier contient ${payload.questions.length} questions au lieu de 100.`);
    }
    loadedPayload = payload;
    const domains = [...new Set(payload.questions.map(q => q.megatheme).filter(Boolean))];
    $('cg2-file-info').textContent = `100 questions prêtes · ${domains.length} mégathème(s)`;
    $('cg2-import').disabled = !currentUser;
    status('Fichier prêt. Aucun document n’a encore été écrit.');
  } catch (e) {
    $('cg2-file-info').textContent = 'Fichier invalide';
    status(e.message, false);
  }
});

$('cg2-import').addEventListener('click', async () => {
  if (!currentUser || !loadedPayload) return;
  if (!confirm('Importer ces 100 questions test dans Firestore ?\n\nLe chemin sera users/<uid>/questions/<original_id>.')) return;

  const button = $('cg2-import');
  button.disabled = true;
  button.textContent = 'Import en cours…';
  status('Écriture des 100 documents…');

  try {
    const batch = writeBatch(db);
    for (const q of loadedPayload.questions) {
      const id = String(q.document_id || q.original_id || `row_${q.row_number}`).replaceAll('/', '_');
      const ref = doc(db, 'users', currentUser.uid, 'questions', id);
      const data = { ...q };
      delete data.document_id;
      data.cloud_schema = 1;
      data.test_import = true;
      data.updated_at = serverTimestamp();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    status('✅ 100 questions test importées dans Firestore.');
    await refreshCount();
  } catch (e) {
    console.error(e);
    status(`❌ Import impossible : ${e.message}`, false);
  } finally {
    button.disabled = !(currentUser && loadedPayload);
    button.textContent = '2. Importer les 100 questions dans Firestore';
  }
});

$('cg2-refresh').addEventListener('click', refreshCount);
