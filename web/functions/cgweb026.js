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


function auditRecord(file){
  const m=file?.metadata||{};
  const path=String(file?.name||'');
  const customSha=one(m?.metadata?.sha256);
  const md5=one(m.md5Hash);
  const filenameHash=((path.match(/\/([a-f0-9]{24,64})-(?:main|thumb)\./i)||[])[1]||'').toLowerCase();
  const rawSize=m.size;
  const size=Number(rawSize);
  const sizeKnown=rawSize!==undefined && rawSize!==null && Number.isFinite(size);

  let source='none';
  let signature='';
  if(customSha){
    source='custom-sha256';
    signature=customSha.toLowerCase();
  }else if(md5){
    source='gcs-md5';
    signature=md5;
  }else if(filenameHash){
    source='filename-hash';
    signature=filenameHash;
  }

  return {
    path,
    isThumb:/-thumb\./i.test(path),
    size:sizeKnown?size:0,
    sizeKnown,
    contentType:one(m.contentType),
    customSha:customSha.toLowerCase(),
    md5,
    filenameHash,
    source,
    signature
  };
}

function pushGroup(map,key,row){
  if(!key)return;
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(row);
}

function duplicateValues(map){
  return [...map.entries()]
    .filter(([,rows])=>rows.length>1)
    .map(([key,rows])=>({key,rows}));
}

