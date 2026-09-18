const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');

if(!getApps().length)initializeApp();

const PAGE_SIZE=1000;
const HISTORY_TTL_MS=60*1000;
const MAX_RESPONSE_MS=10*60*1000;
const DAY_MS=24*60*60*1000;
const PRIOR_WEIGHT=3;
const WEAK_THRESHOLD=35;
const DOMAINS=[
  'Animaux et Plantes','Culture Classique','Culture Générale','Culture Moderne',
  'Géographie','Histoire','Sciences et Techniques','Sport'
];
const CACHE=new Map();
const X_POLICY_TTL_MS=15*1000;
const X_POLICY_CACHE=new Map();
const LEARNING_MODEL_VERSION='CGPLAY003_X_ONLY001_LEARNING_MODEL002';
const X_TRUTH_VERSION='CGPLAY003_FIX2_X_TRUTH001';

const one=v=>String(v??'').trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pct=(a,b)=>b>0?Math.round(100*a/b):0;
const median=values=>{
  const a=(values||[]).filter(v=>Number.isFinite(v)&&v>0).slice().sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2);
};
const avg=values=>{
  const a=(values||[]).filter(v=>Number.isFinite(v));
  return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):0;
};
const tsMs=v=>{
  if(!v)return 0;
  if(typeof v.toMillis==='function')return v.toMillis();
  if(Number.isFinite(v._seconds))return v._seconds*1000;
  if(Number.isFinite(v.seconds))return v.seconds*1000;
  return 0;
};

function cors(req,res){
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.status(204).send('');return true}
  return false;
}
function json(res,status,body){
  res.status(status).set('content-type','application/json; charset=utf-8')
    .send(JSON.stringify(body));
}
async function requireUser(req){
  const h=one(req.headers.authorization);
  if(!h.startsWith('Bearer ')){
    throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});
  }
  return getAuth().verifyIdToken(h.slice(7));
}
function eventFromDoc(doc){
  const x=doc.data()||{};
  const snap=x.question_snapshot&&typeof x.question_snapshot==='object'?x.question_snapshot:{};
  const questionId=one(x.question_id||x.question_row_number||doc.id);
  const row=num(x.question_row_number||x.question_id);
  return {
    id:doc.id,
    questionId,
    row,
    playedAtMs:num(x.client_played_at_ms)||tsMs(x.played_at),
    playType:one(x.play_type),
    gameMode:one(x.game_mode),
    result:one(x.result),
    isCorrect:typeof x.is_correct==='boolean'?x.is_correct:null,
    responseTimeMs:num(x.response_time_ms),
    domain:one(x.domain||snap.domain),
    theme:one(x.theme||snap.theme),
    question:one(snap.question),
    detail:one(snap.detail),
    selectedAnswer:one(x.selected_answer),
    correctAnswer:one(x.correct_answer)
  };
}
async function loadHistory(uid,force=false){
  const hit=CACHE.get(uid);
  if(!force&&hit&&Date.now()-hit.at<HISTORY_TTL_MS)return hit.events;

  const col=getFirestore().collection('users').doc(uid).collection('play_history');
  const events=[];
  let last=null;

  for(;;){
    let q=col.orderBy('client_played_at_ms','desc').limit(PAGE_SIZE);
    if(last)q=q.startAfter(last);
    const snap=await q.get();
    for(const d of snap.docs)events.push(eventFromDoc(d));
    if(snap.size<PAGE_SIZE)break;
    last=snap.docs[snap.docs.length-1];
  }

  CACHE.set(uid,{at:Date.now(),events});
  return events;
}
async function loadXPolicy(uid,force=false){
  const cached=X_POLICY_CACHE.get(uid);
  if(!force&&cached&&Date.now()-cached.at<X_POLICY_TTL_MS)return cached.policy;

  const db=getFirestore();
  const userRef=db.collection('users').doc(uid);
  const questions=userRef.collection('questions');

  // Pendant la transition, X peut provenir de deux stockages :
  // - questions/<id>.status = X
  // - statusBuckets/*.statuses.<id> = X
  // A/R/P/T sont volontairement ignorés.
  const [buckets,upperX,lowerX]=await Promise.all([
    userRef.collection('statusBuckets').get(),
    questions.where('status','==','X').get(),
    questions.where('status','==','x').get()
  ]);

  const ids=new Set();
  const catalogIds=new Set();
  const fromBuckets=new Set();
  const fromQuestionStatus=new Set();
  const docs=new Map();

  for(const snap of [upperX,lowerX]){
    for(const d of snap.docs){
      ids.add(d.id);
      catalogIds.add(d.id);
      fromQuestionStatus.add(d.id);
      docs.set(d.id,d);
    }
  }

  for(const bucket of buckets.docs){
    const statuses=bucket.get('statuses');
    if(!statuses||typeof statuses!=='object')continue;
    for(const [rawId,rawStatus] of Object.entries(statuses)){
      if(String(rawStatus??'').trim().toUpperCase()!=='X')continue;
      const id=String(rawId??'').trim();
      if(!id)continue;
      ids.add(id);
      fromBuckets.add(id);
    }
  }

  // Résout dans le catalogue les X hérités des statusBuckets.
  // On peut alors les soustraire proprement des compteurs Jamais vues.
  const missing=[...ids].filter(id=>!docs.has(id));
  for(let i=0;i<missing.length;i+=200){
    const refs=missing.slice(i,i+200).map(id=>questions.doc(id));
    if(!refs.length)continue;
    const snaps=await db.getAll(...refs);
    for(const d of snaps){
      if(!d.exists)continue;
      docs.set(d.id,d);
      catalogIds.add(d.id);
    }
  }

  const byDomain=new Map();
  for(const [id,d] of docs){
    if(!d.exists)continue;
    catalogIds.add(id);
    const x=d.data()||{};
    const domain=one(x.megatheme);
    if(domain)byDomain.set(domain,(byDomain.get(domain)||0)+1);
  }

  const policy={
    ids,
    catalogIds,
    fromBuckets,
    fromQuestionStatus,
    byDomain
  };

  X_POLICY_CACHE.set(uid,{at:Date.now(),policy});
  return policy;
}


