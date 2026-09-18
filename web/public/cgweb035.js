const CGWEB035_VERSION='CGPLAY003_FIX4_X_SEMANTIC_AUDIT001';
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
const CG35={tab:'overview',domain:'',theme:'',historyFilter:'all',smartConfig:{count:20,duePct:40,weakPct:35,unseenPct:25,domain:''},smartRows:[]};

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
async function cg35Load(tab=CG35.tab){CG35.tab=tab;CG35.domain='';CG35.theme='';cg35Tabs();cg35Status('Chargement…');if(tab==='overview')return cg35Overview();if(tab==='history')return cg35History();if(tab==='never')return cg35NeverOverview();if(tab==='smart')return cg35Smart();return cg35Groups(tab,'')}

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
function cg35SmartSourceLabel(source){
  return source==='due'?'À réviser':source==='weakness'?'Point faible':'Jamais vue';
}
function cg35Smart(){
  const c=CG35.smartConfig||(CG35.smartConfig={count:20,duePct:40,weakPct:35,unseenPct:25,domain:''});
  const domains=['','Animaux et Plantes','Culture Classique','Culture Générale','Culture Moderne','Géographie','Histoire','Sciences et Techniques','Sport'];
  cg35SetBody(`
    <section class="cg35-smart-config">
      <div><h3>Session intelligente</h3><p>Compose automatiquement une séance à partir des révisions échues, points faibles et questions jamais vues.</p></div>
      <div class="cg35-smart-grid">
        <label>Taille de séance<input id="cg35SmartCount" type="number" min="5" max="50" value="${c.count}"></label>
        <label>À réviser (%)<input id="cg35SmartDue" type="number" min="0" max="100" value="${c.duePct}"></label>
        <label>Points faibles (%)<input id="cg35SmartWeak" type="number" min="0" max="100" value="${c.weakPct}"></label>
        <label>Jamais vues (%)<input id="cg35SmartUnseen" type="number" min="0" max="100" value="${c.unseenPct}"></label>
        <label>Domaine<select id="cg35SmartDomain">${domains.map(d=>`<option value="${cg35Esc(d)}" ${d===c.domain?'selected':''}>${cg35Esc(d||'Tous les domaines')}</option>`).join('')}</select></label>
      </div>
      <div class="cg35-actions"><button id="cg35SmartGenerate" class="cg35-smart-primary">Générer la séance</button><button id="cg35XAudit" class="cg35-x-audit-button">Auditer les X</button></div>
      <small>LEARNING_MODEL002 : A/R/P/T ne pilotent plus la sélection. Seul X interdit définitivement une question ; SMART_BALANCE002 gère le reste depuis l’historique de jeu.</small>
    </section>
    <section id="cg35SmartResults" class="cg35-smart-results">
      <div class="cg35-empty">Configure la séance puis clique sur « Générer la séance ».</div>
    </section>`);
  cg35$('cg35SmartGenerate').onclick=cg35GenerateSmart;
  cg35$('cg35XAudit').onclick=cg35RunXAudit;
  cg35Status('Session intelligente prête.','ok');
}
async function cg35RunXAudit(){

  let box=
    cg35$('cg35XAuditResults');


  if(!box){

    const smart=
      cg35$('cg35SmartResults');

    if(!smart){
      return;
    }

    smart.insertAdjacentHTML(
      'beforebegin',
      '<section id="cg35XAuditResults" class="cg35-x-audit"></section>'
    );

    box=
      cg35$('cg35XAuditResults');
  }


  box.innerHTML=
    '<div class="cg35-empty">Analyse sémantique read-only des exclusions X…</div>';


  cg35Status(
    'Audit sémantique des exclusions X…'
  );


  try{

    const d=
      await cg35Api({
        mode:'xSemanticAudit',
        sampleLimit:3000
      });


    const a=
      d.audit||{};


    const pct=v=>
      Number(v||0)
        .toLocaleString(
          'fr-FR',
          {
            maximumFractionDigits:2
          }
        )+
      ' %';


    const bar=(rows,max=12)=>
      (rows||[])
        .slice(0,max)
        .map(
          x=>
            '<div class="cg35-x-audit-row">'+
              '<span>'+
                cg35Esc(x.name)+
              '</span>'+
              '<b>'+
                cg35Fmt(x.count)+
              '</b>'+
            '</div>'
        )
        .join('') ||
      '<div class="cg35-empty">Aucune donnée.</div>';


    const exact=
      (a.exactExamples||[])
        .map(
          g=>
            '<article class="cg35-x-audit-example">'+
              '<header>'+
                '<b>'+
                  cg35Fmt(g.count)+
                  ' occurrences'+
                '</b>'+
                '<span>'+
                  cg35Esc(
                    cg35Path(
                      g.domain,
                      g.theme
                    )
                  )+
                '</span>'+
              '</header>'+
              (g.rows||[])
                .map(
                  q=>
                    '<div class="cg35-x-audit-question">'+
                      '<span>'+
                        cg35Esc(
                          q.question||
                          '(sans texte)'
                        )+
                      '</span>'+
                      cg35QuestionButton(
                        q.id
                      )+
                    '</div>'
                )
                .join('')+
            '</article>'
        )
        .join('') ||
      '<div class="cg35-empty">Aucun doublon exact dans l’échantillon.</div>';


    const near=
      (a.nearDuplicatePairs||[])
        .map(
          p=>
            '<article class="cg35-x-audit-example">'+
              '<header>'+
                '<b>'+
                  cg35Fmt(
                    p.similarity
                  )+
                  ' % similaire'+
                '</b>'+
                '<span>'+
                  cg35Esc(
                    cg35Path(
                      p.domain,
                      p.theme
                    )
                  )+
                '</span>'+
              '</header>'+
              '<div class="cg35-x-audit-question">'+
                '<span>'+
                  cg35Esc(
                    p.a?.question||
                    ''
                  )+
                '</span>'+
                cg35QuestionButton(
                  p.a?.id
                )+
              '</div>'+
              '<div class="cg35-x-audit-question">'+
                '<span>'+
                  cg35Esc(
                    p.b?.question||
                    ''
                  )+
                '</span>'+
                cg35QuestionButton(
                  p.b?.id
                )+
              '</div>'+
            '</article>'
        )
        .join('') ||
      '<div class="cg35-empty">Aucun quasi-doublon détecté dans la limite d’analyse.</div>';


    const unique=
      (a.uniqueExamples||[])
        .map(
          q=>
            '<article class="cg35-x-audit-unique">'+
              '<small>'+
                cg35Esc(
                  cg35Path(
                    q.domain,
                    q.theme
                  )
                )+
              '</small>'+
              '<span>'+
                cg35Esc(
                  q.question||
                  '(sans texte)'
                )+
              '</span>'+
              cg35QuestionButton(
                q.id
              )+
            '</article>'
        )
        .join('') ||
      '<div class="cg35-empty">Aucun exemple disponible.</div>';


    const nonX=
      a.comparisonNonX||{};


    box.innerHTML=
      '<div class="cg35-x-audit-head">'+

        '<div>'+
          '<strong>'+
            cg35Esc(
              a.auditVersion||
              'CGPLAY003_FIX4_X_SEMANTIC_AUDIT001'
            )+
          '</strong>'+
          '<span>Audit read-only · aucune donnée modifiée</span>'+
        '</div>'+

        '<button id="cg35XAuditClose">Fermer l’audit</button>'+

      '</div>'+

      '<section class="cg35-x-audit-kpis">'+

        '<article>'+
          '<small>Catalogue</small>'+
          '<b>'+
            cg35Fmt(
              a.totalQuestions
            )+
          '</b>'+
          '<span>questions actuelles</span>'+
        '</article>'+

        '<article>'+
          '<small>X actifs</small>'+
          '<b>'+
            cg35Fmt(
              a.xActive
            )+
          '</b>'+
          '<span>'+
            pct(
              a.xActivePct
            )+
            ' du catalogue'+
          '</span>'+
        '</article>'+

        '<article>'+
          '<small>Non-X</small>'+
          '<b>'+
            cg35Fmt(
              a.nonX
            )+
          '</b>'+
          '<span>questions non bannies</span>'+
        '</article>'+

        '<article>'+
          '<small>Échantillon X</small>'+
          '<b>'+
            cg35Fmt(
              a.sampleSize
            )+
          '</b>'+
          '<span>'+
            pct(
              a.sampleCoveragePct
            )+
            ' des X actifs'+
          '</span>'+
        '</article>'+

        '<article>'+
          '<small>Doublons exacts X</small>'+
          '<b>'+
            pct(
              a.exactDuplicateRatePct
            )+
          '</b>'+
          '<span>'+
            cg35Fmt(
              a.exactDuplicateRows
            )+
            ' lignes · '+
            cg35Fmt(
              a.exactDuplicateGroups
            )+
            ' groupes'+
          '</span>'+
        '</article>'+

        '<article>'+
          '<small>Comparaison non-X</small>'+
          '<b>'+
            pct(
              nonX.exactDuplicateRatePct
            )+
          '</b>'+
          '<span>'+
            cg35Fmt(
              nonX.sampleSize
            )+
            ' questions échantillonnées'+
          '</span>'+
        '</article>'+

      '</section>'+

      '<div class="cg35-x-audit-warning">'+
        'Les taux de doublons et les répartitions ci-dessous portent sur un échantillon réparti de '+
        cg35Fmt(
          a.sampleSize
        )+
        ' X actifs ; ils ne constituent pas un comptage exhaustif des doublons de la base entière.'+
      '</div>'+

      '<section class="cg35-x-audit-columns">'+

        '<article>'+
          '<h3>Principaux domaines X</h3>'+
          bar(
            a.topDomains,
            12
          )+
        '</article>'+

        '<article>'+
          '<h3>Principaux thèmes X</h3>'+
          bar(
            a.topThemes,
            20
          )+
        '</article>'+

      '</section>'+

      '<details open class="cg35-x-audit-details">'+
        '<summary>Exemples de doublons exacts</summary>'+
        exact+
      '</details>'+

      '<details class="cg35-x-audit-details">'+
        '<summary>Quasi-doublons détectés ('+
          cg35Fmt(
            (a.nearDuplicatePairs||[]).length
          )+
          ')</summary>'+
        near+
      '</details>'+

      '<details class="cg35-x-audit-details">'+
        '<summary>X semblant uniques dans l’échantillon</summary>'+
        '<div class="cg35-x-audit-warning">'+
          'Ces questions sont uniques uniquement au regard de l’échantillon et de l’heuristique actuelle. Elles ne sont pas automatiquement réhabilitées.'+
        '</div>'+
        unique+
      '</details>'+

      '<div class="cg35-x-audit-foot">'+
        'Provenance : '+
        cg35Fmt(
          a.provenance?.fromLegacyBuckets
        )+
        ' références dans statusBuckets · '+
        cg35Fmt(
          a.provenance?.fromQuestionStatus
        )+
        ' dans questions.status · '+
        cg35Fmt(
          a.semanticComparisons
        )+
        ' comparaisons sémantiques effectuées.'+
      '</div>';


    cg35$('cg35XAuditClose')
      ?.addEventListener(
        'click',
        ()=>{
          box.remove();
        }
      );


    cg35Status(
      '✅ Audit X terminé : '+
      cg35Fmt(
        a.sampleSize
      )+
      ' X analysés.',
      'ok'
    );


  }catch(e){

    box.innerHTML=
      '<div class="cg35-error">'+
        cg35Esc(
          e.message
        )+
      '</div>';

    cg35Status(
      '❌ '+
      e.message,
      'bad'
    );
  }
}

