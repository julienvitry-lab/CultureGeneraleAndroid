const {onRequest}=require('firebase-functions/v2/https');
const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
if(!getApps().length)initializeApp();
const REGION='europe-west1';
const one=v=>String(v??'').trim();
function cors(req,res){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS'){res.status(204).send('');return true}return false}
function json(res,status,body){res.status(status).set('content-type','application/json; charset=utf-8').send(JSON.stringify(body))}
async function user(req){const h=one(req.headers.authorization);if(!h.startsWith('Bearer '))throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});return getAuth().verifyIdToken(h.slice(7))}
function cleanIds(v){return [...new Set((Array.isArray(v)?v:[]).map(one).filter(Boolean))].slice(0,500)}
exports.cgweb030Lists=onRequest({region:REGION,timeoutSeconds:120,memory:'512MiB'},async(req,res)=>{
 if(cors(req,res))return;
 try{
  if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});
  const u=await user(req), db=getFirestore(), base=db.collection('users').doc(u.uid), col=base.collection('fun_lists');
  const body=req.body&&typeof req.body==='object'?req.body:{}, mode=one(body.mode)||'list';
  if(mode==='list'){
    const snap=await col.orderBy('updated_ms','desc').limit(100).get().catch(async()=>col.limit(100).get());
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    return json(res,200,{ok:true,rows});
  }
  if(mode==='save'){
    const id=one(body.id), title=one(body.title).slice(0,120), emoji=one(body.emoji).slice(0,8)||'⭐', questionIds=cleanIds(body.questionIds);
    if(!title)return json(res,400,{ok:false,error:'Titre obligatoire.'});
    const ref=id?col.doc(id):col.doc();
    await ref.set({title,emoji,question_ids:questionIds,count:questionIds.length,updated_ms:Date.now(),updated_at:FieldValue.serverTimestamp(),created_ms:Number(body.created_ms)||Date.now(),source:'CGWEB030'},{merge:true});
    return json(res,200,{ok:true,id:ref.id,count:questionIds.length});
  }
  if(mode==='delete'){
    const id=one(body.id);if(!id)return json(res,400,{ok:false,error:'ID liste manquant.'});await col.doc(id).delete();return json(res,200,{ok:true});
  }
  if(mode==='questions'){
    const ids=cleanIds(body.questionIds), out=[];
    for(let i=0;i<ids.length;i+=50){const part=ids.slice(i,i+50);const snaps=await Promise.all(part.map(id=>base.collection('questions').doc(id).get()));for(const s of snaps)if(s.exists)out.push({id:s.id,...s.data()})}
    return json(res,200,{ok:true,rows:out});
  }
  return json(res,400,{ok:false,error:'Mode inconnu.'});
 }catch(e){return json(res,Number(e?.status)||500,{ok:false,error:e?.message||String(e)})}
});
