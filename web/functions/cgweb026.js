const {onRequest}=require('firebase-functions/v2/https');
const {getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');

if(!getApps().length)initializeApp();

const REGION='europe-west1';

function one(v){return String(v??'').trim()}

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

function json(res,status,body){
  res.status(status)
    .set('content-type','application/json; charset=utf-8')
    .send(JSON.stringify(body));
}

async function user(req){
  const h=one(req.headers.authorization);
  if(!h.startsWith('Bearer ')){
    throw Object.assign(new Error('Authentification Firebase requise.'),{status:401});
  }
  return getAuth().verifyIdToken(h.slice(7));
}

function digestFromFile(file){
  const m=file?.metadata||{};
  return one(m?.metadata?.sha256)
    || one(m.md5Hash)
    || ((String(file?.name||'').match(/\/([a-f0-9]{24,64})-(?:main|thumb)\./i)||[])[1]||'');
}

exports.cgweb026ImageCenter=onRequest(
  {region:REGION,timeoutSeconds:540,memory:'2GiB'},
  async(req,res)=>{
    if(cors(req,res))return;

    try{
      if(req.method!=='POST'){
        return json(res,405,{ok:false,error:'POST attendu.'});
      }

      const u=await user(req);
      const mode=one(req.body?.mode)||'scan';

      const db=getFirestore();
      const base=db.collection('users').doc(u.uid);
      const bucket=getStorage().bucket();
      const prefix=`users/${u.uid}/question-images/`;

      if(mode==='scan'){
        const started=Date.now();

        const questionsPromise=(async()=>{
          const t=Date.now();
          const snap=await base.collection('questions')
            .select('image_file','image_thumb_file','theme')
            .get();
          return {snap,ms:Date.now()-t};
        })();

        const filesPromise=(async()=>{
          const t=Date.now();
          const [files]=await bucket.getFiles({prefix});
          return {files:files||[],ms:Date.now()-t};
        })();

        const [{snap:qSnap,ms:questionMs},{files,ms:storageListMs}]
          =await Promise.all([questionsPromise,filesPromise]);

        const refs=new Map();
        const themes=new Map();

        for(const d of qSnap.docs){
          const q=d.data()||{};
          const theme=one(q.theme);

          for(const p of [one(q.image_file),one(q.image_thumb_file)].filter(Boolean)){
            if(!refs.has(p))refs.set(p,[]);
            refs.get(p).push(String(d.id));

            if(theme){
              if(!themes.has(p))themes.set(p,new Set());
              themes.get(p).add(theme);
            }
          }
        }

        const processingStart=Date.now();
        const rows=[];
        const groups=new Map();
        let totalBytes=0;
        let sizeKnownCount=0;

        /*
         * SCALE001:
         * bucket.getFiles() fournit déjà un objet File avec metadata issu du
         * listing Cloud Storage. On utilise donc file.metadata directement.
         * AUCUN getMetadata() individuel n'est lancé ici.
         */
        for(const f of files){
          const m=f.metadata||{};
          const path=String(f.name||'');
          const rawSize=m.size;
          const size=Number(rawSize);
          const sizeKnown=rawSize!==undefined && rawSize!==null && Number.isFinite(size);

          if(sizeKnown){
            totalBytes+=size;
            sizeKnownCount++;
          }

          const questionIds=refs.get(path)||[];
          const digest=digestFromFile(f);
          const isThumb=/-thumb\./i.test(path);

          const row={
            path,
            size:sizeKnown?size:0,
            sizeKnown,
            contentType:one(m.contentType),
            questionIds,
            themes:[...(themes.get(path)||[])].slice(0,10),
            orphan:questionIds.length===0,
            isThumb,
            duplicate:false
          };

          rows.push(row);

          if(digest && !isThumb){
            if(!groups.has(digest))groups.set(digest,[]);
            groups.get(digest).push(row);
          }
        }

        let duplicateGroups=0;
        for(const groupedRows of groups.values()){
          if(groupedRows.length>1){
            duplicateGroups++;
            for(const row of groupedRows)row.duplicate=true;
          }
        }

        const processingMs=Date.now()-processingStart;
        const totalMs=Date.now()-started;

        return json(res,200,{
          ok:true,
          version:'CGWEB026_IMAGECENTER_SCALE001',
          prefix,
          questionCount:qSnap.size,
          fileCount:rows.length,
          totalBytes,
          sizeKnownCount,
          averageBytes:sizeKnownCount?Math.round(totalBytes/sizeKnownCount):0,
          orphanCount:rows.filter(r=>r.orphan).length,
          duplicateGroups,
          rows,
          timing:{
            questionMs,
            storageListMs,
            processingMs,
            totalMs
          }
        });
      }

      if(mode==='deleteOrphan'){
        const path=one(req.body?.path);

        if(!path.startsWith(prefix)){
          return json(res,400,{ok:false,error:'Chemin Storage hors espace utilisateur.'});
        }

        const qSnap=await base.collection('questions')
          .where('image_file','==',path)
          .limit(1)
          .get();

        const tSnap=await base.collection('questions')
          .where('image_thumb_file','==',path)
          .limit(1)
          .get();

        if(!qSnap.empty||!tSnap.empty){
          return json(res,409,{
            ok:false,
            error:'Suppression refusée : cette image est encore référencée.'
          });
        }

        await bucket.file(path).delete({ignoreNotFound:true});
        return json(res,200,{ok:true,deleted:path});
      }

      return json(res,400,{ok:false,error:'Mode inconnu.'});
    }catch(e){
      return json(
        res,
        Number(e?.status)||500,
        {ok:false,error:e?.message||String(e)}
      );
    }
  }
);
