// CGWEB004 + CGWEB005
// Répertoire Firestore filtrable/triable + édition interactive d'une question.
// Utilise exclusivement window.CGWEB001 : une seule instance Auth/Firestore.

const CG45_PAGE_SIZE = 20;
const CG45_DOMAINS = [
  'Animaux et Plantes', 'Culture Classique', 'Culture Générale', 'Culture Moderne',
  'Géographie', 'Histoire', 'Sciences et Techniques', 'Sport'
];

let cg45User = null;
let cg45Total = 0;
let cg45PageIndex = 0;
let cg45Cursors = [null];
let cg45CurrentItems = [];
let cg45Loading = false;
let cg45CurrentQuestion = null;
let cg45Editing = false;
let cg45ActiveCriteria = {
  exactId: '',
  questionPrefix: '',
  megatheme: '',
  theme: '',
  status: '',
  sortField: 'id',
  sortDirection: 'asc'
};

const cg45Panel = document.createElement('section');
cg45Panel.id = 'cgweb004005-panel';
cg45Panel.className = 'cg45-panel';
cg45Panel.innerHTML = `
  <div class="cg45-version-row">
    <span class="cg45-kicker">CGWEB004</span>
    <span class="cg45-kicker cg45-kicker-edit">CGWEB005</span>
  </div>
  <div class="cg45-title-row">
    <div>
      <h2>Répertoire, filtres et édition</h2>
      <p class="cg45-subtitle">Firestore · 20 questions par page · filtres serveur · fiche modifiable</p>
    </div>
    <div id="cg45-cloud-state" class="cg45-pill">Connexion…</div>
  </div>

  <div class="cg45-filter-box">
    <div class="cg45-filter-grid">
      <label>
        <span>ID exact</span>
        <input id="cg45-id" type="text" inputmode="numeric" placeholder="ex. 104159">
      </label>
      <label>
        <span>Début de la question</span>
        <input id="cg45-question-prefix" type="text" placeholder="ex. Quel est">
      </label>
      <label>
        <span>Mégathème</span>
        <select id="cg45-megatheme">
          <option value="">Tous</option>
          ${CG45_DOMAINS.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </label>
      <label>
        <span>Thème exact</span>
        <input id="cg45-theme" type="text" placeholder="Tous les thèmes">
      </label>
      <label>
        <span>Statut</span>
        <select id="cg45-status-filter">
          <option value="">Tous</option>
          <option value="__EMPTY__">Sans statut</option>
          <option value="A">A</option>
          <option value="R">R</option>
          <option value="P">P</option>
          <option value="T">T</option>
        </select>
      </label>
      <label>
        <span>Tri</span>
        <select id="cg45-sort-field">
          <option value="id">ID</option>
          <option value="question">Question</option>
          <option value="megatheme">Mégathème</option>
          <option value="theme">Thème</option>
          <option value="status">Statut</option>
        </select>
      </label>
      <label>
        <span>Sens</span>
        <select id="cg45-sort-direction">
          <option value="asc">Croissant</option>
          <option value="desc">Décroissant</option>
        </select>
      </label>
    </div>
    <div class="cg45-filter-actions">
      <button id="cg45-apply" class="cg45-btn cg45-btn-primary" type="button">Appliquer les filtres</button>
      <button id="cg45-reset" class="cg45-btn cg45-btn-secondary" type="button">Réinitialiser</button>
    </div>
    <div class="cg45-help">Recherche texte = début de question, volontairement. La recherche plein texte sera une étape dédiée.</div>
  </div>

  <div class="cg45-toolbar">
    <div>
      <strong id="cg45-count">Questions : —</strong>
      <div id="cg45-page-label" class="cg45-muted">Page —</div>
    </div>
    <button id="cg45-reload" class="cg45-btn cg45-btn-secondary" type="button">Actualiser</button>
  </div>

  <div id="cg45-status" class="cg45-status"></div>

  <div class="cg45-table-wrap">
    <table class="cg45-table" aria-label="Répertoire des questions">
      <thead>
        <tr>
          <th>ID</th>
          <th>Mégathème</th>
          <th>Thème</th>
          <th>Question</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody id="cg45-body"></tbody>
    </table>
  </div>

  <div id="cg45-mobile-list" class="cg45-mobile-list"></div>

  <div class="cg45-pager">
    <button id="cg45-prev" class="cg45-btn cg45-btn-secondary" type="button">← Précédent</button>
    <div id="cg45-page-center" class="cg45-page-center">—</div>
    <button id="cg45-next" class="cg45-btn cg45-btn-primary" type="button">Suivant →</button>
  </div>
`;

