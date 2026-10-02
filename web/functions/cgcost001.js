const {getFirestore,FieldPath,Timestamp}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const zlib=require('node:zlib');

const VERSION='CGCOST001_FIRESTORE_READ_OPTIMIZE001';
const CACHE_SCHEMA=1;
const PAGE_SIZE=1000;
const MEMORY_TTL_MS=5*60*1000;
const CACHE_FIELDS=[
  'question','detail','megatheme','theme','status','is_image','non_trouve'
];
const MEMORY=new Map();
const INFLIGHT=new Map();

const one=v=>String(v??'').trim();
const cachePath=uid=>`system/cgcost001/${uid}/questions-v${CACHE_SCHEMA}.json.gz`;

function emptyMarker(){return {seconds:0,nanos:0,id:''}}
function markerFrom(ts,id=''){
  if(!ts)return emptyMarker();
  const seconds=Number(ts.seconds??ts._seconds??0);
  const nanos=Number(ts.nanoseconds??ts._nanoseconds??0);
  return {
    seconds:Number.isFinite(seconds)?seconds:0,
    nanos:Number.isFinite(nanos)?nanos:0,
    id:one(id)
  };
}
function compareMarker(a,b){
  a=a||emptyMarker();b=b||emptyMarker();
  if(a.seconds!==b.seconds)return a.seconds-b.seconds;
  if(a.nanos!==b.nanos)return a.nanos-b.nanos;
  const ai=String(a.id||''),bi=String(b.id||'');
  return ai===bi?0:(ai>bi?1:-1);
}
function maxMarker(current,ts,id){
  const next=markerFrom(ts,id);
  return compareMarker(next,current)>0?next:(current||emptyMarker());
}
function markerTimestamp(marker){
  const m=marker||emptyMarker();
  return new Timestamp(Number(m.seconds||0),Number(m.nanos||0));
}
function markerStarted(marker){
  const m=marker||emptyMarker();
  return Boolean(m.seconds||m.nanos||one(m.id));
}
function rowFromDoc(doc){
  const x=doc.data()||{};
  return {
    id:String(doc.id),
    question:one(x.question),
    detail:one(x.detail),
    megatheme:one(x.megatheme),
    theme:one(x.theme),
    status:one(x.status),
    is_image:Number(x.is_image||0),
    non_trouve:Number(x.non_trouve||0)
  };
}
function normalizePayload(value){
  if(!value||Number(value.schema)!==CACHE_SCHEMA||!Array.isArray(value.rows))return null;
  return {
    schema:CACHE_SCHEMA,
    version:one(value.version)||VERSION,
    builtAtMs:Number(value.builtAtMs||0),
    savedAtMs:Number(value.savedAtMs||0),
    markers:{
      cg_updated_at:{...emptyMarker(),...(value.markers?.cg_updated_at||{})},
      updated_at:{...emptyMarker(),...(value.markers?.updated_at||{})},
      deleted_at:{...emptyMarker(),...(value.markers?.deleted_at||{})}
    },
    rows:value.rows
  };
}
function storageFile(uid){
  return getStorage().bucket().file(cachePath(uid));
}
async function readStored(uid){
  const file=storageFile(uid);
  try{
    const [[metadata],[buffer]]=await Promise.all([
      file.getMetadata(),
      file.download()
    ]);
    const raw=zlib.gunzipSync(buffer).toString('utf8');
    const payload=normalizePayload(JSON.parse(raw));
    if(!payload)return null;
    const validatedAtMs=Number(metadata?.metadata?.cgcost001ValidatedAtMs||0);
    return {payload,validatedAtMs};
  }catch(error){
    if(Number(error?.code)===404||String(error?.code)==='404')return null;
    console.warn('CGCOST001 storage read',error?.message||String(error));
    return null;
  }
}
async function saveStored(uid,payload){
  const file=storageFile(uid);
  const now=Date.now();
  const clean={...payload,schema:CACHE_SCHEMA,version:VERSION,savedAtMs:now};
  const encoded=Buffer.from(JSON.stringify(clean),'utf8');
  const zipped=zlib.gzipSync(encoded,{level:6});
  await file.save(zipped,{
    resumable:false,
    metadata:{
      contentType:'application/gzip',
      cacheControl:'private, no-store',
      metadata:{
        cgcost001Version:VERSION,
        cgcost001Schema:String(CACHE_SCHEMA),
        cgcost001ValidatedAtMs:String(now),
        cgcost001Rows:String(clean.rows.length)
      }
    }
  });
  clean.savedAtMs=now;
  return clean;
}
async function touchStored(uid,rowCount){
  try{
    await storageFile(uid).setMetadata({
      metadata:{
        cgcost001Version:VERSION,
        cgcost001Schema:String(CACHE_SCHEMA),
        cgcost001ValidatedAtMs:String(Date.now()),
        cgcost001Rows:String(Number(rowCount||0))
      }
    });
  }catch(error){
    console.warn('CGCOST001 storage touch',error?.message||String(error));
  }
}

