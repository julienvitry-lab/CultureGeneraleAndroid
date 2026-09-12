const CGIMAGE007_VERSION='CGIMAGE007_1';
const CGIMAGE007_ENDPOINT=
  'https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimage007RecoverFailed';

const cg7$=id=>document.getElementById(id);
const cg7sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CG7_FAILED_KEY='CGIMAGE006_FAILED_IDS';
const CG7_LAST_RESULT='CGIMAGE007_LAST_RESULT';

function cg7Esc(v){
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}
function cg7Number(v){
  return new Intl.NumberFormat('fr-FR').format(Number(v||0));
}
async function cg7WaitUser(){
  for(let i=0;i<120;i++){
    const user=window.CGWEB001?.getUser?.();
    if(user?.getIdToken)return user;
    await cg7sleep(100);
  }
  throw new Error('Utilisateur Firebase indisponible.');
}
function cg7LoadFailed(){
  try{
    const rows=JSON.parse(localStorage.getItem(CG7_FAILED_KEY)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch{
    return [];
  }
}
function cg7UniqueIds(){
  return [...new Set(
    cg7LoadFailed().map(r=>String(r?.id||'').trim()).filter(Boolean)
  )];
}
function cg7SetStatus(text,cls=''){
  const el=cg7$('cgimg7Status');
  if(!el)return;
  el.textContent=text;
  el.className='cgimg7-status '+(cls?`cgimg7-${cls}`:'');
}
function cg7Render(result=null){
  const ids=cg7UniqueIds();
  const stats=result?.stats||{};
  cg7$('cgimg7Count').textContent=cg7Number(ids.length);

  cg7$('cgimg7Meta').innerHTML=`
    <div><span>IDs journalisés</span><strong>${cg7Number(ids.length)}</strong></div>
    <div><span>Demandés</span><strong>${cg7Number(stats.requested)}</strong></div>
    <div><span>Récupérés</span><strong>${cg7Number(stats.recovered)}</strong></div>
    <div><span>Déjà Cloud</span><strong>${cg7Number(stats.alreadyCloud)}</strong></div>
    <div><span>Irrécupérables</span><strong>${cg7Number(stats.failed)}</strong></div>`;

  const cards=[];
  for(const row of result?.recovered||[]){
    cards.push(`
      <article class="cgimg7-card ok">
        <b>✅ ${cg7Esc(row.id)}</b>
        <div>Méthode : ${cg7Esc(row.method)}</div>
        <div>${cg7Esc(row.recoveredUrl)}</div>
      </article>`);
  }
  for(const row of result?.failed||[]){
    cards.push(`
      <article class="cgimg7-card bad">
        <b>❌ ${cg7Esc(row.id)}</b>
        <div>${cg7Esc(row.error)}</div>
      </article>`);
  }
  cg7$('cgimg7List').innerHTML=
    cards.length?cards.join(''):'<div class="cgimg7-empty">Aucun résultat encore.</div>';
}
async function cg7Recover(){
  try{
    const ids=cg7UniqueIds();
    if(!ids.length){
      cg7SetStatus('Aucun ID échoué dans le journal CGIMAGE006.','warn');
      return;
    }

    const user=await cg7WaitUser();
    cg7$('cgimg7Run').disabled=true;
    cg7SetStatus(`⏳ Récupération de ${ids.length} ID(s)…`,'warn');

    const token=await user.getIdToken();
    const response=await fetch(CGIMAGE007_ENDPOINT,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        authorization:`Bearer ${token}`
      },
      body:JSON.stringify({ids})
    });

    const text=await response.text();
    const result=text?JSON.parse(text):{};
    if(!response.ok||!result?.ok){
      throw new Error(result?.error||`HTTP ${response.status}`);
    }

    try{
      localStorage.setItem(CG7_LAST_RESULT,JSON.stringify(result));
    }catch(_){}

    // Retirer du journal CGIMAGE006 uniquement les IDs réellement récupérés
    // ou déjà présents dans le Cloud.
    const done=new Set([
      ...(result.recovered||[]).map(r=>String(r.id)),
      ...(result.alreadyCloud||[]).map(r=>String(r.id))
    ]);

    if(done.size){
      const old=cg7LoadFailed();
      const next=old.filter(r=>!done.has(String(r?.id||'')));
      try{
        localStorage.setItem(CG7_FAILED_KEY,JSON.stringify(next));
      }catch(_){}
    }

    cg7Render(result);

    cg7SetStatus(
      `✅ Récupération ciblée terminée.\n`+
      `Récupérés : ${result.stats?.recovered||0} · `+
      `Déjà Cloud : ${result.stats?.alreadyCloud||0} · `+
      `Irrécupérables : ${result.stats?.failed||0}`,
      result.stats?.failed?'warn':'ok'
    );

  }catch(error){
    cg7SetStatus(`❌ ${error?.message||String(error)}`,'error');
  }finally{
    cg7$('cgimg7Run').disabled=false;
  }
}
async function cg7Install(){
  for(let i=0;i<150;i++){
    const anchor=cg7$('cgimg6Journal')||cg7$('cgimage005Panel');
    if(anchor){
      if(cg7$('cgimage007Panel'))return;

      const panel=document.createElement('section');
      panel.id='cgimage007Panel';
      panel.innerHTML=`
        <style>
          #cgimage007Panel{
            margin:14px 0!important;padding:16px!important;
            background:#f0fdf4!important;border:2px solid #86efac!important;
            border-radius:14px!important;color:#111827!important;
          }
          #cgimage007Panel *{color:#111827!important;opacity:1!important}
          .cgimg7-title{font-size:18px!important;font-weight:800!important;color:#166534!important}
          .cgimg7-sub{margin:4px 0 12px!important;font-size:13px!important;color:#374151!important}
          .cgimg7-actions{display:flex!important;gap:8px!important;flex-wrap:wrap!important}
          .cgimg7-btn{padding:9px 13px!important;border:0!important;border-radius:10px!important;background:#16a34a!important;color:#fff!important;font-weight:700!important;cursor:pointer!important}
          .cgimg7-status{margin:12px 0!important;padding:10px 12px!important;border-radius:10px!important;background:#fff!important;white-space:pre-wrap!important}
          .cgimg7-ok{background:#dcfce7!important;color:#166534!important}
          .cgimg7-warn{background:#fff7ed!important;color:#9a3412!important}
          .cgimg7-error{background:#fef2f2!important;color:#991b1b!important}
          .cgimg7-meta{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))!important;gap:8px!important}
          .cgimg7-meta>div{background:#fff!important;border:1px solid #bbf7d0!important;border-radius:10px!important;padding:8px 10px!important}
          .cgimg7-meta span{display:block!important;font-size:11px!important;color:#64748b!important}
          .cgimg7-meta strong{font-size:18px!important;color:#111827!important}
          .cgimg7-list{display:grid!important;gap:8px!important;margin-top:12px!important}
          .cgimg7-card{background:#fff!important;border-radius:10px!important;padding:9px 10px!important;font-size:13px!important;word-break:break-word!important}
          .cgimg7-card.ok{border:1px solid #86efac!important}
          .cgimg7-card.bad{border:1px solid #fca5a5!important}
          .cgimg7-empty{background:#fff!important;border:1px solid #bbf7d0!important;border-radius:10px!important;padding:9px 10px!important}
        </style>
        <div class="cgimg7-title">CGIMAGE007 · Récupération ciblée des 404</div>
        <div class="cgimg7-sub">
          IDs actuellement journalisés : <b id="cgimg7Count">0</b>.
          Tentatives directes + variantes Quizypedia + Wayback Machine.
        </div>
        <div class="cgimg7-actions">
          <button id="cgimg7Run" class="cgimg7-btn" type="button">
            Récupérer les IDs échoués
          </button>
        </div>
        <div id="cgimg7Status" class="cgimg7-status">Prêt.</div>
        <div id="cgimg7Meta" class="cgimg7-meta"></div>
        <div id="cgimg7List" class="cgimg7-list"></div>`;

      anchor.insertAdjacentElement('afterend',panel);

      cg7$('cgimg7Run').onclick=cg7Recover;

      let last=null;
      try{
        last=JSON.parse(localStorage.getItem(CG7_LAST_RESULT)||'null');
      }catch(_){}
      cg7Render(last);
      return;
    }
    await cg7sleep(100);
  }
}
cg7Install();