const cg45Style = document.createElement('style');
cg45Style.textContent = `
  .cg45-panel{width:calc(100% - 32px);max-width:1180px;box-sizing:border-box;margin:24px auto 72px;padding:22px;border-radius:22px;color:#fff;background:linear-gradient(145deg,rgba(8,35,66,.99),rgba(12,63,96,.99));border:1px solid rgba(105,214,255,.42);box-shadow:0 16px 42px rgba(0,0,0,.28);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
  .cg45-version-row{display:flex;gap:9px;align-items:center}.cg45-kicker{font-size:12px;font-weight:900;letter-spacing:.14em;color:#65d6ff}.cg45-kicker-edit{color:#8ff0b5}
  .cg45-title-row{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-top:5px}.cg45-title-row h2{margin:0;font-size:26px;line-height:1.15}.cg45-subtitle{margin:7px 0 0;color:rgba(255,255,255,.72)}
  .cg45-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;color:#ffd878}.cg45-pill.ok{color:#8ff0b5;border-color:rgba(79,222,143,.55)}
  .cg45-filter-box{margin:20px 0 12px;padding:15px;border-radius:16px;background:rgba(0,0,0,.17);border:1px solid rgba(255,255,255,.10)}
  .cg45-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.cg45-filter-grid label{display:block}.cg45-filter-grid label span{display:block;margin:0 0 5px;font-size:12px;font-weight:800;color:#78dcff}
  .cg45-filter-grid input,.cg45-filter-grid select,.cg45-edit-grid input,.cg45-edit-grid select,.cg45-edit-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 10px;background:#071e37;color:#fff;font:inherit;outline:none}.cg45-filter-grid input:focus,.cg45-filter-grid select:focus,.cg45-edit-grid input:focus,.cg45-edit-grid select:focus,.cg45-edit-grid textarea:focus{border-color:#65d6ff;box-shadow:0 0 0 2px rgba(101,214,255,.12)}
  .cg45-filter-actions{display:flex;gap:10px;margin-top:12px}.cg45-help{margin-top:10px;font-size:12px;color:rgba(255,255,255,.60)}
  .cg45-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0 10px;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}.cg45-muted{font-size:13px;color:rgba(255,255,255,.64);margin-top:3px}.cg45-status{min-height:20px;margin:8px 0 12px;font-size:13px;color:#8ff0b5;overflow-wrap:anywhere}
  .cg45-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(0,0,0,.15)}.cg45-table{width:100%;border-collapse:collapse;min-width:780px}.cg45-table th{padding:11px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#78dcff;background:rgba(0,0,0,.22);position:sticky;top:0}.cg45-table td{padding:11px 12px;border-top:1px solid rgba(255,255,255,.08);vertical-align:top;font-size:14px}.cg45-table tr.cg45-clickable{cursor:pointer}.cg45-table tr.cg45-clickable:hover{background:rgba(90,215,255,.08)}.cg45-q{max-width:560px;line-height:1.35}.cg45-status-chip{display:inline-block;min-width:24px;text-align:center;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.10);font-weight:800}
  .cg45-btn{border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}.cg45-btn:disabled{opacity:.38;cursor:not-allowed}.cg45-btn-primary{border:0;background:#5ad7ff;color:#06131f}.cg45-btn-secondary{border:1px solid rgba(255,255,255,.24);background:transparent;color:#fff}.cg45-btn-save{border:0;background:#62e6a2;color:#061b14}.cg45-btn-danger{border:1px solid rgba(255,140,140,.35);background:transparent;color:#ffb0b0}
  .cg45-pager{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-top:14px}.cg45-pager #cg45-next{justify-self:end}.cg45-pager #cg45-prev{justify-self:start}.cg45-page-center{font-size:13px;font-weight:800;color:rgba(255,255,255,.78)}
  .cg45-mobile-list{display:none}.cg45-mobile-card{padding:14px;margin-top:10px;border-radius:14px;background:rgba(0,0,0,.19);border:1px solid rgba(255,255,255,.10);cursor:pointer}.cg45-mobile-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#78dcff;font-weight:800}.cg45-mobile-theme{font-size:13px;color:rgba(255,255,255,.68);margin-top:5px}.cg45-mobile-question{font-size:15px;line-height:1.35;margin-top:8px;font-weight:650}
  .cg45-overlay{position:fixed;inset:0;z-index:99999;display:none;background:rgba(1,8,18,.84);backdrop-filter:blur(4px);padding:18px;overflow:auto}.cg45-overlay.open{display:block}.cg45-detail{max-width:920px;margin:20px auto;background:#0b2848;border:1px solid rgba(101,214,255,.45);border-radius:20px;color:#fff;padding:20px;box-shadow:0 20px 70px rgba(0,0,0,.45)}.cg45-detail-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.cg45-detail h3{margin:4px 0 0;font-size:22px}.cg45-top-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.cg45-close{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:10px;padding:7px 11px;font-weight:800;cursor:pointer}
  .cg45-detail-grid{display:grid;grid-template-columns:180px 1fr;gap:0;margin-top:18px;border:1px solid rgba(255,255,255,.10);border-radius:14px;overflow:hidden}.cg45-detail-grid .k,.cg45-detail-grid .v{padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}.cg45-detail-grid .k:nth-child(-n+2),.cg45-detail-grid .v:nth-child(-n+2){border-top:0}.cg45-detail-grid .k{color:#78dcff;background:rgba(0,0,0,.15);font-weight:800;font-size:12px}.cg45-detail-grid .v{white-space:pre-wrap;overflow-wrap:anywhere}.cg45-prop-ok{color:#8ff0b5;font-weight:800}
  .cg45-edit{display:none;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12)}.cg45-edit.open{display:block}.cg45-edit h4{margin:0 0 12px;color:#8ff0b5}.cg45-edit-note{margin:-4px 0 13px;font-size:12px;color:rgba(255,255,255,.64)}.cg45-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.cg45-edit-grid label{display:block}.cg45-edit-grid label.wide{grid-column:1/-1}.cg45-edit-grid label span{display:block;margin:0 0 5px;font-size:12px;font-weight:800;color:#78dcff}.cg45-edit-grid textarea{min-height:82px;resize:vertical}.cg45-edit-grid .cg45-check{display:flex;align-items:center;gap:9px;padding-top:22px}.cg45-edit-grid .cg45-check input{width:auto}.cg45-edit-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.cg45-edit-status{min-height:20px;margin-top:10px;font-size:13px;color:#8ff0b5}
  @media(max-width:900px){.cg45-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:720px){
    .cg45-panel{width:calc(100% - 24px);padding:16px;margin:18px auto 56px}.cg45-title-row{display:block}.cg45-title-row h2{font-size:23px}.cg45-pill{display:inline-block;margin-top:12px}.cg45-filter-grid{grid-template-columns:1fr}.cg45-filter-actions{display:grid;grid-template-columns:1fr}.cg45-table-wrap{display:none}.cg45-mobile-list{display:block}.cg45-toolbar{align-items:flex-start}.cg45-toolbar .cg45-btn{padding:8px 10px}.cg45-pager{grid-template-columns:1fr 1fr}.cg45-page-center{grid-column:1/-1;grid-row:1;text-align:center}.cg45-pager #cg45-prev{grid-column:1;grid-row:2}.cg45-pager #cg45-next{grid-column:2;grid-row:2}.cg45-detail{margin:2px auto;padding:15px}.cg45-detail-grid{grid-template-columns:1fr}.cg45-detail-grid .k{padding-bottom:4px}.cg45-detail-grid .v{padding-top:4px;border-top:0}.cg45-detail-grid .k:not(:first-child){border-top:1px solid rgba(255,255,255,.08)}.cg45-detail-top{display:block}.cg45-top-actions{justify-content:flex-start;margin-top:12px}.cg45-edit-grid{grid-template-columns:1fr}.cg45-edit-grid label.wide{grid-column:auto}
  }
`;
document.head.appendChild(cg45Style);

