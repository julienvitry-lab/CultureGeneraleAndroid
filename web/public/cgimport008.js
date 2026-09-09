// CGIMPORT008 FIX4 · contexte complet + prévisualisation CGWEB006 + import strict 1:1

const $=id=>document.getElementById(id);
let extracted=null;
let drafts=[];
let strictComplete=false;

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
function validFullQuestionnaireUrl(raw){
  try{
    const u=new URL(raw);
    const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return /(^|\.)quizypedia\.fr$/i.test(u.hostname)&&
      parts.length>=3&&norm(parts[0])==='quiz';
  }catch{return false;}
}

function sourceToDrafts(data){
  const mega=$('cgimp2Mega').value.trim();
  const theme=$('cgimp2Theme').value.trim()||data.theme||'';
  return (data.questions||[]).map(q=>({
    selected:true,
    megatheme:mega,
    theme,
    question:String(q.question||''),
    detail:String(q.detail||''),
    options:Array.isArray(q.options)?q.options.map(v=>String(v||'')):[],
    correct_index:Number(q.correct_index||0),
    url_quizypedia:data.effectiveUrl||data.requestedUrl||'',
    url_internet:'',
    image_file:'',
    non_trouve:0,
    status:'',
    is_image:0,
    fiche:String(q.source_fiche||''),
    source_number:Number(q.source_number||0)
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

function renderCounters(){
  $('cgimp2Fiches').textContent=extracted?String(extracted.fiches?.length||0):'—';
  $('cgimp2Questions').textContent=String(drafts.length||0);
  $('cgimp2Fields').textContent=String(drafts.length||0);
  $('cgimp2Selected').textContent=String(drafts.filter(q=>q.selected).length);
}

function render(){
  renderCounters();
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

async function analyze(){
  const user=currentUser();
  if(!user){status('Connecte-toi d’abord à Firebase.','err');return;}

  const url=$('cgimp2Url').value.trim();
  if(!url){status('Colle l’URL complète d’un questionnaire Quizypedia.','err');return;}
  if(!validFullQuestionnaireUrl(url)){
    status('URL complète attendue : /quiz/<thème>/<questionnaire>/.','err');
    return;
  }

  const btn=$('cgimp2Analyze');
  btn.disabled=true;
  btn.textContent='Capture…';
  status('Capture stricte 12/12 en cours…','warn');

  try{
    const token=await user.getIdToken();
    const res=await fetch('/api/quizypedia',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${token}`
      },
      body:JSON.stringify({url})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);

    extracted=data;
    strictComplete=Boolean(data.strictComplete);
    if(!$('cgimp2Theme').value.trim())$('cgimp2Theme').value=data.theme||'';

    drafts=sourceToDrafts(data);
    render();
    $('cgimp2Import').disabled=!strictComplete||!drafts.length;

    if(strictComplete){
      status(
        `✅ Capture stricte complète : ${drafts.length}/${data.fiches.length} QCM. `+
        `Aucun contenu n’a été inventé. Aucun import n’a encore eu lieu.`,
        'ok'
      );
    }else{
      const diag=(data.diagnostics||[]).slice(0,4).join(' · ');
      status(
        `⚠ Capture partielle : ${drafts.length}/${data.fiches.length}. `+
        `Import désactivé.${diag?` Diagnostic : ${diag}`:''}`,
        'err'
      );
    }
  }catch(e){
    console.error(e);
    extracted=null;drafts=[];strictComplete=false;
    render();
    $('cgimp2Import').disabled=true;
    status(`❌ Capture stricte impossible : ${e.message}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Capturer le questionnaire';
  }
}

async function importSelected(){
  if(!strictComplete){
    status('Import bloqué : la capture 1:1 n’est pas complète.','err');
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
      (skipped?`, ${skipped} doublon(s) ignoré(s)`:'')+'.',
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
  if(kicker)kicker.textContent='CGIMPORT008 FIX4 · 1:1';
  if(sub)sub.textContent=
    'Capture sûre avec contexte complet de chaque question Quizypedia : question, détail et A/B/C/D sont repris de la source sans génération.';

  if($('cgimp2Analyze'))$('cgimp2Analyze').textContent='Capturer le questionnaire';
  if($('cgimp2Rebuild'))$('cgimp2Rebuild').textContent='Appliquer mégathème/thème';

  const qSmall=$('cgimp2Questions')?.parentElement?.querySelector('small');
  const fSmall=$('cgimp2Fields')?.parentElement?.querySelector('small');
  if(qSmall)qSmall.textContent='QCM capturés';
  if(fSmall)fSmall.textContent='QCM stricts';

  status('Aucune question ni aucun distracteur n’est généré par Culture Générale.','warn');
}

function install(){
  relabelUi();
  $('cgimp2Analyze')?.addEventListener('click',analyze);
  $('cgimp2Rebuild')?.addEventListener('click',applyClassification);
  $('cgimp2All')?.addEventListener('click',()=>{
    drafts.forEach(q=>q.selected=true);render();
  });
  $('cgimp2None')?.addEventListener('click',()=>{
    drafts.forEach(q=>q.selected=false);render();
  });
  $('cgimp2Import')?.addEventListener('click',importSelected);
  render();
}
install();
