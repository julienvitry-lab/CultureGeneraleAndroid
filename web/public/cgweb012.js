// CGWEB009 + CGWEB010 + CGWEB011 + CGWEB012
// Recherche avancée, création/suppression, ergonomie, plein texte.

const CGX = {
  manifest: null,
  shardCache: new Map(),
  pageSize: 50,
  sort: 'id-asc'
};

const cgx$ = id => document.getElementById(id);

function cgxStatus(text, type = '') {
  const el = cgx$('cg6Status');
  if (!el) return;
  el.textContent = text;
  el.className = 'cg6-status ' + (type ? `cg6-${type}` : '');
}

function cgxEsc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cgxNormalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CGX_STOP = new Set([
  'de','du','des','la','le','les','un','une','et','ou','a','au','aux','en',
  'dans','sur','sous','par','pour','avec','sans','ce','cet','cette','ces',
  'qui','que','quoi','quel','quelle','quels','quelles','est','sont','etre',
  'son','sa','ses','leur','leurs','il','elle','ils','elles','on','se','ne',
  'pas','plus','the','of','and','to','in','is','are','an'
]);

function cgxTokens(text) {
  return [...new Set(
    cgxNormalize(text)
      .split(/\s+/)
      .filter(t => t.length >= 2 && !CGX_STOP.has(t))
  )];
}


// CGINDEX001_ROW_MATCH_START
function cgindex001RowMatches(row, tokens) {
  const text = cgxNormalize([
    row?.megatheme,
    row?.theme,
    row?.question,
    row?.detail,
    row?.proposition_a,
    row?.proposition_b,
    row?.proposition_c,
    row?.proposition_d
  ].filter(Boolean).join(" "));

  return (tokens || []).every(token => text.includes(token));
}
// CGINDEX001_ROW_MATCH_END

function cgxApplyFilters(rows) {
  const mega = cgx$('cg6Mega')?.value?.trim() || '';
  const theme = cgx$('cg6Theme')?.value?.trim() || '';
  return (rows || []).filter(row => {
    if (!row) return false;
    if (theme && String(row.theme || '') !== theme) return false;
    if (mega && String(row.megatheme || '') !== mega) return false;
    return true;
  });
}

function cgxDedup(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row && row.id != null) map.set(String(row.id), row);
  }
  return [...map.values()];
}

window.CGWEB011_pageSize = 50;
window.CGWEB011_sortRows = rows => {
  const copy = [...(rows || [])];
  const mode = CGX.sort || 'id-asc';
  const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', {
    sensitivity: 'base', numeric: true
  });

  if (mode === 'id-desc') return copy.sort((a,b) => -cmp(a.original_id ?? a.id, b.original_id ?? b.id));
  if (mode === 'question-asc') return copy.sort((a,b) => cmp(a.question, b.question));
  if (mode === 'question-desc') return copy.sort((a,b) => -cmp(a.question, b.question));
  if (mode === 'theme-asc') return copy.sort((a,b) => cmp(a.theme, b.theme));
  return copy.sort((a,b) => cmp(a.original_id ?? a.id, b.original_id ?? b.id));
};

// ---------------- CGWEB009 : recherche avancée ----------------
async function cgxPrefixField(field, text) {
  const api = window.CGWEB009_API;
  if (!api) throw new Error('Pont CGWEB009 indisponible.');
  return api.prefixField(field, text, 100);
}

async function cgxStructuredSearch(term, mode) {
  if (mode === 'id') {
    const api = window.CGWEB006_API;
    if (!api) throw new Error('Pont CGWEB006 indisponible.');
    const row = await api.byId(term);
    return row ? [row] : [];
  }

  if (mode === 'question') return cgxPrefixField('question', term);
  if (mode === 'detail') return cgxPrefixField('detail', term);

  if (mode === 'propositions') {
    const groups = await Promise.all(
      ['proposition_a','proposition_b','proposition_c','proposition_d']
        .map(field => cgxPrefixField(field, term))
    );
    return cgxDedup(groups.flat()).slice(0, 100);
  }

  if (mode === 'allprefix') {
    const groups = await Promise.all(
      ['question','detail','proposition_a','proposition_b','proposition_c','proposition_d']
        .map(field => cgxPrefixField(field, term))
    );
    return cgxDedup(groups.flat()).slice(0, 100);
  }

  return [];
}

