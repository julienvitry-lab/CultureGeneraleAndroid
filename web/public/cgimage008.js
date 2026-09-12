const CGIMAGE008_VERSION='CGIMAGE008_1';
const CGIMAGE008_SUGGEST=
  'https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimage008SuggestCandidates';
const CGIMAGE008_APPLY=
  'https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimage008ApplyCandidate';
const CG8_FAILED_KEY='CGIMAGE006_FAILED_IDS';

const cg8$=id=>document.getElementById(id);
const cg8sleep=ms=>new Promise(r=>setTimeout(r,ms));

function esc(v){
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}
function num(v){ return new Intl.NumberFormat('fr-FR').format(Number(v||0)); }
function loadFailedRows(){
  try{
    const rows=JSON.parse(localStorage.getItem(CG8_FAILED_KEY)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(_){
    return [];
  }
}
function failedIds(){
  return [...new Set(loadFailedRows().map(r=>String(r?.id||'').trim()).filter(Boolean))];
}
function setStatus(text,cls=''){
  const el=cg8$('cgimg8Status');
  if(!el)return;
  el.textContent=text;
  el.className='cgimg8-status '+(cls?`cgimg8-${cls}`:'');
}
async function waitUser(){
  for(let i=0;i<120;i++){
    const user=window.CGWEB001?.getUser?.();
    if(user?.getIdToken)return user;
    await cg8sleep(100);
  }
  throw new Error('Utilisateur Firebase indisponible.');
}
async function api(url,body){
  const user=await waitUser();
  const token=await user.getIdToken();
  const response=await fetch(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:`Bearer ${token}`
    },
    body:JSON.stringify(body)
  });
  const text=await response.text();
  const json=text?JSON.parse(text):{};
  if(!response.ok||!json?.ok){
    throw new Error(json?.error||`HTTP ${response.status}`);
  }
  return json;
}
function removeFailedId(id){
  const rows=loadFailedRows().filter(r=>String(r?.id||'')!==String(id));
  try{
    localStorage.setItem(CG8_FAILED_KEY,JSON.stringify(rows));
  }catch(_){}
  const count=cg8$('cgimg8Count');
  if(count) count.textContent=num(failedIds().length);
}
function render(items=[]){
  cg8$('cgimg8Count').textContent=num(failedIds().length);
  const root=cg8$('cgimg8List');
  if(!root)return;
  if(!items.length){
    root.innerHTML='<div class="cgimg8-empty">Aucune suggestion chargée.</div>';
    return;
  }

  root.innerHTML=items.map((item, idx)=>`
    <section class="cgimg8-item" id="cgimg8item-${esc(item.id)}">
      <div class="cgimg8-head">
        <div>
          <div class="cgimg8-id">ID ${esc(item.id)}</div>
          <div class="cgimg8-question">${esc(item.question||'')}</div>
          ${item.answer ? `<div class="cgimg8-answer"><b>Réponse :</b> ${esc(item.answer)}</div>` : ''}
          ${item.category ? `<div class="cgimg8-cat"><b>Catégorie :</b> ${esc(item.category)}</div>` : ''}
          ${item.urlTail ? `<div class="cgimg8-tail"><b>Indice URL :</b> ${esc(item.urlTail)}</div>` : ''}
          ${item.error ? `<div class="cgimg8-error">❌ ${esc(item.error)}</div>` : ''}
        </div>
      </div>

      <div class="cgimg8-query-wrap">
        ${(item.candidateGroups||[]).map(group=>`
          <div class="cgimg8-query">
            <div class="cgimg8-query-title">Recherche : <code>${esc(group.query)}</code></div>
            <div class="cgimg8-cands">
              ${(group.candidates||[]).map((cand, i)=>`
                <article class="cgimg8-cand">
                  <img src="${esc(cand.thumbUrl||cand.fullUrl)}" alt="${esc(cand.title)}" loading="lazy">
                  <div class="cgimg8-cand-title">${esc(cand.title)}</div>
                  <div class="cgimg8-cand-src">${esc(cand.source||'')}</div>
                  <div class="cgimg8-cand-links">
                    <a href="${esc(cand.fullUrl)}" target="_blank" rel="noopener">Image</a>
                    ${cand.sourcePage ? `<a href="${esc(cand.sourcePage)}" target="_blank" rel="noopener">Source</a>` : ''}
                  </div>
                  <button
                    class="cgimg8-use"
                    type="button"
                    data-id="${esc(item.id)}"
                    data-json="${esc(JSON.stringify(cand))}">
                    Utiliser cette image
                  </button>
                </article>
              `).join('')}
            </div>
          </div>
        `).join('')}

        ${!(item.candidateGroups||[]).length ? '<div class="cgimg8-empty">Aucun candidat automatique trouvé.</div>' : ''}
      </div>
    </section>
  `).join('');

  root.querySelectorAll('.cgimg8-use').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.id;
      const candidate=JSON.parse(btn.dataset.json||'{}');
      btn.disabled=true;
      btn.textContent='Application…';
      try{
        const result=await api(CGIMAGE008_APPLY,{id,candidate});
        removeFailedId(id);
        const section=document.getElementById(`cgimg8item-${id}`);
        if(section){
          section.classList.add('cgimg8-done');
          const banner=document.createElement('div');
          banner.className='cgimg8-saved';
          banner.textContent=`✅ Image appliquée pour ${id}`;
          section.prepend(banner);
        }
        setStatus(`✅ Image appliquée pour l’ID ${id}.`, 'ok');
      }catch(error){
        setStatus(`❌ ${error?.message||String(error)}`, 'error');
        btn.disabled=false;
        btn.textContent='Utiliser cette image';
      }
    };
  });
}
async function analyze(){
  try{
    const ids=failedIds();
    if(!ids.length){
      setStatus('Aucun ID en échec dans le journal local.','warn');
      render([]);
      return;
    }
    cg8$('cgimg8Run').disabled=true;
    setStatus(`⏳ Recherche sémantique sur ${ids.length} ID(s)…`,'warn');
    const result=await api(CGIMAGE008_SUGGEST,{ids});
    render(result.items||[]);
    const withCandidates=(result.items||[]).filter(x=>(x.candidateGroups||[]).length>0).length;
    setStatus(
      `✅ Analyse terminée. ${withCandidates} ID(s) ont au moins un candidat.`,
      withCandidates ? 'ok' : 'warn'
    );
  }catch(error){
    setStatus(`❌ ${error?.message||String(error)}`,'error');
  }finally{
    cg8$('cgimg8Run').disabled=false;
    cg8$('cgimg8Count').textContent=num(failedIds().length);
  }
}
async function install(){
  for(let i=0;i<150;i++){
    const anchor=cg8$('cgimage007Panel') || cg8$('cgimg6Journal') || cg8$('cgimage005Panel');
    if(anchor){
      if(cg8$('cgimage008Panel')) return;

      const panel=document.createElement('section');
      panel.id='cgimage008Panel';
      panel.innerHTML=`
        <style>
          #cgimage008Panel{
            margin:14px 0!important;padding:16px!important;
            background:#eff6ff!important;border:2px solid #93c5fd!important;
            border-radius:14px!important;color:#0f172a!important;
          }
          #cgimage008Panel *{color:#0f172a!important;opacity:1!important}
          .cgimg8-title{font-size:18px!important;font-weight:800!important;color:#1d4ed8!important}
          .cgimg8-sub{margin:4px 0 12px!important;font-size:13px!important;color:#334155!important}
          .cgimg8-actions{display:flex!important;gap:8px!important;flex-wrap:wrap!important}
          .cgimg8-btn{padding:9px 13px!important;border:0!important;border-radius:10px!important;background:#2563eb!important;color:#fff!important;font-weight:700!important;cursor:pointer!important}
          .cgimg8-status{margin:12px 0!important;padding:10px 12px!important;border-radius:10px!important;background:#fff!important;white-space:pre-wrap!important}
          .cgimg8-ok{background:#dcfce7!important;color:#166534!important}
          .cgimg8-warn{background:#fff7ed!important;color:#9a3412!important}
          .cgimg8-error{background:#fef2f2!important;color:#991b1b!important}
          .cgimg8-list{display:grid!important;gap:14px!important;margin-top:12px!important}
          .cgimg8-item{background:#fff!important;border:1px solid #bfdbfe!important;border-radius:12px!important;padding:12px!important}
          .cgimg8-item.cgimg8-done{border:2px solid #16a34a!important;background:#f0fdf4!important}
          .cgimg8-head{margin-bottom:8px!important}
          .cgimg8-id{font-size:12px!important;font-weight:700!important;color:#1d4ed8!important}
          .cgimg8-question{font-size:16px!important;font-weight:700!important;margin:4px 0!important}
          .cgimg8-answer,.cgimg8-cat,.cgimg8-tail{font-size:13px!important;margin-top:3px!important}
          .cgimg8-error{margin-top:6px!important;padding:8px!important;border-radius:8px!important}
          .cgimg8-query-wrap{display:grid!important;gap:10px!important}
          .cgimg8-query{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:10px!important;padding:10px!important}
          .cgimg8-query-title{font-size:12px!important;margin-bottom:8px!important}
          .cgimg8-query-title code{background:#fff!important;border:1px solid #cbd5e1!important;border-radius:6px!important;padding:2px 6px!important}
          .cgimg8-cands{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))!important;gap:10px!important}
          .cgimg8-cand{background:#fff!important;border:1px solid #cbd5e1!important;border-radius:10px!important;padding:8px!important}
          .cgimg8-cand img{display:block!important;width:100%!important;max-height:180px!important;object-fit:contain!important;background:#f8fafc!important;border-radius:8px!important}
          .cgimg8-cand-title{font-weight:700!important;font-size:13px!important;margin-top:8px!important}
          .cgimg8-cand-src{font-size:12px!important;color:#475569!important;margin:4px 0!important}
          .cgimg8-cand-links{display:flex!important;gap:8px!important;flex-wrap:wrap!important;font-size:12px!important;margin-bottom:8px!important}
          .cgimg8-use{width:100%!important;padding:8px 10px!important;border:0!important;border-radius:8px!important;background:#2563eb!important;color:#fff!important;font-weight:700!important;cursor:pointer!important}
          .cgimg8-saved{background:#dcfce7!important;border:1px solid #86efac!important;border-radius:8px!important;padding:8px!important;margin-bottom:8px!important;font-weight:700!important}
          .cgimg8-empty{background:#fff!important;border:1px dashed #cbd5e1!important;border-radius:10px!important;padding:10px!important}
        </style>
        <div class="cgimg8-title">CGIMAGE008 · Récupération sémantique des images restantes</div>
        <div class="cgimg8-sub">
          IDs actuellement en échec : <b id="cgimg8Count">0</b>.
          Recherche Commons/Wikipedia avec validation manuelle avant écriture.
        </div>
        <div class="cgimg8-actions">
          <button id="cgimg8Run" class="cgimg8-btn" type="button">Analyser les IDs échoués</button>
        </div>
        <div id="cgimg8Status" class="cgimg8-status">Prêt.</div>
        <div id="cgimg8List" class="cgimg8-list"></div>`;

      anchor.insertAdjacentElement('afterend',panel);
      cg8$('cgimg8Run').onclick=analyze;
      cg8$('cgimg8Count').textContent=num(failedIds().length);
      return;
    }
    await cg8sleep(100);
  }
}
install();
