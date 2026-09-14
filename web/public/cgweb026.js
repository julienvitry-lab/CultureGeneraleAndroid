import {getApp,getApps} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getStorage,ref,getDownloadURL} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

const CGWEB026_VERSION='CGWEB026_DUPLICATE_SAVINGS001';
const END='https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb026ImageCenter';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;');

let DATA=null;

async function api(body){
  const u=window.CGWEB001?.getUser?.();
  if(!u?.getIdToken)throw new Error('Utilisateur Firebase non connecté.');

  const t=await u.getIdToken();
  const r=await fetch(END,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:`Bearer ${t}`
    },
    body:JSON.stringify(body)
  });

  const raw=await r.text();
  let d={};
  try{d=raw?JSON.parse(raw):{}}
  catch(_){throw new Error(`Réponse serveur illisible · HTTP ${r.status}`)}

  if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}

function fmt(n){
  const u=['o','Ko','Mo','Go','To'];
  let x=Number(n||0),i=0;
  while(x>=1024&&i<u.length-1){x/=1024;i++}
  return `${x.toFixed(i?1:0)} ${u[i]}`;
}

function fmtMs(ms){
  const n=Number(ms||0);
  if(n<1000)return `${n} ms`;
  if(n<60000)return `${(n/1000).toFixed(1)} s`;
  return `${Math.floor(n/60000)} min ${Math.round((n%60000)/1000)} s`;
}

function status(t,c=''){
  const e=$('cg26Status');
  if(e){
    e.textContent=t;
    e.className='cg26-status '+c;
  }
}

function filtered(){
  if(!DATA)return[];

  const q=($('cg26Filter')?.value||'').toLowerCase();
  const mode=$('cg26Mode')?.value||'all';
  const theme=($('cg26Theme')?.value||'').toLowerCase();

  return DATA.rows.filter(r=>
    (!q
      || r.path.toLowerCase().includes(q)
      || r.questionIds.join(' ').toLowerCase().includes(q))
    && (!theme
      || r.themes.some(t=>t.toLowerCase().includes(theme)))
    && (
      mode==='all'
      || (mode==='orphan'&&r.orphan)
      || (mode==='used'&&!r.orphan)
      || (mode==='dupe'&&r.duplicate)
    )
  );
}

async function thumb(el,path){
  try{
    if(!getApps().length)return;
    const url=await getDownloadURL(ref(getStorage(getApp()),path));
    el.src=url;
    el.hidden=false;
  }catch(_){}
}

