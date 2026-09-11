const VERSION = 'CGIMAGE005_1';
const FUNCTION_URL = 'https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimage005MigrateBatch';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS_CURSOR = 'CGIMAGE005_LAST_CURSOR';
async function waitContext() {
  for (let i = 0; i < 120; i++) {
    const user = window.CGWEB001?.getUser?.();
    if (user?.getIdToken && window.CGWEB006_API) return {user, api: window.CGWEB006_API};
    await sleep(100);
  }
  throw new Error('Contexte Firebase CGIMAGE005 indisponible.');
}
function setStatus(message, cls = '') {
  const el = $('cgimg5Status');
  if (!el) return;
  el.textContent = message;
  el.className = 'cgimg5-status ' + (cls ? `cgimg5-${cls}` : '');
}
function number(v) { return new Intl.NumberFormat('fr-FR').format(Number(v || 0)); }
function loadCursor() { try { const v = localStorage.getItem(LS_CURSOR) || ''; if ($('cgimg5Cursor')) $('cgimg5Cursor').value = v; } catch (_) {} }
function saveCursor(v) { try { localStorage.setItem(LS_CURSOR, String(v || '')); } catch (_) {} }
function ensurePanel() {
  if ($('cgimage005Panel')) return;
  const panel = document.createElement('section');
  panel.id = 'cgimage005Panel';
  panel.className = 'cgimg5-panel';
  panel.innerHTML = `
    <style>
      .cgimg5-panel{margin:24px 0;padding:20px;border:1px solid #d8dce6;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.04)}
      .cgimg5-kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:700}.cgimg5-title{margin:6px 0 4px;font-size:24px}.cgimg5-sub{margin:0 0 16px;color:#475569}
      .cgimg5-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.cgimg5-grid label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;color:#334155}.cgimg5-grid input{padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
      .cgimg5-checks{display:flex;flex-wrap:wrap;gap:16px;margin:14px 0 0}.cgimg5-checks label{display:flex;align-items:center;gap:8px;font-size:14px;color:#334155}
      .cgimg5-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.cgimg5-btn{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer;background:#e2e8f0;color:#0f172a}.cgimg5-btn-primary{background:#2563eb;color:#fff}.cgimg5-btn-danger{background:#b91c1c;color:#fff}
      .cgimg5-status{margin:8px 0 12px;padding:10px 12px;border-radius:10px;background:#f8fafc;color:#334155;white-space:pre-wrap}.cgimg5-ok{background:#ecfdf5;color:#166534}.cgimg5-warn{background:#fff7ed;color:#9a3412}.cgimg5-error{background:#fef2f2;color:#991b1b}
      .cgimg5-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px}.cgimg5-metric{padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0}.cgimg5-metric span{display:block;font-size:12px;color:#64748b}.cgimg5-metric strong{font-size:18px}.cgimg5-list{margin-top:14px;display:grid;gap:10px}.cgimg5-card{padding:12px;border-radius:12px;border:1px solid #e2e8f0;background:#fff}.cgimg5-card-title{font-weight:700;margin-bottom:4px}.cgimg5-card-sub{font-size:13px;color:#64748b}.cgimg5-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
    </style>
    <div class="cgimg5-kicker">CGIMAGE005</div>
    <h2 class="cgimg5-title">Migration massive des images historiques</h2>
    <p class="cgimg5-sub">Récupération serveur des anciennes images via <b>url_internet</b> puis <b>url_quizypedia</b>, upload dans Firebase Storage et mise à jour Firestore.</p>
    <div class="cgimg5-grid">
      <label>Lot à traiter<input id="cgimg5Limit" type="number" min="1" max="500" value="500"></label>
      <label>Fenêtre de scan<input id="cgimg5Scan" type="number" min="1" max="2000" value="1500"></label>
      <label>Curseur document ID<input id="cgimg5Cursor" type="text" placeholder="laisser vide pour démarrer au début"></label>
    </div>
    <div class="cgimg5-checks">
      <label><input id="cgimg5DryRun" type="checkbox" checked> Dry-run (aucune écriture)</label>
      <label><input id="cgimg5MarkMissing" type="checkbox"> Marquer introuvable en cas d’échec</label>
      <label><input id="cgimg5AllowNoImage" type="checkbox"> Inclure aussi les questions sans drapeau image</label>
    </div>
    <div class="cgimg5-actions">
      <button id="cgimg5Run" class="cgimg5-btn cgimg5-btn-primary" type="button">Lancer le lot</button>
      <button id="cgimg5Pilot" class="cgimg5-btn" type="button">Pilote 500</button>
      <button id="cgimg5Continue" class="cgimg5-btn" type="button">Continuer au curseur</button>
      <button id="cgimg5Reset" class="cgimg5-btn cgimg5-btn-danger" type="button">Réinitialiser le curseur</button>
    </div>
    <div id="cgimg5Status" class="cgimg5-status">Prêt.</div>
    <div id="cgimg5Meta" class="cgimg5-meta"></div>
    <div id="cgimg5List" class="cgimg5-list"></div>`;
  const anchor = $('cgimage002Panel') || $('cgimport002Panel') || document.body.lastElementChild;
  anchor?.insertAdjacentElement('afterend', panel);
}
function renderResult(result) {
  const stats = result?.stats || {};
  $('cgimg5Meta').innerHTML = `
    <article class="cgimg5-metric"><span>Scannées</span><strong>${number(stats.scanned)}</strong></article>
    <article class="cgimg5-metric"><span>Déjà Cloud</span><strong>${number(stats.alreadyCloud)}</strong></article>
    <article class="cgimg5-metric"><span>Sans source</span><strong>${number(stats.noSource)}</strong></article>
    <article class="cgimg5-metric"><span>Candidates</span><strong>${number(stats.candidates)}</strong></article>
    <article class="cgimg5-metric"><span>Migrées</span><strong>${number(stats.migrated)}</strong></article>
    <article class="cgimg5-metric"><span>Échecs</span><strong>${number(stats.failed)}</strong></article>
    <article class="cgimg5-metric"><span>Curseur suivant</span><strong class="cgimg5-code">${esc(result?.nextCursor || '—')}</strong></article>`;
  const cards = [];
  for (const row of (result?.migrated || []).slice(0, 20)) cards.push(`<article class="cgimg5-card"><div class="cgimg5-card-title">✅ ${esc(row.questionId)}</div><div class="cgimg5-card-sub cgimg5-code">${esc(row.path || '')}</div><div class="cgimg5-card-sub">${esc(row.sourceUrl || '')}</div></article>`);
  for (const row of (result?.failed || []).slice(0, 20)) cards.push(`<article class="cgimg5-card"><div class="cgimg5-card-title">❌ ${esc(row.id)}</div><div class="cgimg5-card-sub">${esc(row.error || '')}</div></article>`);
  if (!cards.length) for (const row of (result?.samples || []).slice(0, 20)) cards.push(`<article class="cgimg5-card"><div class="cgimg5-card-title">🛈 ${esc(row.id)}</div><div class="cgimg5-card-sub">${esc(row.question || '')}</div><div class="cgimg5-card-sub cgimg5-code">${esc((row.sourceFields || []).join(' · '))}</div></article>`);
  $('cgimg5List').innerHTML = cards.length ? cards.join('') : '<div class="cgimg5-card">Aucun élément à afficher.</div>';
  if (result?.nextCursor) { $('cgimg5Cursor').value = result.nextCursor; saveCursor(result.nextCursor); }
}
async function runBatch(forceDryRun = null) {
  try {
    const {user} = await waitContext();
    const limit = Math.min(Math.max(Number($('cgimg5Limit').value) || 500, 1), 500);
    const scanLimit = Math.min(Math.max(Number($('cgimg5Scan').value) || (limit * 3), limit), 2000);
    const payload = {limit, scanLimit, cursor: $('cgimg5Cursor').value.trim(), dryRun: forceDryRun === null ? $('cgimg5DryRun').checked : Boolean(forceDryRun), markMissing: $('cgimg5MarkMissing').checked, allowNoImageFlag: $('cgimg5AllowNoImage').checked};
    setStatus('Traitement en cours…', 'warn');
    $('cgimg5Run').disabled = $('cgimg5Pilot').disabled = $('cgimg5Continue').disabled = true;
    const token = await user.getIdToken();
    const response = await fetch(FUNCTION_URL, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${token}`}, body: JSON.stringify(payload)});
    const text = await response.text();
    const result = text ? JSON.parse(text) : {};
    if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
    renderResult(result);
    const s = result.stats || {};
    setStatus(`✅ Lot terminé\nScannées : ${number(s.scanned)} · Candidates : ${number(s.candidates)} · Migrées : ${number(s.migrated)} · Échecs : ${number(s.failed)}\nCurseur suivant : ${result.nextCursor || '—'}`, 'ok');
  } catch (error) {
    setStatus(`❌ ${error?.message || String(error)}`, 'error');
  } finally {
    $('cgimg5Run').disabled = $('cgimg5Pilot').disabled = $('cgimg5Continue').disabled = false;
  }
}
function bind() {
  $('cgimg5Run').onclick = () => runBatch(null);
  $('cgimg5Pilot').onclick = () => { $('cgimg5Limit').value = '500'; $('cgimg5DryRun').checked = false; runBatch(false); };
  $('cgimg5Continue').onclick = () => runBatch(null);
  $('cgimg5Reset').onclick = () => { $('cgimg5Cursor').value = ''; saveCursor(''); setStatus('Curseur réinitialisé.'); };
}
(async () => {
  try {
    ensurePanel(); loadCursor(); bind();
    setStatus(`Prêt (${VERSION}). Conseil : commence par un dry-run de 100 à 500 questions.`, 'ok');
  } catch (error) { console.error('CGIMAGE005', error); }
})();