// Placement : après CGCLOUD002. CGWEB003 est remplacé par ce module.
const cg45Anchor = document.getElementById('cgcloud002-panel');
if (cg45Anchor) cg45Anchor.insertAdjacentElement('afterend', cg45Panel);
else {
  const main = document.querySelector('main');
  if (main) main.insertAdjacentElement('afterend', cg45Panel);
  else document.body.appendChild(cg45Panel);
}

const cg45Overlay = document.createElement('div');
cg45Overlay.className = 'cg45-overlay';
cg45Overlay.id = 'cg45-overlay';
cg45Overlay.innerHTML = `
  <div class="cg45-detail">
    <div class="cg45-detail-top">
      <div>
        <div class="cg45-kicker">QUESTION</div>
        <h3 id="cg45-detail-title">Détail</h3>
      </div>
      <div class="cg45-top-actions">
        <button class="cg45-btn cg45-btn-save" id="cg45-edit-open" type="button">Modifier</button>
        <button class="cg45-close" id="cg45-close" type="button">Fermer ✕</button>
      </div>
    </div>
    <div id="cg45-detail-grid" class="cg45-detail-grid"></div>

    <div id="cg45-edit" class="cg45-edit">
      <h4>CGWEB005 — Édition Firestore</h4>
      <div class="cg45-edit-note">Le contenu est enregistré dans Firestore. La synchronisation du contenu vers SQLite Android viendra dans l'étape Cloud → Android. Le statut reste géré par SYNCLOUD001.</div>
      <div class="cg45-edit-grid">
        <label><span>Mégathème</span><select id="cg45-e-megatheme">${CG45_DOMAINS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></label>
        <label><span>Thème</span><input id="cg45-e-theme" type="text"></label>
        <label class="wide"><span>Question</span><textarea id="cg45-e-question"></textarea></label>
        <label class="wide"><span>Détail</span><textarea id="cg45-e-detail"></textarea></label>
        <label><span>Proposition A</span><input id="cg45-e-a" type="text"></label>
        <label><span>Proposition B</span><input id="cg45-e-b" type="text"></label>
        <label><span>Proposition C</span><input id="cg45-e-c" type="text"></label>
        <label><span>Proposition D</span><input id="cg45-e-d" type="text"></label>
        <label><span>Bonne réponse</span><select id="cg45-e-correct"><option value="1">A</option><option value="2">B</option><option value="3">C</option><option value="4">D</option></select></label>
        <label><span>Statut (lecture seule)</span><input id="cg45-e-status" type="text" readonly></label>
        <label class="wide"><span>URL Quizypedia</span><input id="cg45-e-url-q" type="text"></label>
        <label class="wide"><span>URL Internet</span><input id="cg45-e-url-i" type="text"></label>
        <label><span>Fichier image</span><input id="cg45-e-image" type="text"></label>
        <label><span>Non trouvé</span><input id="cg45-e-not-found" type="text"></label>
        <label class="cg45-check"><input id="cg45-e-is-image" type="checkbox"><span>Question image</span></label>
      </div>
      <div class="cg45-edit-actions">
        <button id="cg45-save" class="cg45-btn cg45-btn-save" type="button">Enregistrer dans Firestore</button>
        <button id="cg45-cancel-edit" class="cg45-btn cg45-btn-secondary" type="button">Annuler</button>
      </div>
      <div id="cg45-edit-status" class="cg45-edit-status"></div>
    </div>
  </div>
`;
document.body.appendChild(cg45Overlay);

