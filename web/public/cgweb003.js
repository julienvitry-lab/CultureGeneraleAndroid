// CGWEB003 — Répertoire paginé Firestore (lecture seule)
// Utilise exclusivement le contexte Firebase partagé par CGWEB001.

const PAGE_SIZE = 20;
let cg3User = null;
let cg3Total = 0;
let cg3PageIndex = 0;
let cg3Cursors = [null];
let cg3CurrentItems = [];
let cg3Loading = false;

const cg3Panel = document.createElement('section');
cg3Panel.id = 'cgweb003-panel';
cg3Panel.className = 'cg3-panel';
cg3Panel.innerHTML = `
  <div class="cg3-kicker">CGWEB003</div>
  <div class="cg3-title-row">
    <div>
      <h2>Répertoire des questions</h2>
      <p class="cg3-subtitle">Lecture seule · pagination Firestore · 20 questions par page</p>
    </div>
    <div id="cg3-cloud-state" class="cg3-pill">Connexion…</div>
  </div>

  <div class="cg3-toolbar">
    <div>
      <strong id="cg3-count">Questions Cloud : —</strong>
      <div id="cg3-page-label" class="cg3-muted">Page —</div>
    </div>
    <button id="cg3-reload" class="cg3-btn cg3-btn-secondary" type="button">Actualiser</button>
  </div>

  <div id="cg3-status" class="cg3-status"></div>

  <div class="cg3-table-wrap">
    <table class="cg3-table" aria-label="Répertoire des questions">
      <thead>
        <tr>
          <th>ID</th>
          <th>Mégathème</th>
          <th>Thème</th>
          <th>Question</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody id="cg3-body"></tbody>
    </table>
  </div>

  <div id="cg3-mobile-list" class="cg3-mobile-list"></div>

  <div class="cg3-pager">
    <button id="cg3-prev" class="cg3-btn cg3-btn-secondary" type="button">← Précédent</button>
    <div id="cg3-page-center" class="cg3-page-center">—</div>
    <button id="cg3-next" class="cg3-btn cg3-btn-primary" type="button">Suivant →</button>
  </div>
`;

const cg3Style = document.createElement('style');
cg3Style.textContent = `
  .cg3-panel{width:calc(100% - 32px);max-width:1180px;box-sizing:border-box;margin:24px auto 72px;padding:22px;border-radius:22px;color:#fff;background:linear-gradient(145deg,rgba(8,35,66,.98),rgba(12,63,96,.98));border:1px solid rgba(105,214,255,.42);box-shadow:0 16px 42px rgba(0,0,0,.28);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
  .cg3-kicker{font-size:12px;font-weight:900;letter-spacing:.14em;color:#65d6ff}
  .cg3-title-row{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-top:5px}
  .cg3-title-row h2{margin:0;font-size:26px;line-height:1.15}
  .cg3-subtitle{margin:7px 0 0;color:rgba(255,255,255,.72)}
  .cg3-pill{white-space:nowrap;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;color:#ffd878}
  .cg3-pill.ok{color:#8ff0b5;border-color:rgba(79,222,143,.55)}
  .cg3-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0 10px;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}
  .cg3-muted{font-size:13px;color:rgba(255,255,255,.64);margin-top:3px}
  .cg3-status{min-height:20px;margin:8px 0 12px;font-size:13px;color:#8ff0b5}
  .cg3-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(0,0,0,.15)}
  .cg3-table{width:100%;border-collapse:collapse;min-width:780px}
  .cg3-table th{padding:11px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#78dcff;background:rgba(0,0,0,.22);position:sticky;top:0}
  .cg3-table td{padding:11px 12px;border-top:1px solid rgba(255,255,255,.08);vertical-align:top;font-size:14px}
  .cg3-table tr.cg3-clickable{cursor:pointer}
  .cg3-table tr.cg3-clickable:hover{background:rgba(90,215,255,.08)}
  .cg3-q{max-width:560px;line-height:1.35}
  .cg3-status-chip{display:inline-block;min-width:24px;text-align:center;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.10);font-weight:800}
  .cg3-btn{border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}
  .cg3-btn:disabled{opacity:.38;cursor:not-allowed}
  .cg3-btn-primary{border:0;background:#5ad7ff;color:#06131f}
  .cg3-btn-secondary{border:1px solid rgba(255,255,255,.24);background:transparent;color:#fff}
  .cg3-pager{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-top:14px}
  .cg3-pager #cg3-next{justify-self:end}.cg3-pager #cg3-prev{justify-self:start}
  .cg3-page-center{font-size:13px;font-weight:800;color:rgba(255,255,255,.78)}
  .cg3-mobile-list{display:none}
  .cg3-mobile-card{padding:14px;margin-top:10px;border-radius:14px;background:rgba(0,0,0,.19);border:1px solid rgba(255,255,255,.10);cursor:pointer}
  .cg3-mobile-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#78dcff;font-weight:800}
  .cg3-mobile-theme{font-size:13px;color:rgba(255,255,255,.68);margin-top:5px}
  .cg3-mobile-question{font-size:15px;line-height:1.35;margin-top:8px;font-weight:650}
  .cg3-overlay{position:fixed;inset:0;z-index:99999;display:none;background:rgba(1,8,18,.82);backdrop-filter:blur(4px);padding:18px;overflow:auto}
  .cg3-overlay.open{display:block}
  .cg3-detail{max-width:880px;margin:20px auto;background:#0b2848;border:1px solid rgba(101,214,255,.45);border-radius:20px;color:#fff;padding:20px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
  .cg3-detail-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .cg3-detail h3{margin:4px 0 0;font-size:22px}
  .cg3-close{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:10px;padding:7px 11px;font-weight:800;cursor:pointer}
  .cg3-detail-grid{display:grid;grid-template-columns:180px 1fr;gap:0;margin-top:18px;border:1px solid rgba(255,255,255,.10);border-radius:14px;overflow:hidden}
  .cg3-detail-grid .k,.cg3-detail-grid .v{padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}
  .cg3-detail-grid .k:nth-child(-n+2),.cg3-detail-grid .v:nth-child(-n+2){border-top:0}
  .cg3-detail-grid .k{color:#78dcff;background:rgba(0,0,0,.15);font-weight:800;font-size:12px}
  .cg3-detail-grid .v{white-space:pre-wrap;overflow-wrap:anywhere}
  .cg3-prop-ok{color:#8ff0b5;font-weight:800}
  @media(max-width:720px){
    .cg3-panel{width:calc(100% - 24px);padding:16px;margin:18px auto 56px}
    .cg3-title-row{display:block}.cg3-title-row h2{font-size:23px}.cg3-pill{display:inline-block;margin-top:12px}
    .cg3-table-wrap{display:none}.cg3-mobile-list{display:block}
    .cg3-toolbar{align-items:flex-start}.cg3-toolbar .cg3-btn{padding:8px 10px}
    .cg3-pager{grid-template-columns:1fr 1fr}.cg3-page-center{grid-column:1 / -1;grid-row:1;text-align:center}.cg3-pager #cg3-prev{grid-column:1;grid-row:2}.cg3-pager #cg3-next{grid-column:2;grid-row:2}
    .cg3-detail{margin:2px auto;padding:15px}.cg3-detail-grid{grid-template-columns:1fr}.cg3-detail-grid .k{padding-bottom:4px}.cg3-detail-grid .v{padding-top:4px;border-top:0}.cg3-detail-grid .k:not(:first-child){border-top:1px solid rgba(255,255,255,.08)}
  }
`;
document.head.appendChild(cg3Style);

