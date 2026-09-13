const CGWEB019_VERSION="CGWEB019_QUESTION001";
const cg19$=id=>document.getElementById(id);
const cg19Esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const CG19={id:"",record:null,list:[],editing:false};
function cg19Date(v){if(!v)return"—";try{const d=typeof v?.toDate==="function"?v.toDate():v?.seconds?new Date(v.seconds*1000):new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("fr-FR")}catch(_){return"—"}}
function cg19Status(t,type=""){const e=cg19$("cg19Status");if(e){e.textContent=t;e.className=`cg19-status${type?" cg19-"+type:""}`}}
function cg19CorrectIndex(r){const n=Number(r?.correct_index);return Number.isFinite(n)?n:null}
function cg19SourceLink(url,label){const u=String(url||"").trim();return /^https?:\/\//i.test(u)?`<a href="${cg19Esc(u)}" target="_blank" rel="noopener">${label}</a>`:""}
async function cg19Image(record){
  const box=cg19$("cg19Image");if(!box)return;const path=String(record?.image_file||"").trim();
  if(!path){box.innerHTML="<span>Aucune image</span>";cg19$("cg19AndroidImage").innerHTML="";return}
  box.innerHTML="<span>Chargement…</span>";
  try{
    let url="";if(window.CGIMAGE001?.isCloudPath?.(path))url=await window.CGIMAGE001.urlForPath(path);else if(/^https?:\/\//i.test(path))url=path;else if(/^https?:\/\//i.test(String(record.image_source_url||"")))url=String(record.image_source_url);
    if(!url){box.innerHTML=`<span>Image historique : ${cg19Esc(path)}</span>`;return}
    box.innerHTML=`<img src="${cg19Esc(url)}" alt="Image de la question">`;cg19$("cg19AndroidImage").innerHTML=`<img src="${cg19Esc(url)}" alt="Aperçu Android">`;
  }catch(error){box.innerHTML=`<span class="cg19-error">${cg19Esc(error?.message||String(error))}</span>`}
}
async function cg19History(id){
  const box=cg19$("cg19History");box.innerHTML="Chargement…";
  try{const rows=await window.CGWEB019_DATA_API?.history?.(id,30)||[];box.innerHTML=rows.length?rows.map(h=>`<article><div><strong>${cg19Esc(h.operation||"update")}</strong><span>rév. ${cg19Esc(h.revision_after??h.revision_before??"—")}</span></div><small>${cg19Date(h.created_at)} · ${cg19Esc(h.writer_label||h.writer_id||"")}</small><div class="cg19-patch">${cg19Esc(Object.keys(h.patch||{}).join(", ")||"—")}</div></article>`).join(""):`<div class="cg19-empty">Aucun historique CGWEB019 encore enregistré. Révision actuelle : ${cg19Esc(CG19.record?.cg_revision??0)}.</div>`}catch(error){box.innerHTML=`<div class="cg19-error">${cg19Esc(error?.message||String(error))}</div>`}
}
function cg19Props(r,cls=""){
  const correct=cg19CorrectIndex(r);return ["a","b","c","d"].map((letter,i)=>{const v=r?.[`proposition_${letter}`];if(v===undefined||v===null||String(v)==="")return"";return `<div class="${cls} ${correct===i?"correct":""}"><b>${String.fromCharCode(65+i)}.</b> ${cg19Esc(v)}</div>`}).join("")
}
function cg19Render(record){
  CG19.record=record;CG19.id=String(record.id);cg19$("cg19Id").textContent=`#${record.original_id??record.id}`;cg19$("cg19Path").textContent=`${record.megatheme||""}${record.theme?" › "+record.theme:""}`;
  cg19$("cg19Question").textContent=record.question||"";cg19$("cg19Detail").textContent=record.detail||"";cg19$("cg19Props").innerHTML=cg19Props(record,"cg19-prop");
  cg19$("cg19Meta").innerHTML=`<span>Statut : <b>${cg19Esc(record.status??"—")}</b></span><span>Révision : <b>${cg19Esc(record.cg_revision??0)}</b></span><span>Image : <b>${Number(record.is_image||0)===1?"oui":"non"}</b></span><span>Introuvable : <b>${Number(record.non_trouve||0)===1?"oui":"non"}</b></span><span>Mise à jour : <b>${cg19Date(record.cg_updated_at||record.updated_at)}</b></span>`;
  cg19$("cg19Sources").innerHTML=[cg19SourceLink(record.url_quizypedia,"Quizypedia"),cg19SourceLink(record.url_internet,"Source Internet"),cg19SourceLink(record.image_source_url,"Source image")].filter(Boolean).join(" · ")||"Aucun lien source";
  cg19$("cg19AndroidTheme").textContent=record.theme||record.megatheme||"Culture générale";cg19$("cg19AndroidQuestion").textContent=record.question||"";cg19$("cg19AndroidProps").innerHTML=cg19Props(record,"cg19-android-prop");
  cg19FillForm(record);cg19Image(record);cg19History(record.id);cg19NavState();
}
function cg19FillForm(r){for(const [id,key] of [["Mega","megatheme"],["Theme","theme"],["Question","question"],["Detail","detail"],["A","proposition_a"],["B","proposition_b"],["C","proposition_c"],["D","proposition_d"],["Correct","correct_index"],["StatusEdit","status"]]){const e=cg19$(`cg19Edit${id}`);if(e)e.value=r?.[key]??""}}
function cg19ToggleEdit(force){CG19.editing=force??!CG19.editing;cg19$("cg19Editor").classList.toggle("cg19-hidden",!CG19.editing);cg19$("cg19EditBtn").textContent=CG19.editing?"Fermer l'édition":"Modifier"}
async function cg19Save(){
  const raw=cg19$("cg19EditCorrect").value.trim();const n=raw===""?null:Number(raw);const patch={megatheme:cg19$("cg19EditMega").value.trim(),theme:cg19$("cg19EditTheme").value.trim(),question:cg19$("cg19EditQuestion").value.trim(),detail:cg19$("cg19EditDetail").value,proposition_a:cg19$("cg19EditA").value,proposition_b:cg19$("cg19EditB").value,proposition_c:cg19$("cg19EditC").value,proposition_d:cg19$("cg19EditD").value,correct_index:Number.isFinite(n)?n:raw,status:cg19$("cg19EditStatusEdit").value.trim()};
  cg19Status("Enregistrement…");try{const result=await window.CGWEB006_API.update(CG19.id,patch,{expectedRevision:Number(CG19.record.cg_revision||0),source:"CGWEB019_EDITOR"});if(result?.conflict)throw new Error("Conflit de révision : recharge la fiche avant d'enregistrer.");const fresh=await window.CGWEB006_API.byId(CG19.id);cg19Render(fresh);cg19ToggleEdit(false);cg19Status("✅ Question enregistrée.","ok");window.CGWEB018_API?.reload?.()}catch(error){cg19Status(error?.message||String(error),"error")}
}
function cg19NavState(){const i=CG19.list.indexOf(CG19.id);cg19$("cg19Prev").disabled=i<=0;cg19$("cg19Next").disabled=i<0||i>=CG19.list.length-1}
async function cg19Go(delta){const i=CG19.list.indexOf(CG19.id);const id=CG19.list[i+delta];if(id)await cg19Open(id,CG19.list)}
async function cg19Open(id,listIds=[]){
  cg19Ensure();CG19.list=Array.isArray(listIds)&&listIds.length?listIds.map(String):CG19.list;cg19$("cgweb019Drawer").classList.remove("cg19-hidden");document.body.classList.add("cg19-open");cg19Status("Chargement…");
  try{const row=await window.CGWEB006_API?.byId?.(String(id));if(!row)throw new Error(`Question ${id} introuvable.`);cg19Render(row);cg19Status("Fiche chargée.","ok")}catch(error){cg19Status(error?.message||String(error),"error")}
}
function cg19Close(){cg19$("cgweb019Drawer")?.classList.add("cg19-hidden");document.body.classList.remove("cg19-open")}
function cg19Ensure(){
  if(cg19$("cgweb019Drawer"))return;const drawer=document.createElement("div");drawer.id="cgweb019Drawer";drawer.className="cg19-drawer cg19-hidden";drawer.innerHTML=`
  <div class="cg19-sheet"><header class="cg19-head"><div><div class="cg19-kicker">CGWEB019 · QUESTION001</div><h2 id="cg19Id">Question</h2><div id="cg19Path"></div></div><div class="cg19-head-actions"><button id="cg19Prev">←</button><button id="cg19Next">→</button><button id="cg19EditBtn">Modifier</button><button id="cg19Close">×</button></div></header>
  <main class="cg19-main"><section class="cg19-content"><div id="cg19Question" class="cg19-question"></div><div id="cg19Detail" class="cg19-detail"></div><div id="cg19Image" class="cg19-image"></div><div id="cg19Props" class="cg19-props"></div><div id="cg19Meta" class="cg19-meta"></div><div id="cg19Sources" class="cg19-sources"></div>
  <section id="cg19Editor" class="cg19-editor cg19-hidden"><h3>Modification</h3><div class="cg19-form"><label>Mégathème<input id="cg19EditMega"></label><label>Thème<input id="cg19EditTheme"></label><label class="wide">Question<textarea id="cg19EditQuestion"></textarea></label><label class="wide">Détail<textarea id="cg19EditDetail"></textarea></label><label>A<input id="cg19EditA"></label><label>B<input id="cg19EditB"></label><label>C<input id="cg19EditC"></label><label>D<input id="cg19EditD"></label><label>Correct index<input id="cg19EditCorrect"></label><label>Statut<input id="cg19EditStatusEdit"></label></div><button id="cg19Save" class="cg19-primary">Enregistrer</button></section></section>
  <aside class="cg19-side"><h3>Aperçu Android</h3><div class="cg19-phone"><div id="cg19AndroidTheme" class="cg19-phone-theme"></div><div id="cg19AndroidQuestion" class="cg19-phone-question"></div><div id="cg19AndroidImage" class="cg19-phone-image"></div><div id="cg19AndroidProps" class="cg19-phone-props"></div></div><h3>Historique</h3><div id="cg19History" class="cg19-history"></div></aside></main><footer id="cg19Status" class="cg19-status"></footer></div>`;
  document.body.appendChild(drawer);cg19$("cg19Close").onclick=cg19Close;cg19$("cg19EditBtn").onclick=()=>cg19ToggleEdit();cg19$("cg19Save").onclick=cg19Save;cg19$("cg19Prev").onclick=()=>cg19Go(-1);cg19$("cg19Next").onclick=()=>cg19Go(1);drawer.onclick=e=>{if(e.target===drawer)cg19Close()};
}
window.CGWEB019_API={open:cg19Open,close:cg19Close};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cg19Ensure);else cg19Ensure();