function render(){
  const all=filtered();
  const rows=all.slice(0,500);

  $('cg26Rows').innerHTML=rows.map((r,i)=>`
    <article class="cg26-card">
      <div class="cg26-preview"><img id="cg26img${i}" hidden></div>
      <div class="cg26-info">
        <strong>${esc(r.path.split('/').pop())}</strong>
        <small>
          ${r.sizeKnown?fmt(r.size):'taille —'}
          · ${esc(r.contentType||'type —')}
          · ${r.orphan?'orpheline':`${r.questionIds.length} question(s)`}
          ${r.duplicate?' · doublon':''}
        </small>
        <div>${esc(r.themes.join(' · ')||'Sans thème')}</div>
        <code>${esc(r.path)}</code>
        <div class="cg26-q">${r.questionIds.map(id=>`#${esc(id)}`).join(' ')||'Aucune question'}</div>
      </div>
      <div class="cg26-actions">
        ${r.questionIds[0]?`<button data-q="${esc(r.questionIds[0])}">Gérer</button>`:''}
        ${r.orphan?`<button class="danger" data-del="${esc(r.path)}">Supprimer l’orpheline</button>`:''}
      </div>
    </article>
  `).join('')||'<div class="cg26-empty">Aucune image.</div>';

  rows.forEach((r,i)=>{
    const el=$(`cg26img${i}`);
    if(el)thumb(el,r.path);
  });

  $('cg26Shown').textContent=
    all.length>500?`${rows.length} / ${all.length}`:String(all.length);
}


function auditVerdictLabel(v){
  if(v==='confirmed')return '✅ confirmé';
  if(v==='conflict')return '❌ conflit';
  return '⚠️ à vérifier';
}

function renderAudit(a){
  const panel=$('cg26Audit');
  if(!panel)return;

  const warning=a.conflictGroups>0
    ? `⚠️ ${a.conflictGroups} groupe(s) actuellement marqués « doublon » contiennent plusieurs MD5 ou tailles incompatibles. Ne supprimer aucun doublon sur la seule base du compteur actuel.`
    : a.unverifiedGroups>0
      ? `⚠️ ${a.unverifiedGroups} groupe(s) restent non vérifiés faute d’un signal indépendant complet.`
      : `✅ Tous les groupes candidats sont confirmés par un signal indépendant.`;

  const samples=(a.samples||[]).map((g,i)=>`
    <details class="cg26-audit-group" ${i<5?'open':''}>
      <summary>
        ${auditVerdictLabel(g.verdict)}
        · ${g.fileCount} fichier(s)
        · source ${esc(g.source)}
        · ${esc(g.signature.slice(0,18))}${g.signature.length>18?'…':''}
      </summary>
      <div style="padding:8px 0 12px 18px">
        <div><b>${esc(g.reason)}</b></div>
        <div style="opacity:.8;margin:4px 0">
          MD5 distincts ${g.distinctMd5}
          · tailles distinctes ${g.distinctSizes}
          · SHA custom distincts ${g.distinctCustomSha}
          · hash nom distincts ${g.distinctFilenameHash}
        </div>
        ${(g.paths||[]).map(p=>`
          <div style="margin:5px 0">
            <code>${esc(p.path)}</code>
            <small style="display:block;opacity:.75">
              ${p.sizeKnown?fmt(p.size):'taille —'}
              · MD5 ${esc((p.md5||'—').slice(0,18))}
              · SHA ${esc((p.customSha||'—').slice(0,18))}
            </small>
          </div>
        `).join('')}
      </div>
    </details>
  `).join('');

  panel.innerHTML=`
    <div style="margin-top:18px;padding:14px;border:1px solid rgba(200,150,40,.45);border-radius:12px">
      <h3 style="margin:0 0 10px">Audit des doublons</h3>
      <div class="cg26-stats" style="margin-bottom:10px">
        <span>Candidats actuels <b>${a.currentCandidateGroups}</b></span>
        <span>Confirmés <b>${a.confirmedGroups}</b></span>
        <span>Conflits <b>${a.conflictGroups}</b></span>
        <span>À vérifier <b>${a.unverifiedGroups}</b></span>
      </div>
      <div style="margin:8px 0">
        Groupes selon signal indépendant :
        <b>MD5 ${a.groupsByIndependentSignal?.gcsMd5??0}</b>
        · SHA custom ${a.groupsByIndependentSignal?.customSha256??0}
        · hash nom ${a.groupsByIndependentSignal?.filenameHash??0}
      </div>
      <div style="margin:10px 0"><b>${esc(warning)}</b></div>
      <div style="opacity:.8;margin-bottom:10px">
        ${a.mainFileCount} images principales auditées
        · ${a.thumbFileCount} miniatures exclues
        · ${fmtMs(a.timing?.totalMs||0)}
      </div>
      <div>${samples||'<div>Aucun groupe candidat.</div>'}</div>
    </div>
  `;
}


function renderSavings(s){
  const panel=$('cg26Savings');
  if(!panel)return;

  const top=(s.topGroups||[]).map((g,i)=>`
    <details class="cg26-audit-group" ${i<5?'open':''}>
      <summary>
        ${g.fileCount} copies
        · ${g.removableFiles} supprimable(s)
        · ${g.sizeKnown?fmt(g.reclaimableBytes):'taille inconnue'}
        récupérable(s)
      </summary>
      <div style="padding:8px 0 12px 18px">
        <div><b>Exemplaire canonique proposé :</b></div>
        <code>${esc(g.canonicalPath)}</code>
        <div style="margin-top:6px;opacity:.82">
          Taille unitaire ${g.sizeKnown?fmt(g.fileSize):'—'}
          · total groupe ${g.sizeKnown?fmt(g.totalBytes):'—'}
          · économie ${g.sizeKnown?fmt(g.reclaimableBytes):'—'}
        </div>
        ${(g.duplicatePaths||[]).length
          ? `<div style="margin-top:8px"><b>Copies candidates :</b>${g.duplicatePaths.map(p=>`<div><code>${esc(p)}</code></div>`).join('')}</div>`
          : ''}
      </div>
    </details>
  `).join('');

  const sizeWarning=s.unknownSizeGroups>0
    ? `⚠️ ${s.unknownSizeGroups} groupe(s) confirmé(s) ont une taille incomplète : l’économie affichée est un minimum.`
    : `✅ Taille connue pour tous les groupes confirmés : l’économie est calculée exactement.`;

  panel.innerHTML=`
    <div style="margin-top:18px;padding:14px;border:1px solid rgba(200,150,40,.45);border-radius:12px">
      <h3 style="margin:0 0 10px">Économies potentielles</h3>
      <div class="cg26-stats" style="margin-bottom:10px">
        <span>Groupes confirmés <b>${s.confirmedGroups}</b></span>
        <span>Copies supprimables <b>${s.reclaimableFiles}</b></span>
        <span>Espace récupérable <b>${fmt(s.reclaimableBytes)}</b></span>
        <span>Gain Storage <b>${s.reclaimablePercentOfMainBytes}%</b></span>
      </div>
      <div style="margin:8px 0">
        ${s.filesInsideConfirmedGroups} fichiers dans les groupes confirmés
        · ${s.reclaimablePercentOfMainFiles}% des images principales seraient des copies supprimables
      </div>
      <div style="margin:8px 0">
        Répartition :
        <b>2 copies ${s.distribution?.twoCopies??0}</b>
        · 3–5 ${s.distribution?.threeToFive??0}
        · 6–10 ${s.distribution?.sixToTen??0}
        · &gt;10 ${s.distribution?.moreThanTen??0}
      </div>
      <div style="margin:10px 0"><b>${esc(sizeWarning)}</b></div>
      <div style="opacity:.8;margin-bottom:10px">
        Calcul sans suppression ni modification
        · ${fmtMs(s.timing?.totalMs||0)}
        · miniatures exclues : ${s.thumbFileCount}
      </div>
      <h4 style="margin:14px 0 8px">Groupes les plus coûteux</h4>
      <div>${top||'<div>Aucun doublon confirmé.</div>'}</div>
    </div>
  `;
}

async function calculateSavings(){
  const btn=$('cg26SavingsBtn');
  const started=Date.now();
  let timer=null;

  if(btn)btn.disabled=true;
  status('⏳ Calcul des économies potentielles…');

  const update=()=>{
    status(`⏳ Calcul des économies… ${fmtMs(Date.now()-started)} écoulées`);
  };
  timer=setInterval(update,1000);

  try{
    const s=await api({mode:'duplicateSavings'});
    renderSavings(s);
    status(
      `✅ Économies calculées : ${s.reclaimableFiles} copies · ${fmt(s.reclaimableBytes)} récupérables · ${s.reclaimablePercentOfMainBytes}% du Storage principal.`,
      'ok'
    );
    return s;
  }catch(e){
    status(`❌ Calcul économies : ${e.message}`,'bad');
    return null;
  }finally{
    if(timer)clearInterval(timer);
    if(btn)btn.disabled=false;
  }
}

async function auditDuplicates(){
  const btn=$('cg26AuditBtn');
  const started=Date.now();
  let timer=null;

  if(btn)btn.disabled=true;
  status('⏳ Audit des signatures de doublons…');

  const update=()=>{
    status(`⏳ Audit des doublons… ${fmtMs(Date.now()-started)} écoulées`);
  };
  timer=setInterval(update,1000);

  try{
    const a=await api({mode:'duplicateAudit'});
    renderAudit(a);

    if(a.conflictGroups>0){
      status(`⚠️ Audit terminé : ${a.conflictGroups} groupes en conflit sur ${a.currentCandidateGroups} candidats. Aucune suppression automatique.`,'bad');
    }else{
      status(`✅ Audit terminé : ${a.confirmedGroups} groupes confirmés · ${a.unverifiedGroups} à vérifier.`,'ok');
    }

    return a;
  }catch(e){
    status(`❌ Audit doublons : ${e.message}`,'bad');
    return null;
  }finally{
    if(timer)clearInterval(timer);
    if(btn)btn.disabled=false;
  }
}

async function scan(){
  const btn=$('cg26Scan');
  const started=Date.now();
  let timer=null;

  if(btn)btn.disabled=true;

  const update=()=>{
    status(`⏳ Analyse grande bibliothèque… ${fmtMs(Date.now()-started)} écoulées`);
  };

  update();
  timer=setInterval(update,1000);

  try{
    DATA=await api({mode:'scan'});

    $('cg26Files').textContent=DATA.fileCount;

    const exactSize=Number(DATA.sizeKnownCount||0)===Number(DATA.fileCount||0);
    $('cg26Size').textContent=
      exactSize?fmt(DATA.totalBytes):`≥ ${fmt(DATA.totalBytes)}`;

    $('cg26Avg').textContent=
      DATA.sizeKnownCount?fmt(DATA.averageBytes):'—';

    $('cg26Orphans').textContent=DATA.orphanCount;
    $('cg26Dupes').textContent=DATA.duplicateGroups;

    render();

    const totalMs=DATA.timing?.totalMs??(Date.now()-started);
    const sizeInfo=exactSize
      ? ''
      : ` · taille connue pour ${DATA.sizeKnownCount}/${DATA.fileCount}`;

    status(
      `✅ ${DATA.fileCount} fichiers · ${DATA.questionCount} questions · ${fmtMs(totalMs)}${sizeInfo}`,
      'ok'
    );

    return DATA;
  }catch(e){
    status(`❌ ${e.message}`,'bad');
    return null;
  }finally{
    if(timer)clearInterval(timer);
    if(btn)btn.disabled=false;
  }
}

function init(){
  if($('cgweb026Panel'))return;

  const p=document.createElement('section');
  p.id='cgweb026Panel';
  p.className='cg26-panel';

  p.innerHTML=`
    <header>
      <div>
        <div class="k">CGWEB026 · IMAGECENTER_SCALE001 · DUPLICATE_AUDIT001 · DUPLICATE_SAVINGS001</div>
        <h2>Bibliothèque d’images</h2>
        <p>Inventaire central Storage, usages Firestore, orphelines et doublons.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button id="cg26SavingsBtn">Calculer économies</button><button id="cg26AuditBtn">Auditer doublons</button><button id="cg26Scan" class="primary">Analyser</button></div>
    </header>

    <div class="cg26-stats">
      <span>Fichiers <b id="cg26Files">—</b></span>
      <span>Storage <b id="cg26Size">—</b></span>
      <span>Moyenne <b id="cg26Avg">—</b></span>
      <span>Orphelines <b id="cg26Orphans">—</b></span>
      <span>Doublons <b id="cg26Dupes">—</b></span>
    </div>

    <div class="cg26-tools">
      <input id="cg26Filter" placeholder="Nom, chemin ou ID question">
      <input id="cg26Theme" placeholder="Thème contient…">
      <select id="cg26Mode">
        <option value="all">Toutes</option>
        <option value="used">Utilisées</option>
        <option value="orphan">Orphelines</option>
        <option value="dupe">Doublons</option>
      </select>
      <span><b id="cg26Shown">0</b> affichée(s)</span>
    </div>

    <div id="cg26Rows"></div>
    <div id="cg26Savings"></div>
    <div id="cg26Audit"></div>
    <div id="cg26Status" class="cg26-status">
      IMAGECENTER_SCALE001 prêt. L’analyse d’une grande bibliothèque peut prendre quelques minutes.
    </div>
  `;

  (document.querySelector('main')||document.body).appendChild(p);

  $('cg26SavingsBtn').onclick=calculateSavings;
  $('cg26AuditBtn').onclick=auditDuplicates;
  $('cg26Scan').onclick=scan;

  for(const id of ['cg26Filter','cg26Theme']){
    $(id).oninput=render;
  }

  $('cg26Mode').onchange=render;

  p.addEventListener('click',async e=>{
    const b=e.target.closest('button');
    if(!b)return;

    if(b.dataset.q){
      window.CGIMAGE002?.openEditor?.(b.dataset.q);
      return;
    }

    if(b.dataset.del){
      if(!confirm(`Supprimer définitivement cette image orpheline ?\n\n${b.dataset.del}`))return;

      try{
        await api({mode:'deleteOrphan',path:b.dataset.del});
        await scan();
      }catch(err){
        status(`❌ ${err.message}`,'bad');
      }
    }
  });
}

window.CGWEB026_API={scan,auditDuplicates,calculateSavings};
document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',init)
  :init();