const cg45$ = id => document.getElementById(id);
function cg45Bridge(){ return window.CGWEB001 || null; }
function cg45Esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function cg45Status(msg, ok=true){ cg45$('cg45-status').textContent = msg; cg45$('cg45-status').style.color = ok ? '#8ff0b5' : '#ffb0b0'; }
function cg45EditStatus(msg, ok=true){ cg45$('cg45-edit-status').textContent = msg; cg45$('cg45-edit-status').style.color = ok ? '#8ff0b5' : '#ffb0b0'; }

function cg45ReadCriteria(){
  return {
    exactId: cg45$('cg45-id').value.trim(),
    questionPrefix: cg45$('cg45-question-prefix').value.trim(),
    megatheme: cg45$('cg45-megatheme').value,
    theme: cg45$('cg45-theme').value.trim(),
    status: cg45$('cg45-status-filter').value,
    sortField: cg45$('cg45-sort-field').value,
    sortDirection: cg45$('cg45-sort-direction').value
  };
}

function cg45ResetPaging(){
  cg45PageIndex = 0;
  cg45Cursors = [null];
}

function cg45SetFilterUi(criteria){
  cg45$('cg45-id').value = criteria.exactId || '';
  cg45$('cg45-question-prefix').value = criteria.questionPrefix || '';
  cg45$('cg45-megatheme').value = criteria.megatheme || '';
  cg45$('cg45-theme').value = criteria.theme || '';
  cg45$('cg45-status-filter').value = criteria.status || '';
  cg45$('cg45-sort-field').value = criteria.sortField || 'id';
  cg45$('cg45-sort-direction').value = criteria.sortDirection || 'asc';
}