function learningModelMeta(xPolicy){

  const xKnown=
    xPolicy?.ids?.size||0;

  const xActive=
    xPolicy?.catalogIds?.size||0;

  const xOrphaned=
    Math.max(
      0,
      xKnown-xActive
    );

  const xFromLegacyBuckets=
    xPolicy?.fromBuckets?.size||0;

  const xFromQuestionStatus=
    xPolicy?.fromQuestionStatus?.size||0;

  let xInBothSources=0;

  if(
    xPolicy?.fromBuckets &&
    xPolicy?.fromQuestionStatus
  ){
    for(const id of xPolicy.fromBuckets){

      if(
        xPolicy
          .fromQuestionStatus
          .has(id)
      ){
        xInBothSources++;
      }
    }
  }

  return {

    version:
      LEARNING_MODEL_VERSION,

    diagnosticVersion:
      X_TRUTH_VERSION,

    persistentStatuses:[
      'X'
    ],

    ignoredLegacyStatuses:[
      'A',
      'R',
      'P',
      'T'
    ],

    targetPlayMode:
      'qcm',

    legacyHistoryPreserved:
      true,

    /*
     * Noms X_TRUTH001.
     */
    xKnown,
    xActive,
    xOrphaned,
    xFromLegacyBuckets,
    xFromQuestionStatus,
    xInBothSources,

    /*
     * Compatibilité CGPLAY003 initial.
     */
    xExcluded:
      xKnown,

    xResolvedInCatalog:
      xActive
  };
}

