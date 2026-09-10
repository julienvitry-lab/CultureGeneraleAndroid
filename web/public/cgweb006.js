const $=id=>document.getElementById(id);
const state={stack:[null],page:0,last:null,rows:[],mode:"directory",editorBaseRevision:0};
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const fmt=n=>new Intl.NumberFormat("fr-FR").format(Number(n||0));
const api=()=>window.CGWEB006_API||null;
const filters=()=>({megatheme:$("cg6Mega").value.trim(),theme:$("cg6Theme").value.trim()});
function setStatus(t,type=""){const e=$("cg6Status");e.textContent=t;e.className="cg6-status "+(type?`cg6-${type}`:"")}
async function waitApi(){for(let i=0;i<80;i++){if(api())return api();await new Promise(r=>setTimeout(r,250))}throw new Error("Pont Firebase CGWEB006 indisponible.")}
function cgimg1ImageHtml(r){
  const path=String(r.image_thumb_file||r.image_file||"").trim();
  if(!path)return "";
  const cloud=String(r.image_origin||"")==="firebase_storage"||(path.startsWith("users/")&&path.includes("/question-images/"));
  if(!cloud)return `<div class="cgimg1-row-legacy">Image locale historique · ${esc(path)}</div>`;
  return `<div class="cgimg1-row-media" data-cgimg1-path="${esc(path)}" data-cgimg1-question="${esc(r.id)}"><span>Image…</span></div>`;
}
function rowHtml(r){const p=[r.proposition_a,r.proposition_b,r.proposition_c,r.proposition_d].filter(v=>v!==null&&v!==undefined&&String(v)!=="").map((v,i)=>`<span><b>${String.fromCharCode(65+i)}.</b> ${esc(v)}</span>`).join("");return `<article class="cg6-row"><div class="cg6-row-head"><div><div class="cg6-id">#${esc(r.original_id??r.id)}</div><div class="cg6-path">${esc(r.megatheme)}${r.theme?" › "+esc(r.theme):""}</div></div><button class="cg6-edit" data-edit="${esc(r.id)}">Modifier</button></div><div class="cg6-question">${esc(r.question)}</div>${r.detail?`<div class="cg6-detail">${esc(r.detail)}</div>`:""}${cgimg1ImageHtml(r)}${p?`<div class="cg6-props">${p}</div>`:""}<div class="cg6-meta"><span>Réponse : ${esc(r.correct_index??"—")}</span><span>Statut : ${esc(r.status??"—")}</span><span>row : ${esc(r.row_number??"—")}</span><span>Révision : ${esc(r.cg_revision??0)}</span></div></article>`}
function render(rows){if(typeof window.CGWEB011_sortRows==="function")rows=window.CGWEB011_sortRows(rows);state.rows=rows;$("cg6Rows").innerHTML=rows.length?rows.map(rowHtml).join(""):'<div class="cg6-empty">Aucune question trouvée.</div>';document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));window.dispatchEvent(new CustomEvent("cgweb006-rendered",{detail:{rows:state.rows}}))}
async function count(){const a=await waitApi();$("cg6CloudCount").textContent=a.currentUser()?fmt(await a.count(filters())):"—"}
async function load(reset=false){if(reset){state.stack=[null];state.page=0}state.mode="directory";setStatus("Lecture Firestore…");try{const a=await waitApi();if(!a.currentUser())throw new Error("Connecte-toi d’abord avec CGWEB001.");const res=await a.page({...filters(),pageSize:(window.CGWEB011_pageSize||50),afterId:state.stack[state.page]||null});state.last=res.lastId||null;render(res.rows||[]);$("cg6Page").textContent=`Page ${state.page+1}`;$("cg6Prev").disabled=state.page<=0;$("cg6Next").disabled=!state.last||(res.rows||[]).length<(window.CGWEB011_pageSize||50);setStatus(`${fmt((res.rows||[]).length)} question(s) affichée(s)`,"ok");await count()}catch(e){render([]);setStatus(e?.message||String(e),"error")}}
async function search(){const term=$("cg6Search").value.trim(),mode=$("cg6SearchMode").value;if(!term)return load(true);state.mode=mode;setStatus("Recherche…");try{const a=await waitApi();let rows=[];if(mode==="id"){const r=await a.byId(term);rows=r?[r]:[]}else rows=await a.questionPrefix(term,100);render(rows);$("cg6Page").textContent=mode==="id"?"Recherche ID":"100 résultats max.";$("cg6Prev").disabled=true;$("cg6Next").disabled=true;setStatus(`${fmt(rows.length)} résultat(s)`,"ok")}catch(e){render([]);setStatus(e?.message||String(e),"error")}}
// CGSYNC007_EDITOR_HELPERS_START
function cg7FillEditor(r){
  if(!r)return;
  $("cg6EditId").value=r.id;
  $("cg6EditOriginal").textContent=r.original_id??r.id;
  for(const [k,v] of [["Mega","megatheme"],["Theme","theme"],["Question","question"],["Detail","detail"],["A","proposition_a"],["B","proposition_b"],["C","proposition_c"],["D","proposition_d"],["Correct","correct_index"],["Status","status"]]){
    $(`cg6Edit${k}`).value=r[v]??"";
  }
  state.editorBaseRevision=Number(r.cg_revision??0)||0;
  window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
  $("cg7Conflict")?.remove();
}

