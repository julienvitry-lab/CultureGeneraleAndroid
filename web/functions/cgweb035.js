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
                mode==='xSemanticAudit';

    const xPolicy=await loadXPolicy(user.uid,forceX);

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