async function neverOverview(uid,analysis,xPolicy){
  const questions=getFirestore().collection('users').doc(uid).collection('questions');
  const calls=[
    questions.count().get(),
    ...DOMAINS.map(domain=>questions.where('megatheme','==',domain).count().get())
  ];
  const snaps=await Promise.all(calls);

  const seenIds=new Set(
    analysis.questions.map(q=>one(q.questionId)).filter(Boolean)
  );

  const seenByDomain=new Map();
  for(const q of analysis.questions){
    const domain=one(q.domain);
    const id=one(q.questionId);
    if(!domain||!id)continue;
    if(!seenByDomain.has(domain))seenByDomain.set(domain,new Set());
    seenByDomain.get(domain).add(id);
  }

  const rows=DOMAINS.map((domain,i)=>{
    const rawTotal=Number(snaps[i+1].data().count||0);
    const excluded=xPolicy?.byDomain?.get(domain)||0;
    const total=Math.max(0,rawTotal-excluded);
    const seen=seenByDomain.get(domain)?.size||0;
    return {name:domain,total,seen,unseen:Math.max(0,total-seen)};
  }).sort((a,b)=>b.unseen-a.unseen||a.name.localeCompare(b.name,'fr'));

  const rawTotal=Number(snaps[0].data().count||0);
  const total=Math.max(0,rawTotal-(xPolicy?.catalogIds?.size||0));

  return {
    total,
    seen:seenIds.size,
    unseen:Math.max(0,total-seenIds.size),
    excludedX:xPolicy?.ids?.size||0,
    rows
  };
}

async function neverThemes(uid,analysis,domain,xPolicy){
  const questions=getFirestore().collection('users').doc(uid).collection('questions');
  const snap=await questions.where('megatheme','==',domain).select('theme').get();

  const totals=new Map();
  for(const d of snap.docs){
    if(xPolicy?.ids?.has(d.id))continue;
    const theme=one(d.get('theme'));
    totals.set(theme,(totals.get(theme)||0)+1);
  }

  const seen=new Map();
  for(const q of analysis.questions){
    if(one(q.domain)!==domain)continue;
    const id=one(q.questionId);
    if(!id)continue;
    const theme=one(q.theme);
    if(!seen.has(theme))seen.set(theme,new Set());
    seen.get(theme).add(id);
  }

  return [...totals.entries()].map(([theme,total])=>{
    const n=seen.get(theme)?.size||0;
    return {name:theme,total,seen:n,unseen:Math.max(0,total-n)};
  }).filter(x=>x.unseen>0)
    .sort((a,b)=>b.unseen-a.unseen||a.name.localeCompare(b.name,'fr',{numeric:true}));
}

async function neverQuestions(uid,analysis,domain,theme,limit,xPolicy){
  const seen=new Set(analysis.questions.map(q=>one(q.questionId)).filter(Boolean));
  const questions=getFirestore().collection('users').doc(uid).collection('questions');
  const snap=await questions.where('megatheme','==',domain)
    .select('question','detail','megatheme','theme').get();

  const rows=[];
  for(const d of snap.docs){
    if(xPolicy?.ids?.has(d.id)||seen.has(d.id))continue;
    const x=d.data()||{};
    if(one(x.theme)!==theme)continue;
    rows.push({
      id:d.id,
      question:one(x.question),
      detail:one(x.detail),
      domain:one(x.megatheme),
      theme:one(x.theme)
    });
    if(rows.length>=limit)break;
  }
  return rows;
}