async function latestTombstoneMarker(base){
  try{
    const snap=await base.collection('question_tombstones')
      .orderBy('deleted_at','desc')
      .select('question_id','deleted_at')
      .limit(1)
      .get();
    const doc=snap.docs[0];
    return doc?markerFrom(doc.get('deleted_at'),doc.id):emptyMarker();
  }catch(error){
    console.warn('CGCOST001 tombstone marker',error?.message||String(error));
    return emptyMarker();
  }
}

async function fullBuild(uid){
  const startedAt=Date.now();
  const db=getFirestore();
  const base=db.collection('users').doc(uid);
  const questions=base.collection('questions');
  const rows=[];
  const markers={
    cg_updated_at:emptyMarker(),
    updated_at:emptyMarker(),
    deleted_at:emptyMarker()
  };
  let lastId=null;
  let firestoreReads=0;

  for(;;){
    let q=questions
      .orderBy(FieldPath.documentId())
      .select(...CACHE_FIELDS,'cg_updated_at','updated_at')
      .limit(PAGE_SIZE);
    if(lastId!==null)q=q.startAfter(lastId);
    const snap=await q.get();
    firestoreReads+=snap.size;
    if(snap.empty)break;
    for(const doc of snap.docs){
      rows.push(rowFromDoc(doc));
      markers.cg_updated_at=maxMarker(markers.cg_updated_at,doc.get('cg_updated_at'),doc.id);
      markers.updated_at=maxMarker(markers.updated_at,doc.get('updated_at'),doc.id);
    }
    lastId=snap.docs[snap.docs.length-1].id;
    if(snap.size<PAGE_SIZE)break;
  }

  markers.deleted_at=await latestTombstoneMarker(base);
  firestoreReads+=markerStarted(markers.deleted_at)?1:0;

  let payload={
    schema:CACHE_SCHEMA,
    version:VERSION,
    builtAtMs:Date.now(),
    savedAtMs:0,
    markers,
    rows
  };
  payload=await saveStored(uid,payload);

  return {
    payload,
    source:'firestore-full-build',
    firestoreReads,
    changedRows:rows.length,
    deletedRows:0,
    ms:Date.now()-startedAt
  };
}

async function readQuestionChanges(questions,field,marker){
  const docs=[];
  let cursor={...emptyMarker(),...(marker||{})};
  for(;;){
    let q=questions
      .orderBy(field)
      .orderBy(FieldPath.documentId())
      .select(...CACHE_FIELDS,'cg_updated_at','updated_at')
      .limit(PAGE_SIZE);
    if(markerStarted(cursor)){
      q=q.startAfter(markerTimestamp(cursor),String(cursor.id||''));
    }
    const snap=await q.get();
    if(snap.empty)break;
    docs.push(...snap.docs);
    const last=snap.docs[snap.docs.length-1];
    cursor=markerFrom(last.get(field),last.id);
    if(snap.size<PAGE_SIZE)break;
  }
  return {docs,marker:cursor};
}

async function readTombstoneChanges(base,marker){
  const docs=[];
  let cursor={...emptyMarker(),...(marker||{})};
  const col=base.collection('question_tombstones');
  for(;;){
    let q=col
      .orderBy('deleted_at')
      .orderBy(FieldPath.documentId())
      .select('question_id','deleted_at')
      .limit(PAGE_SIZE);
    if(markerStarted(cursor)){
      q=q.startAfter(markerTimestamp(cursor),String(cursor.id||''));
    }
    const snap=await q.get();
    if(snap.empty)break;
    docs.push(...snap.docs);
    const last=snap.docs[snap.docs.length-1];
    cursor=markerFrom(last.get('deleted_at'),last.id);
    if(snap.size<PAGE_SIZE)break;
  }
  return {docs,marker:cursor};
}