function classifyAuditGroup(source,rows){
  const md5Values=[...new Set(rows.map(r=>r.md5).filter(Boolean))];
  const customValues=[...new Set(rows.map(r=>r.customSha).filter(Boolean))];
  const filenameValues=[...new Set(rows.map(r=>r.filenameHash).filter(Boolean))];
  const sizes=[...new Set(rows.filter(r=>r.sizeKnown).map(r=>r.size))];
  const md5Complete=rows.every(r=>!!r.md5);

  let verdict='unverified';
  let reason='Pas assez de métadonnées indépendantes pour confirmer le contenu.';

  if(source==='gcs-md5'){
    verdict='confirmed';
    reason='Même MD5 Google Cloud Storage : contenu binaire identique.';
  }else if(md5Values.length>1){
    verdict='conflict';
    reason='Même signature primaire mais plusieurs MD5 : les fichiers ne sont pas identiques.';
  }else if(md5Complete && md5Values.length===1){
    verdict='confirmed';
    reason='Signature primaire confirmée par un MD5 identique sur tous les fichiers.';
  }else if(sizes.length>1){
    verdict='conflict';
    reason='Même signature primaire mais tailles différentes : faux doublon certain.';
  }

  return {
    verdict,
    reason,
    distinctMd5:md5Values.length,
    distinctCustomSha:customValues.length,
    distinctFilenameHash:filenameValues.length,
    distinctSizes:sizes.length,
    md5Complete
  };
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
          timing:{questionMs,storageListMs,processingMs,totalMs}
        });
      }

      if(mode==='duplicateAudit'){
        const started=Date.now();
        const listStarted=Date.now();
        const [files]=await bucket.getFiles({prefix});
        const storageListMs=Date.now()-listStarted;

        const all=(files||[]).map(auditRecord);
        const rows=all.filter(r=>!r.isThumb);

        const customMap=new Map();
        const md5Map=new Map();
        const filenameMap=new Map();
        const primaryMap=new Map();

        const sourceFileCounts={
          'custom-sha256':0,
          'gcs-md5':0,
          'filename-hash':0,
          'none':0
        };

        for(const r of rows){
          sourceFileCounts[r.source]=(sourceFileCounts[r.source]||0)+1;
          pushGroup(customMap,r.customSha,r);
          pushGroup(md5Map,r.md5,r);
          pushGroup(filenameMap,r.filenameHash,r);
          pushGroup(primaryMap,r.signature?`${r.source}:${r.signature}`:'',r);
        }

        const primaryGroups=duplicateValues(primaryMap);
        const customGroups=duplicateValues(customMap);
        const md5Groups=duplicateValues(md5Map);
        const filenameGroups=duplicateValues(filenameMap);

        const audited=primaryGroups.map(g=>{
          const source=g.rows[0]?.source||'none';
          const cls=classifyAuditGroup(source,g.rows);
          const totalBytes=g.rows.reduce((n,r)=>n+(r.sizeKnown?r.size:0),0);

          return {
            source,
            signature:g.key.replace(/^[^:]+:/,''),
            fileCount:g.rows.length,
            totalBytes,
            verdict:cls.verdict,
            reason:cls.reason,
            distinctMd5:cls.distinctMd5,
            distinctCustomSha:cls.distinctCustomSha,
            distinctFilenameHash:cls.distinctFilenameHash,
            distinctSizes:cls.distinctSizes,
            md5Complete:cls.md5Complete,
            paths:g.rows.slice(0,8).map(r=>({
              path:r.path,
              size:r.size,
              sizeKnown:r.sizeKnown,
              md5:r.md5,
              customSha:r.customSha,
              filenameHash:r.filenameHash
            }))
          };
        });

        const countVerdict=v=>audited.filter(g=>g.verdict===v);
        const confirmed=countVerdict('confirmed');
        const conflicts=countVerdict('conflict');
        const unverified=countVerdict('unverified');

        const filesIn=arr=>arr.reduce((n,g)=>n+g.fileCount,0);

        const priority={conflict:0,unverified:1,confirmed:2};
        const samples=[...audited]
          .sort((a,b)=>
            (priority[a.verdict]-priority[b.verdict])
            || (b.fileCount-a.fileCount)
            || a.signature.localeCompare(b.signature)
          )
          .slice(0,80);

        return json(res,200,{
          ok:true,
          version:'CGWEB026_DUPLICATE_AUDIT001',
          fileCount:all.length,
          mainFileCount:rows.length,
          thumbFileCount:all.length-rows.length,
          currentCandidateGroups:primaryGroups.length,
          currentCandidateFiles:filesIn(audited),
          confirmedGroups:confirmed.length,
          confirmedFiles:filesIn(confirmed),
          conflictGroups:conflicts.length,
          conflictFiles:filesIn(conflicts),
          unverifiedGroups:unverified.length,
          unverifiedFiles:filesIn(unverified),
          groupsByIndependentSignal:{
            customSha256:customGroups.length,
            gcsMd5:md5Groups.length,
            filenameHash:filenameGroups.length
          },
          sourceFileCounts,
          samples,
          timing:{
            storageListMs,
            totalMs:Date.now()-started
          }
        });
      }

      if(mode==='duplicateSavings'){
        const started=Date.now();
        const listStarted=Date.now();
        const [files]=await bucket.getFiles({prefix});
        const storageListMs=Date.now()-listStarted;

        const all=(files||[]).map(auditRecord);
        const rows=all.filter(r=>!r.isThumb);

        const primaryMap=new Map();
        let mainBytes=0;
        let mainSizeKnownCount=0;

        for(const r of rows){
          if(r.sizeKnown){
            mainBytes+=r.size;
            mainSizeKnownCount++;
          }
          pushGroup(primaryMap,r.signature?`${r.source}:${r.signature}`:'',r);
        }

        const primaryGroups=duplicateValues(primaryMap);
        const confirmed=[];

        for(const g of primaryGroups){
          const source=g.rows[0]?.source||'none';
          const cls=classifyAuditGroup(source,g.rows);
          if(cls.verdict!=='confirmed')continue;

          const sizeKnown=g.rows.every(r=>r.sizeKnown);
          const sorted=[...g.rows].sort((a,b)=>a.path.localeCompare(b.path));
          const canonical=sorted[0]||null;
          const totalBytes=sizeKnown
            ? sorted.reduce((n,r)=>n+r.size,0)
            : 0;
          const canonicalBytes=sizeKnown && canonical
            ? canonical.size
            : 0;
          const reclaimableBytes=sizeKnown
            ? Math.max(0,totalBytes-canonicalBytes)
            : 0;

          confirmed.push({
            source,
            signature:g.key.replace(/^[^:]+:/,''),
            fileCount:sorted.length,
            removableFiles:Math.max(0,sorted.length-1),
            sizeKnown,
            fileSize:sizeKnown&&canonical?canonical.size:0,
            totalBytes,
            canonicalBytes,
            reclaimableBytes,
            canonicalPath:canonical?.path||'',
            duplicatePaths:sorted.slice(1,9).map(r=>r.path)
          });
        }

        const reclaimableFiles=confirmed.reduce((n,g)=>n+g.removableFiles,0);
        const reclaimableBytes=confirmed.reduce((n,g)=>n+g.reclaimableBytes,0);
        const bytesInDuplicateGroups=confirmed.reduce((n,g)=>n+g.totalBytes,0);
        const canonicalBytes=confirmed.reduce((n,g)=>n+g.canonicalBytes,0);
        const sizeKnownGroups=confirmed.filter(g=>g.sizeKnown).length;
        const unknownSizeGroups=confirmed.length-sizeKnownGroups;

        const distribution={
          twoCopies:confirmed.filter(g=>g.fileCount===2).length,
          threeToFive:confirmed.filter(g=>g.fileCount>=3&&g.fileCount<=5).length,
          sixToTen:confirmed.filter(g=>g.fileCount>=6&&g.fileCount<=10).length,
          moreThanTen:confirmed.filter(g=>g.fileCount>10).length
        };

        const topGroups=[...confirmed]
          .sort((a,b)=>
            (b.reclaimableBytes-a.reclaimableBytes)
            || (b.fileCount-a.fileCount)
            || a.signature.localeCompare(b.signature)
          )
          .slice(0,80);

        return json(res,200,{
          ok:true,
          version:'CGWEB026_DUPLICATE_SAVINGS001',
          fileCount:all.length,
          mainFileCount:rows.length,
          thumbFileCount:all.length-rows.length,
          mainBytes,
          mainSizeKnownCount,
          confirmedGroups:confirmed.length,
          sizeKnownGroups,
          unknownSizeGroups,
          filesInsideConfirmedGroups:confirmed.reduce((n,g)=>n+g.fileCount,0),
          reclaimableFiles,
          bytesInDuplicateGroups,
          canonicalBytes,
          reclaimableBytes,
          reclaimablePercentOfMainBytes:mainBytes
            ? Math.round((reclaimableBytes/mainBytes)*10000)/100
            : 0,
          reclaimablePercentOfMainFiles:rows.length
            ? Math.round((reclaimableFiles/rows.length)*10000)/100
            : 0,
          distribution,
          topGroups,
          timing:{
            storageListMs,
            totalMs:Date.now()-started
          }
        });
      }

      if(mode==='dedupPlan'){
        const started=Date.now();

        const questionsPromise=(async()=>{
          const t=Date.now();
          const snap=await base.collection('questions')
            .select('image_file','image_thumb_file')
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

        const all=(files||[]).map(auditRecord);
        const mainRows=all.filter(r=>!r.isThumb);
        const fileByPath=new Map(all.map(r=>[r.path,r]));

        // References Firestore exactes vers chaque chemin Storage.
        const refsByPath=new Map();
        for(const d of qSnap.docs){
          const q=d.data()||{};
          for(const field of ['image_file','image_thumb_file']){
            const path=one(q[field]);
            if(!path)continue;
            if(!refsByPath.has(path))refsByPath.set(path,[]);
            refsByPath.get(path).push({
              questionId:String(d.id),
              field
            });
          }
        }

        // Même logique de regroupement que l'audit et le calcul d'économies.
        const primaryMap=new Map();
        for(const r of mainRows){
          pushGroup(primaryMap,r.signature?`${r.source}:${r.signature}`:'',r);
        }

        const candidates=duplicateValues(primaryMap);
        const confirmedGroups=[];
        let conflictGroups=0;
        let unverifiedGroups=0;

        for(const g of candidates){
          const source=g.rows[0]?.source||'none';
          const cls=classifyAuditGroup(source,g.rows);

          if(cls.verdict==='conflict'){
            conflictGroups++;
            continue;
          }
          if(cls.verdict!=='confirmed'){
            unverifiedGroups++;
            continue;
          }

          // Canonique déterministe et plus robuste :
          // privilégier un fichier déjà référencé dans Firestore,
          // puis ordre lexical stable.
          const sorted=[...g.rows].sort((a,b)=>{
            const ar=(refsByPath.get(a.path)||[]).length>0?0:1;
            const br=(refsByPath.get(b.path)||[]).length>0?0:1;
            return (ar-br)||a.path.localeCompare(b.path);
          });

          const canonical=sorted[0];
          confirmedGroups.push({
            source,
            signature:g.key.replace(/^[^:]+:/,''),
            canonical,
            duplicates:sorted.slice(1)
          });
        }

        const plan=[];
        const uniqueDocs=new Set();
        let fieldUpdates=0;
        let deleteOnlyCopies=0;
        let reclaimableBytes=0;
        let unknownSizeCopies=0;
        let canonicalsWithoutRefs=0;
        let duplicateRefs=0;

        const anomalySamples=[];
        let missingCanonicalFiles=0;
        let missingDuplicateFiles=0;
        let duplicateRefsToMissingStorage=0;

        for(const g of confirmedGroups){
          const canonical=g.canonical;
          const canonicalExists=fileByPath.has(canonical.path);
          const canonicalRefs=refsByPath.get(canonical.path)||[];

          if(!canonicalExists){
            missingCanonicalFiles++;
            if(anomalySamples.length<50){
              anomalySamples.push({
                type:'missingCanonical',
                path:canonical.path,
                signature:g.signature
              });
            }
            continue;
          }

          if(canonicalRefs.length===0)canonicalsWithoutRefs++;

          for(const d of g.duplicates){
            const exists=fileByPath.has(d.path);
            if(!exists){
              missingDuplicateFiles++;
              if(anomalySamples.length<50){
                anomalySamples.push({
                  type:'missingDuplicate',
                  path:d.path,
                  signature:g.signature
                });
              }
              continue;
            }

            const refs=refsByPath.get(d.path)||[];
            duplicateRefs+=refs.length;

            for(const ref of refs){
              uniqueDocs.add(ref.questionId);
              fieldUpdates++;
            }

            if(refs.length===0)deleteOnlyCopies++;

            if(d.sizeKnown){
              reclaimableBytes+=d.size;
            }else{
              unknownSizeCopies++;
            }

            plan.push({
              signature:g.signature,
              source:g.source,
              fromPath:d.path,
              toPath:canonical.path,
              fileSize:d.sizeKnown?d.size:0,
              sizeKnown:d.sizeKnown,
              refCount:refs.length,
              refs,
              action:refs.length?'update_then_delete':'delete_only_unreferenced_copy'
            });
          }
        }

        // Vérification supplémentaire : toute référence incluse dans le plan
        // doit pointer vers un fichier Storage réellement présent.
        for(const item of plan){
          if(item.refCount>0 && !fileByPath.has(item.fromPath)){
            duplicateRefsToMissingStorage+=item.refCount;
            if(anomalySamples.length<50){
              anomalySamples.push({
                type:'refToMissingDuplicateStorage',
                path:item.fromPath,
                refCount:item.refCount
              });
            }
          }
        }

        const filesToDelete=plan.length;
        const documentsToUpdate=uniqueDocs.size;
        const anomalyCount=
          missingCanonicalFiles
          +missingDuplicateFiles
          +duplicateRefsToMissingStorage;

        const safeToExecute=
          conflictGroups===0
          &&unverifiedGroups===0
          &&anomalyCount===0
          &&unknownSizeCopies===0;

        const samplePlan=plan.slice(0,100);

        return json(res,200,{
          ok:true,
          version:'CGWEB026_DEDUP_PLAN001',
          dryRun:true,
          safeToExecute,
          questionCount:qSnap.size,
          storageFileCount:all.length,
          mainFileCount:mainRows.length,
          candidateGroups:candidates.length,
          confirmedGroups:confirmedGroups.length,
          conflictGroups,
          unverifiedGroups,
          canonicalFiles:confirmedGroups.length,
          canonicalsWithoutRefs,
          filesToDelete,
          deleteOnlyCopies,
          documentsToUpdate,
          fieldUpdates,
          duplicateRefs,
          reclaimableBytes,
          unknownSizeCopies,
          anomalies:{
            total:anomalyCount,
            missingCanonicalFiles,
            missingDuplicateFiles,
            duplicateRefsToMissingStorage,
            samples:anomalySamples
          },
          plan,
          samplePlan,
          timing:{
            questionMs,
            storageListMs,
            totalMs:Date.now()-started
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
      return json(res,Number(e?.status)||500,{ok:false,error:e?.message||String(e)});
    }
  }
);