function cg45HumanCriteria(){
  const c = cg45ActiveCriteria;
  const parts = [];
  if (c.exactId) parts.push(`ID=${c.exactId}`);
  if (c.questionPrefix) parts.push(`question commence par « ${c.questionPrefix} »`);
  if (c.megatheme) parts.push(c.megatheme);
  if (c.theme) parts.push(`thème=${c.theme}`);
  if (c.status) parts.push(c.status === '__EMPTY__' ? 'sans statut' : `statut=${c.status}`);
  return parts.length ? parts.join(' · ') : 'Aucun filtre';
}

function cg45Render(items){
  cg45CurrentItems = items;
  const tbody = cg45$('cg45-body');
  tbody.innerHTML = '';
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'cg45-clickable';
    tr.innerHTML = `<td>${cg45Esc(item.original_id || item.id)}</td><td>${cg45Esc(item.megatheme)}</td><td>${cg45Esc(item.theme)}</td><td class="cg45-q">${cg45Esc(item.question)}</td><td><span class="cg45-status-chip">${cg45Esc(item.status || '—')}</span></td>`;
    tr.addEventListener('click', () => cg45OpenDetail(item));
    tbody.appendChild(tr);
  });

  const mobile = cg45$('cg45-mobile-list');
  mobile.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'cg45-mobile-card';
    card.innerHTML = `<div class="cg45-mobile-meta"><span>#${cg45Esc(item.original_id || item.id)}</span><span>${cg45Esc(item.status || '—')}</span></div><div class="cg45-mobile-theme">${cg45Esc(item.megatheme)} · ${cg45Esc(item.theme)}</div><div class="cg45-mobile-question">${cg45Esc(item.question)}</div>`;
    card.addEventListener('click', () => cg45OpenDetail(item));
    mobile.appendChild(card);
  });
}

