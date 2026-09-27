const CGWEB032_VERSION='CGWEB121_FIX2_STREAMING_DIRECTORY_SCAN001_PROJECTED_FIELDS001_DIRECT_FUNCTION_ENDPOINT002_BOUNDED_RESULT_CACHE001',CG32_END='https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb032Search';const cg32$=id=>document.getElementById(id),cg32Esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function cg32Api(body){
  const u=window.CGWEB001?.getUser?.();

  if(!u?.getIdToken){
    throw new Error('Utilisateur Firebase non connecté.');
  }

  const t=await u.getIdToken();

  const r=await fetch(
    CG32_END,
    {
      method:'POST',
      headers:{
        'content-type':'application/json',

        /*
         * CGWEB121 FIX1
         * Le Firebase ID token ne voyage plus dans Authorization.
         * Il est réservé à l'application via X-Firebase-Auth.
         */
        'x-firebase-auth':t
      },
      body:JSON.stringify(body)
    }
  );

  /*
   * JSON_RESPONSE_GUARD001
   *
   * Ne jamais lancer r.json() à l'aveugle :
   * une page HTML 401/403 donnerait le cryptique
   * "Unexpected token <".
   */
  const contentType=
    String(
      r.headers.get('content-type')||''
    ).toLowerCase();

  const raw=
    await r.text();

  if(
    !contentType.includes(
      'application/json'
    )
  ){
    throw new Error(
      `HTTP ${r.status} : réponse non JSON reçue`
    );
  }

  let d;

  try{
    d=JSON.parse(raw);
  }catch{
    throw new Error(
      `HTTP ${r.status} : JSON invalide reçu`
    );
  }

  if(!r.ok||!d?.ok){
    throw new Error(
      d?.error||
      `HTTP ${r.status}`
    );
  }

  return d;
}
async function cg32Search(forceRefresh=false){const st=cg32$('cg32Status');st.textContent='Recherche…';try{const d=await cg32Api({term:cg32$('cg32Term').value,megatheme:cg32$('cg32Mega').value,theme:cg32$('cg32Theme').value,withImage:cg32$('cg32Image').value,limit:Number(cg32$('cg32Limit').value),forceRefresh});cg32$('cg32Count').textContent=`${d.total.toLocaleString('fr-FR')} résultat(s) sur ${d.catalogSize.toLocaleString('fr-FR')} questions${d.truncated?' · affichage limité':''}`;cg32$('cg32Rows').innerHTML=(d.rows||[]).map(q=>`<article class="cg32-row"><div><small>${cg32Esc([q.megatheme,q.theme].filter(Boolean).join(' › '))}</small><strong>${cg32Esc(q.question)}</strong><span>#${q.id}${q.is_image?' · 🖼️':''}</span></div><div><button data-open="${q.id}">Ouvrir</button><button data-preview="${q.id}">Android</button></div></article>`).join('')||'<div class="cg32-empty">Aucun résultat.</div>';st.textContent='✅ Recherche terminée.'}catch(e){st.textContent=`❌ ${e.message}`}}
function cg32Init(){if(cg32$('cgweb032Panel'))return;const p=document.createElement('section');p.id='cgweb032Panel';p.className='cg32-panel';p.innerHTML=`<header><div><div class="k">CGWEB032 · SEARCH001</div><h2>Recherche</h2><p>Question, thème, mégathème et détail · casse et accents ignorés.</p></div><button id="cg32Refresh">Recharger l’index</button></header><div class="cg32-form"><input id="cg32Term" placeholder="Mots recherchés"><input id="cg32Mega" placeholder="Mégathème contient…"><input id="cg32Theme" placeholder="Thème contient…"><select id="cg32Image"><option value="">Toutes les images</option><option value="yes">Avec image</option><option value="no">Sans image</option></select><select id="cg32Limit"><option>50</option><option selected>100</option><option>200</option><option>300</option></select><button id="cg32Go" class="primary">Rechercher</button></div><div id="cg32Count" class="cg32-count"></div><div id="cg32Rows" class="cg32-rows"></div><div id="cg32Status" class="cg32-status"></div>`;(document.querySelector('main')||document.body).appendChild(p);cg32$('cg32Go').onclick=()=>cg32Search(false);cg32$('cg32Refresh').onclick=()=>cg32Search(true);for(const id of ['cg32Term','cg32Mega','cg32Theme'])cg32$(id).onkeydown=e=>{if(e.key==='Enter')cg32Search(false)};p.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.open)window.CGWEB019_API?.open?.(b.dataset.open);if(b.dataset.preview)window.CGWEB027_API?.open?.(b.dataset.preview)})}
window.CGWEB032_API={search:cg32Search,query:cg32Api};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',cg32Init):cg32Init();
