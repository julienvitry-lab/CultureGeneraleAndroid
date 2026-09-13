const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
if(!getApps().length)initializeApp();
const REGION='europe-west1';
function one(v){return String(v??'').trim()}
function norm(v){return one(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function cors(req,res){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS'){res.status(204).send('');return true}return false}
function json(res,status,body){res.status(status).set('content-type','application/json; charset=utf-8').send(JSON.stringify(body))}
async function requireUser(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});return getAuth().verifyIdToken(h.slice(7))}
function tokens(q){return [...new Set(norm([q.megatheme,q.theme,q.question,q.detail,q.proposition_a,q.proposition_b,q.proposition_c,q.proposition_d].filter(Boolean).join(' ')).split(/\s+/).filter(t=>t.length>=2))].slice(0,120)}
function canonical(item){const opts=Array.isArray(item.options)?item.options:[];return{requested_id:one(item.requested_id),megatheme:one(item.megatheme),theme:one(item.theme),question:one(item.question),detail:one(item.detail),proposition_a:one(item.proposition_a??opts[0]),proposition_b:one(item.proposition_b??opts[1]),proposition_c:one(item.proposition_c??opts[2]),proposition_d:one(item.proposition_d??opts[3]),correct_index:Number(item.correct_index||0),url_quizypedia:one(item.url_quizypedia),url_internet:one(item.url_internet),image_file:one(item.image_file),non_trouve:Number(item.non_trouve||0),status:one(item.status),is_image:Number(item.is_image||0),questionnaire_title:one(item.questionnaire_title),questionnaire_url:one(item.questionnaire_url)}}

exports.cgweb024ImportReview=onRequest({region:REGION,timeoutSeconds:540,memory:'1GiB'},async(req,res)=>{
 if(cors(req,res))return;
 try{
  if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});
  const user=await requireUser(req);const body=req.body&&typeof req.body==='object'?req.body:{};const mode=one(body.mode);const db=getFirestore();const base=db.collection('users').doc(user.uid);const review=base.collection('import_review');
  if(mode==='stage'){
    const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json(res,400,{ok:false,error:'Aucune question à placer en validation.'});if(items.length>500)return json(res,400,{ok:false,error:'Maximum 500 questions par lot de validation.'});
    const batch=db.batch();const batchId=String(Date.now());let count=0;
    for(let i=0;i<items.length;i++){const q=canonical(items[i]);if(!q.question||!q.proposition_a||!q.proposition_b||!q.proposition_c||!q.proposition_d||q.correct_index<1||q.correct_index>4)continue;const ref=review.doc();q.requested_id=q.requested_id||String(Date.now()*1000+i);batch.set(ref,{...q,review_state:'pending',review_batch_id:batchId,created_ms:Date.now(),created_at:FieldValue.serverTimestamp(),source:'CGWEB024'});count++}
    await batch.commit();return json(res,200,{ok:true,batchId,staged:count});
  }
  if(mode==='list'){
    const snap=await review.orderBy('created_ms','desc').limit(Math.min(Math.max(Number(body.limit)||200,1),500)).get();let rows=snap.docs.map(d=>({id:d.id,...d.data()}));const state=one(body.state)||'pending';if(state)rows=rows.filter(r=>String(r.review_state||'pending')===state);
    return json(res,200,{ok:true,rows});
  }
  if(mode==='reject'){
    const id=one(body.id);if(!id)return json(res,400,{ok:false,error:'ID de validation manquant.'});await review.doc(id).set({review_state:'rejected',reviewed_ms:Date.now(),reviewed_at:FieldValue.serverTimestamp()},{merge:true});return json(res,200,{ok:true,id});
  }
  if(mode==='approve'){
    const id=one(body.id);if(!id)return json(res,400,{ok:false,error:'ID de validation manquant.'});const reviewRef=review.doc(id);const rSnap=await reviewRef.get();if(!rSnap.exists)return json(res,404,{ok:false,error:'Élément de validation introuvable.'});const item=rSnap.data()||{};if(item.review_state!=='pending'&&item.review_state!=='duplicate')return json(res,409,{ok:false,error:`État ${item.review_state} non approuvable.`});
    const duplicateSnap=await base.collection('questions').where('question','==',item.question).limit(30).get();const dup=duplicateSnap.docs.find(d=>norm(d.data()?.question)===norm(item.question)&&norm(d.data()?.detail||'')===norm(item.detail||''));if(dup&&!body.forceDuplicate){await reviewRef.set({review_state:'duplicate',duplicate_question_id:dup.id,reviewed_ms:Date.now()},{merge:true});return json(res,200,{ok:true,duplicate:true,duplicateId:dup.id,id});}
    let qid=one(item.requested_id)||String(Date.now());let qRef=base.collection('questions').doc(qid);let suffix=0;while((await qRef.get()).exists){suffix++;qid=`${item.requested_id||Date.now()}_${suffix}`;qRef=base.collection('questions').doc(qid)}
    const q=canonical(item);delete q.requested_id;delete q.questionnaire_title;delete q.questionnaire_url;const deltaRef=base.collection('question_search_delta').doc(qid);const hRef=base.collection('question_history').doc();const batch=db.batch();batch.set(qRef,{...q,cg_revision:1,cg_base_revision:0,cg_updated_at:FieldValue.serverTimestamp(),cg_updated_by:'web',cg_writer_id:'cgweb024',cg_writer_label:'Web · CGWEB024',cg_update_source:'CGWEB024_APPROVE'});batch.set(deltaRef,{question_id:qid,deleted:false,tokens:tokens(q),cgindex_updated_at:FieldValue.serverTimestamp()},{merge:true});batch.set(hRef,{question_id:qid,operation:'create',revision_before:0,revision_after:1,patch:q,before_snapshot:{},after_snapshot:q,writer_id:'cgweb024',writer_label:'Web · CGWEB024',source:'CGWEB024_APPROVE',created_at:FieldValue.serverTimestamp()});batch.set(reviewRef,{review_state:'approved',approved_question_id:qid,reviewed_ms:Date.now(),reviewed_at:FieldValue.serverTimestamp()},{merge:true});await batch.commit();return json(res,200,{ok:true,id,questionId:qid,duplicate:false});
  }
  return json(res,400,{ok:false,error:'Mode inconnu.'});
 }catch(error){return json(res,Number(error?.status)||500,{ok:false,error:error?.message||String(error)})}
});
