const CGWEB018_VERSION="CGWEB108_DIRECTORY_COMPACT_LAYOUT001";
// CGWEB108_DIRECTORY_COMPACT_LAYOUT001_MAIN_TABS_REORDER001_MASS_SELECTION_ENABLE001
// CGWEB109_DIRECTORY_SELECTION_SIMPLIFY001_BULK_EDIT_RETIRE001_QUIZYPEDIA_UNIFIED_FLOW001_IMAGE_TOOLS_RETIRE001
const cg18$=id=>document.getElementById(id);
const cg18Esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const cg18Fmt=v=>new Intl.NumberFormat("fr-FR").format(Number(v||0));
const CG18_SELECTION="CGWEB018_SELECTED";
const CG18_COLUMNS="CGWEB018_COLUMNS";
const CG18_THEME_CATALOG_SESSION="CGWEB018_THEME_CATALOG_V5";

const CG18_COLS={
  id:"ID", mega:"Mégathème", theme:"Thème", question:"Question",
  image:"Image", missing:"Recherche image", status:"Statut", revision:"Révision", updated:"Mise à jour"
};
const CG18_DEFAULT=["id","mega","theme","question","image","missing","status","revision"];
const CG18={stack:[null],page:0,next:null,rows:[],total:0,selected:new Set(),columns:new Set(CG18_DEFAULT),classic:false};

function cg18LoadPrefs(){
  try{const a=JSON.parse(sessionStorage.getItem(CG18_SELECTION)||"[]");CG18.selected=new Set(Array.isArray(a)?a.map(String):[])}catch(_){}
  try{const a=JSON.parse(localStorage.getItem(CG18_COLUMNS)||"[]");if(Array.isArray(a)&&a.length)CG18.columns=new Set(a)}catch(_){}
}
function cg18SaveSelection(){try{sessionStorage.setItem(CG18_SELECTION,JSON.stringify([...CG18.selected]))}catch(_){}}
function cg18SaveColumns(){try{localStorage.setItem(CG18_COLUMNS,JSON.stringify([...CG18.columns]))}catch(_){}}
function cg18Status(text,type=""){const e=cg18$("cg18Status");if(e){e.textContent=text;e.className=`cg18-status${type?" cg18-"+type:""}`}}
function cg18Date(v){if(!v)return"—";try{const d=typeof v?.toDate==="function"?v.toDate():v?.seconds?new Date(v.seconds*1000):new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("fr-FR")}catch(_){return"—"}}
function cg18ImageLabel(r){const p=String(r.image_file||"").trim();if(!p)return"—";return String(r.image_origin||"")==="firebase_storage"||p.startsWith("users/")?"Cloud":"Historique"}
function cg18Filters(){return{
  megatheme:"",
  themeContains:"",
  status:"",
  recordContains:cg18$("cg18Prefix")?.value.trim()||"",
  imageState:cg18$("cg18Image")?.value||"",
  nonTrouve:""
}}
function cg18UpdateSelection(){
  const label=cg18$("cg18Selected");
  if(label)label.textContent=`${cg18Fmt(CG18.selected.size)} sélectionnée(s)`;
  cg18SaveSelection();
  window.dispatchEvent(new CustomEvent("cgweb018-selection-change",{detail:{ids:[...CG18.selected]}}));
}

function cg18Cell(key,r){
  if(key==="id")return `<code>#${cg18Esc(r.original_id??r.id)}</code>`;
  if(key==="mega")return cg18Esc(r.megatheme||"");
  if(key==="theme")return cg18Esc(r.theme||"");
  if(key==="question")return `<div class="cg18-question">${cg18Esc(r.question||"")}</div>`;
  if(key==="image")return `<span class="cg18-pill">${cg18ImageLabel(r)}</span>`;
  if(key==="missing")return Number(r.non_trouve||0)===1?'<span class="cg18-bad">Oui</span>':'Non';
  if(key==="status")return cg18Esc(r.status??"");
  if(key==="revision")return cg18Esc(r.cg_revision??0);
  if(key==="updated")return cg18Date(r.cg_updated_at||r.updated_at);
  return "";
}