function cg45DetailRows(item){
  const correct = Number(item.correct_index || 0);
  const props = [item.proposition_a,item.proposition_b,item.proposition_c,item.proposition_d];
  return [
    ['Document ID', item.id], ['Original ID', item.original_id], ['Row number', item.row_number],
    ['Mégathème', item.megatheme], ['Thème', item.theme], ['Question', item.question], ['Détail', item.detail],
    ['Proposition A', props[0]], ['Proposition B', props[1]], ['Proposition C', props[2]], ['Proposition D', props[3]],
    ['Bonne réponse', correct >= 1 && correct <= 4 ? `${String.fromCharCode(64+correct)} — ${props[correct-1] || ''}` : item.correct_index],
    ['Statut', item.status], ['URL Quizypedia', item.url_quizypedia], ['URL Internet', item.url_internet],
    ['Image', item.image_file], ['Non trouvé', item.non_trouve], ['Question image', item.is_image], ['Schéma Cloud', item.cloud_schema]
  ];
}

function cg45RenderDetail(item){
  cg45$('cg45-detail-title').textContent = item.question || `Question ${item.original_id || item.id || ''}`;
  cg45$('cg45-detail-grid').innerHTML = cg45DetailRows(item).map(([k,v]) => {
    const value = (k === 'Bonne réponse') ? `<span class="cg45-prop-ok">${cg45Esc(v)}</span>` : cg45Esc(v);
    return `<div class="k">${cg45Esc(k)}</div><div class="v">${value || '—'}</div>`;
  }).join('');
}

function cg45FillEditForm(item){
  cg45$('cg45-e-megatheme').value = item.megatheme || CG45_DOMAINS[0];
  cg45$('cg45-e-theme').value = item.theme || '';
  cg45$('cg45-e-question').value = item.question || '';
  cg45$('cg45-e-detail').value = item.detail || '';
  cg45$('cg45-e-a').value = item.proposition_a || '';
  cg45$('cg45-e-b').value = item.proposition_b || '';
  cg45$('cg45-e-c').value = item.proposition_c || '';
  cg45$('cg45-e-d').value = item.proposition_d || '';
  cg45$('cg45-e-correct').value = String(Number(item.correct_index || 1));
  cg45$('cg45-e-status').value = item.status || '';
  cg45$('cg45-e-url-q').value = item.url_quizypedia || '';
  cg45$('cg45-e-url-i').value = item.url_internet || '';
  cg45$('cg45-e-image').value = item.image_file || '';
  cg45$('cg45-e-not-found').value = item.non_trouve ?? '';
  cg45$('cg45-e-is-image').checked = Number(item.is_image || 0) === 1 || item.is_image === true;
  cg45EditStatus('');
}

function cg45OpenDetail(item){
  cg45CurrentQuestion = item;
  cg45Editing = false;
  cg45$('cg45-edit').classList.remove('open');
  cg45RenderDetail(item);
  cg45FillEditForm(item);
  cg45Overlay.classList.add('open');
}

function cg45CloseDetail(){
  if (cg45Editing && !confirm('Fermer sans enregistrer les modifications ?')) return;
  cg45Editing = false;
  cg45$('cg45-edit').classList.remove('open');
  cg45Overlay.classList.remove('open');
}

cg45$('cg45-close').addEventListener('click', cg45CloseDetail);
cg45Overlay.addEventListener('click', e => { if (e.target === cg45Overlay) cg45CloseDetail(); });

cg45$('cg45-edit-open').addEventListener('click', () => {
  if (!cg45CurrentQuestion) return;
  cg45Editing = true;
  cg45FillEditForm(cg45CurrentQuestion);
  cg45$('cg45-edit').classList.add('open');
  cg45$('cg45-edit').scrollIntoView({behavior:'smooth',block:'start'});
});

cg45$('cg45-cancel-edit').addEventListener('click', () => {
  cg45Editing = false;
  cg45$('cg45-edit').classList.remove('open');
  cg45EditStatus('');
});

