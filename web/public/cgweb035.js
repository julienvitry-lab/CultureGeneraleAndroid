const CGWEB035_VERSION='CGWEB035_FIX2_LEARNING_HUB002';
const CG35_END='https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb032Search';
const cg35$=id=>document.getElementById(id);
const cg35Esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cg35Fmt=v=>new Intl.NumberFormat('fr-FR').format(Number(v||0));
const cg35Count=(n,singular,plural=singular+'s')=>`${cg35Fmt(n)} ${Number(n)===1?singular:plural}`;
const cg35QuestionCount=n=>cg35Count(n,'question');
const cg35ResponseCount=n=>cg35Count(n,'réponse');
const cg35ErrorCount=n=>cg35Count(n,'erreur');
const cg35PriorityCount=n=>cg35Count(n,'prioritaire','prioritaires');
const cg35DifficultyValue=v=>Number.isFinite(v)?`${cg35Fmt(v)}/100`:'—';
const cg35Time=ms=>{const n=Number(ms||0);if(!n)return '—';if(n<60000)return `${(n/1000).toFixed(1).replace('.',',')} s`;return `${Math.floor(n/60000)} min ${Math.floor((n%60000)/1000)} s`};
const cg35Date=ms=>ms?new Date(Number(ms)).toLocaleString('fr-FR'):'—';
const CG35={tab:'overview',domain:'',theme:'',historyFilter:'all'};

async function cg35Api(body){
  const u=window.CGWEB001?.getUser?.();
  if(!u?.getIdToken)throw new Error('Utilisateur Firebase non connecté.');
  const token=await u.getIdToken();
  const r=await fetch(CG35_END,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({cgweb035:true,...(body||{})})});
  const d=await r.json();
  if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function cg35Status(text,type=''){const e=cg35$('cg35Status');if(e){e.textContent=text;e.className=`cg35-status${type?` cg35-${type}`:''}`}}
function cg35SetBody(html){const e=cg35$('cg35Body');if(e)e.innerHTML=html}
function cg35Path(domain='',theme=''){return [domain,theme].filter(Boolean).map(cg35Esc).join(' › ')}
function cg35QuestionButton(id,label='Ouvrir'){return id?`<button class="cg35-open" data-open="${cg35Esc(id)}">${label}</button>`:''}
function cg35Copy(ids){const text=(ids||[]).filter(Boolean).join('\n');if(!text)return;navigator.clipboard?.writeText(text);cg35Status(`✅ ${ids.length} ID copié(s).`,'ok')}
function cg35Tabs(){document.querySelectorAll('[data-cg35-tab]').forEach(b=>b.classList.toggle('active',b.dataset.cg35Tab===CG35.tab))}
async function cg35Load(tab=CG35.tab){CG35.tab=tab;CG35.domain='';CG35.theme='';cg35Tabs();cg35Status('Chargement…');if(tab==='overview')return cg35Overview();if(tab==='history')return cg35History();if(tab==='never')return cg35NeverOverview();return cg35Groups(tab,'')}