function cg18Render(){
  const cols=[...CG18.columns].filter(k=>CG18_COLS[k]);
  const head=`<tr><th class="cg18-checkcol"><input id="cg18CheckVisible" type="checkbox" title="Sélectionner la page"></th>${cols.map(k=>`<th>${CG18_COLS[k]}</th>`).join("")}<th></th></tr>`;
  const body=CG18.rows.map(r=>`<tr data-row-id="${cg18Esc(r.id)}">
    <td class="cg18-checkcol"><input class="cg18-row-check" type="checkbox" data-id="${cg18Esc(r.id)}" ${CG18.selected.has(String(r.id))?"checked":""}></td>
    ${cols.map(k=>`<td data-col="${k}">${cg18Cell(k,r)}</td>`).join("")}
    <td><button class="cg18-open" data-open="${cg18Esc(r.id)}">Ouvrir</button></td>
  </tr>`).join("");
  cg18$("cg18Table").innerHTML=`<thead>${head}</thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="cg18-empty">Aucun résultat.</td></tr>`}</tbody>`;
  cg18$("cg18Meta").textContent=`${cg18Fmt(CG18.total)} résultat(s) · page ${CG18.page+1}`;
  cg18$("cg18Prev").disabled=CG18.page===0;
  cg18$("cg18Next").disabled=!CG18.next||CG18.rows.length===0;
  cg18UpdateSelection();

  cg18$("cg18CheckVisible")?.addEventListener("change",e=>{
    for(const r of CG18.rows){if(e.target.checked)CG18.selected.add(String(r.id));else CG18.selected.delete(String(r.id))}
    cg18Render();
  });
  document.querySelectorAll(".cg18-row-check").forEach(c=>c.onchange=e=>{const id=String(c.dataset.id);if(e.target.checked)CG18.selected.add(id);else CG18.selected.delete(id);cg18UpdateSelection()});
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>window.CGWEB019_API?.open?.(b.dataset.open,CG18.rows.map(r=>String(r.id))));
}

async function cg18Load(reset=false){
  if(reset){CG18.stack=[null];CG18.page=0}
  cg18Status("Lecture Firestore…");
  try{
    const api=window.CGWEB001;
    if(!api?.queryQuestionsPage)throw new Error("API Répertoire indisponible.");
    const filters=cg18Filters();
    const params={
      cursor:CG18.stack[CG18.page]||null,
      pageSize:Number(cg18$("cg18PageSize").value)||50,
      filters,
      sortField:cg18$("cg18Sort").value,
      sortDirection:cg18$("cg18Direction").value
    };
    const forceThemeCatalog=filters.themeContains
      ? sessionStorage.getItem(CG18_THEME_CATALOG_SESSION)!=="1"
      : false;
    let res;
    if(filters.recordContains){
      const searchApi=window.CGWEB032_API?.query;
      if(!searchApi)throw new Error("Moteur de recherche plein texte indisponible.");
      const offset=Number((CG18.stack[CG18.page]||{}).offset||0);
      const d=await searchApi({
        term:filters.recordContains,
        megatheme:filters.megatheme,
        theme:filters.themeContains,
        withImage:filters.imageState==="1"?"yes":filters.imageState==="0"?"no":"",
        status:filters.status,
        nonTrouve:filters.nonTrouve,
        limit:Number(cg18$("cg18PageSize").value)||50,
        offset,
        sortField:cg18$("cg18Sort").value,
        sortDirection:cg18$("cg18Direction").value
      });
      res={
        items:d.rows||[],
        total:Number(d.total||0),
        nextCursor:d.nextOffset==null?null:{offset:d.nextOffset},
        searchIndexCapped:false
      };
    }else{
      res=filters.themeContains
        ? await api.queryQuestionsThemeContains({
            ...params,
            term:filters.themeContains
          })
        : await api.queryQuestionsPage(params);
    }
    if(filters.themeContains && res.catalogSchema===5){
      sessionStorage.setItem(CG18_THEME_CATALOG_SESSION,"1");
    }
    CG18.rows=res.items||[];CG18.total=res.total||0;CG18.next=res.nextCursor||null;
    cg18Render();
    const matching=Array.isArray(res.matchingThemes)?res.matchingThemes:[];
    const themeInfo=filters.themeContains
      ? ` · ${cg18Fmt(matching.length)} thème(s) correspondant(s)`
      : "";
    const catalogInfo=filters.themeContains && Number(res.themeCatalogSize||0)
      ? ` · catalogue: ${cg18Fmt(res.themeCatalogSize)} thèmes / ${cg18Fmt(res.catalogQuestionCount)} questions`
      : "";
    const truncated=res.truncated
      ? " · ⚠️ résultats serveur plafonnés"
      : "";
    cg18Status(`${cg18Fmt(CG18.rows.length)} question(s) chargée(s)${themeInfo}${catalogInfo}${truncated}`,"ok");
    const diag=cg18$("cg18ThemeMatches");
    if(diag){
      if(filters.themeContains){
        diag.hidden=false;
        diag.textContent=matching.length
          ? `Thèmes détectés : ${matching.slice(0,30).join(" · ")}${matching.length>30?" · …":""}`
          : `Aucun intitulé de thème contenant « ${filters.themeContains} » dans le catalogue reconstruit.`;
      }else{
        diag.hidden=true;
        diag.textContent="";
      }
    }
  }catch(error){CG18.rows=[];CG18.total=0;CG18.next=null;cg18Render();cg18Status(error?.message||String(error),"error")}
}

function cg18BuildColumns(){
  cg18$("cg18ColumnList").innerHTML=Object.entries(CG18_COLS).map(([k,label])=>`<label><input type="checkbox" data-column="${k}" ${CG18.columns.has(k)?"checked":""}> ${label}</label>`).join("");
  cg18$("cg18ColumnList").querySelectorAll("[data-column]").forEach(c=>c.onchange=()=>{if(c.checked)CG18.columns.add(c.dataset.column);else CG18.columns.delete(c.dataset.column);if(!CG18.columns.size)CG18.columns.add("question");cg18SaveColumns();cg18Render()});
}
function cg18ToggleClassic(){CG18.classic=!CG18.classic;document.body.classList.toggle("cg18-show-classic",CG18.classic);cg18$("cg18Classic").textContent=CG18.classic?"Masquer la vue classique":"Vue classique"}
function cg18CopySelected(){navigator.clipboard?.writeText([...CG18.selected].join("\n"));cg18Status(`${CG18.selected.size} ID copié(s).`,"ok")}

function cg18Init(){
  if(cg18$("cgweb018Panel"))return;cg18LoadPrefs();
  const panel=document.createElement("section");panel.id="cgweb018Panel";panel.className="cg18-panel";panel.innerHTML=`
    <div class="cg18-filters cg18-filters-compact">
      <label class="cg18-filter-search">La fiche contient<input id="cg18Prefix" placeholder="Question, détail, thème ou mégathème…"></label>
      <label class="cg18-filter-image">Image<select id="cg18Image"><option value="">Toutes</option><option value="1">Avec image</option><option value="0">Sans image</option></select></label>
      <label class="cg18-filter-sort">Tri<select id="cg18Sort"><option value="id">ID</option><option value="question">Question</option><option value="megatheme">Mégathème</option><option value="theme">Thème</option><option value="status">Statut</option></select></label>
      <label class="cg18-filter-direction">Sens<select id="cg18Direction"><option value="asc">Croissant</option><option value="desc">Décroissant</option></select></label>
      <label class="cg18-filter-page">Par page<select id="cg18PageSize"><option>20</option><option selected>50</option><option>100</option></select></label>
    </div>
    <div class="cg18-actions"><button id="cg18Apply" class="cg18-btn cg18-primary">Appliquer</button><button id="cg18Reset" class="cg18-btn">Réinitialiser</button><button id="cg18Columns" class="cg18-btn">Colonnes</button><button id="cgweb109ExportCsv" class="cg18-btn" disabled>Exporter CSV</button><strong id="cg18Selected" class="cgweb109-selected">0 sélectionnée(s)</strong><span id="cg18Meta"></span></div>
    <div id="cg18ColumnList" class="cg18-columns cg18-hidden"></div>
    <div class="cg18-table-wrap"><table id="cg18Table" class="cg18-table"></table></div>
    <div class="cg18-pagination"><button id="cg18Prev" class="cg18-btn">← Précédent</button><button id="cg18Next" class="cg18-btn cg18-primary">Suivant →</button></div>
    <div id="cg18Status" class="cg18-status">Initialisation…</div>`;
  (document.querySelector("main")||document.body).appendChild(panel);document.body.classList.add("cg18-managed");cg18BuildColumns();
  cg18$("cg18Apply").onclick=()=>cg18Load(true);cg18$("cg18Reset").onclick=()=>{for(const id of ["cg18Prefix","cg18Image"]){const e=cg18$(id);if(e)e.value=""}cg18$("cg18Sort").value="id";cg18$("cg18Direction").value="asc";cg18Load(true)};
  cg18$("cg18Columns").onclick=()=>cg18$("cg18ColumnList").classList.toggle("cg18-hidden");
  cg18$("cg18Prev").onclick=()=>{if(CG18.page>0){CG18.page--;cg18Load(false)}};cg18$("cg18Next").onclick=()=>{if(CG18.next){CG18.stack[CG18.page+1]=CG18.next;CG18.page++;cg18Load(false)}};
  cg18$("cg18Prefix").onkeydown=e=>{if(e.key==="Enter")cg18Load(true)};
  window.CGWEB018_API={selectedIds:()=>[...CG18.selected],reload:()=>cg18Load(true),rows:()=>CG18.rows.slice()};
  cg18Load(true);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cg18Init);else cg18Init();

// CGWEB018 FIX5 · style diagnostic thèmes injecté sans dépendre d'un fichier CSS supplémentaire.
(() => {
  if (document.getElementById("cg18Fix5Style")) return;
  const style=document.createElement("style");
  style.id="cg18Fix5Style";
  style.textContent=`
    .cg18-theme-matches{
      margin:0 0 10px!important;
      padding:9px 11px!important;
      border:1px solid rgba(59,165,220,.28)!important;
      border-radius:9px!important;
      background:rgba(19,91,128,.13)!important;
      color:#bfe9ff!important;
      font-size:.8rem!important;
      line-height:1.45!important;
    }
  `;
  document.head.appendChild(style);
})();