async function incrementalRefresh(uid,payload){
  const startedAt=Date.now();
  const db=getFirestore();
  const base=db.collection('users').doc(uid);
  const questions=base.collection('questions');
  const map=new Map(payload.rows.map(row=>[String(row.id),row]));

  const [cg,legacy,tomb]=await Promise.all([
    readQuestionChanges(questions,'cg_updated_at',payload.markers?.cg_updated_at),
    readQuestionChanges(questions,'updated_at',payload.markers?.updated_at),
    readTombstoneChanges(base,payload.markers?.deleted_at)
  ]);

  const changedIds=new Set();
  for(const doc of [...cg.docs,...legacy.docs]){
    map.set(String(doc.id),rowFromDoc(doc));
    changedIds.add(String(doc.id));
  }

  let deletedRows=0;
  for(const doc of tomb.docs){
    const id=one(doc.get('question_id'))||String(doc.id);
    if(map.delete(id))deletedRows++;
  }

  const countSnap=await questions.count().get();
  const authoritativeCount=Number(countSnap.data().count||0);
  const firestoreReads=cg.docs.length+legacy.docs.length+tomb.docs.length+1;

  if(map.size!==authoritativeCount){
    console.warn(
      `CGCOST001 count mismatch cache=${map.size} firestore=${authoritativeCount}; full rebuild`
    );
    const rebuilt=await fullBuild(uid);
    return {
      ...rebuilt,
      source:'firestore-full-build-count-repair',
      firestoreReads:firestoreReads+rebuilt.firestoreReads
    };
  }

  const markers={
    cg_updated_at:cg.marker,
    updated_at:legacy.marker,
    deleted_at:tomb.marker
  };
  let next={
    ...payload,
    schema:CACHE_SCHEMA,
    version:VERSION,
    markers,
    rows:[...map.values()]
  };

  if(changedIds.size||tomb.docs.length){
    next=await saveStored(uid,next);
  }else{
    await touchStored(uid,next.rows.length);
  }

  return {
    payload:next,
    source:(changedIds.size||tomb.docs.length)?'storage-incremental-refresh':'storage-validated',
    firestoreReads,
    changedRows:changedIds.size,
    deletedRows,
    ms:Date.now()-startedAt
  };
}

async function getQuestionCatalog(uid,options={}){
  uid=one(uid);
  if(!uid)throw new Error('CGCOST001 uid manquant.');
  const forceRebuild=Boolean(options.forceRebuild);
  const hit=MEMORY.get(uid);
  if(!forceRebuild&&hit&&Date.now()-hit.validatedAt<MEMORY_TTL_MS){
    return {
      rows:hit.payload.rows,
      source:'memory',
      firestoreReads:0,
      changedRows:0,
      deletedRows:0,
      ms:0,
      version:VERSION
    };
  }

  if(INFLIGHT.has(uid))return INFLIGHT.get(uid);

  const job=(async()=>{
    let result;
    if(forceRebuild){
      result=await fullBuild(uid);
    }else if(hit?.payload){
      result=await incrementalRefresh(uid,hit.payload);
    }else{
      const stored=await readStored(uid);
      if(!stored){
        result=await fullBuild(uid);
      }else if(stored.validatedAtMs&&Date.now()-stored.validatedAtMs<MEMORY_TTL_MS){
        result={
          payload:stored.payload,
          source:'storage-recent',
          firestoreReads:0,
          changedRows:0,
          deletedRows:0,
          ms:0
        };
      }else{
        result=await incrementalRefresh(uid,stored.payload);
      }
    }

    MEMORY.set(uid,{payload:result.payload,validatedAt:Date.now()});
    return {
      rows:result.payload.rows,
      source:result.source,
      firestoreReads:Number(result.firestoreReads||0),
      changedRows:Number(result.changedRows||0),
      deletedRows:Number(result.deletedRows||0),
      ms:Number(result.ms||0),
      version:VERSION
    };
  })().finally(()=>INFLIGHT.delete(uid));

  INFLIGHT.set(uid,job);
  return job;
}

module.exports={
  VERSION,
  getQuestionCatalog
};