async function cgxSearch() {
  const input = cgx$('cg6Search');
  const modeEl = cgx$('cg6SearchMode');
  if (!input || !modeEl) return;

  const term = input.value.trim();
  const mode = modeEl.value;

  if (!term) {
    if (typeof window.CGWEB006_reload === 'function') await window.CGWEB006_reload(true);
    return;
  }

  cgxStatus('Recherche…');

  try {
    if (mode === 'fulltext') {
      await cgxFulltextSearch(term);
      return;
    }

    let rows = await cgxStructuredSearch(term, mode);
    rows = cgxApplyFilters(rows);

    if (window.CGWEB006_state) window.CGWEB006_state.mode = mode;
    if (typeof window.CGWEB006_render !== 'function') throw new Error('Affichage CGWEB006 indisponible.');

    window.CGWEB006_render(rows);
    if (cgx$('cg6Page')) cgx$('cg6Page').textContent = 'Recherche avancée';
    if (cgx$('cg6Prev')) cgx$('cg6Prev').disabled = true;
    if (cgx$('cg6Next')) cgx$('cg6Next').disabled = true;
    cgxStatus(`${rows.length} résultat(s)`, rows.length ? 'ok' : '');
  } catch (error) {
    cgxStatus(error?.message || String(error), 'error');
  }
}

function cgxInstallSearchModes() {
  const mode = cgx$('cg6SearchMode');
  const input = cgx$('cg6Search');
  const button = cgx$('cg6SearchBtn');
  if (!mode || !input || !button) throw new Error('Zone de recherche CGWEB006 introuvable.');

  mode.innerHTML = `
    <option value="id">ID exact</option>
    <option value="question">Question commence par</option>
    <option value="detail">Détail commence par</option>
    <option value="propositions">Propositions commencent par</option>
    <option value="allprefix">Tous les champs commencent par</option>
    <option value="fulltext">Plein texte — contient les mots</option>
  `;

  button.onclick = cgxSearch;
  input.onkeydown = e => { if (e.key === 'Enter') cgxSearch(); };
}

