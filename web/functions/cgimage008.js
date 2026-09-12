const {onRequest} = require('firebase-functions/v2/https');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');
const crypto = require('crypto');

if (!getApps().length) initializeApp();

const REGION = 'europe-west1';
const UA = 'Mozilla/5.0 (compatible; CGIMAGE008/1.0; +https://culturegeneralesync.web.app)';
const MAX_IDS = 30;
const MAX_BYTES = 15 * 1024 * 1024;

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

function questionText(data){
  return one(
    data?.question || data?.label || data?.title || data?.texte || data?.text || data?.name || ''
  );
}
function answerText(data){
  return one(
    data?.answer || data?.reponse || data?.response || data?.bonne_reponse || data?.good_answer || ''
  );
}
function categoryText(data){
  return one(
    data?.category || data?.categorie || data?.theme || data?.subject || ''
  );
}
function parseUrlTail(data){
  const candidates = [data?.url_quizypedia, data?.image_source_url, data?.image_file];
  for(const raw of candidates){
    const v=one(raw);
    if(!v) continue;
    try{
      const u = new URL(v);
      let tail = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
      tail = tail.replace(/\.[A-Za-z0-9]{2,5}$/,'');
      tail = tail.replace(/[_+]/g,' ');
      tail = tail.replace(/%20/g,' ');
      tail = tail.replace(/\s*;\s*/g,' ; ');
      tail = one(tail);
      if(tail) return tail;
    }catch(_){}
  }
  return '';
}
function semanticQueries(data){
  const q = [];
  const push = v => {
    const s = one(v);
    if(!s) return;
    if(!q.some(x => x.toLowerCase() === s.toLowerCase())) q.push(s);
  };

  const tail = parseUrlTail(data);
  const question = questionText(data);
  const answer = answerText(data);
  const category = categoryText(data);

  if(tail.includes(';')){
    const parts = tail.split(';').map(one).filter(Boolean);
    push(parts.join(' '));
    for(const part of parts) push(part);
  }

  push(tail);
  push(answer);
  push(question);
  if(answer && question) push(`${answer} ${question}`);
  if(tail && question) push(`${tail} ${question}`);
  if(category && tail) push(`${tail} ${category}`);
  if(category && answer) push(`${answer} ${category}`);

  return q.slice(0, 8);
}

