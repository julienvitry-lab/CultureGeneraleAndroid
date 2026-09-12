const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');
const crypto = require('crypto');

if (!getApps().length) initializeApp();

const REGION = 'europe-west1';
const MAX_IDS = 100;
const MAX_BYTES = 15 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; CGIMAGE007/1.0; +https://culturegeneralesync.web.app)';

function one(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function isHttp(v){ return /^https?:\/\//i.test(one(v)); }
function isCloudPath(v){
  const p=one(v);
  return p.startsWith('users/') && p.includes('/question-images/');
}
function sha256(buffer){
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function extFromType(type){
  const t=one(type).toLowerCase().split(';')[0];
  if(t==='image/jpeg')return '.jpg';
  if(t==='image/png')return '.png';
  if(t==='image/webp')return '.webp';
  if(t==='image/gif')return '.gif';
  if(t==='image/svg+xml')return '.svg';
  if(t==='image/avif')return '.avif';
  return '.img';
}
function safeSegment(id){
  return encodeURIComponent(String(id||'').trim()).replaceAll('/','%2F');
}
function headers(){
  return {
    'user-agent': UA,
    'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7'
  };
}
function json(res,status,body){
  res.status(status);
  res.set('content-type','application/json; charset=utf-8');
  res.send(JSON.stringify(body,null,2));
}
function cors(req,res){
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){
    res.status(204).send('');
    return true;
  }
  return false;
}
async function requireUser(req){
  const h=String(req.headers.authorization||'');
  if(!h.startsWith('Bearer ')){
    throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});
  }
  return getAuth().verifyIdToken(h.slice(7));
}

function seeds(data){
  const out=[];
  const push=(label,value)=>{
    const url=one(value);
    if(!url || !isHttp(url))return;
    if(!out.some(x=>x.url===url))out.push({label,url});
  };
  push('url_internet',data?.url_internet);
  push('image_source_url',data?.image_source_url);
  if(!isCloudPath(data?.image_file))push('image_file',data?.image_file);
  push('url_quizypedia',data?.url_quizypedia);
  return out;
}

async function fetchDirectImage(url){
  const response=await fetch(url,{redirect:'follow',headers:headers()});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const type=one(response.headers.get('content-type')||'').toLowerCase();
  if(!type.startsWith('image/')){
    throw new Error(`Type ${type||'inconnu'} non image`);
  }
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_BYTES)throw new Error(`Image trop volumineuse (${length})`);
  const buffer=Buffer.from(await response.arrayBuffer());
  if(!buffer.length)throw new Error('Image vide');
  if(buffer.length>MAX_BYTES)throw new Error(`Image trop volumineuse (${buffer.length})`);
  return {
    buffer,
    contentType:type,
    finalUrl:response.url||url,
    method:'direct'
  };
}

async function waybackSnapshot(originalUrl){
  const cdx='https://web.archive.org/cdx/search/cdx'
    + `?url=${encodeURIComponent(originalUrl)}`
    + '&output=json'
    + '&filter=statuscode:200'
    + '&filter=mimetype:image/.*'
    + '&limit=10'
    + '&fl=timestamp,original,statuscode,mimetype,digest';

  const response=await fetch(cdx,{headers:headers()});
  if(!response.ok)throw new Error(`Wayback CDX HTTP ${response.status}`);
  const rows=await response.json();
  if(!Array.isArray(rows) || rows.length<2){
    throw new Error('Aucune archive Wayback');
  }

  for(let i=rows.length-1;i>=1;i--){
    const row=rows[i]||[];
    const timestamp=String(row[0]||'').trim();
    const archivedOriginal=String(row[1]||originalUrl).trim();
    if(!timestamp)continue;

    const archivedUrl=`https://web.archive.org/web/${timestamp}id_/${archivedOriginal}`;
    try{
      const image=await fetchDirectImage(archivedUrl);
      return {
        ...image,
        finalUrl:archivedUrl,
        method:'wayback',
        archivedOriginal,
        timestamp
      };
    }catch(_){}
  }
  throw new Error('Archives Wayback inexploitables');
}

function quizypediaVariants(url){
  const out=[];
  const push=u=>{ if(u && !out.includes(u))out.push(u); };
  push(url);

  try{
    const u=new URL(url);

    const hostVariants=[
      'www.quizypedia.fr',
      'quizypedia.fr'
    ];

    const pathVariants=[
      u.pathname,
      u.pathname.replace('/site_media/images/','/media/images/'),
      u.pathname.replace('/site_media/','/media/'),
      u.pathname.replace('/site_media/images/','/site-media/images/')
    ];

    for(const host of hostVariants){
      for(const protocol of ['https:','http:']){
        for(const path of pathVariants){
          const v=new URL(u.toString());
          v.hostname=host;
          v.protocol=protocol;
          v.pathname=path;
          push(v.toString());
        }
      }
    }
  }catch(_){}

  return out;
}

