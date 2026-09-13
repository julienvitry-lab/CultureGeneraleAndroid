const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();
const REGION = 'europe-west1';

const CONTENT_FIELDS = [
  'megatheme','theme','question','detail',
  'proposition_a','proposition_b','proposition_c','proposition_d',
  'correct_index','url_quizypedia','url_internet',
  'image_file','image_thumb_file','image_source_url','image_mime',
  'image_width','image_height','image_bytes','image_sha256',
  'image_schema','image_origin','image_original_name','image_updated_ms',
  'non_trouve','status','is_image'
];
const STOP = new Set(['de','du','des','la','le','les','un','une','et','ou','a','au','aux','en','dans','sur','sous','par','pour','avec','sans','ce','cet','cette','ces','qui','que','quoi','quel','quelle','quels','quelles','est','sont','etre','son','sa','ses','leur','leurs','il','elle','ils','elles','on','se','ne','pas','plus','the','of','and','to','in','is','are','an']);

function one(v){return String(v??'').trim()}
function norm(v){return one(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function tokens(data){return [...new Set(norm(CONTENT_FIELDS.map(f=>data?.[f]).filter(v=>typeof v==='string').join(' ')).split(/\s+/).filter(t=>t.length>=2&&!STOP.has(t)))]}
function revision(data){const n=Number(data?.cg_revision||0);return Number.isFinite(n)&&n>=0?Math.trunc(n):0}
function snapshot(data){const out={};for(const f of CONTENT_FIELDS){if(data?.[f]!==undefined)out[f]=data[f]}return out}
function cors(req,res){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS'){res.status(204).send('');return true}return false}
function json(res,status,body){res.status(status).set('content-type','application/json; charset=utf-8').send(JSON.stringify(body))}
async function requireUser(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});return getAuth().verifyIdToken(h.slice(7))}

exports.cgweb022History = onRequest({region:REGION,timeoutSeconds:540,memory:'1GiB'},async(req,res)=>{
  if(cors(req,res))return;
  try{
    if(req.method!=='POST')return json(res,405,{ok:false,error:'POST attendu.'});
    const user=await requireUser(req);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const mode=one(body.mode)||'list';
    const db=getFirestore();
    const base=db.collection('users').doc(user.uid);

    if(mode==='list'){
      const max=Math.min(Math.max(Number(body.limit)||100,1),250);
      const [histSnap,bulkSnap]=await Promise.all([
        base.collection('question_history').orderBy('created_at','desc').limit(max).get().catch(()=>({docs:[]})),
        base.collection('bulk_audits').orderBy('created_ms','desc').limit(30).get().catch(()=>({docs:[]}))
      ]);
      let rows=histSnap.docs.map(d=>({id:d.id,type:'question',...d.data()}));
      const qid=one(body.questionId);
      const op=one(body.operation);
      const source=one(body.source);
      if(qid)rows=rows.filter(r=>String(r.question_id||'')===qid);
      if(op)rows=rows.filter(r=>String(r.operation||'')===op);
      if(source)rows=rows.filter(r=>String(r.source||'').toLowerCase().includes(source.toLowerCase()));
      const bulk=bulkSnap.docs.map(d=>({id:d.id,type:'bulk',...d.data()}));
      return json(res,200,{ok:true,rows,bulk});
    }

    if(mode==='restore'){
      const historyId=one(body.historyId);
      if(!historyId)return json(res,400,{ok:false,error:'historyId manquant.'});
      const historyRef=base.collection('question_history').doc(historyId);
      const historySnap=await historyRef.get();
      if(!historySnap.exists)return json(res,404,{ok:false,error:'Entrée historique introuvable.'});
      const h=historySnap.data()||{};
      const before=h.before_snapshot;
      if(!before||typeof before!=='object')return json(res,409,{ok:false,error:'Cette ancienne entrée ne possède pas de snapshot restaurable.'});
      const id=String(h.question_id||'').trim();
      if(!id)return json(res,409,{ok:false,error:'Question historique sans ID.'});

      const qRef=base.collection('questions').doc(id);
      const tombRef=base.collection('question_tombstones').doc(id);
      const deltaRef=base.collection('question_search_delta').doc(id);
      const newHistoryRef=base.collection('question_history').doc();
      const expected=body.expectedCurrentRevision;

      const result=await db.runTransaction(async tx=>{
        const qSnap=await tx.get(qRef);
        const current=qSnap.exists?qSnap.data()||{}:{};
        const currentRev=qSnap.exists?revision(current):null;
        if(expected!==null&&expected!==undefined&&Number(expected)!==currentRev){
          return {conflict:true,currentRevision:currentRev};
        }
        const restore={};
        for(const field of CONTENT_FIELDS){
          restore[field]=Object.prototype.hasOwnProperty.call(before,field)?before[field]:FieldValue.delete();
        }
        const nextRev=(currentRev===null?Number(h.revision_before||0):currentRev)+1;
        const payload={...restore,cg_revision:nextRev,cg_base_revision:currentRev??Number(h.revision_before||0),cg_updated_at:FieldValue.serverTimestamp(),cg_updated_by:'web',cg_writer_id:'cgweb022',cg_writer_label:'Web · CGWEB022',cg_update_source:'CGWEB022_RESTORE'};
        if(qSnap.exists)tx.update(qRef,payload);else tx.set(qRef,payload,{merge:true});
        tx.delete(tombRef);
        tx.set(deltaRef,{question_id:id,deleted:false,tokens:tokens(before),cgindex_updated_at:FieldValue.serverTimestamp()},{merge:true});
        tx.set(newHistoryRef,{question_id:id,operation:'restore',revision_before:currentRev??Number(h.revision_before||0),revision_after:nextRev,patch:{},before_snapshot:snapshot(current),after_snapshot:snapshot(before),restored_from_history_id:historyId,writer_id:'cgweb022',writer_label:'Web · CGWEB022',source:'CGWEB022_RESTORE',created_at:FieldValue.serverTimestamp()});
        return {conflict:false,questionId:id,revision:nextRev};
      });
      if(result.conflict)return json(res,409,{ok:false,conflict:true,error:'La question a changé depuis l’ouverture de l’historique.',...result});
      return json(res,200,{ok:true,...result});
    }

    return json(res,400,{ok:false,error:'Mode inconnu.'});
  }catch(error){return json(res,Number(error?.status)||500,{ok:false,error:error?.message||String(error)})}
});
