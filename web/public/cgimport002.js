// CGIMPORT004 · aperçu import calqué sur l’écran de jeu
// CGIMPORT003 · QCM sémantique par fiche Quizypedia
// CGIMPORT002-WEB · URL Quizypedia -> fiches -> QCM -> Firestore
const $ = id => document.getElementById(id);
let extracted = null;
let drafts = [];

function apiCreate(){ return window.CGWEB010_API || null; }
function apiSearch(){ return window.CGWEB006_API || null; }
function currentUser(){ return window.CGWEB001?.getUser?.() || null; }
function status(msg, type='warn'){
  const el=$('cgimp2Status'); if(!el)return;
  el.textContent=msg; el.className=`cgimp2-status ${type}`;
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function norm(s){ return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function uniq(values){ const seen=new Set(); return values.filter(v=>{const k=norm(v); if(!k||seen.has(k))return false; seen.add(k); return true;}); }
function seededOrder(values, seed){
  let h=2166136261; for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return [...values].sort((a,b)=>{const ha=hash(h+':'+a),hb=hash(h+':'+b);return ha-hb});
}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return h;}

const NOISY = new Set(['info','position','numero','numéro','total','image','photo','lien','url']);
function questionText(label, name){
  const k=norm(label);
  const n=`« ${name} »`;
  if(/^info 1$/.test(k)) return `Que signifie ${n} ?`;
  if(/^info [0-9]+$/.test(k)) return `Quelle information correspond à ${n} ?`;
  if(k==='auteur'||k==='auteurs') return `Qui est l’auteur de ${n} ?`;
  if(k==='realisateur'||k==='réalisateur') return `Qui a réalisé ${n} ?`;
  if(k==='compositeur') return `Qui est le compositeur associé à ${n} ?`;
  if(k==='interprete'||k==='interprète') return `Quel interprète est associé à ${n} ?`;
  if(k==='acteur'||k==='actrice') return `Quel ${k} est associé à ${n} ?`;
  if(k==='capitale') return `Quelle est la capitale associée à ${n} ?`;
  if(k==='pays') return `Quel pays est associé à ${n} ?`;
  if(k==='ville') return `Quelle ville est associée à ${n} ?`;
  if(k==='nationalite'||k==='nationalité') return `Quelle est la nationalité de ${n} ?`;
  if(k==='profession') return `Quelle est la profession de ${n} ?`;
  if(k==='naissance'||k==='date de naissance') return `Quelle est la date de naissance de ${n} ?`;
  if(k==='deces'||k==='décès'||k==='date de deces'||k==='date de décès') return `Quelle est la date de décès de ${n} ?`;
  if(k==='annee'||k==='année') return `Quelle année est associée à ${n} ?`;
  if(k==='date') return `Quelle date est associée à ${n} ?`;
  if(k==='genre') return `Quel est le genre de ${n} ?`;
  if(k==='club') return `Quel club est associé à ${n} ?`;
  if(k==='equipe'||k==='équipe') return `Quelle équipe est associée à ${n} ?`;
  if(k==='sport') return `Quel sport est associé à ${n} ?`;
  if(k==='langue') return `Quelle langue est associée à ${n} ?`;
  if(k==='monnaie') return `Quelle monnaie est associée à ${n} ?`;
  if(k==='altitude') return `Quelle est l’altitude de ${n} ?`;
  if(k==='population') return `Quelle population est indiquée pour ${n} ?`;
  if(k==='superficie') return `Quelle superficie est indiquée pour ${n} ?`;
  return `Pour ${n}, quelle valeur correspond à « ${label} » ?`;
}

function semanticField(fiche,names){
  const wanted=new Set(names.map(norm));
  for(const field of fiche.fields||[]){
    const label=norm(field.label||'');
    const value=String(field.value||'').trim();
    if(value&&wanted.has(label)) return value;
  }
  return '';
}
function semanticAnswer(fiche){
  return semanticField(fiche,['Héroïne','Heroine','Personnage','Nom'])
    || String(fiche.name||'').replace(/\s*\([^)]*\)\s*$/,'').trim();
}
function semanticClueLines(fiche){
  const preferred=[
    ['Œuvre',['Œuvre','Oeuvre','Roman','Livre','Titre']],
    ['Auteur',['Auteur','Auteurs','Autrice']],
    ['Date',['Date','Année','Annee','Époque','Epoque']],
    ['Lieu',['Lieu','Pays','Ville','Région','Region']],
    ['Particularités',['Particularités','Particularites','Description','Résumé','Resume','Indices','Caractéristiques','Caracteristiques']]
  ];
  const out=[];
  const used=new Set();
  for(const [display,names] of preferred){
    const value=semanticField(fiche,names);
    if(value){out.push(`${display} : ${value}`);for(const n of names)used.add(norm(n));}
  }
  if(out.length<2){
    for(const field of fiche.fields||[]){
      const label=String(field.label||'').trim(), value=String(field.value||'').trim();
      const k=norm(label);
      if(!label||!value||used.has(k)||/^info\s+\d+$/.test(k)) continue;
      if(['heroine','personnage','nom'].includes(k)) continue;
      out.push(`${label} : ${value}`);
      if(out.length>=4) break;
    }
  }
  return out;
}
function buildSemanticDrafts(data,mega,theme){
  const fiches=data.fiches||[];
  const answers=uniq(fiches.map(semanticAnswer).filter(Boolean));
  if(answers.length<4) return [];
  const result=[];
  for(const fiche of fiches){
    const good=semanticAnswer(fiche);
    const clues=semanticClueLines(fiche);
    if(!good||clues.length<2) continue;
    const others=seededOrder(answers.filter(v=>norm(v)!==norm(good)),`cgimport003|${fiche.name}`).slice(0,3);
    if(others.length<3) continue;
    const options=seededOrder([good,...others],`cgimport003-opt|${fiche.name}`);
    const answerLabel=semanticField(fiche,['Héroïne','Heroine'])?'héroïne':'personnage';
    result.push({
      selected:true, megatheme:mega, theme,
      question:`Quelle ${answerLabel} correspond à ces indices ?\n${clues.join('\n')}`,
      detail:`Quizypedia · ${fiche.name} · ${clues.join(' · ')}`,
      options,
      correct_index:options.findIndex(v=>norm(v)===norm(good))+1,
      url_quizypedia:data.effectiveUrl||data.requestedUrl||'', url_internet:'', image_file:'', non_trouve:0, status:'', is_image:0,
      fiche:fiche.name, label:'CGIMPORT003 · fiche complète'
    });
  }
  return result;
}

