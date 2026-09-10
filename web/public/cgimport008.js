// CGIMPORT009 · import d'un thème Quizypedia complet
// URL thème -> découverte des questionnaires -> capture séquentielle 1:1 -> import unique.
// Le moteur individuel reste strictement verbatim : aucun contenu QCM n'est inventé.

const $=id=>document.getElementById(id);
const CGIMPORT009_ENDPOINT =
  'https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimport002Quizypedia';

let extracted=null;
let drafts=[];
let strictComplete=false;
let batchMode=false;
let questionnaires=[];
let batchBusy=false;

function apiCreate(){return window.CGWEB010_API||null;}
function apiSearch(){return window.CGWEB006_API||null;}
function currentUser(){return window.CGWEB001?.getUser?.()||null;}
function status(msg,type='warn'){
  const el=$('cgimp2Status'); if(!el)return;
  el.textContent=msg; el.className=`cgimp2-status ${type}`;
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function norm(s){
  return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function canonicalUrl(raw){
  try{
    const u=new URL(raw);
    u.hash='';
    return u.toString().replace(/\/+$/,'/');
  }catch{return String(raw||'');}
}
function parseQuizypediaUrl(raw){
  try{
    const u=new URL(raw);
    if(!/(^|\.)quizypedia\.fr$/i.test(u.hostname))return null;
    const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    if(parts.length<2||norm(parts[0])!=='quiz')return null;
    return {
      kind:parts.length>=3?'questionnaire':'theme',
      theme:String(parts[1]||'').trim()
    };
  }catch{return null;}
}
async function apiCall(body){
  const user=currentUser();
  if(!user)throw new Error('Connecte-toi d’abord à Firebase.');
  const token=await user.getIdToken();
  const res=await fetch(CGIMPORT009_ENDPOINT,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${token}`
    },
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

function sourceToDrafts(data,questionnaireMeta=null){
  const mega=$('cgimp2Mega').value.trim();
  const theme=$('cgimp2Theme').value.trim()||data.theme||'';
  const sourceUrl=canonicalUrl(data.effectiveUrl||data.requestedUrl||'');
  return (data.questions||[]).map(q=>({
    selected:questionnaireMeta?Boolean(questionnaireMeta.selected):true,
    megatheme:mega,
    theme,
    question:String(q.question||''),
    detail:String(q.detail||''),
    options:Array.isArray(q.options)?q.options.map(v=>String(v||'')):[],
    correct_index:Number(q.correct_index||0),
    url_quizypedia:sourceUrl,
    url_internet:'',
    image_file:'',
    non_trouve:0,
    status:'',
    is_image:0,
    fiche:String(q.source_fiche||''),
    source_number:Number(q.source_number||0),
    questionnaire_title:String(data.questionnaire||questionnaireMeta?.title||''),
    questionnaire_url:sourceUrl,
    strict_source:true
  })).filter(q=>
    q.question&&q.options.length===4&&q.options.every(Boolean)&&
    q.correct_index>=1&&q.correct_index<=4
  );
}

function applyClassification(){
  const mega=$('cgimp2Mega').value.trim();
  const theme=$('cgimp2Theme').value.trim()||extracted?.theme||'';
  drafts.forEach(q=>{q.megatheme=mega;q.theme=theme;});
  render();
  status('Mégathème / thème appliqués. Le contenu Quizypedia reste inchangé.','ok');
}

function batchSelectedItems(){
  return questionnaires.filter(q=>q.selected);
}
function batchStrictComplete(){
  const targets=batchSelectedItems();
  return targets.length>0&&targets.every(q=>q.state==='ok');
}
function updateImportAvailability(){
  if(batchMode)strictComplete=batchStrictComplete();
  $('cgimp2Import').disabled=!strictComplete||!drafts.some(q=>q.selected);
}
function aggregateFiches(){
  if(!batchMode)return extracted?.fiches?.length??null;
  return questionnaires.reduce((sum,q)=>sum+(Number(q.expected)||0),0);
}
function strictQuestionCount(){
  if(!batchMode)return drafts.length;
  const okUrls=new Set(
    questionnaires.filter(q=>q.state==='ok').map(q=>canonicalUrl(q.url))
  );
  return drafts.filter(q=>okUrls.has(canonicalUrl(q.questionnaire_url))).length;
}
function renderCounters(){
  const fiches=aggregateFiches();
  $('cgimp2Fiches').textContent=fiches===null?'—':String(fiches);
  $('cgimp2Questions').textContent=String(drafts.length||0);
  $('cgimp2Fields').textContent=String(strictQuestionCount()||0);
  $('cgimp2Selected').textContent=String(drafts.filter(q=>q.selected).length);
}

function ensureBatchUi(){
  let el=$('cgimp9Batch');
  if(el)return el;

  el=document.createElement('section');
  el.id='cgimp9Batch';
  el.className='cgimp9-batch';
  el.hidden=true;
  $('cgimp2Status').insertAdjacentElement('afterend',el);

  if(!$('cgimp9Style')){
    const style=document.createElement('style');
    style.id='cgimp9Style';
    style.textContent=`
      .cgimp9-batch{margin:14px 0 4px;padding:14px;border:1px solid rgba(111,214,255,.24);
        border-radius:14px;background:rgba(3,25,45,.38)}
      .cgimp9-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
        flex-wrap:wrap;margin-bottom:9px}
      .cgimp9-title{font-weight:900;font-size:15px}
      .cgimp9-summary{font-size:12px;color:#b9d8ea}
      .cgimp9-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .cgimp9-actions button{border:1px solid rgba(255,255,255,.22);border-radius:9px;
        padding:7px 11px;background:#174b6c;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      .cgimp9-actions button.primary{background:#57d4ff;color:#061521;border-color:#57d4ff}
      .cgimp9-actions button:disabled{opacity:.45;cursor:not-allowed}
      .cgimp9-list{display:grid;gap:7px}
      .cgimp9-row{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:9px;
        padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.055)}
      .cgimp9-row input{width:auto!important;margin-top:3px!important}
      .cgimp9-name{font-size:13px;font-weight:800}
      .cgimp9-url{font-size:11px;color:#9fc7de;overflow-wrap:anywhere;margin-top:2px}
      .cgimp9-diag{font-size:11px;color:#ffb6b6;margin-top:3px}
      .cgimp9-badge{white-space:nowrap;border-radius:999px;padding:4px 8px;font-size:11px;
        background:#234f6d;color:#d8eaf5}
      .cgimp9-badge.running{background:#725b18;color:#fff0a6}
      .cgimp9-badge.ok{background:#176342;color:#9effc8}
      .cgimp9-badge.partial,.cgimp9-badge.error{background:#6f2831;color:#ffc0c7}
      @media(max-width:760px){.cgimp9-row{grid-template-columns:auto 1fr}.cgimp9-badge{grid-column:2}}
    `;
    document.head.appendChild(style);
  }
  return el;
}

function stateLabel(q){
  if(q.state==='running')return 'Capture…';
  if(q.state==='ok')return `${q.captured||0}/${q.expected||q.captured||0}`;
  if(q.state==='partial')return `${q.captured||0}/${q.expected||'?'}`;
  if(q.state==='error')return 'Erreur';
  return 'À capturer';
}

function renderBatch(){
  const el=ensureBatchUi();
  if(!batchMode){
    el.hidden=true;
    el.innerHTML='';
    return;
  }
  el.hidden=false;

  const total=questionnaires.length;
  const selected=batchSelectedItems().length;
  const done=questionnaires.filter(q=>q.state==='ok').length;
  const failures=questionnaires.filter(q=>['partial','error'].includes(q.state)).length;

  el.innerHTML=`
    <div class="cgimp9-head">
      <div class="cgimp9-title">Questionnaires détectés</div>
      <div class="cgimp9-summary">${done}/${total} terminés · ${selected} sélectionné(s) · ${failures} en échec</div>
    </div>
    <div class="cgimp9-actions">
      <button type="button" id="cgimp9All">Tout sélectionner</button>
      <button type="button" id="cgimp9None">Tout désélectionner</button>
      <button type="button" class="primary" id="cgimp9Capture" ${batchBusy||selected===0?'disabled':''}>
        Capturer les questionnaires sélectionnés
      </button>
      <button type="button" id="cgimp9Retry" ${
        batchBusy||!questionnaires.some(q=>q.selected&&['partial','error'].includes(q.state))
          ?'disabled':''
      }>Réessayer les échecs</button>
    </div>
    <div class="cgimp9-list">
      ${questionnaires.map((q,i)=>`
        <div class="cgimp9-row" data-i="${i}">
          <input type="checkbox" class="cgimp9-check" ${q.selected?'checked':''} ${batchBusy?'disabled':''}>
          <div>
            <div class="cgimp9-name">${esc(q.title)}</div>
            <div class="cgimp9-url">${esc(q.url)}</div>
            ${q.diagnostic?`<div class="cgimp9-diag">${esc(q.diagnostic)}</div>`:''}
          </div>
          <span class="cgimp9-badge ${esc(q.state||'pending')}">${esc(stateLabel(q))}</span>
        </div>
      `).join('')}
    </div>
  `;

  $('cgimp9All')?.addEventListener('click',()=>{
    questionnaires.forEach(q=>q.selected=true);
    drafts.forEach(q=>q.selected=true);
    renderBatch();render();updateImportAvailability();
  });
  $('cgimp9None')?.addEventListener('click',()=>{
    questionnaires.forEach(q=>q.selected=false);
    drafts.forEach(q=>q.selected=false);
    renderBatch();render();updateImportAvailability();
  });
  $('cgimp9Capture')?.addEventListener('click',()=>captureBatch(false));
  $('cgimp9Retry')?.addEventListener('click',()=>captureBatch(true));

  el.querySelectorAll('.cgimp9-row').forEach(row=>{
    const i=Number(row.dataset.i);
    row.querySelector('.cgimp9-check')?.addEventListener('change',e=>{
      const q=questionnaires[i];
      q.selected=e.target.checked;
      const key=canonicalUrl(q.url);
      drafts
        .filter(d=>canonicalUrl(d.questionnaire_url)===key)
        .forEach(d=>d.selected=q.selected);
      renderBatch();render();updateImportAvailability();
    });
  });
}

function render(){
  renderCounters();
  renderBatch();
  const box=$('cgimp2List');

  if(!drafts.length){
    box.innerHTML='<div class="cgimp2-empty">Aucun QCM Quizypedia capturé pour le moment.</div>';
    return;
  }

  box.innerHTML=drafts.map((q,i)=>`
    <article class="cgimp8-card" data-i="${i}">
      <div class="cgimp8-card-top">
        <label class="cgimp8-lot">
          <input type="checkbox" class="cgimp2-check" ${q.selected?'checked':''}>
          <span>Lot</span>
        </label>
        <button type="button" class="cgimp8-modify">Modifier</button>
      </div>

      <div class="cgimp8-source">Quizypedia · ${esc(q.fiche||`Fiche ${q.source_number||''}`)}</div>
      <div class="cgimp8-category">${esc(q.megatheme||'—')} &gt; ${esc(q.theme||'—')}</div>

      <div class="cgimp8-question">${esc(q.question)}</div>
      ${q.detail?`<div class="cgimp8-detail">${esc(q.detail).replace(/\n/g,'<br>')}</div>`:''}

      <div class="cgimp8-options">
        ${q.options.map((v,j)=>`
          <div class="cgimp8-option ${j+1===q.correct_index?'cgimp8-correct':''}">
            <strong>${'ABCD'[j]}.</strong>&nbsp;<span>${esc(v)}</span>
          </div>
        `).join('')}
      </div>

      <div class="cgimp8-footer">
        <span>Réponse : ${q.correct_index}</span>
        <span>Source : Quizypedia 1:1</span>
        ${q.questionnaire_title?`<span>Questionnaire : ${esc(q.questionnaire_title)}</span>`:''}
      </div>

      <details class="cgimp8-editor">
        <summary>Modifier avant import</summary>
        <div class="cgimp2-edit">
          <label class="wide">Question
            <textarea data-field="question" rows="3">${esc(q.question)}</textarea>
          </label>
          <label class="wide">Détail
            <textarea data-field="detail" rows="4">${esc(q.detail)}</textarea>
          </label>
          ${q.options.map((v,j)=>`
            <label>${'ABCD'[j]}
              <input data-opt="${j}" value="${esc(v)}">
            </label>
          `).join('')}
          <label>Bonne réponse
            <select data-field="correct_index">
              ${[1,2,3,4].map(n=>`
                <option value="${n}" ${n===q.correct_index?'selected':''}>
                  ${'ABCD'[n-1]}
                </option>
              `).join('')}
            </select>
          </label>
        </div>
      </details>
    </article>
  `).join('');

  box.querySelectorAll('.cgimp8-card').forEach(card=>{
    const i=Number(card.dataset.i),q=drafts[i];
    const editor=card.querySelector('.cgimp8-editor');

    card.querySelector('.cgimp8-modify').addEventListener('click',()=>{
      editor.open=!editor.open;
      if(editor.open)editor.scrollIntoView({behavior:'smooth',block:'nearest'});
    });

    card.querySelector('.cgimp2-check').addEventListener('change',e=>{
      q.selected=e.target.checked;
      renderCounters();
      updateImportAvailability();
    });

    card.querySelectorAll('[data-field]').forEach(inp=>{
      inp.addEventListener('change',()=>{
        const f=inp.dataset.field;
        q[f]=f==='correct_index'?Number(inp.value):inp.value;
      });
    });

    card.querySelectorAll('[data-opt]').forEach(inp=>{
      inp.addEventListener('change',()=>{
        q.options[Number(inp.dataset.opt)]=inp.value;
      });
    });
  });
}

function replaceDraftsForQuestionnaire(data,item){
  const key=canonicalUrl(data.effectiveUrl||data.requestedUrl||item.url);
  drafts=drafts.filter(d=>canonicalUrl(d.questionnaire_url)!==key);
  drafts.push(...sourceToDrafts(data,item));
}

async function captureQuestionnaireItem(item,index,total){
  item.state='running';
  item.diagnostic='';
  renderBatch();
  status(`Questionnaire ${index}/${total} : ${item.title}…`,'warn');

  try{
    const data=await apiCall({mode:'capture',url:item.url});
    item.expected=Number(data.fiches?.length||0);
    item.captured=Number(data.questions?.length||0);
    item.diagnostic=(data.diagnostics||[]).slice(0,2).join(' · ');
    item.state=data.strictComplete?'ok':'partial';
    item.url=canonicalUrl(data.effectiveUrl||item.url);
    replaceDraftsForQuestionnaire(data,item);
    return Boolean(data.strictComplete);
  }catch(e){
    console.error('CGIMPORT009 questionnaire',item.title,e);
    item.state='error';
    item.diagnostic=e.message;
    item.captured=0;
    return false;
  }finally{
    render();
  }
}

async function captureBatch(onlyFailures=false){
  if(batchBusy)return;
  const targets=questionnaires.filter(q=>
    q.selected&&(!onlyFailures||['partial','error'].includes(q.state))
  );
  if(!targets.length){
    status(onlyFailures?'Aucun questionnaire en échec à réessayer.':'Aucun questionnaire sélectionné.','err');
    return;
  }

  batchBusy=true;
  strictComplete=false;
  updateImportAvailability();
  renderBatch();

  let ok=0;
  for(let i=0;i<targets.length;i++){
    const success=await captureQuestionnaireItem(targets[i],i+1,targets.length);
    if(success)ok++;
    // Petit intervalle entre deux Chromium pour éviter les pics de ressources.
    if(i<targets.length-1)await sleep(600);
  }

  batchBusy=false;
  strictComplete=batchStrictComplete();
  updateImportAvailability();
  render();

  const selected=batchSelectedItems();
  const failed=selected.filter(q=>q.state!=='ok');
  if(!failed.length){
    status(
      `✅ Thème capturé : ${selected.length}/${selected.length} questionnaire(s), `+
      `${drafts.filter(q=>q.selected).length} QCM stricts. Aucun import n’a encore eu lieu.`,
      'ok'
    );
  }else{
    status(
      `⚠ Capture du thème incomplète : ${selected.length-failed.length}/${selected.length} questionnaire(s) complets. `+
      `${failed.length} à réessayer. Les captures réussies sont conservées ; import global désactivé.`,
      'err'
    );
  }
}

async function captureDirect(url){
  const btn=$('cgimp2Analyze');
  btn.disabled=true;
  btn.textContent='Capture…';
  status('Capture stricte du questionnaire en cours…','warn');

  try{
    const data=await apiCall({mode:'capture',url});
    extracted=data;
    batchMode=false;
    questionnaires=[];
    strictComplete=Boolean(data.strictComplete);
    if(!$('cgimp2Theme').value.trim())$('cgimp2Theme').value=data.theme||'';
    drafts=sourceToDrafts(data);
    render();
    updateImportAvailability();

    if(strictComplete){
      status(
        `✅ Capture stricte complète : ${drafts.length}/${data.fiches.length} QCM. `+
        `Aucun contenu n’a été inventé. Aucun import n’a encore eu lieu.`,
        'ok'
      );
    }else{
      const diag=(data.diagnostics||[]).slice(0,4).join(' · ');
      status(
        `⚠ Capture partielle : ${drafts.length}/${data.fiches.length}. Import désactivé.`+
        (diag?` Diagnostic : ${diag}`:''),
        'err'
      );
    }
  }catch(e){
    console.error(e);
    extracted=null;drafts=[];strictComplete=false;
    render();updateImportAvailability();
    status(`❌ Capture stricte impossible : ${e.message}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Analyser l’URL';
  }
}

async function discoverTheme(url){
  const btn=$('cgimp2Analyze');
  btn.disabled=true;
  btn.textContent='Découverte…';
  status('Recherche des questionnaires appartenant à ce thème Quizypedia…','warn');

  try{
    const data=await apiCall({mode:'discover',url});
    extracted={theme:data.theme,fiches:[]};
    batchMode=true;
    drafts=[];
    strictComplete=false;
    if(!$('cgimp2Theme').value.trim())$('cgimp2Theme').value=data.theme||'';

    questionnaires=(data.questionnaires||[]).map((q,i)=>({
      id:i+1,
      title:String(q.title||q.label||`Questionnaire ${i+1}`),
      url:canonicalUrl(q.url),
      selected:true,
      state:'pending',
      expected:0,
      captured:0,
      diagnostic:''
    }));

    render();
    updateImportAvailability();

    if(!questionnaires.length){
      status('❌ Aucun questionnaire appartenant à ce thème n’a été détecté.','err');
      return;
    }

    status(
      `✅ ${questionnaires.length} questionnaire(s) détecté(s). `+
      `Ils sont tous sélectionnés par défaut ; lance maintenant la capture en lot.`,
      'ok'
    );
  }catch(e){
    console.error(e);
    extracted=null;drafts=[];questionnaires=[];batchMode=false;strictComplete=false;
    render();updateImportAvailability();
    status(`❌ Découverte du thème impossible : ${e.message}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Analyser l’URL';
  }
}

async function analyze(){
  const url=$('cgimp2Url').value.trim();
  if(!url){
    status('Colle l’URL d’un thème ou d’un questionnaire Quizypedia.','err');
    return;
  }
  const parsed=parseQuizypediaUrl(url);
  if(!parsed){
    status(
      'URL attendue : https://www.quizypedia.fr/quiz/<thème>/ '+
      'ou https://www.quizypedia.fr/quiz/<thème>/<questionnaire>/.',
      'err'
    );
    return;
  }

  if(parsed.kind==='theme')await discoverTheme(url);
  else await captureDirect(url);
}

async function importSelected(){
  if(!strictComplete){
    status(
      batchMode
        ?'Import bloqué : tous les questionnaires sélectionnés doivent être capturés complètement.'
        :'Import bloqué : la capture 1:1 n’est pas complète.',
      'err'
    );
    return;
  }

  const create=apiCreate();
  if(!create?.create){
    status('API de création Firestore indisponible.','err');
    return;
  }

  const selected=drafts.filter(q=>q.selected);
  if(!selected.length){status('Aucune question sélectionnée.','err');return;}

  if(!confirm(
    `Importer ${selected.length} QCM Quizypedia 1:1 ?\n\n`+
    `Seuls les ID Culture Générale seront nouveaux.`
  ))return;

  const btn=$('cgimp2Import');
  btn.disabled=true;
  btn.textContent='Import…';
  let created=0,skipped=0;

  try{
    const base=Date.now()*1000;
    for(let i=0;i<selected.length;i++){
      const q=selected[i];
      status(`Import ${i+1}/${selected.length}…`,'warn');

      if($('cgimp2SkipDuplicates').checked&&apiSearch()?.questionPrefix){
        const hits=await apiSearch().questionPrefix(q.question,50);
        const duplicate=hits.some(h=>
          norm(h.question)===norm(q.question)&&
          norm(h.detail||'')===norm(q.detail||'')
        );
        if(duplicate){skipped++;continue;}
      }

      await create.create({
        requested_id:String(base+i),
        megatheme:q.megatheme,
        theme:q.theme,
        question:q.question,
        detail:q.detail,
        proposition_a:q.options[0],
        proposition_b:q.options[1],
        proposition_c:q.options[2],
        proposition_d:q.options[3],
        correct_index:Number(q.correct_index),
        url_quizypedia:q.url_quizypedia,
        url_internet:'',
        image_file:'',
        non_trouve:0,
        status:'',
        is_image:0
      });
      created++;
    }

    status(
      `✅ Import terminé : ${created} créée(s)`+
      (skipped?`, ${skipped} doublon(s) exact(s) ignoré(s)`:'')+'.',
      'ok'
    );
  }catch(e){
    console.error(e);
    status(`❌ Import interrompu après ${created} création(s) : ${e.message}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Importer les questions sélectionnées';
  }
}

function relabelUi(){
  const panel=$('cgimport002Panel');
  if(!panel)return;
  const kicker=panel.querySelector('.cgimp2-kicker');
  const sub=panel.querySelector('.cgimp2-sub');

  if(kicker)kicker.textContent='CGIMPORT009 · THÈME COMPLET · 1:1';
  if(sub)sub.textContent=
    'Collez l’URL d’un thème Quizypedia pour détecter tous ses questionnaires, puis les capturer en lot. '+
    'Une URL de questionnaire reste compatible. Aucun contenu QCM n’est inventé.';

  if($('cgimp2Analyze'))$('cgimp2Analyze').textContent='Analyser l’URL';
  if($('cgimp2Rebuild'))$('cgimp2Rebuild').textContent='Appliquer mégathème/thème';
  if($('cgimp2Url')){
    $('cgimp2Url').placeholder='https://www.quizypedia.fr/quiz/<thème>/';
  }

  const qSmall=$('cgimp2Questions')?.parentElement?.querySelector('small');
  const fSmall=$('cgimp2Fields')?.parentElement?.querySelector('small');
  if(qSmall)qSmall.textContent='QCM capturés';
  if(fSmall)fSmall.textContent='QCM stricts';

  ensureBatchUi();
  status(
    'URL de thème = découverte de tous les questionnaires. URL complète = capture d’un seul questionnaire.',
    'warn'
  );
}

function install(){
  relabelUi();
  $('cgimp2Analyze')?.addEventListener('click',analyze);
  $('cgimp2Rebuild')?.addEventListener('click',applyClassification);

  $('cgimp2All')?.addEventListener('click',()=>{
    drafts.forEach(q=>q.selected=true);
    render();updateImportAvailability();
  });
  $('cgimp2None')?.addEventListener('click',()=>{
    drafts.forEach(q=>q.selected=false);
    render();updateImportAvailability();
  });
  $('cgimp2Import')?.addEventListener('click',importSelected);

  render();
  updateImportAvailability();
}
install();