function cg45BuildPatch(){
  return {
    megatheme: cg45$('cg45-e-megatheme').value,
    theme: cg45$('cg45-e-theme').value.trim(),
    question: cg45$('cg45-e-question').value.trim(),
    detail: cg45$('cg45-e-detail').value.trim(),
    proposition_a: cg45$('cg45-e-a').value.trim(),
    proposition_b: cg45$('cg45-e-b').value.trim(),
    proposition_c: cg45$('cg45-e-c').value.trim(),
    proposition_d: cg45$('cg45-e-d').value.trim(),
    correct_index: Number(cg45$('cg45-e-correct').value),
    url_quizypedia: cg45$('cg45-e-url-q').value.trim(),
    url_internet: cg45$('cg45-e-url-i').value.trim(),
    image_file: cg45$('cg45-e-image').value.trim(),
    non_trouve: cg45$('cg45-e-not-found').value.trim(),
    is_image: cg45$('cg45-e-is-image').checked ? 1 : 0
  };
}

cg45$('cg45-save').addEventListener('click', async () => {
  const api = cg45Bridge();
  if (!api?.updateQuestion || !cg45CurrentQuestion) {
    cg45EditStatus('API d’édition Firestore indisponible.', false);
    return;
  }
  const patch = cg45BuildPatch();
  if (!patch.question) {
    cg45EditStatus('La question ne peut pas être vide.', false);
    return;
  }
  if (!patch.theme) {
    cg45EditStatus('Le thème ne peut pas être vide.', false);
    return;
  }

  const button = cg45$('cg45-save');
  button.disabled = true;
  cg45EditStatus('Enregistrement dans Firestore…');
  try {
    const fresh = await api.updateQuestion(cg45CurrentQuestion.id, patch);
    if (!fresh) throw new Error('La question n’a pas pu être relue après modification.');
    cg45CurrentQuestion = fresh;
    cg45Editing = false;
    cg45RenderDetail(fresh);
    cg45FillEditForm(fresh);
    cg45$('cg45-edit').classList.remove('open');
    cg45EditStatus('✅ Modification enregistrée dans Firestore.');

    const idx = cg45CurrentItems.findIndex(q => q.id === fresh.id);
    if (idx >= 0) {
      cg45CurrentItems[idx] = fresh;
      cg45Render(cg45CurrentItems);
    } else {
      await cg45LoadPage(cg45PageIndex);
    }
    cg45Status('✅ Question modifiée dans Firestore.');
  } catch(e) {
    console.error(e);
    cg45EditStatus(`Enregistrement impossible : ${e.message}`, false);
  } finally {
    button.disabled = false;
  }
});

