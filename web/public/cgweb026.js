import {getApp,getApps} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getStorage,ref,getDownloadURL} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

const CGWEB026_VERSION='CGWEB026_IMAGECENTER_SCALE001';
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
  let d=null;
  try{
    d=raw?JSON.parse(raw):{};
  }catch(_){
    throw new Error(`Réponse serveur illisible · HTTP ${r.status}`);
  }

  if(!r.ok||!d.ok){
    throw new Error(d.error||`HTTP ${r.status}`);
  }

  return d;
}

function fmt(n){
  const u=['o','Ko','Mo','Go','To'];
  let x=Number(n||0),i=0;
  while(x>=1024&&i<u.length-1){
    x/=1024;
    i++;
  }
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
      <div class="cg26-preview">
        <img id="cg26img${i}" hidden>
      </div>
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
        <div class="cg26-q">
          ${r.questionIds.map(id=>`#${esc(id)}`).join(' ')||'Aucune question'}
        </div>
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
        <div class="k">CGWEB026 · IMAGECENTER_SCALE001</div>
        <h2>Bibliothèque d’images</h2>
        <p>Inventaire central Storage, usages Firestore, orphelines et doublons.</p>
      </div>
      <button id="cg26Scan" class="primary">Analyser</button>
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
    <div id="cg26Status" class="cg26-status">
      IMAGECENTER_SCALE001 prêt. L’analyse d’une grande bibliothèque peut prendre quelques minutes.
    </div>
  `;

  (document.querySelector('main')||document.body).appendChild(p);

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

window.CGWEB026_API={scan};
document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',init)
  :init();