function buildDrafts(data){
  const mega=$('cgimp2Mega').value.trim();
  const theme=$('cgimp2Theme').value.trim() || data.detectedTheme || '';
  const semantic=buildSemanticDrafts(data,mega,theme);
  if(semantic.length) return semantic;
  const byLabel=new Map();
  for(const f of data.fiches||[]){
    for(const field of f.fields||[]){
      const label=String(field.label||'').trim(), value=String(field.value||'').trim();
      if(!label||!value||NOISY.has(norm(label))) continue;
      const key=norm(label); if(!byLabel.has(key))byLabel.set(key,{label,items:[]});
      byLabel.get(key).items.push({fiche:f,value});
    }
  }
  const result=[];
  for(const bucket of byLabel.values()){
    const pool=uniq(bucket.items.map(x=>x.value));
    if(pool.length<4) continue;
    for(const item of bucket.items){
      const good=item.value;
      const others=seededOrder(pool.filter(v=>norm(v)!==norm(good)), item.fiche.name+'|'+bucket.label).slice(0,3);
      if(others.length<3) continue;
      const options=seededOrder([good,...others], 'opt|'+item.fiche.name+'|'+bucket.label);
      result.push({
        selected:true, megatheme:mega, theme,
        question:questionText(bucket.label,item.fiche.name),
        detail:`Quizypedia · ${item.fiche.name} · ${bucket.label}${item.fiche.fullText?` · ${item.fiche.fullText}`:''}`,
        options, correct_index:options.findIndex(v=>norm(v)===norm(good))+1,
        url_quizypedia:data.effectiveUrl||data.requestedUrl||'', url_internet:'', image_file:'', non_trouve:0, status:'', is_image:0,
        fiche:item.fiche.name, label:bucket.label
      });
    }
  }
  return result;
}