async function cg45LoadPage(index){
  if (cg45Loading) return;
  const api = cg45Bridge();
  cg45User = api?.getUser?.() || null;
  if (!api || !cg45User){
    cg45$('cg45-cloud-state').textContent = 'Non connecté';
    cg45$('cg45-cloud-state').classList.remove('ok');
    cg45Status('Connecte-toi avec CGWEB001 pour ouvrir le répertoire.', false);
    return;
  }

  cg45Loading = true;
  cg45$('cg45-prev').disabled = true;
  cg45$('cg45-next').disabled = true;
  cg45Status('Chargement…');
  try {
    if (cg45ActiveCriteria.exactId) {
      const item = await api.getQuestion(cg45ActiveCriteria.exactId);
      const items = item ? [item] : [];
      cg45Total = items.length;
      cg45PageIndex = 0;
      cg45Render(items);
      cg45$('cg45-count').textContent = `Résultat : ${cg45Total}`;
      cg45$('cg45-page-label').textContent = cg45HumanCriteria();
      cg45$('cg45-page-center').textContent = 'ID exact';
      cg45$('cg45-prev').disabled = true;
      cg45$('cg45-next').disabled = true;
      cg45$('cg45-cloud-state').textContent = 'Firestore connecté';
      cg45$('cg45-cloud-state').classList.add('ok');
      cg45Status(items.length ? 'Question trouvée. Clique dessus pour ouvrir sa fiche.' : 'Aucune question avec cet ID.');
      return;
    }

    const cursor = cg45Cursors[index] ?? null;
    const result = await api.queryQuestionsPage({
      cursor,
      pageSize: CG45_PAGE_SIZE,
      filters: {
        megatheme: cg45ActiveCriteria.megatheme,
        theme: cg45ActiveCriteria.theme,
        status: cg45ActiveCriteria.status,
        questionPrefix: cg45ActiveCriteria.questionPrefix
      },
      sortField: cg45ActiveCriteria.sortField,
      sortDirection: cg45ActiveCriteria.sortDirection
    });

    cg45Total = result.total;
    cg45PageIndex = index;
    cg45Render(result.items);
    if (result.items.length) cg45Cursors[index + 1] = result.nextCursor;

    const pages = Math.max(1, Math.ceil(cg45Total / CG45_PAGE_SIZE));
    const pageNo = index + 1;
    cg45$('cg45-count').textContent = `Questions : ${cg45Total}`;
    cg45$('cg45-page-label').textContent = `${cg45HumanCriteria()} · ${result.items.length} affichée(s)`;
    cg45$('cg45-page-center').textContent = `Page ${pageNo} / ${pages}`;
    cg45$('cg45-cloud-state').textContent = 'Firestore connecté';
    cg45$('cg45-cloud-state').classList.add('ok');
    cg45$('cg45-prev').disabled = index <= 0;
    cg45$('cg45-next').disabled = pageNo >= pages || result.items.length === 0;
    cg45Status(result.items.length ? 'Clique sur une question pour consulter ou modifier sa fiche.' : 'Aucune question ne correspond aux critères.');
  } catch(e){
    console.error(e);
    let message = e?.message || String(e);
    if ((e?.code || '').includes('failed-precondition') || message.toLowerCase().includes('index')) {
      message = `Firestore demande probablement un index pour cette combinaison de filtres/tri. ${message}`;
    }
    cg45Status(`Lecture Firestore impossible : ${message}`, false);
  } finally {
    cg45Loading = false;
  }
}

cg45$('cg45-apply').addEventListener('click', () => {
  cg45ActiveCriteria = cg45ReadCriteria();
  if (cg45ActiveCriteria.exactId) {
    cg45ActiveCriteria.questionPrefix = '';
    cg45$('cg45-question-prefix').value = '';
  }
  cg45ResetPaging();
  cg45LoadPage(0);
});

cg45$('cg45-reset').addEventListener('click', () => {
  cg45ActiveCriteria = { exactId:'', questionPrefix:'', megatheme:'', theme:'', status:'', sortField:'id', sortDirection:'asc' };
  cg45SetFilterUi(cg45ActiveCriteria);
  cg45ResetPaging();
  cg45LoadPage(0);
});

cg45$('cg45-reload').addEventListener('click', () => {
  cg45ResetPaging();
  cg45LoadPage(0);
});
cg45$('cg45-prev').addEventListener('click', () => { if (cg45PageIndex > 0) cg45LoadPage(cg45PageIndex - 1); });
cg45$('cg45-next').addEventListener('click', () => cg45LoadPage(cg45PageIndex + 1));

// Entrée dans les champs texte = appliquer.
['cg45-id','cg45-question-prefix','cg45-theme'].forEach(id => {
  cg45$(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') cg45$('cg45-apply').click();
  });
});

// Auth Firebase restaurée de façon asynchrone par CGWEB001.
const cg45AuthTimer = setInterval(() => {
  const api = cg45Bridge();
  const user = api?.getUser?.() || null;
  if (!user) return;
  if (!cg45User || cg45User.uid !== user.uid){
    cg45User = user;
    cg45ResetPaging();
    cg45LoadPage(0);
  }
}, 350);
window.addEventListener('beforeunload', () => clearInterval(cg45AuthTimer));

cg45LoadPage(0);
