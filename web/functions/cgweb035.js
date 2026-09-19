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
const X_TRUTH_VERSION='CGPLAY003_FIX3_X_TRUTH001_REPAIR001';
const X_AUDIT_VERSION='CGPLAY003_FIX4_X_SEMANTIC_AUDIT001';
const X_DUPLICATE_TRUTH_VERSION='CGPLAY003_FIX5_X_DUPLICATE_TRUTH002';
const X_ORIGIN_VERSION='CGPLAY003_FIX6_X_ORIGIN_AUDIT001';
const X_REHABILITATION_PREVIEW_VERSION='CGPLAY003_FIX6_REHABILITATION_PREVIEW001';
const CGPLAY004_LONG_SESSION_VERSION='CGPLAY004_LONG_SESSION001';
const CGPLAY004_ADAPTIVE_BATCH_VERSION='CGPLAY004_ADAPTIVE_BATCH001';
const CGPLAY004_SESSION_RESUME_VERSION='CGPLAY004_SESSION_RESUME001';

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

    xKnown,
    xActive,
    xOrphaned,

    xFromLegacyBuckets,
    xFromQuestionStatus,
    xInBothSources,

    /*
     * Compatibilité avec l'interface CGPLAY003/FIX2.
     */
    xExcluded:
      xKnown,

    xResolvedInCatalog:
      xActive
  };
}