// ---------------- CGWEB010 : ajout/suppression ----------------
function cgxEnsureCreateDialog() {
  if (cgx$('cg10Modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cg10Modal';
  modal.className = 'cg6-modal cg6-hidden';
  modal.innerHTML = `
    <div class="cg6-modal-card">
      <div class="cg6-modal-head">
        <div><div class="cg6-kicker">CGWEB010</div><h3>Nouvelle question</h3></div>
        <button id="cg10Close" class="cg6-close">×</button>
      </div>
      <div class="cg6-editor">
        <label>ID <input id="cg10Id" placeholder="vide = ID automatique"></label>
        <label>Mégathème <input id="cg10Mega"></label>
        <label class="cg6-wide">Thème <input id="cg10Theme"></label>
        <label class="cg6-wide">Question <textarea id="cg10Question"></textarea></label>
        <label class="cg6-wide">Détail <textarea id="cg10Detail"></textarea></label>
        <label>Proposition A <input id="cg10A"></label>
        <label>Proposition B <input id="cg10B"></label>
        <label>Proposition C <input id="cg10C"></label>
        <label>Proposition D <input id="cg10D"></label>
        <label>Correct index <input id="cg10Correct" inputmode="numeric"></label>
        <label>Statut <input id="cg10Status"></label>
      </div>
      <div class="cg10-hint">ID automatique : horodatage milliseconde unique, sans parcourir les 217 576 documents.</div>
      <div class="cg6-actions">
        <span id="cg10SaveState" class="cg6-save-state"></span>
        <button id="cg10Cancel" class="cg6-btn">Annuler</button>
        <button id="cg10Save" class="cg6-btn cg6-primary">Créer</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  cgx$('cg10Close').onclick = () => modal.classList.add('cg6-hidden');
  cgx$('cg10Cancel').onclick = () => modal.classList.add('cg6-hidden');
  modal.onclick = e => { if (e.target === modal) modal.classList.add('cg6-hidden'); };
  cgx$('cg10Save').onclick = cgxCreateQuestion;
}

function cgxOpenCreate() {
  cgxEnsureCreateDialog();
  cgx$('cg10Id').value = '';
  cgx$('cg10Mega').value = cgx$('cg6Mega')?.value || '';
  cgx$('cg10Theme').value = cgx$('cg6Theme')?.value || '';
  for (const id of ['cg10Question','cg10Detail','cg10A','cg10B','cg10C','cg10D','cg10Correct','cg10Status']) {
    cgx$(id).value = '';
  }
  cgx$('cg10SaveState').textContent = '';
  cgx$('cg10Modal').classList.remove('cg6-hidden');
}

async function cgxCreateQuestion() {
  const api = window.CGWEB010_API;
  if (!api) return;

  const raw = cgx$('cg10Correct').value.trim();
  const num = raw === '' ? null : Number(raw);
  const payload = {
    requested_id: cgx$('cg10Id').value.trim(),
    megatheme: cgx$('cg10Mega').value.trim(),
    theme: cgx$('cg10Theme').value.trim(),
    question: cgx$('cg10Question').value.trim(),
    detail: cgx$('cg10Detail').value,
    proposition_a: cgx$('cg10A').value,
    proposition_b: cgx$('cg10B').value,
    proposition_c: cgx$('cg10C').value,
    proposition_d: cgx$('cg10D').value,
    correct_index: Number.isFinite(num) ? num : raw,
    status: cgx$('cg10Status').value.trim()
  };

  if (!payload.question) {
    cgx$('cg10SaveState').textContent = '❌ La question est obligatoire.';
    return;
  }

  cgx$('cg10Save').disabled = true;
  cgx$('cg10SaveState').textContent = 'Création…';
  try {
    const id = await api.create(payload);
    cgx$('cg10SaveState').textContent = `✅ Question ${id} créée.`;
    setTimeout(async () => {
      cgx$('cg10Modal').classList.add('cg6-hidden');
      if (typeof window.CGWEB006_reload === 'function') await window.CGWEB006_reload(true);
    }, 450);
  } catch (error) {
    cgx$('cg10SaveState').textContent = '❌ ' + (error?.message || String(error));
  } finally {
    cgx$('cg10Save').disabled = false;
  }
}

async function cgxDeleteCurrent() {
  const id = cgx$('cg6EditId')?.value;
  if (!id) return;
  const original = cgx$('cg6EditOriginal')?.textContent || id;

  if (!confirm(`Supprimer la question ${original} du Cloud ?\n\nUn tombstone sera conservé pour propager ensuite la suppression vers Android.`)) return;

  try {
    const api = window.CGWEB010_API;
    if (!api) throw new Error('Pont CGWEB010 indisponible.');
    await api.remove(id);
    alert(`Question ${original} supprimée du Cloud. Tombstone enregistré.`);
    cgx$('cg6Modal')?.classList.add('cg6-hidden');
    if (typeof window.CGWEB006_reload === 'function') await window.CGWEB006_reload(true);
  } catch (error) {
    alert(error?.message || String(error));
  }
}

function cgxInstallCreateDelete() {
  const panel = cgx$('cgweb006Panel');
  if (!panel) throw new Error('Panneau CGWEB006 introuvable.');

  if (!cgx$('cg10New')) {
    const button = document.createElement('button');
    button.id = 'cg10New';
    button.className = 'cg6-btn cg6-primary cg10-new';
    button.textContent = '+ Nouvelle question';
    panel.querySelector('.cg6-title')?.insertAdjacentElement('afterend', button);
    button.onclick = cgxOpenCreate;
  }

  const actions = cgx$('cg6Save')?.parentElement;
  if (actions && !cgx$('cg10Delete')) {
    const del = document.createElement('button');
    del.id = 'cg10Delete';
    del.className = 'cg6-btn cg10-delete';
    del.textContent = 'Supprimer';
    del.onclick = cgxDeleteCurrent;
    actions.insertBefore(del, cgx$('cg6Cancel'));
  }

  cgxEnsureCreateDialog();
}

// ---------------- CGWEB011 : ergonomie ----------------
function cgxInstallErgonomics() {
  const panel = cgx$('cgweb006Panel');
  if (!panel || cgx$('cg11Controls')) return;

  const controls = document.createElement('div');
  controls.id = 'cg11Controls';
  controls.className = 'cg11-controls';
  controls.innerHTML = `
    <label>Par page
      <select id="cg11PageSize"><option>20</option><option selected>50</option><option>100</option></select>
    </label>
    <label>Tri de la page
      <select id="cg11Sort">
        <option value="id-asc">ID croissant</option><option value="id-desc">ID décroissant</option>
        <option value="question-asc">Question A → Z</option><option value="question-desc">Question Z → A</option>
        <option value="theme-asc">Thème A → Z</option>
      </select>
    </label>
    <label>Affichage
      <select id="cg11View"><option value="full">Complet</option><option value="compact">Compact</option></select>
    </label>`;

  panel.querySelector('.cg6-summary')?.insertAdjacentElement('beforebegin', controls);

  cgx$('cg11PageSize').onchange = async e => {
    CGX.pageSize = Number(e.target.value) || 50;
    window.CGWEB011_pageSize = CGX.pageSize;
    if (typeof window.CGWEB006_reload === 'function') await window.CGWEB006_reload(true);
  };

  cgx$('cg11Sort').onchange = e => {
    CGX.sort = e.target.value;
    if (typeof window.CGWEB011_rerender === 'function') window.CGWEB011_rerender();
  };

  cgx$('cg11View').onchange = e => {
    document.body.classList.toggle('cg11-compact', e.target.value === 'compact');
  };
}

// ---------------- CGWEB012 : plein texte ----------------
async function cgxManifest() {
  if (CGX.manifest) return CGX.manifest;
  const r = await fetch('./cgweb012_index/manifest.json?v=CGWEB012_1', {cache:'no-store'});
  if (!r.ok) throw new Error('Manifest plein texte indisponible.');
  CGX.manifest = await r.json();
  return CGX.manifest;
}

function cgxShard(token) {
  return token.length >= 2 ? token.slice(0,2) : '__';
}

async function cgxLoadShard(prefix) {
  if (CGX.shardCache.has(prefix)) return CGX.shardCache.get(prefix);
  const manifest = await cgxManifest();
  if (!manifest.shards?.includes(prefix)) {
    CGX.shardCache.set(prefix, {});
    return {};
  }
  const r = await fetch(`./cgweb012_index/${prefix}.json?v=CGWEB012_1`, {cache:'force-cache'});
  if (!r.ok) throw new Error(`Index ${prefix} indisponible.`);
  const data = await r.json();
  CGX.shardCache.set(prefix, data);
  return data;
}

function cgxPosting(shard, token) {
  if (Array.isArray(shard[token])) return shard[token];
  if (token.length >= 3) {
    const ids = new Set();
    for (const [word, posting] of Object.entries(shard)) {
      if (!word.startsWith(token)) continue;
      for (const id of posting) {
        ids.add(String(id));
        if (ids.size >= 5000) break;
      }
      if (ids.size >= 5000) break;
    }
    return [...ids];
  }
  return [];
}

function cgxIntersect(lists) {
  if (!lists.length) return [];
  lists.sort((a,b) => a.length-b.length);
  let result = new Set(lists[0].map(String));
  for (let i=1; i<lists.length; i++) {
    const next = new Set(lists[i].map(String));
    result = new Set([...result].filter(id => next.has(id)));
    if (!result.size) break;
  }
  return [...result];
}

async function cgxFulltextSearch(term) {
  cgxStatus('Recherche plein texte…');
  const tokens = cgxTokens(term);
  if (!tokens.length) throw new Error('Saisis au moins un mot significatif de 2 caractères.');

  const postings = [];
  for (const token of tokens) {
    const shard = await cgxLoadShard(cgxShard(token));
    postings.push(cgxPosting(shard, token));
  }

  let ids = cgxIntersect(postings);

    // CGINDEX001_DELTA_SEARCH_START
    try {
      if (window.CGINDEX001_API?.searchDelta) {
        const liveIds = await window.CGINDEX001_API.searchDelta(tokens);
        ids = [...new Set([
          ...ids.map(String),
          ...liveIds.map(String)
        ])];
      }
    } catch (deltaError) {
      console.warn("CGINDEX001 searchDelta", deltaError);
    }
    // CGINDEX001_DELTA_SEARCH_END
  if (!ids.length) {
    window.CGWEB006_render?.([]);
    cgxStatus('0 résultat');
    return;
  }

  const api = window.CGWEB006_API;
  if (!api) throw new Error('Pont CGWEB006 indisponible.');
  const rows = (await Promise.all(ids.slice(0,100).map(id => api.byId(String(id))))).filter(Boolean);
  let filtered = cgxApplyFilters(rows);

    // CGINDEX001_CURRENT_CONTENT_FILTER
    filtered = filtered.filter(row =>
      cgindex001RowMatches(row, tokens));

  if (window.CGWEB006_state) window.CGWEB006_state.mode = 'fulltext';
  window.CGWEB006_render?.(filtered);

  if (cgx$('cg6Page')) cgx$('cg6Page').textContent = `${ids.length} correspondance(s) index · ${filtered.length} affichée(s)`;
  if (cgx$('cg6Prev')) cgx$('cg6Prev').disabled = true;
  if (cgx$('cg6Next')) cgx$('cg6Next').disabled = true;
  cgxStatus(`${ids.length} correspondance(s) plein texte · ${filtered.length} chargée(s)`, filtered.length ? 'ok' : '');
}

async function cgxInstallIndexInfo() {
  try {
    const manifest = await cgxManifest();
    const note = document.querySelector('#cgweb006Panel .cg6-note');
    if (note && !cgx$('cg12Info')) {
      const div = document.createElement('div');
      div.id = 'cg12Info';
      div.className = 'cg12-info';
      div.textContent = `Index plein texte : ${manifest.question_count || 0} questions · ${manifest.token_count || 0} mots indexés.`;
      note.appendChild(div);
    }
  } catch (e) {
    console.warn('CGWEB012', e);
  }
}

// ---------------- Init ----------------
function cgxInit() {
  cgxInstallSearchModes();
  cgxInstallCreateDelete();
  cgxInstallErgonomics();
  cgxInstallIndexInfo();
}

try {
  cgxInit();
} catch (error) {
  console.error('CGWEB009-012', error);
  cgxStatus(error?.message || String(error), 'error');
}