async function cg7ReloadEditorCloud(){
  const id=$("cg6EditId").value;
  if(!id)return null;
  const fresh=await (await waitApi()).byId(id);
  if(fresh){
    cg7FillEditor(fresh);
    $("cg6SaveState").textContent=`Cloud rechargé · révision ${state.editorBaseRevision}`;
  }
  return fresh;
}
window.CGSYNC007_reloadEditorCloud=cg7ReloadEditorCloud;

function cg7ConflictFields(cloud,patch){
  const labels={megatheme:"Mégathème",theme:"Thème",question:"Question",detail:"Détail",proposition_a:"A",proposition_b:"B",proposition_c:"C",proposition_d:"D",correct_index:"Réponse",status:"Statut"};
  return Object.keys(patch||{}).filter(k=>String(cloud?.[k]??"")!==String(patch?.[k]??"")).map(k=>labels[k]||k);
}

function cg7ShowConflict(result,patch){
  $("cg7Conflict")?.remove();
  const card=$("cg6Modal")?.querySelector(".cg6-modal-card");
  if(!card)return;
  const changed=cg7ConflictFields(result?.cloud||{},patch);
  const box=document.createElement("div");
  box.id="cg7Conflict";
  box.className="cg7-conflict";
  box.innerHTML=`<div class="cg7-conflict-title">⚠️ Conflit détecté</div><div>Cette question a changé depuis l'ouverture de l'éditeur.</div><div class="cg7-conflict-meta">Votre base : révision ${state.editorBaseRevision} · Cloud : révision ${result.cloudRevision}</div><div class="cg7-conflict-fields">Champ(s) concerné(s) : ${esc(changed.join(", ")||"modification concurrente")}</div><div class="cg7-conflict-actions"><button id="cg7UseCloud" class="cg6-btn">Utiliser le Cloud</button><button id="cg7UseMine" class="cg6-btn cg6-primary">Appliquer mes modifications</button></div>`;
  card.querySelector(".cg6-actions")?.insertAdjacentElement("beforebegin",box);

  $("cg7UseCloud").onclick=async()=>{
    try{
      await window.CGSYNC007_API?.resolveConflict(result.conflictId,"cloud_reloaded");
      await cg7ReloadEditorCloud();
      box.remove();
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
    }catch(e){$("cg6SaveState").textContent="❌ "+(e?.message||String(e))}
  };

  $("cg7UseMine").onclick=async()=>{
    try{
      $("cg6SaveState").textContent="Résolution du conflit…";
      const resolved=await (await waitApi()).update(
        $("cg6EditId").value,
        patch,
        {expectedRevision:result.cloudRevision,force:true,conflictId:result.conflictId,resolution:"local_applied",source:"CGWEB006_CONFLICT_RESOLUTION"}
      );
      state.editorBaseRevision=Number(resolved?.revision??result.cloudRevision+1)||0;
      window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
      box.remove();
      $("cg6SaveState").textContent=`✅ Conflit résolu · révision ${state.editorBaseRevision}`;
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
      setTimeout(async()=>{closeEditor();state.mode==="directory"?await load(false):await search()},500);
    }catch(e){$("cg6SaveState").textContent="❌ "+(e?.message||String(e))}
  };
}
// CGSYNC007_EDITOR_HELPERS_END
function openEditor(id){const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;cg7FillEditor(r);$("cg6Modal").classList.remove("cg6-hidden");window.dispatchEvent(new CustomEvent("cgweb006-editor-opened",{detail:{record:r}}))}