async function resolveHistoricalImage(data){
  const attempts=[];

  for(const seed of seeds(data)){
    const variants = /(^|\.)quizypedia\.fr$/i.test((()=>{
      try{return new URL(seed.url).hostname}catch{return ''}
    })())
      ? quizypediaVariants(seed.url)
      : [seed.url];

    for(const url of variants){
      try{
        const image=await fetchDirectImage(url);
        return {...image,seedLabel:seed.label,seedUrl:seed.url,recoveredUrl:url};
      }catch(error){
        attempts.push(`${seed.label} direct ${url}: ${error?.message||String(error)}`);
      }
    }

    if(/(^|\.)quizypedia\.fr$/i.test((()=>{
      try{return new URL(seed.url).hostname}catch{return ''}
    })())){
      try{
        const image=await waybackSnapshot(seed.url);
        return {...image,seedLabel:seed.label,seedUrl:seed.url,recoveredUrl:image.finalUrl};
      }catch(error){
        attempts.push(`${seed.label} wayback: ${error?.message||String(error)}`);
      }
    }
  }

  throw new Error(attempts.slice(-8).join(' | ') || 'Aucune source exploitable');
}

async function saveRecovered(uid,id,data,image){
  const db=getFirestore();
  const bucket=getStorage().bucket();
  const digest=sha256(image.buffer);
  const folder=`users/${uid}/question-images/${safeSegment(id)}`;
  const mainPath=`${folder}/${digest.slice(0,24)}-main${extFromType(image.contentType)}`;

  await bucket.file(mainPath).save(image.buffer,{
    resumable:false,
    contentType:image.contentType,
    metadata:{
      cacheControl:'private,max-age=604800',
      metadata:{
        cgimage:'CGIMAGE007_1',
        questionId:String(id),
        sha256:digest,
        sourceUrl:image.finalUrl||'',
        originalSource:image.seedUrl||'',
        method:image.method||'',
        waybackTimestamp:image.timestamp||''
      }
    }
  });

  const ref=db.collection('users').doc(uid).collection('questions').doc(String(id));

  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new Error(`Question ${id} introuvable.`);
    const cloud=snap.data()||{};
    const rev=Number(cloud.cg_revision||0)||0;

    tx.update(ref,{
      image_file:mainPath,
      image_thumb_file:'',
      image_source_url:image.finalUrl||image.seedUrl||'',
      image_mime:image.contentType,
      image_bytes:image.buffer.length,
      image_sha256:digest,
      image_schema:1,
      image_origin:'firebase_storage',
      image_original_name:'',
      image_updated_ms:Date.now(),
      is_image:1,
      non_trouve:0,
      cg_revision:rev+1,
      cg_base_revision:rev,
      cg_updated_at:FieldValue.serverTimestamp(),
      cg_updated_by:'server',
      cg_writer_id:'cgimage007',
      cg_writer_label:'Server · CGIMAGE007',
      cg_update_source:'CGIMAGE007_RECOVERY'
    });
  });

  return {
    id,
    path:mainPath,
    method:image.method,
    source:image.seedUrl||'',
    recoveredUrl:image.finalUrl||'',
    bytes:image.buffer.length
  };
}

exports.cgimage007RecoverFailed = onRequest(
  {region:REGION,timeoutSeconds:540,memory:'1GiB'},
  async(req,res)=>{
    if(cors(req,res))return;

    try{
      if(req.method!=='POST'){
        return json(res,405,{ok:false,error:'POST attendu.'});
      }

      const user=await requireUser(req);
      const ids=Array.from(new Set(
        (Array.isArray(req.body?.ids)?req.body.ids:[])
          .map(v=>String(v||'').trim())
          .filter(Boolean)
      )).slice(0,MAX_IDS);

      if(!ids.length){
        return json(res,400,{ok:false,error:'Aucun ID fourni.'});
      }

      const db=getFirestore();
      const recovered=[];
      const failed=[];
      const alreadyCloud=[];

      for(const id of ids){
        try{
          const ref=db.collection('users').doc(user.uid).collection('questions').doc(id);
          const snap=await ref.get();
          if(!snap.exists){
            failed.push({id,error:'Question Firestore introuvable'});
            continue;
          }

          const data=snap.data()||{};
          if(isCloudPath(data.image_file)){
            alreadyCloud.push({id,path:data.image_file});
            continue;
          }

          const image=await resolveHistoricalImage(data);
          recovered.push(await saveRecovered(user.uid,id,data,image));
        }catch(error){
          failed.push({id,error:error?.message||String(error)});
        }
      }

      return json(res,200,{
        ok:true,
        requested:ids.length,
        recovered,
        failed,
        alreadyCloud,
        stats:{
          requested:ids.length,
          recovered:recovered.length,
          failed:failed.length,
          alreadyCloud:alreadyCloud.length
        }
      });

    }catch(error){
      return json(res,Number(error?.status)||500,{
        ok:false,
        error:error?.message||String(error)
      });
    }
  }
);