async function fetchDirectImage(url){
  const response = await fetch(url,{redirect:'follow',headers:headers()});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = one(response.headers.get('content-type')||'').toLowerCase();
  if(!type.startsWith('image/')) throw new Error(`Type ${type||'inconnu'} non image`);
  const length=Number(response.headers.get('content-length')||0);
  if(length > MAX_BYTES) throw new Error(`Image trop volumineuse (${length})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if(!buffer.length) throw new Error('Image vide');
  if(buffer.length > MAX_BYTES) throw new Error(`Image trop volumineuse (${buffer.length})`);
  return {buffer, contentType:type, finalUrl:response.url||url};
}

async function wikiQuery(params){
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response = await fetch(url.toString(),{headers:headers()});
  if(!response.ok) throw new Error(`Wikimedia HTTP ${response.status}`);
  return response.json();
}

async function wikipediaQuery(params){
  const url = new URL('https://en.wikipedia.org/w/api.php');
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response = await fetch(url.toString(),{headers:headers()});
  if(!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  return response.json();
}

function normalizeCandidate(row){
  const title = one(row.title).replace(/^File:/i,'').replace(/^Category:/i,'');
  const thumb = one(row.thumburl || row.thumbnail || row.image || row.original || row.url);
  const full = one(row.imageinfo?.[0]?.url || row.original || row.thumburl || row.url);
  if(!title || !full) return null;
  return {
    title,
    thumbUrl: thumb || full,
    fullUrl: full,
    sourcePage: row.descriptionurl || row.sourcePage || '',
    width: row.width || row.thumbwidth || 0,
    height: row.height || row.thumbheight || 0,
    source: row.source || 'commons'
  };
}

async function commonsSearch(query){
  const candidates = [];

  // 1) Direct file title search on Commons
  try{
    const data = await wikiQuery({
      action:'query',
      format:'json',
      origin:'*',
      generator:'search',
      gsrsearch:query,
      gsrlimit:'5',
      gsrnamespace:'6',
      prop:'imageinfo',
      iiprop:'url',
      iiurlwidth:'320'
    });
    const pages = Object.values(data?.query?.pages || {});
    for(const page of pages){
      const row = normalizeCandidate({
        title: page.title,
        thumburl: page.imageinfo?.[0]?.thumburl,
        original: page.imageinfo?.[0]?.url,
        sourcePage: page.imageinfo?.[0]?.descriptionurl,
        width: page.imageinfo?.[0]?.thumbwidth,
        height: page.imageinfo?.[0]?.thumbheight,
        source: 'commons'
      });
      if(row) candidates.push(row);
    }
  }catch(_){}

  // 2) Wikipedia page image search as fallback
  try{
    const data = await wikipediaQuery({
      action:'query',
      format:'json',
      origin:'*',
      generator:'search',
      gsrsearch:query,
      gsrlimit:'5',
      prop:'pageimages|info',
      piprop:'thumbnail|original',
      pithumbsize:'320',
      inprop:'url'
    });
    const pages = Object.values(data?.query?.pages || {});
    for(const page of pages){
      const row = normalizeCandidate({
        title: page.title,
        thumburl: page.thumbnail?.source,
        original: page.original?.source,
        sourcePage: page.fullurl,
        width: page.thumbnail?.width || page.original?.width,
        height: page.thumbnail?.height || page.original?.height,
        source: 'wikipedia'
      });
      if(row) candidates.push(row);
    }
  }catch(_){}

  const dedup = [];
  const seen = new Set();
  for(const c of candidates){
    const key = `${c.fullUrl}|${c.title}`;
    if(seen.has(key)) continue;
    seen.add(key);
    dedup.push(c);
  }
  return dedup.slice(0, 5);
}

async function getQuestion(uid,id){
  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('questions').doc(String(id));
  const snap = await ref.get();
  if(!snap.exists) throw new Error(`Question ${id} introuvable`);
  return {ref, data: snap.data() || {}};
}

async function saveRecovered(uid,id,data,candidate){
  const image = await fetchDirectImage(candidate.fullUrl);
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const digest = sha256(image.buffer);
  const folder = `users/${uid}/question-images/${safeSegment(id)}`;
  const mainPath = `${folder}/${digest.slice(0,24)}-main${extFromType(image.contentType)}`;

  await bucket.file(mainPath).save(image.buffer,{
    resumable:false,
    contentType:image.contentType,
    metadata:{
      cacheControl:'private,max-age=604800',
      metadata:{
        cgimage:'CGIMAGE008_1',
        questionId:String(id),
        sha256:digest,
        sourceUrl:candidate.fullUrl,
        sourcePage:candidate.sourcePage || '',
        source:candidate.source || '',
        title:candidate.title || ''
      }
    }
  });

  const ref = db.collection('users').doc(uid).collection('questions').doc(String(id));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists) throw new Error(`Question ${id} introuvable.`);
    const cloud=snap.data()||{};
    const rev=Number(cloud.cg_revision||0)||0;
    tx.update(ref,{
      image_file:mainPath,
      image_thumb_file:'',
      image_source_url:candidate.fullUrl,
      image_mime:image.contentType,
      image_bytes:image.buffer.length,
      image_sha256:digest,
      image_schema:1,
      image_origin:'firebase_storage',
      image_original_name:candidate.title || '',
      image_updated_ms:Date.now(),
      is_image:1,
      non_trouve:0,
      cg_revision:rev+1,
      cg_base_revision:rev,
      cg_updated_at:FieldValue.serverTimestamp(),
      cg_updated_by:'server',
      cg_writer_id:'cgimage008',
      cg_writer_label:'Server · CGIMAGE008',
      cg_update_source:'CGIMAGE008_SEMANTIC_RECOVERY'
    });
  });

  return {
    id,
    path:mainPath,
    title:candidate.title,
    fullUrl:candidate.fullUrl
  };
}

exports.cgimage008SuggestCandidates = onRequest(
  {region:REGION,timeoutSeconds:540,memory:'1GiB'},
  async(req,res)=>{
    if(cors(req,res)) return;
    try{
      if(req.method!=='POST') return json(res,405,{ok:false,error:'POST attendu.'});
      const user = await requireUser(req);
      const ids = Array.from(new Set(
        (Array.isArray(req.body?.ids) ? req.body.ids : [])
          .map(v => String(v||'').trim())
          .filter(Boolean)
      )).slice(0,MAX_IDS);

      if(!ids.length) return json(res,400,{ok:false,error:'Aucun ID fourni.'});

      const out = [];
      for(const id of ids){
        try{
          const {data} = await getQuestion(user.uid,id);
          const existingCloud = isCloudPath(data.image_file);
          const queries = semanticQueries(data);
          const candidateGroups = [];
          const seen = new Set();

          for(const query of queries){
            const found = await commonsSearch(query);
            const filtered = [];
            for(const cand of found){
              const key = cand.fullUrl;
              if(seen.has(key)) continue;
              seen.add(key);
              filtered.push(cand);
            }
            if(filtered.length){
              candidateGroups.push({query, candidates: filtered.slice(0,3)});
            }
            if(candidateGroups.flatMap(g=>g.candidates).length >= 6) break;
          }

          out.push({
            id,
            question: questionText(data),
            answer: answerText(data),
            category: categoryText(data),
            urlTail: parseUrlTail(data),
            existingCloud,
            queries,
            candidateGroups: candidateGroups.slice(0,3)
          });
        }catch(error){
          out.push({
            id,
            error: error?.message || String(error),
            candidateGroups: []
          });
        }
      }

      return json(res,200,{ok:true,items:out});
    }catch(error){
      return json(res,Number(error?.status)||500,{ok:false,error:error?.message||String(error)});
    }
  }
);

exports.cgimage008ApplyCandidate = onRequest(
  {region:REGION,timeoutSeconds:540,memory:'1GiB'},
  async(req,res)=>{
    if(cors(req,res)) return;
    try{
      if(req.method!=='POST') return json(res,405,{ok:false,error:'POST attendu.'});
      const user = await requireUser(req);
      const id = one(req.body?.id);
      const candidate = req.body?.candidate || {};

      if(!id) return json(res,400,{ok:false,error:'ID manquant.'});
      if(!isHttp(candidate.fullUrl)) return json(res,400,{ok:false,error:'Candidate.fullUrl invalide.'});

      const {data} = await getQuestion(user.uid,id);
      const saved = await saveRecovered(user.uid,id,data,{
        title: one(candidate.title),
        fullUrl: one(candidate.fullUrl),
        thumbUrl: one(candidate.thumbUrl),
        sourcePage: one(candidate.sourcePage),
        source: one(candidate.source)
      });

      return json(res,200,{ok:true,saved});
    }catch(error){
      return json(res,Number(error?.status)||500,{ok:false,error:error?.message||String(error)});
    }
  }
);