function closeEditor(){$("cg6Modal").classList.add("cg6-hidden")}
// CGSYNC007_EDITOR_SAVE
async function save(){
  const raw=$("cg6EditCorrect").value.trim(),n=raw===""?null:Number(raw);
  const patch={megatheme:$("cg6EditMega").value.trim(),theme:$("cg6EditTheme").value.trim(),question:$("cg6EditQuestion").value.trim(),detail:$("cg6EditDetail").value,proposition_a:$("cg6EditA").value,proposition_b:$("cg6EditB").value,proposition_c:$("cg6EditC").value,proposition_d:$("cg6EditD").value,correct_index:Number.isFinite(n)?n:raw,status:$("cg6EditStatus").value.trim()};
  try{
    $("cg6SaveState").textContent="Enregistrement…";
    const result=await (await waitApi()).update(
      $("cg6EditId").value,
      patch,
      {expectedRevision:state.editorBaseRevision,source:"CGWEB006_EDITOR"}
    );
    if(result?.conflict){
      $("cg6SaveState").textContent="⚠️ Conflit : choisissez la version à conserver";
      cg7ShowConflict(result,patch);
      window.dispatchEvent(new CustomEvent("cgsync007-conflicts-changed"));
      return;
    }
    state.editorBaseRevision=Number(result?.revision??state.editorBaseRevision+1)||0;
    window.CGSYNC007_EDITOR_BASE_REVISION=state.editorBaseRevision;
    $("cg6SaveState").textContent=`✅ Enregistré · révision ${state.editorBaseRevision}`;
    setTimeout(async()=>{closeEditor();state.mode==="directory"?await load(false):await search()},350);
  }catch(e){
    $("cg6SaveState").textContent="❌ "+(e?.message||String(e));
  }
}
$("cg6Refresh").onclick=()=>load(true);$("cg6SearchBtn").onclick=search;$("cg6Search").onkeydown=e=>{if(e.key==="Enter")search()};$("cg6Mega").onchange=()=>load(true);$("cg6Theme").onkeydown=e=>{if(e.key==="Enter")load(true)};$("cg6Prev").onclick=async()=>{if(state.page>0){state.page--;await load(false)}};$("cg6Next").onclick=async()=>{if(state.last){state.stack[state.page+1]=state.last;state.page++;await load(false)}};$("cg6Close").onclick=closeEditor;$("cg6Cancel").onclick=closeEditor;$("cg6Save").onclick=save;$("cg6Modal").onclick=e=>{if(e.target===$("cg6Modal"))closeEditor()};
(async()=>{try{const a=await waitApi();for(let i=0;i<30&&!a.currentUser();i++){setStatus("Connexion Firebase en attente…");await new Promise(r=>setTimeout(r,500))}await load(true)}catch(e){setStatus(e?.message||String(e),"error")}})();

// CGWEB008_RELOAD_BRIDGE_START
window.CGWEB006_reload = async (reset = true) => {
  await load(Boolean(reset));
};
// CGWEB008_RELOAD_BRIDGE_END


// CGWEB009_012_EXPOSE_START
window.CGWEB006_render = render;
window.CGWEB006_state = state;
window.CGWEB011_rerender = () => render(state.rows || []);
if (typeof window.CGWEB006_reload !== "function") {
  window.CGWEB006_reload = async (reset = true) => { await load(Boolean(reset)); };
}
// CGWEB009_012_EXPOSE_END