function cg35Shuffle(rows){
  const a=(rows||[]).slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const t=a[i];a[i]=a[j];a[j]=t;
  }
  return a;
}
function smartQuota(count,duePct,weakPct,unseenPct){
  let weights=[Math.max(0,duePct),Math.max(0,weakPct),Math.max(0,unseenPct)];
  let total=weights.reduce((a,b)=>a+b,0);
  if(total<=0){weights=[40,35,25];total=100}
  const raw=weights.map(w=>count*w/total);
  const q=raw.map(Math.floor);
  let left=count-q.reduce((a,b)=>a+b,0);
  const order=raw.map((v,i)=>({i,frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac);
  for(let k=0;k<left;k++)q[order[k%order.length].i]++;
  return {due:q[0],weakness:q[1],unseen:q[2]};
}
function smartHistoricalRow(q,source){
  return {
    id:q.questionId||String(q.row||''),
    row:q.row||0,
    domain:q.domain||'',
    theme:q.theme||'',
    question:q.question||'',
    detail:q.detail||'',
    source,
    reason:source==='due'?'À réviser':'Point faible',
    due:Boolean(q.due),
    weakness:q.weakness||0,
    successPercent:q.successPercent||0,
    attempts:q.attempts||0,
    mastery:q.mastery||'',
    medianResponseMs:q.medianResponseMs||0
  };
}
async function smartUnseenCandidates(uid,analysis,wanted,domain,xPolicy){
  const seen=new Set(analysis.questions.map(q=>one(q.questionId)).filter(Boolean));
  const out=[];
  const col=getFirestore().collection('users').doc(uid).collection('questions');
  let last=null;
  let scanned=0;
  const maxScan=Math.max(1000,Math.min(10000,Math.max(1,wanted)*80));

  while(out.length<wanted&&scanned<maxScan){
    let q=col;
    if(domain)q=q.where('megatheme','==',domain);
    q=q.orderBy(FieldPath.documentId())
      .select('question','detail','megatheme','theme')
      .limit(250);
    if(last)q=q.startAfter(last);

    const snap=await q.get();
    if(snap.empty)break;
    scanned+=snap.size;

    for(const d of snap.docs){
      // X est rejeté avant la première exposition.
      if(xPolicy?.ids?.has(d.id)||seen.has(d.id))continue;
      const x=d.data()||{};
      out.push({
        id:d.id,
        row:num(d.id),
        domain:one(x.megatheme),
        theme:one(x.theme),
        question:one(x.question),
        detail:one(x.detail),
        source:'unseen',
        reason:'Jamais vue',
        due:false,
        weakness:0,
        successPercent:null,
        attempts:0,
        mastery:'Jamais vue',
        medianResponseMs:0
      });
      if(out.length>=wanted)break;
    }

    last=snap.docs[snap.docs.length-1];
    if(snap.size<250)break;
  }

  return cg35Shuffle(out);
}

async function smartSession(uid,analysis,body,xPolicy){

  const count=clamp(
    Math.floor(num(body.count)||20),
    5,
    50
  );

  const duePct=clamp(num(body.duePct??40),0,100);
  const weakPct=clamp(num(body.weakPct??35),0,100);
  const unseenPct=clamp(num(body.unseenPct??25),0,100);
  const domain=one(body.domain);

  const quota=smartQuota(
    count,
    duePct,
    weakPct,
    unseenPct
  );

  const eligible=q=>
    !domain || one(q.domain)===domain;

  const idOf=q=>
    one(q.questionId)||String(q.row||'');

  const unique=(rows,getId)=>{
    const seen=new Set();
    const out=[];

    for(const x of rows){
      const id=getId(x);
      if(!id || seen.has(id)) continue;
      seen.add(id);
      out.push(x);
    }

    return out;
  };


  /*
   * Priorité de classement :
   * une question échue appartient d'abord à "À réviser".
   */
  const dueSource=unique(
    analysis.questions
      .filter(q=>q.due&&eligible(q))
      .sort((a,b)=>
        b.overdueMs-a.overdueMs ||
        a.successPercent-b.successPercent
      ),
    idOf
  );

  const dueIds=
    new Set(dueSource.map(idOf));


  /*
   * Les points faibles déjà classés "À réviser"
   * sont retirés de ce second stock.
   */
  const weakSource=unique(
    analysis.questions
      .filter(q=>
        q.priority &&
        eligible(q) &&
        !dueIds.has(idOf(q))
      )
      .sort((a,b)=>
        b.weakness-a.weakness ||
        b.failures-a.failures
      ),
    idOf
  );


  /*
   * Réserve Jamais vues suffisamment grande pour
   * absorber une redistribution.
   */
  const unseenWanted=
    Math.max(100,count*4);

  const unseenSource=
    await smartUnseenCandidates(
      uid,
      analysis,
      unseenWanted,
      domain,
      xPolicy
    );


  const pools={

    due:
      dueSource.map(
        q=>smartHistoricalRow(q,'due')
      ),

    weakness:
      weakSource.map(
        q=>smartHistoricalRow(q,'weakness')
      ),

    unseen:
      unique(
        unseenSource,
        q=>one(q.id)
      )
  };


  const available={
    due:pools.due.length,
    weakness:pools.weakness.length,
    unseen:pools.unseen.length
  };


  /*
   * Si le moteur récupère exactement unseenWanted éléments,
   * on sait seulement qu'il y en a AU MOINS ce nombre.
   */
  const availableCapped={
    due:false,
    weakness:false,
    unseen:pools.unseen.length>=unseenWanted
  };


  const actual={
    due:0,
    weakness:0,
    unseen:0
  };

  const primaryActual={
    due:0,
    weakness:0,
    unseen:0
  };

  const redistributed={
    due:0,
    weakness:0,
    unseen:0
  };

  const selected=[];


  const take=(key,n,phase)=>{

    let done=0;

    while(
      done<n &&
      selected.length<count &&
      pools[key].length
    ){
      selected.push(
        pools[key].shift()
      );

      actual[key]++;

      if(phase==='primary')
        primaryActual[key]++;
      else
        redistributed[key]++;

      done++;
    }

    return done;
  };


  /*
   * Allocation primaire.
   */
  take('due',quota.due,'primary');
  take('weakness',quota.weakness,'primary');
  take('unseen',quota.unseen,'primary');


  const shortage={

    due:
      Math.max(
        0,
        quota.due-primaryActual.due
      ),

    weakness:
      Math.max(
        0,
        quota.weakness-primaryActual.weakness
      ),

    unseen:
      Math.max(
        0,
        quota.unseen-primaryActual.unseen
      )
  };


  /*
   * Redistribue les places vacantes uniquement entre
   * les catégories disposant encore d'un stock.
   */
  const weights={
    due:Math.max(0,duePct),
    weakness:Math.max(0,weakPct),
    unseen:Math.max(0,unseenPct)
  };

  const tieOrder={
    due:0,
    weakness:1,
    unseen:2
  };


  while(selected.length<count){

    const availableKeys=
      ['due','weakness','unseen']
        .filter(k=>pools[k].length);

    if(!availableKeys.length)
      break;


    const weighted=
      availableKeys.filter(
        k=>weights[k]>0
      );

    const candidates=
      weighted.length
        ? weighted
        : availableKeys;


    /*
     * Round-robin pondéré sur les places redistribuées.
     */
    candidates.sort((a,b)=>{

      const scoreA=
        weights[a]>0
          ? weights[a]/(redistributed[a]+1)
          : 0;

      const scoreB=
        weights[b]>0
          ? weights[b]/(redistributed[b]+1)
          : 0;

      return (
        scoreB-scoreA ||
        tieOrder[a]-tieOrder[b]
      );
    });


    take(
      candidates[0],
      1,
      'redistributed'
    );
  }


  const shortageTotal=
    shortage.due+
    shortage.weakness+
    shortage.unseen;


  const redistributedTotal=
    redistributed.due+
    redistributed.weakness+
    redistributed.unseen;


  return {

    balanceVersion:
      'CGPLAY002_SMART_BALANCE002',

    generatedAtMs:
      Date.now(),

    requested:{
      count,
      duePct,
      weakPct,
      unseenPct,
      domain
    },

    quota,

    available,
    availableCapped,

    primaryActual,

    shortage,
    shortageTotal,

    redistributed,
    redistributedTotal,

    actual,

    count:
      selected.length,

    complete:
      selected.length===count,

    rows:
      selected.slice(0,count)
  };
}

async function handleLearningHub(req,res){
  if(cors(req,res))return;

  try{
    if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});

    const user=await requireUser(req);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const mode=one(body.mode)||'overview';
    const events=await loadHistory(user.uid,Boolean(body.forceRefresh));

    // L'historique brut reste intact, y compris les anciens événements Mental.
    if(mode==='history'){
      const filter=['qcm','mental','revision'].includes(one(body.filter))
        ? one(body.filter)
        : 'all';
      const limit=clamp(Math.floor(num(body.limit)||100),1,500);
      return json(res,200,{
        ok:true,
        total:events.length,
        filter,
        rows:historyRows(events,filter,limit)
      });
    }

    // Les modes susceptibles de proposer une question rechargent X immédiatement.
    const forceX=
      Boolean(body.forceRefresh)||
      mode==='smartSession'||
      mode==='neverOverview'||
      mode==='neverThemes'||
      mode==='neverQuestions';

    const xPolicy=await loadXPolicy(user.uid,forceX);

    // A/R/P/T ne sont jamais consultés.
    // X est retiré avant buildAnalysis : ni révision, ni faiblesse, ni stats pédagogiques.
    const learningEvents=events.filter(
      e=>!xPolicy.ids.has(one(e.questionId))
    );

    const analysis=buildAnalysis(learningEvents);
    const learningModel=learningModelMeta(xPolicy);

    if(mode==='overview'){
      return json(res,200,{
        ok:true,
        summary:summaryOf(analysis),
        domains:sortGroups(groupsFor(analysis,null),'mastery'),
        learningModel
      });
    }

    if(mode==='groups'){
      const view=one(body.view)||'mastery';
      const domain=body.domain===undefined||body.domain===null?'':one(body.domain);
      let rows=groupsFor(analysis,domain||null);
      rows=sortGroups(rows,view);
      return json(res,200,{ok:true,view,domain,rows,learningModel});
    }

    if(mode==='questions'){
      const view=one(body.view)||'mastery';
      const domain=one(body.domain);
      const theme=one(body.theme);
      let rows=analysis.questions.filter(
        q=>(one(q.domain)||'(Sans domaine)')===domain&&one(q.theme)===theme
      );
      rows=sortQuestions(rows,view).slice(0,300).map(compactQuestion);
      return json(res,200,{ok:true,view,domain,theme,rows,learningModel});
    }

    if(mode==='neverOverview'){
      return json(res,200,{
        ok:true,
        ...await neverOverview(user.uid,analysis,xPolicy),
        learningModel
      });
    }

    if(mode==='neverThemes'){
      const domain=one(body.domain);
      if(!domain)return json(res,400,{ok:false,error:'Domaine manquant.'});
      return json(res,200,{
        ok:true,
        domain,
        rows:await neverThemes(user.uid,analysis,domain,xPolicy),
        learningModel
      });
    }

    if(mode==='neverQuestions'){
      const domain=one(body.domain);
      const theme=one(body.theme);
      if(!domain)return json(res,400,{ok:false,error:'Domaine manquant.'});
      const limit=clamp(Math.floor(num(body.limit)||100),1,300);
      return json(res,200,{
        ok:true,
        domain,
        theme,
        rows:await neverQuestions(user.uid,analysis,domain,theme,limit,xPolicy),
        learningModel
      });
    }

    if(mode==='smartSession'){
      return json(res,200,{
        ok:true,
        ...await smartSession(user.uid,analysis,body,xPolicy),
        learningModel
      });
    }

    return json(res,400,{ok:false,error:'Mode inconnu.'});

  }catch(error){
    return json(res,Number(error?.status)||500,{
      ok:false,
      error:error?.message||String(error)
    });
  }
}

module.exports={handleLearningHub};
