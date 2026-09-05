// CGCLOUD002_SHARED_CONTEXT_FIX
// Aucune seconde instance Firebase ici : toutes les opérations Cloud passent
// par l'instance CGWEB001 exposée dans window.CGWEB001.

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
  position: 'static',
  width: 'calc(100% - 32px)',
  maxWidth: '1180px',
  boxSizing: 'border-box',
  margin: '24px auto 56px auto',
  padding: '18px',
  borderRadius: '18px',
  color: 'white',
  background: 'linear-gradient(145deg, rgba(11,39,69,.97), rgba(14,77,112,.97))',
  border: '1px solid rgba(108,214,255,.45)',
  boxShadow: '0 12px 36px rgba(0,0,0,.28)',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  display: 'block'
});

const mainContent = document.querySelector('main');
if (mainContent) mainContent.insertAdjacentElement('afterend', panel);
else document.body.appendChild(panel);

const $ = id => document.getElementById(id);
const status = (msg, ok = true) => {
  $('cg2-status').textContent = msg;
  $('cg2-status').style.color = ok ? '#8ff0b5' : '#ffb0b0';
};

function bridge() {
  return window.CGWEB001 || null;
}

function syncAuthUi() {
  const api = bridge();
  currentUser = api?.getUser?.() || null;

  if (!api) {
    $('cg2-auth').textContent = 'CGWEB001 est encore en cours de chargement…';
    $('cg2-count').textContent = 'Questions Cloud : —';
    $('cg2-import').disabled = true;
    return;
  }

  if (!currentUser) {
    $('cg2-auth').textContent = 'Connecte-toi d’abord avec CGWEB001 ci-dessus.';
    $('cg2-count').textContent = 'Questions Cloud : non connecté';
    $('cg2-import').disabled = true;
    return;
  }

  $('cg2-auth').textContent = `Firebase connecté : ${currentUser.email || currentUser.uid}`;
  $('cg2-import').disabled = !loadedPayload;
}

async function refreshCount() {
  syncAuthUi();
  if (!currentUser) return;
  try {
    const count = await bridge().countQuestions();
    $('cg2-count').textContent = `Questions Cloud : ${count}`;
  } catch (e) {
    $('cg2-count').textContent = 'Questions Cloud : erreur';
    status(`Lecture Firestore impossible : ${e.message}`, false);
  }
}

// La connexion de CGWEB001 peut être restaurée après le chargement du module.
// On observe donc directement SON auth, sans créer une deuxième instance Firebase.
const authTimer = setInterval(() => {
  const before = currentUser?.uid || null;
  syncAuthUi();
  const after = currentUser?.uid || null;
  if (after && after !== before) refreshCount();
}, 300);
window.addEventListener('beforeunload', () => clearInterval(authTimer));

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
    syncAuthUi();
    status('Fichier prêt. Aucun document n’a encore été écrit.');
  } catch (e) {
    $('cg2-file-info').textContent = 'Fichier invalide';
    status(e.message, false);
  }
});

$('cg2-import').addEventListener('click', async () => {
  syncAuthUi();
  if (!currentUser) {
    status('Connexion Firebase absente dans CGWEB001.', false);
    return;
  }
  if (!loadedPayload) {
    status('Sélectionne d’abord le fichier JSON des 100 questions.', false);
    return;
  }
  if (!confirm('Importer ces 100 questions test dans Firestore ?\n\nLe chemin sera users/<uid>/questions/<original_id>.')) return;

  const button = $('cg2-import');
  button.disabled = true;
  button.textContent = 'Import en cours…';
  status('Écriture des 100 documents…');

  try {
    await bridge().importQuestions(loadedPayload.questions);
    status('✅ 100 questions test importées dans Firestore.');
    await refreshCount();
  } catch (e) {
    console.error(e);
    status(`❌ Import impossible : ${e.message}`, false);
  } finally {
    syncAuthUi();
    button.textContent = '2. Importer les 100 questions dans Firestore';
  }
});

$('cg2-refresh').addEventListener('click', refreshCount);

syncAuthUi();