// Placement séquentiel : CGWEB001 -> CGCLOUD002 -> CGWEB003.
const cg2 = document.getElementById('cgcloud002-panel');
if (cg2) cg2.insertAdjacentElement('afterend', cg3Panel);
else {
  const main = document.querySelector('main');
  if (main) main.insertAdjacentElement('afterend', cg3Panel);
  else document.body.appendChild(cg3Panel);
}

const cg3Overlay = document.createElement('div');
cg3Overlay.className = 'cg3-overlay';
cg3Overlay.id = 'cg3-overlay';
cg3Overlay.innerHTML = `<div class="cg3-detail"><div class="cg3-detail-top"><div><div class="cg3-kicker">QUESTION</div><h3 id="cg3-detail-title">Détail</h3></div><button class="cg3-close" id="cg3-close" type="button">Fermer ✕</button></div><div id="cg3-detail-grid" class="cg3-detail-grid"></div></div>`;
document.body.appendChild(cg3Overlay);

document.getElementById('cg3-close').addEventListener('click', () => cg3Overlay.classList.remove('open'));
cg3Overlay.addEventListener('click', e => { if (e.target === cg3Overlay) cg3Overlay.classList.remove('open'); });

const cg3$ = id => document.getElementById(id);
function cg3Bridge(){ return window.CGWEB001 || null; }
function cg3Esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function cg3Status(msg, ok=true){ cg3$('cg3-status').textContent = msg; cg3$('cg3-status').style.color = ok ? '#8ff0b5' : '#ffb0b0'; }