function render(){
  $('cgimp2Fiches').textContent=extracted?String(extracted.fiches?.length||0):'—';
  $('cgimp2Questions').textContent=String(drafts.length||0);
  $('cgimp2Selected').textContent=String(drafts.filter(q=>q.selected).length);
  $('cgimp2Fields').textContent=String(new Set(drafts.map(q=>norm(q.label))).size||0);
  const box=$('cgimp2List');
  if(!drafts.length){
    box.innerHTML='<div class="cgimp2-empty">Aucune question générée pour le moment.</div>';
    return;
  }

  box.innerHTML=drafts.map((q,i)=>{
    const lines=String(q.question||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    const stem=lines.shift()||'Question';
    const clues=lines.map(line=>{
      const p=line.indexOf(':');
      if(p>0){
        const label=line.slice(0,p).trim();
        const value=line.slice(p+1).trim();
        return `<div class="cgimp4-clue"><span>${esc(label)} :</span><strong>${esc(value)}</strong></div>`;
      }
      return `<div class="cgimp4-clue"><strong>${esc(line)}</strong></div>`;
    }).join('');

    return `<article class="cgimp2-card cgimp4-card" data-i="${i}">
      <div class="cgimp4-selectbar">
        <label class="cgimp4-select">
          <input type="checkbox" class="cgimp2-check" ${q.selected?'checked':''}>
          <span>Sélectionner pour import</span>
        </label>
        <div class="cgimp4-meta">${esc(q.fiche)} · ${esc(q.label||'Question générée')}</div>
      </div>

      <div class="cgimp4-game">
        <div class="cgimp4-question-panel">
          <div class="cgimp4-theme">${esc($('cgimp2Theme')?.value || extracted?.detectedTheme || 'Quizypedia')}</div>
          <div class="cgimp4-stem">${esc(stem)}</div>
          <div class="cgimp4-clues">${clues}</div>
        </div>

        <div class="cgimp4-options">
          ${q.options.map((v,j)=>`
            <div class="cgimp4-option ${j+1===q.correct_index?'cgimp4-correct':''}">
              <span class="cgimp4-letter">${'ABCD'[j]}</span>
              <span class="cgimp4-answer">${esc(v)}</span>
            </div>`).join('')}
        </div>
      </div>

      <details class="cgimp4-edit-details">
        <summary>Modifier avant import</summary>
        <div class="cgimp2-edit">
          <label class="wide">Question<textarea data-field="question" rows="5">${esc(q.question)}</textarea></label>
          ${q.options.map((v,j)=>`<label>${'ABCD'[j]}<input data-opt="${j}" value="${esc(v)}"></label>`).join('')}
          <label>Bonne réponse<select data-field="correct_index">${[1,2,3,4].map(n=>`<option value="${n}" ${n===q.correct_index?'selected':''}>${'ABCD'[n-1]}</option>`).join('')}</select></label>
          <label class="wide">Détail<textarea data-field="detail" rows="3">${esc(q.detail)}</textarea></label>
        </div>
      </details>
    </article>`;
  }).join('');

  box.querySelectorAll('.cgimp2-card').forEach(card=>{
    const i=Number(card.dataset.i),q=drafts[i];
    card.querySelector('.cgimp2-check').addEventListener('change',e=>{
      q.selected=e.target.checked;
      renderCounters();
    });
    card.querySelectorAll('[data-field]').forEach(inp=>inp.addEventListener('change',()=>{
      const f=inp.dataset.field;
      q[f]=f==='correct_index'?Number(inp.value):inp.value;
    }));
    card.querySelectorAll('[data-opt]').forEach(inp=>inp.addEventListener('change',()=>{
      q.options[Number(inp.dataset.opt)]=inp.value;
    }));
  });
}
function renderCounters(){ $('cgimp2Selected').textContent=String(drafts.filter(q=>q.selected).length); }

async function analyze(){
  const user=currentUser(); if(!user){status('Connecte-toi d’abord à Firebase.','err');return;}
  const url=$('cgimp2Url').value.trim(); if(!url){status('Colle une URL Quizypedia.','err');return;}
  const btn=$('cgimp2Analyze'); btn.disabled=true; btn.textContent='Analyse…'; status('Téléchargement et analyse de Quizypedia…','warn');
  try{
    const token=await user.getIdToken();
    const res=await fetch('/api/quizypedia',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({url})});
    const data=await res.json().catch(()=>({})); if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);
    extracted=data;
    if(!$('cgimp2Theme').value.trim()) $('cgimp2Theme').value=data.detectedTheme||'';
    drafts=buildDrafts(data); render();
    $('cgimp2Import').disabled=!drafts.length;
    status(`✅ ${data.fiches.length} fiche(s) extraite(s), ${drafts.length} question(s) générée(s). Aucun import n’a encore eu lieu.`,'ok');
  }catch(e){console.error(e);extracted=null;drafts=[];render();$('cgimp2Import').disabled=true;status(`❌ Analyse impossible : ${e.message}`,'err');}
  finally{btn.disabled=false;btn.textContent='Analyser l’URL';}
}