async function cg35GenerateSmart(){

  try{

    const c={

      count:
        Number(
          cg35$('cg35SmartCount').value
        )||20,

      duePct:
        Number(
          cg35$('cg35SmartDue').value
        )||0,

      weakPct:
        Number(
          cg35$('cg35SmartWeak').value
        )||0,

      unseenPct:
        Number(
          cg35$('cg35SmartUnseen').value
        )||0,

      domain:
        cg35$('cg35SmartDomain').value||''
    };


    CG35.smartConfig=c;


    cg35Status(
      'Génération et équilibrage de la session intelligente…'
    );


    const d=
      await cg35Api({
        mode:'smartSession',
        ...c
      });


    const rows=d.rows||[];

    CG35.smartRows=rows;


    const a=d.actual||{};
    const q=d.quota||{};
    const av=d.available||{};
    const cap=d.availableCapped||{};
    const miss=d.shortage||{};
    const red=d.redistributed||{};
    const lm=d.learningModel||{};


    const stock=k=>{

      return (
        (cap[k]?'≥ ':'')+
        cg35Fmt(av[k]||0)
      );
    };


    const detail=k=>{

      const parts=[
        'demandé '+cg35Fmt(q[k]||0),
        'stock '+stock(k)
      ];

      if(Number(miss[k]||0)>0){

        parts.push(
          'manque '+
          cg35Fmt(miss[k])
        );
      }

      if(Number(red[k]||0)>0){

        parts.push(
          '+'+
          cg35Fmt(red[k])+
          ' rééquilibré'
        );
      }

      return parts.join(' · ');
    };


    const deficits=[];


    if(miss.due){

      deficits.push(
        cg35Fmt(miss.due)+
        ' À réviser'
      );
    }


    if(miss.weakness){

      deficits.push(
        cg35Fmt(miss.weakness)+
        ' Points faibles'
      );
    }


    if(miss.unseen){

      deficits.push(
        cg35Fmt(miss.unseen)+
        ' Jamais vues'
      );
    }


    let balanceText=
      'Répartition cible disponible : aucun rééquilibrage nécessaire.';


    if(Number(d.redistributedTotal||0)>0){

      balanceText=
        'Rééquilibrage automatique : '+
        cg35Fmt(d.redistributedTotal)+
        ' place(s) redistribuée(s)';

      if(deficits.length){

        balanceText+=
          ' après déficit de '+
          deficits.join(' + ');
      }

      balanceText+='.';
    }


    if(!d.complete){

      balanceText+=
        ' Stock total insuffisant : '+
        cg35Fmt(rows.length)+
        ' question(s) disponibles sur '+
        cg35Fmt(c.count)+
        ' demandées.';
    }


    const summary=

      '<div class="cg35-smart-summary">'+

        '<div>'+
          '<strong>'+
            cg35Fmt(rows.length)+
            ' question(s)'+
          '</strong>'+
          '<span>'+
            (
              c.domain
                ? cg35Esc(c.domain)
                : 'Tous domaines'
            )+
          '</span>'+
          '<small>'+
            'objectif '+
            cg35Fmt(c.count)+
          '</small>'+
        '</div>'+

        '<div>'+
          '<b>'+
            cg35Fmt(a.due||0)+
          '</b>'+
          '<span>À réviser</span>'+
          '<small>'+
            cg35Esc(detail('due'))+
          '</small>'+
        '</div>'+

        '<div>'+
          '<b>'+
            cg35Fmt(a.weakness||0)+
          '</b>'+
          '<span>Points faibles</span>'+
          '<small>'+
            cg35Esc(detail('weakness'))+
          '</small>'+
        '</div>'+

        '<div>'+
          '<b>'+
            cg35Fmt(a.unseen||0)+
          '</b>'+
          '<span>Jamais vues</span>'+
          '<small>'+
            cg35Esc(detail('unseen'))+
          '</small>'+
        '</div>'+

        '<button id="cg35SmartCopy">'+
          'Copier les ID'+
        '</button>'+

      '</div>';


    const balance=

      '<div class="cg35-smart-balance '+
        (
          Number(d.redistributedTotal||0)>0
            ? 'active'
            : ''
        )+
      '">'+

        '<strong>'+
          'SMART_BALANCE002'+
        '</strong>'+

        '<span>'+
          cg35Esc(balanceText)+
        '</span>'+

      '</div>';


    const cards=
      rows.map(
        (item,i)=>{

          let metric='';


          if(item.source==='weakness'){

            metric=
              '<p>'+
                'Faiblesse '+
                cg35Fmt(item.weakness)+
                '/100 · '+
                cg35Fmt(item.successPercent)+
                ' % réussite'+
              '</p>';
          }


          if(item.source==='due'){

            metric=
              '<p>'+
                cg35Fmt(item.successPercent)+
                ' % réussite · '+
                cg35Fmt(item.attempts)+
                ' tentative(s)'+
              '</p>';
          }


          if(item.source==='unseen'){

            metric=
              '<p>'+
                'Première exposition prévue.'+
              '</p>';
          }


          return (

            '<article class="cg35-q cg35-smart-q">'+

              '<div class="cg35-smart-top">'+

                '<span class="cg35-smart-order">'+
                  (i+1)+
                '</span>'+

                '<span class="cg35-smart-badge '+
                  cg35Esc(item.source)+
                '">'+
                  cg35Esc(
                    cg35SmartSourceLabel(
                      item.source
                    )
                  )+
                '</span>'+

              '</div>'+

              '<small>'+
                cg35Esc(
                  cg35Path(
                    item.domain,
                    item.theme
                  )
                )+
              '</small>'+

              '<h3>'+
                cg35Esc(
                  item.question||
                  '(question sans texte)'
                )+
              '</h3>'+

              metric+

              cg35QuestionButton(
                item.id
              )+

            '</article>'
          );
        }
      ).join('');


    const box=
      cg35$('cg35SmartResults');


    box.innerHTML=

      summary+
      balance+

      '<section class="cg35-list">'+

        (
          cards ||

          '<div class="cg35-empty">'+
            'Aucune question disponible pour cette configuration.'+
          '</div>'
        )+

      '</section>';



    if(box&&lm.version){

      const xKnown=
        Number(
          lm.xKnown ??
          lm.xExcluded ??
          0
        );

      const xActive=
        Number(
          lm.xActive ??
          lm.xResolvedInCatalog ??
          0
        );

      const xOrphaned=
        Number(
          lm.xOrphaned ??
          Math.max(
            0,
            xKnown-xActive
          )
        );

      const xBuckets=
        Number(
          lm.xFromLegacyBuckets ??
          0
        );

      const xQuestionStatus=
        Number(
          lm.xFromQuestionStatus ??
          0
        );

      const xBoth=
        Number(
          lm.xInBothSources ??
          0
        );

      const diagnosticVersion=
        lm.diagnosticVersion ||
        'CGPLAY003_FIX2_X_TRUTH001';

      box.insertAdjacentHTML(
        'afterbegin',

        '<div class="cg35-learning-model cg35-learning-model-truth">'+

          '<div class="cg35-learning-truth-head">'+
            '<strong>'+
              cg35Esc(diagnosticVersion)+
            '</strong>'+
            '<span>'+
              'Lecture exacte des exclusions X'+
            '</span>'+
          '</div>'+

          '<div class="cg35-learning-truth-grid">'+

            '<span>'+
              '<b>X actifs</b>'+
              '<strong>'+
                cg35Fmt(xActive)+
              '</strong>'+
            '</span>'+

            '<span>'+
              '<b>Références X connues</b>'+
              '<strong>'+
                cg35Fmt(xKnown)+
              '</strong>'+
            '</span>'+

            '<span>'+
              '<b>X orphelins</b>'+
              '<strong>'+
                cg35Fmt(xOrphaned)+
              '</strong>'+
            '</span>'+

          '</div>'+

          '<div class="cg35-learning-truth-detail">'+
            'Présents dans anciens statusBuckets : '+
            cg35Fmt(xBuckets)+
            ' · présents dans questions.status : '+
            cg35Fmt(xQuestionStatus)+
            ' · présents dans les deux sources : '+
            cg35Fmt(xBoth)+
          '</div>'+

          '<div class="cg35-learning-truth-detail">'+
            'A/R/P/T ignorés · mode cible QCM'+
            (
              lm.legacyHistoryPreserved
                ? ' · ancien historique conservé'
                : ''
            )+
          '</div>'+

          '<div class="cg35-learning-truth-note">'+
            'Les compteurs de provenance peuvent se chevaucher ; X actifs correspond uniquement aux exclusions rattachées au catalogue actuel.'+
          '</div>'+

        '</div>'
      );
    }

    cg35$('cg35SmartCopy')
      ?.addEventListener(
        'click',
        ()=>
          cg35Copy(
            rows.map(x=>x.id)
          )
      );


    cg35Status(
      '✅ Session intelligente : '+
      rows.length+
      ' question(s)'+
      (
        Number(d.redistributedTotal||0)>0
          ? ' · '+
            d.redistributedTotal+
            ' place(s) rééquilibrée(s)'
          : ''
      )+
      '.',
      'ok'
    );


  }catch(e){

    const box=
      cg35$('cg35SmartResults');


    if(box){

      box.innerHTML=
        '<div class="cg35-error">'+
          cg35Esc(e.message)+
        '</div>';
    }


    cg35Status(
      '❌ '+e.message,
      'bad'
    );
  }
}