function cg3OpenDetail(item){
  cg3$('cg3-detail-title').textContent = item.question || `Question ${item.original_id || item.id || ''}`;
  const correct = Number(item.correct_index || 0);
  const props = [item.proposition_a,item.proposition_b,item.proposition_c,item.proposition_d];
  const rows = [
    ['Document ID', item.id], ['Original ID', item.original_id], ['Row number', item.row_number],
    ['Mégathème', item.megatheme], ['Thème', item.theme], ['Question', item.question], ['Détail', item.detail],
    ['Proposition A', props[0]], ['Proposition B', props[1]], ['Proposition C', props[2]], ['Proposition D', props[3]],
    ['Bonne réponse', correct >= 1 && correct <= 4 ? `${String.fromCharCode(64+correct)} — ${props[correct-1] || ''}` : item.correct_index],
    ['Statut', item.status], ['URL Quizypedia', item.url_quizypedia], ['URL Internet', item.url_internet],
    ['Image', item.image_file], ['Non trouvé', item.non_trouve], ['Question image', item.is_image], ['Schéma Cloud', item.cloud_schema]
  ];
  cg3$('cg3-detail-grid').innerHTML = rows.map(([k,v]) => {
    const value = (k === 'Bonne réponse') ? `<span class="cg3-prop-ok">${cg3Esc(v)}</span>` : cg3Esc(v);
    return `<div class="k">${cg3Esc(k)}</div><div class="v">${value || '—'}</div>`;
  }).join('');
  cg3Overlay.classList.add('open');
}

function cg3Render(items){
  cg3CurrentItems = items;
  const tbody = cg3$('cg3-body');
  tbody.innerHTML = '';
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'cg3-clickable';
    tr.innerHTML = `<td>${cg3Esc(item.original_id || item.id)}</td><td>${cg3Esc(item.megatheme)}</td><td>${cg3Esc(item.theme)}</td><td class="cg3-q">${cg3Esc(item.question)}</td><td><span class="cg3-status-chip">${cg3Esc(item.status || '—')}</span></td>`;
    tr.addEventListener('click', () => cg3OpenDetail(item));
    tbody.appendChild(tr);
  });

  const mobile = cg3$('cg3-mobile-list');
  mobile.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'cg3-mobile-card';
    card.innerHTML = `<div class="cg3-mobile-meta"><span>#${cg3Esc(item.original_id || item.id)}</span><span>${cg3Esc(item.status || '—')}</span></div><div class="cg3-mobile-theme">${cg3Esc(item.megatheme)} · ${cg3Esc(item.theme)}</div><div class="cg3-mobile-question">${cg3Esc(item.question)}</div>`;
    card.addEventListener('click', () => cg3OpenDetail(item));
    mobile.appendChild(card);
  });
}

async function cg3LoadPage(index){
  if (cg3Loading) return;
  const api = cg3Bridge();
  cg3User = api?.getUser?.() || null;
  if (!api || !cg3User){
    cg3$('cg3-cloud-state').textContent = 'Non connecté';
    cg3$('cg3-cloud-state').classList.remove('ok');
    cg3Status('Connecte-toi avec CGWEB001 pour ouvrir le répertoire.', false);
    return;
  }

  cg3Loading = true;
  cg3$('cg3-prev').disabled = true;
  cg3$('cg3-next').disabled = true;
  cg3Status('Chargement de la page…');
  try {
    cg3Total = await api.countQuestions();
    const cursor = cg3Cursors[index] ?? null;
    const result = await api.listQuestionsPage({ afterId: cursor, pageSize: PAGE_SIZE });
    cg3PageIndex = index;
    cg3Render(result.items);

    if (result.items.length && !cg3Cursors[index + 1]) cg3Cursors[index + 1] = result.lastId;

    const pages = Math.max(1, Math.ceil(cg3Total / PAGE_SIZE));
    const pageNo = index + 1;
    cg3$('cg3-count').textContent = `Questions Cloud : ${cg3Total}`;
    cg3$('cg3-page-label').textContent = `${result.items.length} question(s) affichée(s)`;
    cg3$('cg3-page-center').textContent = `Page ${pageNo} / ${pages}`;
    cg3$('cg3-cloud-state').textContent = 'Firestore connecté';
    cg3$('cg3-cloud-state').classList.add('ok');
    cg3$('cg3-prev').disabled = index <= 0;
    cg3$('cg3-next').disabled = pageNo >= pages || result.items.length === 0;
    cg3Status(result.items.length ? 'Clique sur une question pour afficher sa fiche complète.' : 'Aucune question sur cette page.');
  } catch(e){
    console.error(e);
    cg3Status(`Lecture Firestore impossible : ${e.message}`, false);
  } finally {
    cg3Loading = false;
  }
}

cg3$('cg3-prev').addEventListener('click', () => { if (cg3PageIndex > 0) cg3LoadPage(cg3PageIndex - 1); });
cg3$('cg3-next').addEventListener('click', () => cg3LoadPage(cg3PageIndex + 1));
cg3$('cg3-reload').addEventListener('click', () => { cg3Cursors = [null]; cg3LoadPage(0); });

// La restauration Auth de Firebase est asynchrone : on attend CGWEB001.
const cg3AuthTimer = setInterval(() => {
  const api = cg3Bridge();
  const user = api?.getUser?.() || null;
  if (!user) return;
  if (!cg3User || cg3User.uid !== user.uid){
    cg3User = user;
    cg3Cursors = [null];
    cg3LoadPage(0);
  }
}, 350);
window.addEventListener('beforeunload', () => clearInterval(cg3AuthTimer));

cg3LoadPage(0);