async function importSelected(){
  const create=apiCreate(); if(!create?.create){status('API de création Firestore indisponible.','err');return;}
  const selected=drafts.filter(q=>q.selected); if(!selected.length){status('Aucune question sélectionnée.','err');return;}
  if(!confirm(`Importer ${selected.length} question(s) dans Firestore ?\n\nAndroid les recevra ensuite par la synchronisation Cloud.`))return;
  const btn=$('cgimp2Import'); btn.disabled=true; btn.textContent='Import…'; let created=0,skipped=0;
  try{
    const base=Date.now()*1000;
    for(let i=0;i<selected.length;i++){
      const q=selected[i]; status(`Import ${i+1}/${selected.length}…`,'warn');
      if($('cgimp2SkipDuplicates').checked && apiSearch()?.questionPrefix){
        const hits=await apiSearch().questionPrefix(q.question,20);
        if(hits.some(h=>norm(h.question)===norm(q.question))){skipped++;continue;}
      }
      await create.create({requested_id:String(base+i),megatheme:q.megatheme,theme:q.theme,question:q.question,detail:q.detail,proposition_a:q.options[0],proposition_b:q.options[1],proposition_c:q.options[2],proposition_d:q.options[3],correct_index:Number(q.correct_index),url_quizypedia:q.url_quizypedia,url_internet:'',image_file:'',non_trouve:0,status:'',is_image:0});
      created++;
    }
    status(`✅ Import terminé : ${created} créée(s)${skipped?`, ${skipped} doublon(s) ignoré(s)`:''}.`,'ok');
  }catch(e){console.error(e);status(`❌ Import interrompu après ${created} création(s) : ${e.message}`,'err');}
  finally{btn.disabled=false;btn.textContent='Importer les questions sélectionnées';}
}

function install(){
  $('cgimp2Analyze')?.addEventListener('click',analyze);
  $('cgimp2Rebuild')?.addEventListener('click',()=>{if(!extracted)return;drafts=buildDrafts(extracted);render();$('cgimp2Import').disabled=!drafts.length;status('Questions régénérées avec le mégathème/thème indiqué.','ok');});
  $('cgimp2All')?.addEventListener('click',()=>{drafts.forEach(q=>q.selected=true);render();});
  $('cgimp2None')?.addEventListener('click',()=>{drafts.forEach(q=>q.selected=false);render();});
  $('cgimp2Import')?.addEventListener('click',importSelected);
  render();
}
install();