function isEvaluable(e){
  return e.playType==='challenge_choice'||e.playType==='challenge_mental';
}
function isPositive(e){
  if(e.playType==='challenge_choice')return e.isCorrect===true;
  if(e.playType==='challenge_mental')return e.result==='assimilated';
  return false;
}
function questionKey(e){
  return one(e.questionId)||one(e.question)||`${one(e.domain)}|${one(e.theme)}|${e.playedAtMs}`;
}
function longestFailureStreak(results){
  let best=0,cur=0;
  for(const r of results){if(!r.positive){cur++;best=Math.max(best,cur)}else cur=0}
  return best;
}
function recentFailureScore(results){
  const r=results.slice(-5);
  if(!r.length)return 0;
  let bad=0,total=0;
  for(let i=0;i<r.length;i++){
    const w=i+1;
    total+=w;
    if(!r[i].positive)bad+=w;
  }
  return total?bad/total:0;
}
function masteryOf(q,now){
  if(q.attempts<=1)return 'Découverte';
  const success=q.successPercent;
  const stale=q.lastPlayedAtMs>0&&now-q.lastPlayedAtMs>30*DAY_MS;
  const acquired=q.attempts>=3&&success>=60;
  if((acquired&&!q.lastPositive)||(stale&&success>=60))return 'À réviser';
  if(success<60)return 'Fragile';
  if(q.attempts>=3&&success>=80&&q.lastTwoPositive)return 'Maîtrisée';
  return 'Connue';
}
function spacedInterval(q){
  if(!q.lastPositive)return 1;
  if(q.attempts<=1)return 3;
  if(q.successPercent<60)return 1;
  if(q.attempts>=5&&q.successPercent>=90&&q.lastThreePositive)return 60;
  if(q.attempts>=3&&q.successPercent>=80&&q.lastTwoPositive)return 30;
  return 7;
}
function buildAnalysis(events){
  const now=Date.now();
  const chronological=events.slice().sort((a,b)=>a.playedAtMs-b.playedAtMs);
  const byKey=new Map();
  let totalAttempts=0,totalPositive=0;
  const allTimes=[];

  for(const e of chronological){
    const key=questionKey(e);
    let q=byKey.get(key);
    if(!q){
      q={
        key,questionId:e.questionId,row:e.row,domain:e.domain,theme:e.theme,
        question:e.question,detail:e.detail,exposures:0,attempts:0,positive:0,
        results:[],responseTimes:[],lastPlayedAtMs:0,lastPositive:true
      };
      byKey.set(key,q);
    }
    q.exposures++;
    if(e.questionId)q.questionId=e.questionId;
    if(e.row>0)q.row=e.row;
    if(e.domain)q.domain=e.domain;
    if(e.theme)q.theme=e.theme;
    if(e.question)q.question=e.question;
    if(e.detail)q.detail=e.detail;
    q.lastPlayedAtMs=Math.max(q.lastPlayedAtMs,e.playedAtMs||0);

    if(isEvaluable(e)){
      const positive=isPositive(e);
      q.attempts++;
      totalAttempts++;
      if(positive){q.positive++;totalPositive++}
      q.results.push({at:e.playedAtMs,positive,responseTimeMs:e.responseTimeMs});
      q.lastPositive=positive;
      if(e.responseTimeMs>0&&e.responseTimeMs<=MAX_RESPONSE_MS){
        q.responseTimes.push(e.responseTimeMs);
        allTimes.push(e.responseTimeMs);
      }
    }
  }

  const globalMedian=median(allTimes);
  const globalFailure=totalAttempts?1-totalPositive/totalAttempts:0;
  const questions=[];

  for(const q of byKey.values()){
    q.successPercent=pct(q.positive,q.attempts);
    q.failures=q.attempts-q.positive;
    q.avgResponseMs=avg(q.responseTimes);
    q.medianResponseMs=median(q.responseTimes);
    q.timeCount=q.responseTimes.length;
    q.lastTwoPositive=q.results.length>=2&&q.results[q.results.length-1].positive&&q.results[q.results.length-2].positive;
    q.lastThreePositive=q.results.length>=3&&q.results.slice(-3).every(x=>x.positive);
    q.mastery=masteryOf(q,now);

    const failure=q.attempts?q.failures/q.attempts:0;
    const recentFailure=recentFailureScore(q.results);
    const repeatPenalty=clamp(longestFailureStreak(q.results)/3,0,1);
    const ratio=globalMedian>0&&q.medianResponseMs>0?q.medianResponseMs/globalMedian:1;
    const slowPenalty=clamp((ratio-1)/1.5,0,1);

    q.weakness=Math.round(100*(0.45*failure+0.30*recentFailure+0.15*repeatPenalty+0.10*slowPenalty));
    q.priority=q.weakness>=WEAK_THRESHOLD||(q.attempts>0&&!q.lastPositive);

    if(q.attempts<=0){
      q.difficulty=null;
      q.difficultyLabel='Données insuffisantes';
      q.confidence='Aucune réponse évaluée';
    }else{
      const adjustedFailure=(q.failures+globalFailure*PRIOR_WEIGHT)/(q.attempts+PRIOR_WEIGHT);
      q.difficulty=Math.round(100*(0.80*adjustedFailure+0.20*slowPenalty));
      q.difficultyLabel=q.difficulty<20?'Très facile':q.difficulty<40?'Facile':q.difficulty<60?'Moyenne':q.difficulty<80?'Difficile':'Très difficile';
      q.confidence=q.attempts<=1?'Données insuffisantes':q.attempts<=4?'Échantillon limité':'Données suffisantes';
    }

    q.knownSlow=q.successPercent>=60&&q.timeCount>=2&&globalMedian>0&&q.medianResponseMs>=globalMedian*1.4;

    q.intervalDays=spacedInterval(q);
    q.dueAtMs=q.lastPlayedAtMs+q.intervalDays*DAY_MS;
    q.due=q.attempts>0&&q.lastPlayedAtMs>0&&q.dueAtMs<=now;
    q.overdueMs=q.due?now-q.dueAtMs:0;

    delete q.results;
    questions.push(q);
  }

  return {
    questions,totalAttempts,totalPositive,
    globalSuccessPercent:pct(totalPositive,totalAttempts),
    globalMedianResponseMs:globalMedian,
    globalAverageResponseMs:avg(allTimes),
    eventsCount:events.length
  };
}
function compactQuestion(q){
  return {
    id:q.questionId||String(q.row||''),row:q.row,domain:q.domain,theme:q.theme,
    question:q.question,detail:q.detail,exposures:q.exposures,attempts:q.attempts,
    positive:q.positive,failures:q.failures,successPercent:q.successPercent,
    mastery:q.mastery,weakness:q.weakness,priority:q.priority,
    avgResponseMs:q.avgResponseMs,medianResponseMs:q.medianResponseMs,timeCount:q.timeCount,
    knownSlow:q.knownSlow,difficulty:q.difficulty,difficultyLabel:q.difficultyLabel,
    confidence:q.confidence,intervalDays:q.intervalDays,dueAtMs:q.dueAtMs,
    due:q.due,overdueMs:q.overdueMs,lastPlayedAtMs:q.lastPlayedAtMs,lastPositive:q.lastPositive
  };
}
function groupQuestions(list,name='',domain=''){
  const mastery={Découverte:0,Fragile:0,Connue:0,Maîtrisée:0,'À réviser':0};
  let attempts=0,positive=0,weak=0,diffWeighted=0,diffWeight=0,due=0,priority=0,knownSlow=0;
  const times=[];
  for(const q of list){
    attempts+=q.attempts;positive+=q.positive;weak+=q.weakness;
    mastery[q.mastery]=(mastery[q.mastery]||0)+1;
    if(q.attempts>0&&Number.isFinite(q.difficulty)){
      const w=Math.max(1,Math.min(5,q.attempts));
      diffWeighted+=q.difficulty*w;diffWeight+=w;
    }
    if(q.due)due++;
    if(q.priority)priority++;
    if(q.knownSlow)knownSlow++;
    times.push(...q.responseTimes);
  }
  return {
    name,domain,questionCount:list.length,attempts,successPercent:pct(positive,attempts),
    mastery,weakness:list.length?Math.round(weak/list.length):0,
    priorityCount:priority,dueCount:due,knownSlowCount:knownSlow,
    medianResponseMs:median(times),averageResponseMs:avg(times),
    difficulty:diffWeight?Math.round(diffWeighted/diffWeight):null,
    difficultyQuestionCount:list.filter(q=>q.attempts>0&&Number.isFinite(q.difficulty)).length
  };
}
function groupsFor(analysis,domain=null){
  const map=new Map();
  for(const q of analysis.questions){
    const d=one(q.domain)||'(Sans domaine)';
    if(domain!==null&&d!==domain)continue;
    const key=domain===null?d:one(q.theme);
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(q);
  }
  return [...map.entries()].map(([name,list])=>groupQuestions(list,name,domain||''));
}
function sortGroups(rows,view){
  const r=rows.slice();
  if(view==='weakness')return r.sort((a,b)=>b.weakness-a.weakness||b.priorityCount-a.priorityCount);
  if(view==='response')return r.sort((a,b)=>b.medianResponseMs-a.medianResponseMs||b.knownSlowCount-a.knownSlowCount);
  if(view==='difficulty')return r.sort((a,b)=>{
    const ad=Number.isFinite(a.difficulty)?a.difficulty:-1;
    const bd=Number.isFinite(b.difficulty)?b.difficulty:-1;
    return bd-ad||b.attempts-a.attempts;
  });
  if(view==='due')return r.sort((a,b)=>b.dueCount-a.dueCount||b.priorityCount-a.priorityCount);
  if(view==='mastery')return r.sort((a,b)=>(b.mastery['À réviser']*100+b.mastery.Fragile*10+b.mastery.Découverte)-(a.mastery['À réviser']*100+a.mastery.Fragile*10+a.mastery.Découverte));
  return r.sort((a,b)=>a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'}));
}
function sortQuestions(rows,view){
  const r=rows.slice();
  if(view==='weakness')return r.sort((a,b)=>b.weakness-a.weakness||b.failures-a.failures);
  if(view==='response')return r.sort((a,b)=>b.medianResponseMs-a.medianResponseMs||b.timeCount-a.timeCount);
  if(view==='difficulty')return r.sort((a,b)=>{
    const ad=Number.isFinite(a.difficulty)?a.difficulty:-1;
    const bd=Number.isFinite(b.difficulty)?b.difficulty:-1;
    return bd-ad||b.attempts-a.attempts;
  });
  if(view==='due')return r.filter(x=>x.due).sort((a,b)=>b.overdueMs-a.overdueMs||a.successPercent-b.successPercent);
  if(view==='mastery'){
    const rank={'À réviser':0,'Fragile':1,'Découverte':2,'Connue':3,'Maîtrisée':4};
    return r.sort((a,b)=>(rank[a.mastery]??9)-(rank[b.mastery]??9)||b.lastPlayedAtMs-a.lastPlayedAtMs);
  }
  return r;
}
function summaryOf(analysis){
  const mastery={Découverte:0,Fragile:0,Connue:0,Maîtrisée:0,'À réviser':0};
  let priority=0,due=0,knownSlow=0,weakSum=0,diffSum=0,diffCount=0;
  for(const q of analysis.questions){
    mastery[q.mastery]=(mastery[q.mastery]||0)+1;
    if(q.priority)priority++;
    if(q.due)due++;
    if(q.knownSlow)knownSlow++;
    weakSum+=q.weakness;
    if(q.attempts>0&&Number.isFinite(q.difficulty)){diffSum+=q.difficulty;diffCount++}
  }
  return {
    eventsCount:analysis.eventsCount,
    seenQuestions:analysis.questions.length,
    attempts:analysis.totalAttempts,
    successPercent:analysis.globalSuccessPercent,
    mastery,
    priorityCount:priority,
    dueCount:due,
    knownSlowCount:knownSlow,
    averageWeakness:analysis.questions.length?Math.round(weakSum/analysis.questions.length):0,
    averageDifficulty:diffCount?Math.round(diffSum/diffCount):null,
    difficultyQuestionCount:diffCount,
    medianResponseMs:analysis.globalMedianResponseMs,
    averageResponseMs:analysis.globalAverageResponseMs
  };
}
function historyRows(events,filter,limit){
  const mapType={qcm:'challenge_choice',mental:'challenge_mental',revision:'revision_reveal'};
  const filtered=events.filter(e=>!mapType[filter]||e.playType===mapType[filter]);
  const totals=new Map(),numbers=new Map(),ordered=filtered.slice().sort((a,b)=>a.playedAtMs-b.playedAtMs);
  for(const e of ordered){
    const key=`${e.playType}|${questionKey(e)}`;
    totals.set(key,(totals.get(key)||0)+1);
    numbers.set(e.id,totals.get(key));
  }
  const grand=new Map();
  for(const e of filtered){
    const key=`${e.playType}|${questionKey(e)}`;
    grand.set(key,(grand.get(key)||0)+1);
  }
  return filtered.slice(0,limit).map(e=>{
    const key=`${e.playType}|${questionKey(e)}`;
    return {...e,attemptNumber:numbers.get(e.id)||1,attemptTotal:grand.get(key)||1,positive:isEvaluable(e)?isPositive(e):null};
  });
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

function xAuditNorm(value){

  return one(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(/œ/gi,'oe')
    .replace(/æ/gi,'ae')
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
    .replace(/\s+/g,' ');
}

function xAuditTokenSet(value){

  return new Set(
    xAuditNorm(value)
      .split(' ')
      .filter(
        x=>x.length>=2
      )
  );
}

function xAuditSimilarity(a,b){

  const A=
    xAuditTokenSet(a);

  const B=
    xAuditTokenSet(b);

  if(
    A.size<3 ||
    B.size<3
  ){
    return 0;
  }

  let common=0;

  for(const x of A){

    if(B.has(x)){
      common++;
    }
  }

  const union=
    A.size+
    B.size-
    common;

  return union
    ? common/union
    : 0;
}

function xAuditTop(map,limit=15){

  return [...map.entries()]
    .map(
      ([name,count])=>({
        name,
        count
      })
    )
    .sort(
      (a,b)=>
        b.count-a.count ||
        a.name.localeCompare(
          b.name,
          'fr'
        )
    )
    .slice(
      0,
      limit
    );
}

function xAuditExactStats(rows){

  const map=
    new Map();

  for(const row of rows){

    const key=
      xAuditNorm(
        row.question
      );

    if(!key)continue;

    if(!map.has(key)){
      map.set(key,[]);
    }

    map
      .get(key)
      .push(row);
  }

  const groups=
    [...map.values()]
      .filter(
        group=>group.length>1
      )
      .sort(
        (a,b)=>
          b.length-a.length
      );

  const duplicateRows=
    groups.reduce(
      (n,g)=>n+g.length,
      0
    );

  return {
    map,
    groups,
    duplicateRows
  };
}

async function xSemanticAudit(
  uid,
  xPolicy,
  body
){

  const db=
    getFirestore();

  const questions=
    db
      .collection('users')
      .doc(uid)
      .collection('questions');


  /*
   * Audit volontairement borné.
   *
   * On ne relit PAS les 49 657 documents :
   * loadXPolicy connaît déjà tous leurs IDs.
   *
   * On sélectionne un échantillon réparti
   * régulièrement sur l'ensemble des IDs.
   */
  const sampleLimit=
    clamp(
      Math.floor(
        num(body.sampleLimit)||3000
      ),
      500,
      5000
    );


  const totalSnap=
    await questions
      .count()
      .get();


  const totalQuestions=
    Number(
      totalSnap
        .data()
        .count||0
    );


  const xKnown=
    xPolicy?.ids?.size||0;

  const xActive=
    xPolicy?.catalogIds?.size||0;

  const nonX=
    Math.max(
      0,
      totalQuestions-xActive
    );


  const activeIds=
    [
      ...(xPolicy?.catalogIds||[])
    ]
    .sort(
      (a,b)=>
        String(a)
          .localeCompare(
            String(b),
            'fr',
            {
              numeric:true
            }
          )
    );


  const selectedIds=[];


  if(
    activeIds.length<=sampleLimit
  ){

    selectedIds.push(
      ...activeIds
    );

  }else{

    const used=
      new Set();

    for(
      let i=0;
      i<sampleLimit;
      i++
    ){

      const index=
        Math.floor(
          i*
          (activeIds.length-1)/
          Math.max(
            1,
            sampleLimit-1
          )
        );

      const id=
        activeIds[index];

      if(
        !used.has(id)
      ){

        used.add(id);
        selectedIds.push(id);
      }
    }
  }


  const sample=[];


  for(
    let i=0;
    i<selectedIds.length;
    i+=200
  ){

    const refs=
      selectedIds
        .slice(i,i+200)
        .map(
          id=>
            questions.doc(id)
        );


    if(!refs.length)continue;


    const snaps=
      await db.getAll(...refs);


    for(const d of snaps){

      if(!d.exists)continue;

      const x=
        d.data()||{};

      sample.push({

        id:d.id,

        domain:
          one(x.megatheme)||
          '(Sans domaine)',

        theme:
          one(x.theme)||
          '(Sans thème)',

        question:
          one(x.question),

        detail:
          one(x.detail)
      });
    }
  }


  /*
   * Répartition domaine / thème.
   */
  const domains=
    new Map();

  const themes=
    new Map();


  for(const row of sample){

    domains.set(
      row.domain,
      (domains.get(row.domain)||0)+1
    );

    const themeKey=
      row.domain+
      ' › '+
      row.theme;

    themes.set(
      themeKey,
      (themes.get(themeKey)||0)+1
    );
  }


  /*
   * Doublons textuels exacts après normalisation.
   */
  const exact=
    xAuditExactStats(sample);


  const exactExamples=
    exact.groups
      .slice(0,15)
      .map(
        group=>({

          count:
            group.length,

          domain:
            group[0]?.domain||'',

          theme:
            group[0]?.theme||'',

          normalized:
            xAuditNorm(
              group[0]?.question
            ),

          rows:
            group
              .slice(0,5)
              .map(
                x=>({
                  id:x.id,
                  question:x.question,
                  domain:x.domain,
                  theme:x.theme
                })
              )
        })
      );


  /*
   * Quasi-doublons :
   *
   * - uniquement parmi les textes non déjà identiques ;
   * - même domaine + même thème ;
   * - Jaccard >= 0,82 ;
   * - nombre de comparaisons volontairement plafonné.
   */
  const uniqueRows=
    sample.filter(
      row=>{

        const key=
          xAuditNorm(
            row.question
          );

        return (
          key.length>=12 &&
          (
            exact.map
              .get(key)
              ?.length||0
          )===1
        );
      }
    );


  const buckets=
    new Map();


  for(const row of uniqueRows){

    const key=
      row.domain+
      '\u0000'+
      row.theme;

    if(!buckets.has(key)){
      buckets.set(key,[]);
    }

    buckets
      .get(key)
      .push(row);
  }


  const nearPairs=[];

  const nearIds=
    new Set();

  let comparisons=0;

  const maxComparisons=
    80000;


  outer:
  for(const rows of buckets.values()){

    const capped=
      rows.slice(0,350);

    for(
      let i=0;
      i<capped.length;
      i++
    ){

      for(
        let j=i+1;
        j<capped.length;
        j++
      ){

        comparisons++;

        if(
          comparisons>maxComparisons
        ){
          break outer;
        }


        const a=
          capped[i];

        const b=
          capped[j];


        const la=
          xAuditNorm(
            a.question
          ).length;

        const lb=
          xAuditNorm(
            b.question
          ).length;


        if(
          !la ||
          !lb
        ){
          continue;
        }


        const lengthRatio=
          Math.min(la,lb)/
          Math.max(la,lb);


        if(
          lengthRatio<0.65
        ){
          continue;
        }


        const similarity=
          xAuditSimilarity(
            a.question,
            b.question
          );


        if(
          similarity>=0.82
        ){

          nearIds.add(a.id);
          nearIds.add(b.id);

          nearPairs.push({

            similarity:
              Math.round(
                similarity*100
              ),

            domain:
              a.domain,

            theme:
              a.theme,

            a:{
              id:a.id,
              question:a.question
            },

            b:{
              id:b.id,
              question:b.question
            }
          });


          if(
            nearPairs.length>=25
          ){
            break outer;
          }
        }
      }
    }
  }


  /*
   * Questions X qui semblent uniques
   * dans l'échantillon.
   *
   * Ce n'est PAS une preuve qu'elles ne sont pas
   * des doublons dans la base complète.
   */
  const uniqueCandidates=
    uniqueRows.filter(
      row=>
        !nearIds.has(row.id)
    );


  const uniqueExamples=[];


  if(uniqueCandidates.length){

    const wanted=
      Math.min(
        25,
        uniqueCandidates.length
      );

    for(
      let i=0;
      i<wanted;
      i++
    ){

      const index=
        Math.floor(
          i*
          (uniqueCandidates.length-1)/
          Math.max(
            1,
            wanted-1
          )
        );

      const row=
        uniqueCandidates[index];

      uniqueExamples.push({

        id:row.id,

        domain:row.domain,

        theme:row.theme,

        question:row.question
      });
    }
  }


  /*
   * Petit échantillon non-X pour comparaison.
   *
   * Lecture plafonnée à 4 000 documents.
   */
  const nonXSample=[];

  let last=null;
  let scanned=0;


  while(
    nonXSample.length<300 &&
    scanned<4000
  ){

    let q=
      questions
        .orderBy(
          FieldPath.documentId()
        )
        .select(
          'question',
          'megatheme',
          'theme'
        )
        .limit(500);


    if(last){
      q=q.startAfter(last);
    }


    const snap=
      await q.get();


    if(snap.empty)break;


    scanned+=snap.size;


    for(const d of snap.docs){

      if(
        xPolicy
          ?.ids
          ?.has(d.id)
      ){
        continue;
      }


      const x=
        d.data()||{};


      nonXSample.push({

        id:d.id,

        domain:
          one(x.megatheme)||
          '(Sans domaine)',

        theme:
          one(x.theme)||
          '(Sans thème)',

        question:
          one(x.question)
      });


      if(
        nonXSample.length>=300
      ){
        break;
      }
    }


    last=
      snap.docs[
        snap.docs.length-1
      ];


    if(snap.size<500){
      break;
    }
  }


  const nonXExact=
    xAuditExactStats(
      nonXSample
    );


  const sampleWithText=
    sample.filter(
      x=>
        xAuditNorm(
          x.question
        )
    ).length;


  const nonXWithText=
    nonXSample.filter(
      x=>
        xAuditNorm(
          x.question
        )
    ).length;


  return {

    auditVersion:
      X_AUDIT_VERSION,

    readOnly:true,

    totalQuestions,

    xKnown,

    xActive,

    nonX,

    xActivePct:
      totalQuestions
        ? Math.round(
            xActive/
            totalQuestions*
            10000
          )/100
        : 0,

    sampleSize:
      sample.length,

    sampleLimit,

    sampleCoveragePct:
      xActive
        ? Math.round(
            sample.length/
            xActive*
            10000
          )/100
        : 0,

    topDomains:
      xAuditTop(
        domains,
        12
      ),

    topThemes:
      xAuditTop(
        themes,
        20
      ),

    exactDuplicateGroups:
      exact.groups.length,

    exactDuplicateRows:
      exact.duplicateRows,

    exactDuplicateRatePct:
      sampleWithText
        ? Math.round(
            exact.duplicateRows/
            sampleWithText*
            10000
          )/100
        : 0,

    exactExamples,

    nearDuplicatePairs:
      nearPairs,

    semanticComparisons:
      comparisons,

    uniqueCandidateCount:
      uniqueCandidates.length,

    uniqueExamples,

    comparisonNonX:{

      sampleSize:
        nonXSample.length,

      scanned,

      exactDuplicateGroups:
        nonXExact.groups.length,

      exactDuplicateRows:
        nonXExact.duplicateRows,

      exactDuplicateRatePct:
        nonXWithText
          ? Math.round(
              nonXExact.duplicateRows/
              nonXWithText*
              10000
            )/100
          : 0
    },

    provenance:{

      fromLegacyBuckets:
        xPolicy
          ?.fromBuckets
          ?.size||0,

      fromQuestionStatus:
        xPolicy
          ?.fromQuestionStatus
          ?.size||0
    }
  };
}

function xTruthNorm(value){

  return one(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(/œ/gi,'oe')
    .replace(/æ/gi,'ae')
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
    .replace(/\s+/g,' ');
}

function xTruthUrl(value){

  const raw=
    one(value);

  if(!raw)return '';

  try{

    const u=
      new URL(raw);

    return (
      u.origin+
      u.pathname
    )
    .toLowerCase()
    .replace(/\/+$/,'');

  }catch(_){

    return raw
      .split('#')[0]
      .split('?')[0]
      .trim()
      .toLowerCase();
  }
}

function xTruthBool(value){

  if(value===true)return true;

  const s=
    one(value)
      .toLowerCase();

  return [
    '1',
    'true',
    'oui',
    'yes'
  ].includes(s);
}

function xTruthQuestionRow(doc){

  const x=
    doc.data()||{};

  const options=[
    one(x.proposition_a),
    one(x.proposition_b),
    one(x.proposition_c),
    one(x.proposition_d)
  ];

  let correctIndex=
    Math.floor(
      num(x.correct_index)
    );

  /*
   * Les données historiques peuvent utiliser
   * 0..3 ou 1..4 selon leur provenance.
   *
   * On conserve la valeur brute ET on tente
   * simplement de résoudre le texte correct.
   */
  let correctText='';

  if(
    correctIndex>=0 &&
    correctIndex<=3
  ){
    correctText=
      options[correctIndex]||'';
  }

  if(
    !correctText &&
    correctIndex>=1 &&
    correctIndex<=4
  ){
    correctText=
      options[correctIndex-1]||'';
  }


  const imageFile=
    one(x.image_file);

  const imageSource=
    one(x.image_source_url);

  const imageKey=
    xTruthUrl(
      imageFile||
      imageSource
    );

  const isImage=
    xTruthBool(x.is_image)||
    Boolean(
      imageFile||
      imageSource
    );


  return {

    id:doc.id,

    domain:
      one(x.megatheme)||
      '(Sans domaine)',

    theme:
      one(x.theme)||
      '(Sans thème)',

    question:
      one(x.question),

    detail:
      one(x.detail),

    options,

    correctIndex,

    correctText,

    isImage,

    imageFile,

    imageSource,

    imageKey,

    source:
      one(
        x.url_quizypedia||
        x.url_internet
      )
  };
}

function xTruthStemKey(row){

  return xTruthNorm(
    row.question
  );
}

function xTruthStrictKey(row){

  /*
   * Pour une question image sans référence exploitable,
   * on refuse de conclure à un doublon.
   */
  if(
    row.isImage &&
    !row.imageKey
  ){
    return '__IMAGE_UNKNOWN__'+row.id;
  }

  return [
    xTruthNorm(row.domain),
    xTruthNorm(row.theme),
    xTruthNorm(row.question),
    xTruthNorm(row.detail),

    ...row.options.map(
      xTruthNorm
    ),

    String(
      row.correctIndex
    ),

    row.isImage
      ? 'image'
      : 'text',

    row.imageKey
  ].join('\u0001');
}

function xTruthStructuralKey(row){

  /*
   * Même identité sémantique, mais ordre des distracteurs
   * non significatif.
   */
  if(
    row.isImage &&
    !row.imageKey
  ){
    return '__IMAGE_UNKNOWN__'+row.id;
  }

  const sortedOptions=
    row.options
      .map(xTruthNorm)
      .filter(Boolean)
      .sort();

  return [
    xTruthNorm(row.domain),
    xTruthNorm(row.theme),
    xTruthNorm(row.question),
    xTruthNorm(row.detail),

    sortedOptions.join('\u0002'),

    xTruthNorm(
      row.correctText
    ),

    row.isImage
      ? 'image'
      : 'text',

    row.imageKey
  ].join('\u0001');
}

function xTruthGroups(rows,keyFn){

  const map=
    new Map();

  for(const row of rows){

    const key=
      keyFn(row);

    if(
      !key ||
      key.startsWith('__IMAGE_UNKNOWN__')
    ){
      continue;
    }

    if(!map.has(key)){
      map.set(key,[]);
    }

    map
      .get(key)
      .push(row);
  }

  const groups=
    [...map.values()]
      .filter(
        group=>
          group.length>1
      )
      .sort(
        (a,b)=>
          b.length-a.length
      );

  const ids=
    new Set();

  for(const group of groups){

    for(const row of group){
      ids.add(row.id);
    }
  }

  return {

    map,

    groups,

    ids,

    rows:
      ids.size
  };
}

function xTruthTokens(value){

  return new Set(
    xTruthNorm(value)
      .split(' ')
      .filter(
        x=>x.length>=2
      )
  );
}

function xTruthSimilarity(a,b){

  const A=
    xTruthTokens(a);

  const B=
    xTruthTokens(b);

  if(
    A.size<3 ||
    B.size<3
  ){
    return 0;
  }

  let common=0;

  for(const x of A){

    if(B.has(x)){
      common++;
    }
  }

  const union=
    A.size+
    B.size-
    common;

  return union
    ? common/union
    : 0;
}

function xTruthOptionSimilarity(a,b){

  const A=
    new Set(
      a.options
        .map(xTruthNorm)
        .filter(Boolean)
    );

  const B=
    new Set(
      b.options
        .map(xTruthNorm)
        .filter(Boolean)
    );

  if(
    !A.size &&
    !B.size
  ){
    return 1;
  }

  if(
    !A.size ||
    !B.size
  ){
    return 0;
  }

  let common=0;

  for(const x of A){

    if(B.has(x)){
      common++;
    }
  }

  const union=
    A.size+
    B.size-
    common;

  return union
    ? common/union
    : 0;
}

function xTruthPct(n,total){

  if(!total)return 0;

  return Math.round(
    n/
    total*
    10000
  )/100;
}

function xTruthGroupExamples(
  groups,
  limit=15
){

  return groups
    .slice(0,limit)
    .map(
      group=>({

        count:
          group.length,

        question:
          group[0]?.question||'',

        domain:
          group[0]?.domain||'',

        theme:
          group[0]?.theme||'',

        rows:
          group
            .slice(0,6)
            .map(
              row=>({

                id:row.id,

                question:
                  row.question,

                detail:
                  row.detail,

                correct:
                  row.correctText,

                isImage:
                  row.isImage,

                image:
                  row.imageFile||
                  row.imageSource||
                  '',

                source:
                  row.source
              })
            )
      })
    );
}

function xTruthTemplateExamples(
  stemGroups,
  structuralKeyFn,
  limit=15
){

  const out=[];

  for(const group of stemGroups){

    const signatures=
      new Set(
        group.map(
          structuralKeyFn
        )
      );

    /*
     * Même libellé, mais contenus structurels distincts.
     * C'est exactement le cas que FIX4 confondait.
     */
    if(signatures.size<=1){
      continue;
    }

    out.push({

      count:
        group.length,

      distinctContents:
        signatures.size,

      question:
        group[0]?.question||'',

      rows:
        group
          .slice(0,6)
          .map(
            row=>({

              id:row.id,

              domain:
                row.domain,

              theme:
                row.theme,

              detail:
                row.detail,

              correct:
                row.correctText,

              isImage:
                row.isImage,

              image:
                row.imageFile||
                row.imageSource||
                ''
            })
          )
    });

    if(out.length>=limit){
      break;
    }
  }

  return out;
}

async function xDuplicateTruth(
  uid,
  xPolicy,
  body
){

  const db=
    getFirestore();

  const questions=
    db
      .collection('users')
      .doc(uid)
      .collection('questions');


  const sampleLimit=
    clamp(
      Math.floor(
        num(body.sampleLimit)||3000
      ),
      500,
      5000
    );


  const totalSnap=
    await questions
      .count()
      .get();


  const totalQuestions=
    Number(
      totalSnap
        .data()
        .count||0
    );


  const xActive=
    xPolicy
      ?.catalogIds
      ?.size||0;


  const activeIds=
    [
      ...(xPolicy?.catalogIds||[])
    ]
    .sort(
      (a,b)=>
        String(a)
          .localeCompare(
            String(b),
            'fr',
            {
              numeric:true
            }
          )
    );


  /*
   * Échantillon X régulièrement réparti
   * sur l'ensemble des identifiants actifs.
   */
  const selectedIds=[];


  if(
    activeIds.length<=sampleLimit
  ){

    selectedIds.push(
      ...activeIds
    );

  }else{

    const used=
      new Set();

    for(
      let i=0;
      i<sampleLimit;
      i++
    ){

      const index=
        Math.floor(
          i*
          (activeIds.length-1)/
          Math.max(
            1,
            sampleLimit-1
          )
        );

      const id=
        activeIds[index];

      if(
        !used.has(id)
      ){

        used.add(id);
        selectedIds.push(id);
      }
    }
  }


  const sample=[];


  for(
    let i=0;
    i<selectedIds.length;
    i+=200
  ){

    const refs=
      selectedIds
        .slice(i,i+200)
        .map(
          id=>
            questions.doc(id)
        );


    if(!refs.length)continue;


    const snaps=
      await db.getAll(...refs);


    for(const d of snaps){

      if(d.exists){
        sample.push(
          xTruthQuestionRow(d)
        );
      }
    }
  }


  /*
   * Trois vérités distinctes :
   *
   * 1. même libellé ;
   * 2. copie strictement identique ;
   * 3. même structure sémantique en tolérant
   *    l'ordre des propositions.
   */
  const stems=
    xTruthGroups(
      sample,
      xTruthStemKey
    );


  const strict=
    xTruthGroups(
      sample,
      xTruthStrictKey
    );


  const structural=
    xTruthGroups(
      sample,
      xTruthStructuralKey
    );


  const imageRows=
    sample.filter(
      x=>x.isImage
    );


  const imageUnknown=
    imageRows.filter(
      x=>!x.imageKey
    );


  /*
   * Gabarits répétés mais contenus distincts.
   */
  const templateExamples=
    xTruthTemplateExamples(
      stems.groups,
      xTruthStructuralKey,
      20
    );


  const templateIds=
    new Set();


  for(const group of stems.groups){

    const signatures=
      new Set(
        group.map(
          xTruthStructuralKey
        )
      );

    if(signatures.size<=1){
      continue;
    }

    for(const row of group){
      templateIds.add(row.id);
    }
  }


  /*
   * Quasi-doublons forts.
   *
   * Très conservateur :
   * - même domaine ;
   * - même thème ;
   * - pas déjà doublon structurel ;
   * - compatibilité image obligatoire ;
   * - texte composite >= 90 % ;
   * - propositions >= 75 %.
   */
  const candidates=
    sample.filter(
      row=>
        !structural.ids.has(row.id)
    );


  const buckets=
    new Map();


  for(const row of candidates){

    const key=
      xTruthNorm(row.domain)+
      '\u0000'+
      xTruthNorm(row.theme);

    if(!buckets.has(key)){
      buckets.set(key,[]);
    }

    buckets
      .get(key)
      .push(row);
  }


  const nearPairs=[];

  const nearIds=
    new Set();

  let comparisons=0;

  const maxComparisons=
    80000;


  outer:
  for(const rows of buckets.values()){

    const capped=
      rows.slice(0,300);

    for(
      let i=0;
      i<capped.length;
      i++
    ){

      for(
        let j=i+1;
        j<capped.length;
        j++
      ){

        comparisons++;

        if(
          comparisons>maxComparisons
        ){
          break outer;
        }


        const a=
          capped[i];

        const b=
          capped[j];


        /*
         * Une question avec image ne peut être rapprochée
         * que d'une autre utilisant la même image connue.
         */
        if(
          a.isImage !== b.isImage
        ){
          continue;
        }


        if(a.isImage){

          if(
            !a.imageKey ||
            !b.imageKey ||
            a.imageKey!==b.imageKey
          ){
            continue;
          }
        }


        const textA=[
          a.question,
          a.detail,
          a.correctText
        ].join(' ');


        const textB=[
          b.question,
          b.detail,
          b.correctText
        ].join(' ');


        const textSimilarity=
          xTruthSimilarity(
            textA,
            textB
          );


        if(
          textSimilarity<0.90
        ){
          continue;
        }


        const optionSimilarity=
          xTruthOptionSimilarity(
            a,
            b
          );


        if(
          optionSimilarity<0.75
        ){
          continue;
        }


        nearIds.add(a.id);
        nearIds.add(b.id);


        nearPairs.push({

          similarity:
            Math.round(
              textSimilarity*100
            ),

          optionsSimilarity:
            Math.round(
              optionSimilarity*100
            ),

          domain:
            a.domain,

          theme:
            a.theme,

          a:{
            id:a.id,
            question:a.question,
            detail:a.detail,
            correct:a.correctText,
            image:
              a.imageFile||
              a.imageSource||
              ''
          },

          b:{
            id:b.id,
            question:b.question,
            detail:b.detail,
            correct:b.correctText,
            image:
              b.imageFile||
              b.imageSource||
              ''
          }
        });


        if(
          nearPairs.length>=30
        ){
          break outer;
        }
      }
    }
  }


  /*
   * X sans doublon structurel ni quasi-doublon
   * détecté DANS L'ÉCHANTILLON.
   */
  const unmatched=
    sample.filter(
      row=>
        !structural.ids.has(row.id) &&
        !nearIds.has(row.id)
    );


  const uniqueExamples=[];


  if(unmatched.length){

    const wanted=
      Math.min(
        25,
        unmatched.length
      );

    for(
      let i=0;
      i<wanted;
      i++
    ){

      const index=
        Math.floor(
          i*
          (unmatched.length-1)/
          Math.max(
            1,
            wanted-1
          )
        );

      const row=
        unmatched[index];


      uniqueExamples.push({

        id:row.id,

        domain:row.domain,

        theme:row.theme,

        question:row.question,

        detail:row.detail,

        correct:
          row.correctText,

        isImage:
          row.isImage,

        image:
          row.imageFile||
          row.imageSource||
          ''
      });
    }
  }


  /*
   * CONTRÔLE NON-X DISTRIBUÉ.
   *
   * FIX4 prenait les premiers documents du catalogue,
   * ce qui pouvait être fortement biaisé.
   *
   * Ici, on ouvre plusieurs fenêtres réparties le long
   * des identifiants X, qui eux-mêmes couvrent la base.
   */
  const nonXSample=[];

  const nonXSeen=
    new Set();


  const anchorCount=
    Math.min(
      16,
      activeIds.length
    );


  for(
    let i=0;
    i<anchorCount &&
    nonXSample.length<600;
    i++
  ){

    const anchorIndex=
      Math.floor(
        i*
        (activeIds.length-1)/
        Math.max(
          1,
          anchorCount-1
        )
      );


    const anchor=
      activeIds[
        anchorIndex
      ];


    const snap=
      await questions
        .orderBy(
          FieldPath.documentId()
        )
        .startAt(
          questions.doc(anchor)
        )
        .select(
          'question',
          'detail',
          'megatheme',
          'theme',
          'proposition_a',
          'proposition_b',
          'proposition_c',
          'proposition_d',
          'correct_index',
          'is_image',
          'image_file',
          'image_source_url',
          'url_quizypedia',
          'url_internet'
        )
        .limit(120)
        .get();


    for(const d of snap.docs){

      if(
        nonXSample.length>=600
      ){
        break;
      }


      if(
        nonXSeen.has(d.id) ||
        xPolicy
          ?.ids
          ?.has(d.id)
      ){
        continue;
      }


      nonXSeen.add(d.id);

      nonXSample.push(
        xTruthQuestionRow(d)
      );
    }
  }


  const nonXStems=
    xTruthGroups(
      nonXSample,
      xTruthStemKey
    );


  const nonXStrict=
    xTruthGroups(
      nonXSample,
      xTruthStrictKey
    );


  const nonXStructural=
    xTruthGroups(
      nonXSample,
      xTruthStructuralKey
    );


  return {

    auditVersion:
      X_DUPLICATE_TRUTH_VERSION,

    readOnly:true,

    methodology:
      'X_DUPLICATE_TRUTH002',

    totalQuestions,

    xActive,

    nonX:
      Math.max(
        0,
        totalQuestions-xActive
      ),

    xActivePct:
      xTruthPct(
        xActive,
        totalQuestions
      ),

    sampleSize:
      sample.length,

    sampleCoveragePct:
      xTruthPct(
        sample.length,
        xActive
      ),


    /*
     * Même libellé : descriptif uniquement.
     */
    repeatedStemGroups:
      stems.groups.length,

    repeatedStemRows:
      stems.rows,

    repeatedStemRatePct:
      xTruthPct(
        stems.rows,
        sample.length
      ),


    /*
     * Doublons réellement forts.
     */
    strictDuplicateGroups:
      strict.groups.length,

    strictDuplicateRows:
      strict.rows,

    strictDuplicateRatePct:
      xTruthPct(
        strict.rows,
        sample.length
      ),


    structuralDuplicateGroups:
      structural.groups.length,

    structuralDuplicateRows:
      structural.rows,

    structuralDuplicateRatePct:
      xTruthPct(
        structural.rows,
        sample.length
      ),


    templateReuseRows:
      templateIds.size,

    templateReuseRatePct:
      xTruthPct(
        templateIds.size,
        sample.length
      ),


    imageSampleRows:
      imageRows.length,

    imageWithoutReference:
      imageUnknown.length,


    nearDuplicatePairCount:
      nearPairs.length,

    nearDuplicateRows:
      nearIds.size,

    nearDuplicateRatePct:
      xTruthPct(
        nearIds.size,
        sample.length
      ),

    semanticComparisons:
      comparisons,


    unmatchedRows:
      unmatched.length,

    unmatchedRatePct:
      xTruthPct(
        unmatched.length,
        sample.length
      ),


    strictExamples:
      xTruthGroupExamples(
        strict.groups,
        15
      ),

    structuralExamples:
      xTruthGroupExamples(
        structural.groups,
        20
      ),

    templateExamples,

    nearPairs,

    unmatchedExamples:
      uniqueExamples,


    comparisonNonX:{

      sampleSize:
        nonXSample.length,

      repeatedStemRows:
        nonXStems.rows,

      repeatedStemRatePct:
        xTruthPct(
          nonXStems.rows,
          nonXSample.length
        ),

      strictDuplicateRows:
        nonXStrict.rows,

      strictDuplicateRatePct:
        xTruthPct(
          nonXStrict.rows,
          nonXSample.length
        ),

      structuralDuplicateRows:
        nonXStructural.rows,

      structuralDuplicateRatePct:
        xTruthPct(
          nonXStructural.rows,
          nonXSample.length
        )
    }
  };
}

function xOriginStatus(value){

  return one(value)
    .trim()
    .toUpperCase();
}

function xOriginTimestamp(value){

  if(!value)return 0;

  try{

    if(
      typeof value.toMillis==='function'
    ){
      return value.toMillis();
    }

    if(value.seconds){
      return Number(value.seconds)*1000;
    }

    const n=
      new Date(value)
        .getTime();

    return Number.isFinite(n)
      ? n
      : 0;

  }catch(_){

    return 0;
  }
}

function xOriginHistoryStatus(row){

  const before=
    row?.before_snapshot &&
    typeof row.before_snapshot==='object'
      ? xOriginStatus(
          row.before_snapshot.status
        )
      : '';

  const after=
    row?.after_snapshot &&
    typeof row.after_snapshot==='object'
      ? xOriginStatus(
          row.after_snapshot.status
        )
      : '';

  const patchHasStatus=
    Boolean(
      row?.patch &&
      typeof row.patch==='object' &&
      Object.prototype.hasOwnProperty.call(
        row.patch,
        'status'
      )
    );

  const patch=
    patchHasStatus
      ? xOriginStatus(
          row.patch.status
        )
      : '';

  return {
    before,
    after,
    patch,
    patchHasStatus
  };
}

function xOriginEvent(row){

  const status=
    xOriginHistoryStatus(row);

  const operation=
    one(row?.operation)
      .toLowerCase();

  const target=
    status.patchHasStatus
      ? status.patch
      : status.after;


  if(
    operation==='create' &&
    target==='X'
  ){
    return 'created_as_x';
  }


  /*
   * Un patch explicite status=X constitue une preuve
   * d'affectation de X, même si l'ancien snapshot
   * n'existait pas encore à cette époque.
   */
  if(
    status.patchHasStatus &&
    status.patch==='X' &&
    status.before!=='X'
  ){
    return 'set_to_x';
  }


  if(
    status.before!=='X' &&
    status.after==='X'
  ){
    return 'set_to_x';
  }


  if(
    status.before==='X' &&
    (
      status.after==='X' ||
      (
        status.patchHasStatus &&
        status.patch==='X'
      )
    )
  ){
    return 'x_preserved';
  }


  return '';
}

function xOriginSourceFamily(row){

  const s=[
    row?.writer_id,
    row?.writer_label,
    row?.source
  ]
  .map(
    x=>one(x).toUpperCase()
  )
  .join(' ');


  if(
    s.includes('CGWEB019')
  ){
    return 'Édition Web CGWEB019';
  }


  if(
    s.includes('CGWEB022') ||
    s.includes('RESTORE')
  ){
    return 'Restauration';
  }


  if(
    s.includes('BULK') ||
    s.includes('MASS')
  ){
    return 'Opération massive';
  }


  if(
    s.includes('CGWEB024') ||
    s.includes('CGIMPORT') ||
    s.includes('IMPORT')
  ){
    return 'Import';
  }


  if(
    s.includes('MIGR') ||
    s.includes('RECOVERY') ||
    s.includes('RECOVER') ||
    s.includes('SCRIPT') ||
    s.includes('FIX')
  ){
    return 'Migration / technique';
  }


  if(
    s.includes('CGSYNC') ||
    s.includes('SYNC')
  ){
    return 'Synchronisation';
  }


  return 'Autre / indéterminée';
}

function xOriginQualitySignals(doc){

  const x=
    doc?.data
      ? doc.data()
      : {};

  const q=
    one(x.question);

  const options=[
    one(x.proposition_a),
    one(x.proposition_b),
    one(x.proposition_c),
    one(x.proposition_d)
  ];

  const signals=[];


  if(!q){
    signals.push(
      'question vide'
    );
  }


  if(
    options.filter(Boolean).length<4
  ){
    signals.push(
      'QCM incomplet'
    );
  }


  const nonTrouve=
    x.non_trouve===1 ||
    x.non_trouve===true ||
    one(x.non_trouve)==='1';


  if(nonTrouve){
    signals.push(
      'non_trouve'
    );
  }


  const isImage=
    x.is_image===1 ||
    x.is_image===true ||
    one(x.is_image)==='1';


  if(
    isImage &&
    !one(x.image_file) &&
    !one(x.image_source_url)
  ){
    signals.push(
      'image sans référence'
    );
  }


  return signals;
}

function xOriginExample(
  id,
  doc,
  histories,
  classification
){

  const x=
    doc?.data
      ? doc.data()
      : {};


  const historySummary=
    histories
      .filter(
        h=>xOriginEvent(h)
      )
      .slice(-3)
      .map(
        h=>({

          event:
            xOriginEvent(h),

          operation:
            one(h.operation),

          source:
            one(
              h.source||
              h.writer_label||
              h.writer_id
            ),

          family:
            xOriginSourceFamily(h),

          at:
            xOriginTimestamp(
              h.created_at
            )
        })
      );


  return {

    id,

    classification,

    domain:
      one(x.megatheme),

    theme:
      one(x.theme),

    question:
      one(x.question),

    detail:
      one(x.detail),

    cgWriter:
      one(
        x.cg_writer_label||
        x.cg_writer_id
      ),

    cgSource:
      one(
        x.cg_update_source
      ),

    revision:
      Number(
        x.cg_revision||0
      )||0,

    qualitySignals:
      xOriginQualitySignals(doc),

    historyCount:
      histories.length,

    historySummary
  };
}

async function xOriginAudit(
  uid,
  xPolicy,
  body
){

  const db=
    getFirestore();

  const base=
    db
      .collection('users')
      .doc(uid);

  const questions=
    base.collection('questions');

  const history=
    base.collection('question_history');


  /*
   * L'historique n'est pas complet sur toute la vie
   * du catalogue. On travaille donc sur un échantillon
   * suffisamment large, sans transformer absence de
   * trace en preuve de réhabilitation.
   */
  const sampleLimit=
    clamp(
      Math.floor(
        num(body.sampleLimit)||1200
      ),
      300,
      2000
    );


  const activeIds=[
    ...(xPolicy?.catalogIds||[])
  ]
  .sort(
    (a,b)=>
      String(a)
        .localeCompare(
          String(b),
          'fr',
          {
            numeric:true
          }
        )
  );


  const selectedIds=[];


  if(
    activeIds.length<=sampleLimit
  ){

    selectedIds.push(
      ...activeIds
    );

  }else{

    const used=
      new Set();

    for(
      let i=0;
      i<sampleLimit;
      i++
    ){

      const index=
        Math.floor(
          i*
          (activeIds.length-1)/
          Math.max(
            1,
            sampleLimit-1
          )
        );

      const id=
        activeIds[index];

      if(
        !used.has(id)
      ){
        used.add(id);
        selectedIds.push(id);
      }
    }
  }


  /*
   * Documents questions.
   *
   * loadXPolicy possède normalement déjà les snapshots
   * status=X ; fallback getAll si nécessaire.
   */
  const docs=
    new Map();


  for(const id of selectedIds){

    const d=
      xPolicy
        ?.docs
        ?.get(id);

    if(d?.exists){
      docs.set(id,d);
    }
  }


  const missingIds=
    selectedIds.filter(
      id=>!docs.has(id)
    );


  for(
    let i=0;
    i<missingIds.length;
    i+=200
  ){

    const refs=
      missingIds
        .slice(i,i+200)
        .map(
          id=>questions.doc(id)
        );

    const snaps=
      await db.getAll(...refs);

    for(const d of snaps){

      if(d.exists){
        docs.set(d.id,d);
      }
    }
  }


  /*
   * Historique ciblé.
   *
   * Requêtes "in" par petits lots :
   * pas de lecture exhaustive de question_history.
   */
  const historyByQuestion=
    new Map();


  for(const id of selectedIds){
    historyByQuestion.set(id,[]);
  }


  for(
    let i=0;
    i<selectedIds.length;
    i+=25
  ){

    const ids=
      selectedIds.slice(i,i+25);


    const snap=
      await history
        .where(
          'question_id',
          'in',
          ids
        )
        .get()
        .catch(
          ()=>({
            docs:[]
          })
        );


    for(const d of snap.docs){

      const row={
        id:d.id,
        ...d.data()
      };

      const qid=
        one(row.question_id);

      if(
        historyByQuestion.has(qid)
      ){
        historyByQuestion
          .get(qid)
          .push(row);
      }
    }
  }


  for(
    const rows
    of historyByQuestion.values()
  ){

    rows.sort(
      (a,b)=>
        xOriginTimestamp(a.created_at)-
        xOriginTimestamp(b.created_at)
    );
  }


  const counters={

    withHistory:0,

    withoutHistory:0,

    explicitSetX:0,

    createdAsX:0,

    xPreservedOnly:0,

    historyNoXEvidence:0,

    strongReviewCandidate:0,

    qualityReviewCandidate:0,

    explicitKeepEvidence:0
  };


  const sourceFamilies=
    new Map();


  const examples={

    explicit:[],

    strong:[],

    quality:[],

    noHistory:[],

    preserved:[]
  };


  for(const id of selectedIds){

    const doc=
      docs.get(id);

    if(!doc)continue;


    const rows=
      historyByQuestion.get(id)||[];


    if(rows.length){
      counters.withHistory++;
    }else{
      counters.withoutHistory++;
    }


    const events=
      rows
        .map(
          row=>({
            row,
            kind:
              xOriginEvent(row)
          })
        )
        .filter(
          x=>x.kind
        );


    const createdAsX=
      events.some(
        x=>
          x.kind==='created_as_x'
      );


    const setToX=
      events.some(
        x=>
          x.kind==='set_to_x'
      );


    const preserved=
      events.some(
        x=>
          x.kind==='x_preserved'
      );


    const qualitySignals=
      xOriginQualitySignals(doc);


    /*
     * Toute création en X ou transition explicite
     * vers X est considérée comme preuve positive
     * de conservation, pas comme candidat automatique.
     */
    if(
      createdAsX ||
      setToX
    ){

      counters.explicitKeepEvidence++;

      if(createdAsX){
        counters.createdAsX++;
      }

      if(setToX){
        counters.explicitSetX++;
      }


      for(const event of events){

        if(
          event.kind!=='created_as_x' &&
          event.kind!=='set_to_x'
        ){
          continue;
        }

        const family=
          xOriginSourceFamily(
            event.row
          );

        sourceFamilies.set(
          family,
          (
            sourceFamilies.get(family)||0
          )+1
        );
      }


      if(
        examples.explicit.length<20
      ){
        examples.explicit.push(
          xOriginExample(
            id,
            doc,
            rows,
            'X explicitement historisé'
          )
        );
      }

      continue;
    }


    /*
     * Pas de preuve d'affectation.
     */
    if(
      preserved
    ){

      counters.xPreservedOnly++;

      if(
        examples.preserved.length<15
      ){
        examples.preserved.push(
          xOriginExample(
            id,
            doc,
            rows,
            'X déjà présent au début de l’historique disponible'
          )
        );
      }

    }else if(rows.length){

      counters.historyNoXEvidence++;
    }


    /*
     * Preview de réexamen seulement.
     *
     * Aucun changement de statut.
     */
    if(
      qualitySignals.length===0
    ){

      counters.strongReviewCandidate++;

      if(
        examples.strong.length<25
      ){
        examples.strong.push(
          xOriginExample(
            id,
            doc,
            rows,
            'Candidat fort à réexamen'
          )
        );
      }

    }else{

      counters.qualityReviewCandidate++;

      if(
        examples.quality.length<20
      ){
        examples.quality.push(
          xOriginExample(
            id,
            doc,
            rows,
            'Candidat à contrôler'
          )
        );
      }
    }


    if(
      !rows.length &&
      examples.noHistory.length<20
    ){
      examples.noHistory.push(
        xOriginExample(
          id,
          doc,
          rows,
          'Aucun historique disponible'
        )
      );
    }
  }


  const sourceSummary=
    [...sourceFamilies.entries()]
      .map(
        ([name,count])=>({
          name,
          count
        })
      )
      .sort(
        (a,b)=>
          b.count-a.count
      );


  const analyzed=
    [
      ...selectedIds
    ]
    .filter(
      id=>docs.has(id)
    )
    .length;


  return {

    auditVersion:
      X_ORIGIN_VERSION,

    previewVersion:
      X_REHABILITATION_PREVIEW_VERSION,

    readOnly:true,

    modificationsPerformed:0,

    xActive:
      xPolicy
        ?.catalogIds
        ?.size||0,

    sampleRequested:
      selectedIds.length,

    sampleAnalyzed:
      analyzed,

    sampleCoveragePct:
      xPolicy?.catalogIds?.size
        ? Math.round(
            analyzed/
            xPolicy.catalogIds.size*
            10000
          )/100
        : 0,

    historyWarning:
      'question_history ne couvre que les écritures historisées depuis CGWEB019/CGWEB022 ; absence de trace ne prouve pas que X était involontaire.',

    ...counters,

    historyCoveragePct:
      analyzed
        ? Math.round(
            counters.withHistory/
            analyzed*
            10000
          )/100
        : 0,

    explicitKeepPct:
      analyzed
        ? Math.round(
            counters.explicitKeepEvidence/
            analyzed*
            10000
          )/100
        : 0,

    strongReviewPct:
      analyzed
        ? Math.round(
            counters.strongReviewCandidate/
            analyzed*
            10000
          )/100
        : 0,

    qualityReviewPct:
      analyzed
        ? Math.round(
            counters.qualityReviewCandidate/
            analyzed*
            10000
          )/100
        : 0,

    sourceSummary,

    examples
  };
}

function smartLongConfig(body){

  return {

    count:
      clamp(
        Math.floor(
          num(body?.count)||20
        ),
        5,
        1000
      ),

    batchSize:
      clamp(
        Math.floor(
          num(body?.batchSize)||50
        ),
        10,
        100
      ),

    duePct:
      clamp(
        num(
          body?.duePct??40
        ),
        0,
        100
      ),

    weakPct:
      clamp(
        num(
          body?.weakPct??35
        ),
        0,
        100
      ),

    unseenPct:
      clamp(
        num(
          body?.unseenPct??25
        ),
        0,
        100
      ),

    domain:
      one(body?.domain)
  };
}

function smartLongCounts(value){

  const v=
    value&&
    typeof value==='object'
      ? value
      : {};

  return {

    due:
      Math.max(
        0,
        Math.floor(
          num(v.due)
        )
      ),

    weakness:
      Math.max(
        0,
        Math.floor(
          num(v.weakness)
        )
      ),

    unseen:
      Math.max(
        0,
        Math.floor(
          num(v.unseen)
        )
      )
  };
}

function smartLongRowId(row){

  return (
    one(row?.id) ||
    one(row?.questionId) ||
    (
      row?.row
        ? String(row.row)
        : ''
    )
  );
}

async function smartLongUnseenPool(
  uid,
  analysis,
  wanted,
  domain,
  xPolicy,
  blocked
){

  const seen=
    new Set(
      analysis.questions
        .map(
          x=>
            one(x.questionId)
        )
        .filter(Boolean)
    );


  for(const id of blocked||[]){
    seen.add(
      one(id)
    );
  }


  const out=[];

  const col=
    getFirestore()
      .collection('users')
      .doc(uid)
      .collection('questions');


  let last=null;
  let scanned=0;


  /*
   * Les lots longs peuvent avoir déjà consommé
   * plusieurs centaines d'identifiants.
   * Le scan reste borné.
   */
  const maxScan=
    Math.max(
      5000,
      Math.min(
        30000,
        Math.max(
          1,
          wanted
        )*200
      )
    );


  while(
    out.length<wanted &&
    scanned<maxScan
  ){

    let q=col;


    if(domain){

      q=q.where(
        'megatheme',
        '==',
        domain
      );
    }


    q=q
      .orderBy(
        FieldPath.documentId()
      )
      .select(
        'question',
        'detail',
        'megatheme',
        'theme'
      )
      .limit(250);


    if(last){

      q=q.startAfter(last);
    }


    const snap=
      await q.get();


    if(snap.empty)break;


    scanned+=snap.size;


    for(const d of snap.docs){

      if(
        seen.has(d.id) ||
        xPolicy?.ids?.has(d.id)
      ){
        continue;
      }


      const x=
        d.data()||{};


      out.push({

        id:d.id,

        row:
          num(d.id),

        domain:
          one(x.megatheme),

        theme:
          one(x.theme),

        question:
          one(x.question),

        detail:
          one(x.detail),

        source:'unseen',

        reason:'Jamais vue',

        due:false,

        weakness:0,

        successPercent:null,

        attempts:0,

        mastery:'Jamais vue',

        medianResponseMs:0
      });


      seen.add(d.id);


      if(
        out.length>=wanted
      ){
        break;
      }
    }


    last=
      snap.docs[
        snap.docs.length-1
      ];


    if(snap.size<250){
      break;
    }
  }


  return {
    rows:
      cg35Shuffle(out),

    scanned
  };
}

async function smartLongComposeBatch(
  uid,
  analysis,
  body,
  xPolicy
){

  const config=
    smartLongConfig(body);


  const servedCounts=
    smartLongCounts(
      body?.servedCounts
    );


  const blocked=
    new Set(
      (
        Array.isArray(
          body?.excludeIds
        )
          ? body.excludeIds
          : []
      )
      .map(one)
      .filter(Boolean)
      .slice(0,1000)
    );


  const remainingTotal=
    Math.max(
      0,
      config.count-
      blocked.size
    );


  const batchCount=
    Math.min(
      config.batchSize,
      remainingTotal
    );


  const targetQuota=
    smartQuota(
      config.count,
      config.duePct,
      config.weakPct,
      config.unseenPct
    );


  if(batchCount<=0){

    return {

      rows:[],

      requestedBatch:0,

      desired:{
        due:0,
        weakness:0,
        unseen:0
      },

      actual:{
        due:0,
        weakness:0,
        unseen:0
      },

      targetQuota,

      servedCountsAfter:
        servedCounts,

      redistributed:0,

      scannedUnseen:0
    };
  }


  /*
   * ADAPTIVE_BATCH001 :
   * le prochain lot cherche à rattraper les quotas
   * globaux restant encore à servir.
   */
  const remainingTargets={

    due:
      Math.max(
        0,
        targetQuota.due-
        servedCounts.due
      ),

    weakness:
      Math.max(
        0,
        targetQuota.weakness-
        servedCounts.weakness
      ),

    unseen:
      Math.max(
        0,
        targetQuota.unseen-
        servedCounts.unseen
      )
  };


  const remainingWeight=
    remainingTargets.due+
    remainingTargets.weakness+
    remainingTargets.unseen;


  const desired=
    remainingWeight>0

      ? smartQuota(
          batchCount,
          remainingTargets.due,
          remainingTargets.weakness,
          remainingTargets.unseen
        )

      : smartQuota(
          batchCount,
          config.duePct,
          config.weakPct,
          config.unseenPct
        );


  const selected=[];

  const selectedIds=
    new Set(blocked);


  const eligible=q=>{

    const id=
      one(q.questionId)||
      String(q.row||'');


    if(
      !id ||
      selectedIds.has(id) ||
      xPolicy?.ids?.has(id)
    ){
      return false;
    }


    if(
      config.domain &&
      one(q.domain)!==config.domain
    ){
      return false;
    }


    return true;
  };


  const due=
    analysis.questions
      .filter(
        q=>
          q.due &&
          eligible(q)
      )
      .sort(
        (a,b)=>
          b.overdueMs-a.overdueMs ||
          a.successPercent-b.successPercent
      );


  const weak=
    analysis.questions
      .filter(
        q=>
          q.priority &&
          eligible(q)
      )
      .sort(
        (a,b)=>
          b.weakness-a.weakness ||
          b.failures-a.failures
      );


  const unseenWanted=
    Math.min(
      250,
      Math.max(
        batchCount*3,
        desired.unseen+
        batchCount
      )
    );


  const unseenResult=
    await smartLongUnseenPool(
      uid,
      analysis,
      unseenWanted,
      config.domain,
      xPolicy,
      selectedIds
    );


  const pools={

    due,

    weakness:weak,

    unseen:
      unseenResult.rows
  };


  const cursor={
    due:0,
    weakness:0,
    unseen:0
  };


  const actual={
    due:0,
    weakness:0,
    unseen:0
  };


  function pullOne(key){

    const pool=
      pools[key]||[];


    while(
      cursor[key]<
      pool.length
    ){

      const q=
        pool[
          cursor[key]++
        ];


      const id=
        key==='unseen'
          ? one(q.id)
          : (
              one(q.questionId)||
              String(q.row||'')
            );


      if(
        !id ||
        selectedIds.has(id) ||
        xPolicy?.ids?.has(id)
      ){
        continue;
      }


      const row=
        key==='unseen'
          ? q
          : smartHistoricalRow(
              q,
              key
            );


      selected.push(row);

      selectedIds.add(id);

      actual[key]++;

      return true;
    }


    return false;
  }


  /*
   * Quotas primaires.
   */
  for(
    const key of [
      'due',
      'weakness',
      'unseen'
    ]
  ){

    while(
      actual[key]<
        desired[key] &&
      selected.length<
        batchCount
    ){

      if(
        !pullOne(key)
      ){
        break;
      }
    }
  }


  /*
   * SMART_BALANCE pour le lot :
   * toute place manquante est redistribuée vers
   * la catégorie ayant le plus grand déficit global.
   */
  while(
    selected.length<
    batchCount
  ){

    const keys=[
      'due',
      'weakness',
      'unseen'
    ];


    keys.sort(
      (a,b)=>{

        const da=
          targetQuota[a]-
          (
            servedCounts[a]+
            actual[a]
          );


        const db=
          targetQuota[b]-
          (
            servedCounts[b]+
            actual[b]
          );


        return db-da;
      }
    );


    let added=false;


    for(const key of keys){

      if(pullOne(key)){

        added=true;
        break;
      }
    }


    if(!added){
      break;
    }
  }


  const servedCountsAfter={

    due:
      servedCounts.due+
      actual.due,

    weakness:
      servedCounts.weakness+
      actual.weakness,

    unseen:
      servedCounts.unseen+
      actual.unseen
  };


  const redistributed=
    ['due','weakness','unseen']
      .reduce(
        (sum,key)=>
          sum+
          Math.max(
            0,
            actual[key]-
            desired[key]
          ),
        0
      );


  return {

    rows:
      selected.slice(
        0,
        batchCount
      ),

    requestedBatch:
      batchCount,

    desired,

    actual,

    targetQuota,

    servedCountsAfter,

    redistributed,

    scannedUnseen:
      unseenResult.scanned
  };
}

function smartLongPublicState(
  id,
  state
){

  const s=
    state||{};


  return {

    found:true,

    sessionId:id,

    version:
      CGPLAY004_LONG_SESSION_VERSION,

    adaptiveVersion:
      CGPLAY004_ADAPTIVE_BATCH_VERSION,

    resumeVersion:
      CGPLAY004_SESSION_RESUME_VERSION,

    status:
      one(s.status)||
      'active',

    config:
      s.config||{},

    targetQuota:
      s.targetQuota||{
        due:0,
        weakness:0,
        unseen:0
      },

    servedCounts:
      smartLongCounts(
        s.servedCounts
      ),

    generatedCount:
      Number(
        s.generatedCount||0
      )||0,

    batchNo:
      Number(
        s.batchNo||0
      )||0,

    currentBatch:
      Array.isArray(
        s.currentBatch
      )
        ? s.currentBatch
        : [],

    lastBatchActual:
      s.lastBatchActual||{
        due:0,
        weakness:0,
        unseen:0
      },

    lastBatchDesired:
      s.lastBatchDesired||{
        due:0,
        weakness:0,
        unseen:0
      },

    lastRedistributed:
      Number(
        s.lastRedistributed||0
      )||0,

    createdAtMs:
      Number(
        s.createdAtMs||0
      )||0,

    updatedAtMs:
      Number(
        s.updatedAtMs||0
      )||0,

    complete:
      one(s.status)!=='active'
  };
}

async function smartLongStart(
  uid,
  analysis,
  body,
  xPolicy
){

  const db=
    getFirestore();

  const config=
    smartLongConfig(body);


  const sessions=
    db
      .collection('users')
      .doc(uid)
      .collection('smart_sessions');


  const ref=
    sessions.doc();


  const batch=
    await smartLongComposeBatch(
      uid,
      analysis,
      {
        ...config,
        excludeIds:[],
        servedCounts:{
          due:0,
          weakness:0,
          unseen:0
        }
      },
      xPolicy
    );


  const servedIds=
    batch.rows
      .map(smartLongRowId)
      .filter(Boolean);


  const now=
    Date.now();


  const generatedCount=
    servedIds.length;


  const status=
    generatedCount>=config.count
      ? 'completed'
      : (
          batch.rows.length
            ? 'active'
            : 'exhausted'
        );


  const state={

    version:
      CGPLAY004_LONG_SESSION_VERSION,

    adaptiveVersion:
      CGPLAY004_ADAPTIVE_BATCH_VERSION,

    resumeVersion:
      CGPLAY004_SESSION_RESUME_VERSION,

    status,

    config,

    targetQuota:
      batch.targetQuota,

    servedCounts:
      batch.servedCountsAfter,

    servedIds,

    generatedCount,

    batchNo:
      batch.rows.length
        ? 1
        : 0,

    currentBatch:
      batch.rows,

    lastBatchActual:
      batch.actual,

    lastBatchDesired:
      batch.desired,

    lastRedistributed:
      batch.redistributed,

    createdAtMs:now,

    updatedAtMs:now
  };


  await ref.set(state);


  return smartLongPublicState(
    ref.id,
    state
  );
}

async function smartLongNext(
  uid,
  analysis,
  body,
  xPolicy
){

  const id=
    one(body?.sessionId);


  if(!id){

    const e=
      new Error(
        'Identifiant de séance manquant.'
      );

    e.status=400;

    throw e;
  }


  const db=
    getFirestore();


  const ref=
    db
      .collection('users')
      .doc(uid)
      .collection('smart_sessions')
      .doc(id);


  const snap=
    await ref.get();


  if(!snap.exists){

    const e=
      new Error(
        'Séance longue introuvable.'
      );

    e.status=404;

    throw e;
  }


  const state=
    snap.data()||{};


  if(
    one(state.status)!=='active'
  ){

    return smartLongPublicState(
      id,
      state
    );
  }


  const config=
    smartLongConfig(
      state.config||{}
    );


  const excludeIds=
    Array.isArray(
      state.servedIds
    )
      ? state.servedIds
      : [];


  const batch=
    await smartLongComposeBatch(
      uid,
      analysis,
      {
        ...config,
        excludeIds,
        servedCounts:
          state.servedCounts||{}
      },
      xPolicy
    );


  const newIds=
    batch.rows
      .map(smartLongRowId)
      .filter(Boolean);


  const servedIds=[
    ...excludeIds,
    ...newIds
  ]
  .slice(0,1000);


  const generatedCount=
    servedIds.length;


  const status=
    generatedCount>=config.count
      ? 'completed'
      : (
          batch.rows.length
            ? 'active'
            : 'exhausted'
        );


  const next={

    ...state,

    status,

    config,

    targetQuota:
      batch.targetQuota,

    servedCounts:
      batch.servedCountsAfter,

    servedIds,

    generatedCount,

    batchNo:
      (
        Number(
          state.batchNo||0
        )||0
      )+
      (
        batch.rows.length
          ? 1
          : 0
      ),

    currentBatch:
      batch.rows,

    lastBatchActual:
      batch.actual,

    lastBatchDesired:
      batch.desired,

    lastRedistributed:
      batch.redistributed,

    updatedAtMs:
      Date.now()
  };


  await ref.set(
    next,
    {
      merge:true
    }
  );


  return smartLongPublicState(
    id,
    next
  );
}

async function smartLongResume(
  uid,
  body
){

  const db=
    getFirestore();


  const sessions=
    db
      .collection('users')
      .doc(uid)
      .collection('smart_sessions');


  const requestedId=
    one(body?.sessionId);


  if(requestedId){

    const snap=
      await sessions
        .doc(requestedId)
        .get();


    if(
      snap.exists &&
      one(
        snap.data()?.status
      )==='active'
    ){

      return smartLongPublicState(
        snap.id,
        snap.data()
      );
    }
  }


  /*
   * Sans ID : recherche de la séance active
   * la plus récente. Aucune requête composite.
   */
  const recent=
    await sessions
      .orderBy(
        'updatedAtMs',
        'desc'
      )
      .limit(10)
      .get();


  const active=
    recent.docs.find(
      d=>
        one(
          d.data()?.status
        )==='active'
    );


  if(!active){

    return {
      found:false
    };
  }


  return smartLongPublicState(
    active.id,
    active.data()
  );
}

async function smartLongStop(
  uid,
  body
){

  const id=
    one(body?.sessionId);


  if(!id){

    return {
      found:false
    };
  }


  const ref=
    getFirestore()
      .collection('users')
      .doc(uid)
      .collection('smart_sessions')
      .doc(id);


  const snap=
    await ref.get();


  if(!snap.exists){

    return {
      found:false
    };
  }


  const state=
    snap.data()||{};


  const next={

    ...state,

    status:'stopped',

    updatedAtMs:
      Date.now()
  };


  await ref.set(
    {
      status:'stopped',
      updatedAtMs:
        next.updatedAtMs
    },
    {
      merge:true
    }
  );


  return smartLongPublicState(
    id,
    next
  );
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
      mode==='neverQuestions'||
                mode==='xSemanticAudit'||
                mode==='xDuplicateTruth'||
                mode==='xOriginAudit'||
                mode==='smartLongStart'||
                mode==='smartLongNext'||
                mode==='smartLongResume'||
                mode==='smartLongStop';

    const xPolicy=await loadXPolicy(user.uid,forceX);

              if(mode==='smartLongResume'){

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    session:
                      await smartLongResume(
                        user.uid,
                        body
                      )
                  }
                );
              }


              if(mode==='smartLongStop'){

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    session:
                      await smartLongStop(
                        user.uid,
                        body
                      )
                  }
                );
              }


              if(mode==='xOriginAudit'){

                const audit=
                  await xOriginAudit(
                    user.uid,
                    xPolicy,
                    body
                  );

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    audit,
                    learningModel:
                      learningModelMeta(
                        xPolicy
                      )
                  }
                );
              }


              if(mode==='xDuplicateTruth'){

                const audit=
                  await xDuplicateTruth(
                    user.uid,
                    xPolicy,
                    body
                  );

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    audit,
                    learningModel:
                      learningModelMeta(
                        xPolicy
                      )
                  }
                );
              }


              if(mode==='xSemanticAudit'){

                const audit=
                  await xSemanticAudit(
                    user.uid,
                    xPolicy,
                    body
                  );

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    audit,
                    learningModel:
                      learningModelMeta(
                        xPolicy
                      )
                  }
                );
              }

    // A/R/P/T ne sont jamais consultés.
    // X est retiré avant buildAnalysis : ni révision, ni faiblesse, ni stats pédagogiques.
    const learningEvents=events.filter(
      e=>!xPolicy.ids.has(one(e.questionId))
    );

    const analysis=buildAnalysis(learningEvents);

              // CGANDROID001 FIX2 · ANALYSIS_TDZ_FIX001
              // LONG_SESSION001 nécessite analysis initialisé.
if(mode==='smartLongStart'){

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    session:
                      await smartLongStart(
                        user.uid,
                        analysis,
                        body,
                        xPolicy
                      )
                  }
                );
              }


              if(mode==='smartLongNext'){

                return json(
                  res,
                  200,
                  {
                    ok:true,
                    session:
                      await smartLongNext(
                        user.uid,
                        analysis,
                        body,
                        xPolicy
                      )
                  }
                );
              }


              
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
