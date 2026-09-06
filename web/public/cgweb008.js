const $=id=>document.getElementById(id);
const S={catalog:null,mega:null,theme:null};

function setStatus(t,type=""){
  const e=$("cg6Status"); if(!e)return;
  e.textContent=t; e.className="cg6-status "+(type?`cg6-${type}`:"");
}
async function reload(){
  if(typeof window.CGWEB006_reload!=="function")
    throw new Error("CGWEB006_reload indisponible.");
  await window.CGWEB006_reload(true);
}
function currentThemes(){
  const m=S.mega?.value||"";
  const arr=S.catalog?.megathemes?.[m];
  return Array.isArray(arr)?arr:[];
}
function populate(){
  const m=S.mega.value;
  const arr=currentThemes();
  S.theme.innerHTML="";
  const first=document.createElement("option");
  first.value="";
  first.textContent=m?"Tous les thèmes":"Choisir d’abord un mégathème";
  S.theme.appendChild(first);

  for(const t of arr){
    const o=document.createElement("option");
    o.value=t; o.textContent=t;
    S.theme.appendChild(o);
  }

  S.theme.disabled=!m;
  const c=$("cg8ThemeCount");
  if(c)c.textContent=m?`${arr.length} thème(s)`:"—";
}
async function init(){
  S.mega=$("cg6Mega");
  const old=$("cg6Theme");
  if(!S.mega||!old)throw new Error("Filtres CGWEB006 introuvables.");

  const sel=document.createElement("select");
  sel.id="cg6Theme";
  old.replaceWith(sel);
  S.theme=sel;

  const label=document.querySelector('label[for="cg6Theme"]');
  if(label)label.textContent="Thème";

  const count=document.createElement("div");
  count.id="cg8ThemeCount";
  count.className="cg8-theme-count";
  S.theme.closest(".cg6-field")?.appendChild(count);

  const reset=document.createElement("button");
  reset.id="cg8Reset";
  reset.className="cg6-btn cg8-reset";
  reset.textContent="Réinitialiser";
  $("cg6Refresh")?.insertAdjacentElement("afterend",reset);

  const r=await fetch("./cgweb008_catalog.json?v=CGWEB008_1",{cache:"no-store"});
  if(!r.ok)throw new Error("Catalogue des thèmes indisponible.");
  S.catalog=await r.json();

  populate();

  S.mega.onchange=async()=>{
    S.theme.value="";
    populate();
    setStatus("Filtre mégathème appliqué…");
    try{await reload()}catch(e){setStatus(e.message||String(e),"error")}
  };

  S.theme.onchange=async()=>{
    setStatus("Filtre thème appliqué…");
    try{await reload()}catch(e){setStatus(e.message||String(e),"error")}
  };
  S.theme.onkeydown=null;

  reset.onclick=async()=>{
    S.mega.value="";
    populate();
    const search=$("cg6Search");
    if(search)search.value="";
    setStatus("Filtres réinitialisés…");
    try{await reload()}catch(e){setStatus(e.message||String(e),"error")}
  };

  const note=document.querySelector("#cgweb006Panel .cg6-note");
  if(note){
    const d=document.createElement("div");
    d.className="cg8-catalog-note";
    d.textContent=`Catalogue : ${S.catalog.theme_count||0} thèmes · aucune lecture Firestore pour cette liste.`;
    note.appendChild(d);
  }

  setStatus("Filtres dynamiques prêts.","ok");
}

init().catch(e=>setStatus(e.message||String(e),"error"));