function cg35Wire(){
  document.querySelectorAll('[data-cg35-tab]').forEach(b=>b.onclick=()=>cg35Load(b.dataset.cg35Tab));
  cg35$('cg35Refresh').onclick=()=>cg35Load(CG35.tab);
  cg35$('cgweb035Panel').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b?.dataset.open)window.CGWEB019_API?.open?.(b.dataset.open)});
}
function cg35Init(){
  if(cg35$('cgweb035Panel'))return;
  const p=document.createElement('section');p.id='cgweb035Panel';p.className='cg35-panel';p.innerHTML=`<header class="cg35-head"><div><div class="cg35-kicker">CGWEB035 FIX2 · LEARNING_HUB002</div><h2>Apprentissage</h2><p>Historique, maîtrise, révisions, points faibles, vitesse et difficulté.</p></div><button id="cg35Refresh">Actualiser</button></header>
  <nav class="cg35-tabs" aria-label="Analyses d'apprentissage"><button data-cg35-tab="overview" class="active">Vue d’ensemble</button><button data-cg35-tab="history">Historique</button><button data-cg35-tab="mastery">Maîtrise</button><button data-cg35-tab="never">Jamais vues</button><button data-cg35-tab="due">À réviser</button><button data-cg35-tab="weakness">Points faibles</button><button data-cg35-tab="response">Temps de réponse</button><button data-cg35-tab="difficulty">Difficulté</button><button data-cg35-tab="smart">Session intelligente</button></nav>
  <div id="cg35Body" class="cg35-body"></div><div id="cg35Status" class="cg35-status">Initialisation…</div>`;
  (document.querySelector('main')||document.body).appendChild(p);cg35Wire();setTimeout(()=>{if(window.CGWEB001?.getUser?.())cg35Load('overview')},600);
}
window.CGWEB035_API={open:()=>{window.CGWEB016_API?.navigate?.('learning');cg35Load('overview')},refresh:()=>cg35Load(CG35.tab)};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',cg35Init):cg35Init();