async function cg35Overview(){
  try{
    const d=await cg35Api({mode:'overview'}),s=d.summary||{},m=s.mastery||{};
    cg35SetBody(`<section class="cg35-kpis">
      <article><small>Questions vues</small><b>${cg35Fmt(s.seenQuestions)}</b><span>${cg35Fmt(s.eventsCount)} événements</span></article>
      <article><small>Réussite</small><b>${cg35Fmt(s.successPercent)} %</b><span>${cg35Fmt(s.attempts)} réponses évaluées</span></article>
      <article><small>À réviser</small><b>${cg35Fmt(s.dueCount)}</b><span>${cg35Fmt(m['À réviser']||0)} statut maîtrise</span></article>
      <article><small>Points faibles</small><b>${cg35Fmt(s.priorityCount)}</b><span>score moyen ${cg35Fmt(s.averageWeakness)}/100</span></article>
      <article><small>Temps médian</small><b>${cg35Time(s.medianResponseMs)}</b><span>${cg35Fmt(s.knownSlowCount)} connue(s) mais lente(s)</span></article>
      <article><small>Difficulté</small><b>${cg35DifficultyValue(s.averageDifficulty)}</b><span>${s.difficultyQuestionCount?`${cg35QuestionCount(s.difficultyQuestionCount)} évaluée${s.difficultyQuestionCount===1?'':'s'}`:'aucune réponse évaluée'}</span></article>
    </section>
    <section class="cg35-masterline">
      <span>Découverte <b>${cg35Fmt(m['Découverte']||0)}</b></span><span>Fragile <b>${cg35Fmt(m['Fragile']||0)}</b></span><span>Connue <b>${cg35Fmt(m['Connue']||0)}</b></span><span>Maîtrisée <b>${cg35Fmt(m['Maîtrisée']||0)}</b></span><span>À réviser <b>${cg35Fmt(m['À réviser']||0)}</b></span>
    </section>
    <section class="cg35-domain-grid">${(d.domains||[]).map(g=>`<article class="cg35-card"><h3>${cg35Esc(g.name)}</h3><p>${cg35Fmt(g.questionCount)} vue${Number(g.questionCount)===1?'':'s'} · ${g.attempts>0?`${cg35Fmt(g.successPercent)} % réussite`:'aucune réponse évaluée'}</p><small>${cg35PriorityCount(g.priorityCount)} · ${cg35Fmt(g.dueCount)} à réviser</small></article>`).join('')||'<div class="cg35-empty">Aucune donnée de jeu.</div>'}</section>`);
    cg35Status('✅ Vue d’ensemble à jour.','ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}
function cg35HistoryResult(e){if(e.playType==='revision_reveal')return 'Révélation';if(e.playType==='challenge_choice')return e.positive?'Juste':'Faux';if(e.playType==='challenge_mental')return e.result==='assimilated'?'Assimilée':'À revoir';return e.result||'—'}
function cg35HistoryType(e){if(e.playType==='challenge_choice')return 'QCM';if(e.playType==='challenge_mental')return 'Mental';if(e.playType==='revision_reveal')return 'Révision';return e.playType||'Événement'}
async function cg35History(){
  try{
    const d=await cg35Api({mode:'history',filter:CG35.historyFilter,limit:100});
    cg35SetBody(`<div class="cg35-filterbar">${[['all','Tous'],['qcm','QCM'],['mental','Mental'],['revision','Révision']].map(([k,l])=>`<button data-history-filter="${k}" class="${CG35.historyFilter===k?'active':''}">${l}</button>`).join('')}</div>
      <div class="cg35-submeta">${cg35Fmt((d.rows||[]).length)} affiché${(d.rows||[]).length===1?'':'s'} · 100 derniers maximum</div>
      <section class="cg35-list">${(d.rows||[]).map(e=>`<article class="cg35-event"><header><b>${cg35Date(e.playedAtMs)} · ${cg35HistoryType(e)}</b>${e.attemptTotal>1?`<span>Tentative ${e.attemptNumber}/${e.attemptTotal}</span>`:''}</header><small>${cg35Esc(cg35Path(e.domain,e.theme))}</small><h3>${cg35Esc(e.question||'(question sans texte)')}</h3><div class="cg35-result">${cg35Esc(cg35HistoryResult(e))}${e.responseTimeMs>0?` · ${cg35Time(e.responseTimeMs)}`:''}</div>${cg35QuestionButton(e.questionId)}</article>`).join('')||'<div class="cg35-empty">Aucun événement.</div>'}</section>`);
    document.querySelectorAll('[data-history-filter]').forEach(b=>b.onclick=()=>{CG35.historyFilter=b.dataset.historyFilter;cg35History()});
    cg35Status('✅ Historique chargé.','ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}

const CG35_LABELS={mastery:'Maîtrise',due:'À réviser',weakness:'Points faibles',response:'Temps de réponse',difficulty:'Difficulté'};
function cg35Metric(g,view){
  if(view==='mastery'){
    const m=g.mastery||{};
    return `${cg35Count(m['Maîtrisée']||0,'maîtrisée','maîtrisées')} · ${cg35Count(m['Fragile']||0,'fragile','fragiles')} · ${cg35Fmt(m['À réviser']||0)} à réviser`;
  }
  if(view==='due')return `${cg35Count(g.dueCount,'révision')} échue${Number(g.dueCount)===1?'':'s'} · ${g.attempts>0?`${cg35Fmt(g.successPercent)} % réussite`:'aucune réponse évaluée'}`;
  if(view==='weakness')return `Faiblesse ${cg35Fmt(g.weakness)}/100 · ${cg35PriorityCount(g.priorityCount)}`;
  if(view==='response')return `Médiane ${cg35Time(g.medianResponseMs)} · ${cg35Count(g.knownSlowCount,'connue mais lente','connues mais lentes')}`;
  if(view==='difficulty'){
    if(!Number.isFinite(g.difficulty)||Number(g.attempts)<=0)return 'Difficulté — · données insuffisantes';
    return `Difficulté ${cg35DifficultyValue(g.difficulty)} · ${cg35ResponseCount(g.attempts)}`;
  }
  return '';
}
async function cg35Groups(view,domain=''){
  try{
    CG35.domain=domain;CG35.theme='';
    const d=await cg35Api({mode:'groups',view,domain:domain||null});
    const title=domain?`${CG35_LABELS[view]} · ${domain}`:CG35_LABELS[view];
    cg35SetBody(`<div class="cg35-viewhead"><div><h3>${cg35Esc(title)}</h3><p>${domain?'Choisis un thème.':'Choisis un domaine.'}</p></div>${domain?'<button id="cg35BackGroups">← Domaines</button>':''}</div>
      <section class="cg35-list">${(d.rows||[]).map(g=>`<button class="cg35-group" data-group="${cg35Esc(g.name)}"><strong>${cg35Esc(g.name||'(Sans thème)')}</strong><span>${cg35QuestionCount(g.questionCount)} · ${g.attempts>0?`${cg35Fmt(g.successPercent)} % réussite`:'aucune réponse évaluée'}</span><small>${cg35Esc(cg35Metric(g,view))}</small></button>`).join('')||'<div class="cg35-empty">Aucune donnée.</div>'}</section>`);
    if(domain)cg35$('cg35BackGroups').onclick=()=>cg35Groups(view,'');
    document.querySelectorAll('[data-group]').forEach(b=>{b.onclick=()=>{if(domain)cg35Questions(view,domain,b.dataset.group);else cg35Groups(view,b.dataset.group)}});
    cg35Status('✅ Analyse chargée.','ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}
function cg35QuestionMetric(q,view){
  if(view==='mastery')return `${q.mastery} · ${q.attempts>0?`${q.successPercent}% réussite · ${cg35ResponseCount(q.attempts)}`:'aucune réponse évaluée'}`;
  if(view==='due')return `${q.intervalDays} j · échéance ${q.dueAtMs?new Date(q.dueAtMs).toLocaleDateString('fr-FR'):'—'} · ${q.successPercent}% réussite`;
  if(view==='weakness')return `Faiblesse ${q.weakness}/100 · ${cg35ErrorCount(q.failures)} · ${q.successPercent}% réussite`;
  if(view==='response')return `Médiane ${cg35Time(q.medianResponseMs)} · moyenne ${cg35Time(q.avgResponseMs)} · ${q.knownSlow?'Connue mais lente':'—'}`;
  if(view==='difficulty'){
    if(!Number.isFinite(q.difficulty)||Number(q.attempts)<=0)return 'Difficulté — · aucune réponse évaluée';
    return `${q.difficultyLabel} · ${cg35DifficultyValue(q.difficulty)} · ${q.confidence}`;
  }
  return '';
}
async function cg35Questions(view,domain,theme){
  try{
    CG35.domain=domain;CG35.theme=theme;
    const d=await cg35Api({mode:'questions',view,domain,theme}),rows=d.rows||[];
    cg35SetBody(`<div class="cg35-viewhead"><div><h3>${cg35Esc(CG35_LABELS[view])}</h3><p>${cg35Esc(cg35Path(domain,theme||'(Sans thème)'))}</p></div><div class="cg35-actions"><button id="cg35BackThemes">← Thèmes</button><button id="cg35CopyIds">Copier les ID</button></div></div>
      <section class="cg35-list">${rows.map(q=>`<article class="cg35-q"><small>${cg35Esc(cg35Path(q.domain,q.theme))}</small><h3>${cg35Esc(q.question||'(question sans texte)')}</h3><p>${cg35Esc(cg35QuestionMetric(q,view))}</p>${cg35QuestionButton(q.id)}</article>`).join('')||'<div class="cg35-empty">Aucune question pour cette sélection.</div>'}</section>`);
    cg35$('cg35BackThemes').onclick=()=>cg35Groups(view,domain);cg35$('cg35CopyIds').onclick=()=>cg35Copy(rows.map(x=>x.id));cg35Status(`✅ ${cg35QuestionCount(rows.length)}.`,'ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}

async function cg35NeverOverview(){
  try{
    const d=await cg35Api({mode:'neverOverview'});
    cg35SetBody(`<div class="cg35-viewhead"><div><h3>Jamais vues</h3><p>${cg35Fmt(d.unseen)} jamais vue${Number(d.unseen)===1?'':'s'} sur ${cg35QuestionCount(d.total)}</p></div></div>
      <section class="cg35-list">${(d.rows||[]).map(r=>`<button class="cg35-group" data-never-domain="${cg35Esc(r.name)}"><strong>${cg35Esc(r.name)}</strong><span>${cg35Fmt(r.unseen)} jamais vue${Number(r.unseen)===1?'':'s'}</span><small>${cg35Fmt(r.seen)} vue${Number(r.seen)===1?'':'s'} · ${cg35Fmt(r.total)} total</small></button>`).join('')}</section>`);
    document.querySelectorAll('[data-never-domain]').forEach(b=>b.onclick=()=>cg35NeverThemes(b.dataset.neverDomain));cg35Status('✅ Stock jamais vu calculé.','ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}
async function cg35NeverThemes(domain){
  try{
    CG35.domain=domain;const d=await cg35Api({mode:'neverThemes',domain});
    cg35SetBody(`<div class="cg35-viewhead"><div><h3>Jamais vues · ${cg35Esc(domain)}</h3><p>Choisis un thème.</p></div><button id="cg35NeverBack">← Domaines</button></div>
      <section class="cg35-list">${(d.rows||[]).map(r=>`<button class="cg35-group" data-never-theme="${cg35Esc(r.name)}"><strong>${cg35Esc(r.name||'(Sans thème)')}</strong><span>${cg35Fmt(r.unseen)} jamais vue${Number(r.unseen)===1?'':'s'}</span><small>${cg35Fmt(r.seen)} vue${Number(r.seen)===1?'':'s'} · ${cg35Fmt(r.total)} total</small></button>`).join('')||'<div class="cg35-empty">Aucun thème jamais vu.</div>'}</section>`);
    cg35$('cg35NeverBack').onclick=cg35NeverOverview;document.querySelectorAll('[data-never-theme]').forEach(b=>b.onclick=()=>cg35NeverQuestions(domain,b.dataset.neverTheme));cg35Status('✅ Thèmes jamais vus chargés.','ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}
async function cg35NeverQuestions(domain,theme){
  try{
    const d=await cg35Api({mode:'neverQuestions',domain,theme,limit:100}),rows=d.rows||[];
    cg35SetBody(`<div class="cg35-viewhead"><div><h3>Jamais vues</h3><p>${cg35Esc(cg35Path(domain,theme||'(Sans thème)'))} · 100 maximum</p></div><div class="cg35-actions"><button id="cg35NeverThemeBack">← Thèmes</button><button id="cg35CopyIds">Copier les ID</button></div></div>
      <section class="cg35-list">${rows.map(q=>`<article class="cg35-q"><small>#${cg35Esc(q.id)}</small><h3>${cg35Esc(q.question||'(question sans texte)')}</h3>${cg35QuestionButton(q.id)}</article>`).join('')||'<div class="cg35-empty">Aucune question jamais vue.</div>'}</section>`);
    cg35$('cg35NeverThemeBack').onclick=()=>cg35NeverThemes(domain);cg35$('cg35CopyIds').onclick=()=>cg35Copy(rows.map(x=>x.id));cg35Status(`✅ ${rows.length} jamais vue${rows.length===1?'':'s'} affichée${rows.length===1?'':'s'}.`,'ok');
  }catch(e){cg35SetBody(`<div class="cg35-error">${cg35Esc(e.message)}</div>`);cg35Status(`❌ ${e.message}`,'bad')}
}
function cg35Wire(){
  document.querySelectorAll('[data-cg35-tab]').forEach(b=>b.onclick=()=>cg35Load(b.dataset.cg35Tab));
  cg35$('cg35Refresh').onclick=()=>cg35Load(CG35.tab);
  cg35$('cgweb035Panel').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b?.dataset.open)window.CGWEB019_API?.open?.(b.dataset.open)});
}
function cg35Init(){
  if(cg35$('cgweb035Panel'))return;
  const p=document.createElement('section');p.id='cgweb035Panel';p.className='cg35-panel';p.innerHTML=`<header class="cg35-head"><div><div class="cg35-kicker">CGWEB035 FIX2 · LEARNING_HUB002</div><h2>Apprentissage</h2><p>Historique, maîtrise, révisions, points faibles, vitesse et difficulté.</p></div><button id="cg35Refresh">Actualiser</button></header>
  <nav class="cg35-tabs" aria-label="Analyses d'apprentissage"><button data-cg35-tab="overview" class="active">Vue d’ensemble</button><button data-cg35-tab="history">Historique</button><button data-cg35-tab="mastery">Maîtrise</button><button data-cg35-tab="never">Jamais vues</button><button data-cg35-tab="due">À réviser</button><button data-cg35-tab="weakness">Points faibles</button><button data-cg35-tab="response">Temps de réponse</button><button data-cg35-tab="difficulty">Difficulté</button></nav>
  <div id="cg35Body" class="cg35-body"></div><div id="cg35Status" class="cg35-status">Initialisation…</div>`;
  (document.querySelector('main')||document.body).appendChild(p);cg35Wire();setTimeout(()=>{if(window.CGWEB001?.getUser?.())cg35Load('overview')},600);
}
window.CGWEB035_API={open:()=>{window.CGWEB016_API?.navigate?.('learning');cg35Load('overview')},refresh:()=>cg35Load(CG35.tab)};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',cg35Init):cg35Init();
