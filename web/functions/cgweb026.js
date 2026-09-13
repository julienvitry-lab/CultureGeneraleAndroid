const {onRequest}=require('firebase-functions/v2/https');
const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
if(!getApps().length)initializeApp();
const REGION='europe-west1';
function one(v){return String(v??'').trim()}
function cors(req,res){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS'){res.status(204).send('');return true}return false}
function json(res,status,body){res.status(status).set('content-type','application/json; charset=utf-8').send(JSON.stringify(body))}
async function user(req){const h=one(req.headers.authorization);if(!h.startsWith('Bearer '))throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});return getAuth().verifyIdToken(h.slice(7))}
function sha(meta,name){return one(meta?.metadata?.sha256)||((name.match(/\/([a-f0-9]{24,64})-(?:main|thumb)\./i)||[])[1]||'')}
exports.cgweb026ImageCenter=onRequest({region:REGION,timeoutSeconds:540,memory:'2GiB'},async(req,res)=>{
  if(cors(req,res))return;
  try{
    if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});
    const u=await user(req);const mode=one(req.body?.mode)||'scan';
    const db=getFirestore();const base=db.collection('users').doc(u.uid);
    const bucket=getStorage().bucket();const prefix=`users/${u.uid}/question-images/`;
    if(mode==='scan'){
      const [qSnap,fileTuple]=await Promise.all([base.collection('questions').get(),bucket.getFiles({prefix})]);
      const files=fileTuple[0]||[];const refs=new Map();const themes=new Map();
      for(const d of qSnap.docs){const q=d.data()||{};for(const p of [one(q.image_file),one(q.image_thumb_file)].filter(Boolean)){if(!refs.has(p))refs.set(p,[]);refs.get(p).push(String(d.id));if(!themes.has(p))themes.set(p,new Set());if(one(q.theme))themes.get(p).add(one(q.theme))}}
      const rows=[];let total=0;
      for(const f of files){const [m]=await f.getMetadata();const size=Number(m.size||0);total+=size;const path=f.name;rows.push({path,size,contentType:one(m.contentType),updated:one(m.updated),sha256:sha(m,path),questionIds:refs.get(path)||[],themes:[...(themes.get(path)||[])].slice(0,10),orphan:!(refs.get(path)||[]).length,isThumb:/-thumb\./i.test(path)})}
      const groups=new Map();for(const r of rows){if(!r.sha256||r.isThumb)continue;if(!groups.has(r.sha256))groups.set(r.sha256,[]);groups.get(r.sha256).push(r.path)}
      const duplicates=[...groups.entries()].filter(([,a])=>a.length>1).map(([digest,paths])=>({digest,paths}));
      return json(res,200,{ok:true,prefix,questionCount:qSnap.size,fileCount:rows.length,totalBytes:total,averageBytes:rows.length?Math.round(total/rows.length):0,orphanCount:rows.filter(r=>r.orphan).length,duplicateGroups:duplicates.length,duplicates,rows});
    }
    if(mode==='deleteOrphan'){
      const path=one(req.body?.path);if(!path.startsWith(prefix))return json(res,400,{ok:false,error:'Chemin Storage hors espace utilisateur.'});
      const qSnap=await base.collection('questions').where('image_file','==',path).limit(1).get();
      const tSnap=await base.collection('questions').where('image_thumb_file','==',path).limit(1).get();
      if(!qSnap.empty||!tSnap.empty)return json(res,409,{ok:false,error:'Suppression refusée : cette image est encore référencée.'});
      await bucket.file(path).delete({ignoreNotFound:true});return json(res,200,{ok:true,deleted:path});
    }
    return json(res,400,{ok:false,error:'Mode inconnu.'});
  }catch(e){return json(res,Number(e?.status)||500,{ok:false,error:e?.message||String(e)})}
});
