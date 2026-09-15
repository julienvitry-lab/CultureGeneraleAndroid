const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');

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
async function neverOverview(uid,analysis){
  const base=getFirestore().collection('users').doc(uid);
  const q=base.collection('questions');
  const countCalls=[q.count().get(),...DOMAINS.map(d=>q.where('megatheme','==',d).count().get())];
  const snaps=await Promise.all(countCalls);
  const seenIds=new Set(analysis.questions.map(x=>one(x.questionId)).filter(Boolean));
  const seenByDomain=new Map();
  for(const x of analysis.questions){
    const d=one(x.domain);
    if(!d)continue;
    if(!seenByDomain.has(d))seenByDomain.set(d,new Set());
    if(x.questionId)seenByDomain.get(d).add(one(x.questionId));
  }
  const rows=DOMAINS.map((d,i)=>{
    const total=Number(snaps[i+1].data().count||0);
    const seen=seenByDomain.get(d)?.size||0;
    return {name:d,total,seen,unseen:Math.max(0,total-seen)};
  }).sort((a,b)=>b.unseen-a.unseen||a.name.localeCompare(b.name,'fr'));
  const total=Number(snaps[0].data().count||0);
  return {total,seen:seenIds.size,unseen:Math.max(0,total-seenIds.size),rows};
}
async function neverThemes(uid,analysis,domain){
  const q=getFirestore().collection('users').doc(uid).collection('questions');
  const snap=await q.where('megatheme','==',domain).select('theme').get();
  const totals=new Map();
  for(const d of snap.docs){
    const t=one(d.get('theme'));
    totals.set(t,(totals.get(t)||0)+1);
  }
  const seen=new Map();
  for(const x of analysis.questions){
    if(one(x.domain)!==domain||!x.questionId)continue;
    const t=one(x.theme);
    if(!seen.has(t))seen.set(t,new Set());
    seen.get(t).add(one(x.questionId));
  }
  return [...totals.entries()].map(([theme,total])=>{
    const n=seen.get(theme)?.size||0;
    return {name:theme,total,seen:n,unseen:Math.max(0,total-n)};
  }).filter(x=>x.unseen>0).sort((a,b)=>b.unseen-a.unseen||a.name.localeCompare(b.name,'fr',{numeric:true}));
}
async function neverQuestions(uid,analysis,domain,theme,limit){
  const seen=new Set(analysis.questions.map(x=>one(x.questionId)).filter(Boolean));
  const q=getFirestore().collection('users').doc(uid).collection('questions');
  const snap=await q.where('megatheme','==',domain).select('question','detail','megatheme','theme').get();
  const rows=[];
  for(const d of snap.docs){
    if(seen.has(d.id))continue;
    const x=d.data()||{};
    if(one(x.theme)!==theme)continue;
    rows.push({id:d.id,question:one(x.question),detail:one(x.detail),domain:one(x.megatheme),theme:one(x.theme)});
    if(rows.length>=limit)break;
  }
  return rows;
}

async function handleLearningHub(req,res){
    if(cors(req,res))return;
    try{
      if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});
      const user=await requireUser(req);
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const mode=one(body.mode)||'overview';
      const events=await loadHistory(user.uid,Boolean(body.forceRefresh));
      const analysis=buildAnalysis(events);

      if(mode==='overview'){
        return json(res,200,{ok:true,summary:summaryOf(analysis),domains:sortGroups(groupsFor(analysis,null),'mastery')});
      }
      if(mode==='history'){
        const filter=['qcm','mental','revision'].includes(one(body.filter))?one(body.filter):'all';
        const limit=clamp(Math.floor(num(body.limit)||100),1,500);
        return json(res,200,{ok:true,total:events.length,filter,rows:historyRows(events,filter,limit)});
      }
      if(mode==='groups'){
        const view=one(body.view)||'mastery';
        const domain=body.domain===undefined||body.domain===null?'':one(body.domain);
        let rows=groupsFor(analysis,domain||null);
        rows=sortGroups(rows,view);
        return json(res,200,{ok:true,view,domain,rows});
      }
      if(mode==='questions'){
        const view=one(body.view)||'mastery';
        const domain=one(body.domain),theme=one(body.theme);
        let rows=analysis.questions.filter(q=>(one(q.domain)||'(Sans domaine)')===domain&&one(q.theme)===theme);
        rows=sortQuestions(rows,view).slice(0,300).map(compactQuestion);
        return json(res,200,{ok:true,view,domain,theme,rows});
      }
      if(mode==='neverOverview')return json(res,200,{ok:true,...await neverOverview(user.uid,analysis)});
      if(mode==='neverThemes'){
        const domain=one(body.domain);
        if(!domain)return json(res,400,{ok:false,error:'Domaine manquant.'});
        return json(res,200,{ok:true,domain,rows:await neverThemes(user.uid,analysis,domain)});
      }
      if(mode==='neverQuestions'){
        const domain=one(body.domain),theme=one(body.theme);
        if(!domain)return json(res,400,{ok:false,error:'Domaine manquant.'});
        const limit=clamp(Math.floor(num(body.limit)||100),1,300);
        return json(res,200,{ok:true,domain,theme,rows:await neverQuestions(user.uid,analysis,domain,theme,limit)});
      }
      return json(res,400,{ok:false,error:'Mode inconnu.'});
    }catch(error){
      return json(res,Number(error?.status)||500,{ok:false,error:error?.message||String(error)});
    }
}
module.exports={handleLearningHub};
