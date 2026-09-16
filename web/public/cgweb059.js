(() => {
  "use strict";

  const VERSION = "COVERAGE_MAP001";
  const SUMMARY_KEY = "cgweb059.coverage.summary.v1";
  const state = { data:null };

  const clean=(v)=>String(v??"").replace(/\s+/g," ").trim();
  const esc=(v)=>clean(v).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const hasImage=(r)=>Number(r?.is_image||0)===1||!!clean(r?.image_file);
  const hasSource=(r)=>!!(clean(r?.url_quizypedia)||clean(r?.url_internet)||clean(r?.image_source_url));
  const pct=(a,b)=>b?(100*a/b):0;

  function aggregate(rows){
    const roots=new Map();
    for(const r of rows||[]){
      const mega=clean(r?.megatheme)||"(Sans mégathème)";
      const theme=clean(r?.theme)||"(Sans thème)";
      let m=roots.get(mega);
      if(!m){m={name:mega,count:0,images:0,sources:0,missing:0,themes:new Map()};roots.set(mega,m)}
      let t=m.themes.get(theme);
      if(!t){t={name:theme,count:0,images:0,sources:0,missing:0};m.themes.set(theme,t)}
      for(const x of [m,t]){
        x.count++;
        if(hasImage(r))x.images++;
        if(hasSource(r))x.sources++;
        if(Number(r?.non_trouve||0)===1)x.missing++;
      }
    }
    const megathemes=[...roots.values()].map((m)=>({
      ...m,
      themes:[...m.themes.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"fr"))
    })).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"fr"));
    const allThemes=megathemes.flatMap((m)=>m.themes.map((t)=>({...t,megatheme:m.name})));
    const result={
      total:(rows||[]).length,
      megathemes,
      theme_count:allThemes.length,
      smallest:allThemes.slice().sort((a,b)=>a.count-b.count||a.name.localeCompare(b.name,"fr")).slice(0,100),
      analyzedAt:Date.now()
    };
    state.data=result;
    try{localStorage.setItem(SUMMARY_KEY,JSON.stringify({
      total:result.total,megatheme_count:result.megathemes.length,theme_count:result.theme_count,
      analyzedAt:result.analyzedAt,under25:allThemes.filter((x)=>x.count<25).length
    }))}catch(_){}
    return result;
  }

  function lastSummary(){
    if(state.data)return{
      total:state.data.total,megatheme_count:state.data.megathemes.length,theme_count:state.data.theme_count,
      analyzedAt:state.data.analyzedAt,
      under25:state.data.megathemes.flatMap((m)=>m.themes).filter((x)=>x.count<25).length
    };
    try{return JSON.parse(localStorage.getItem(SUMMARY_KEY)||"null")}catch(_){return null}
  }

  function ensureModal(){
    let m=document.getElementById("cgweb059Modal");if(m)return m;
    m=document.createElement("div");m.id="cgweb059Modal";m.className="cgweb059-overlay";m.hidden=true;
    m.innerHTML=`
      <div class="cgweb059-dialog" role="dialog" aria-modal="true" aria-label="Cartographie de couverture">
        <header><div><strong>Cartographie de couverture</strong><small>Structure éditoriale Mégathème → Thème</small></div><button type="button" data-cg59-close>×</button></header>
        <div class="cgweb059-actions">
          <button type="button" data-cg59-run>Analyser le catalogue</button>
          <label>Faible couverture<select id="cgweb059Threshold"><option value="10">&lt; 10</option><option value="25" selected>&lt; 25</option><option value="50">&lt; 50</option><option value="100">&lt; 100</option></select></label>
          <button type="button" data-cg59-export>Exporter CSV</button>
        </div>
        <div id="cgweb059Status" class="cgweb059-status"></div>
        <div id="cgweb059Stats" class="cgweb059-stats"></div>
        <div id="cgweb059Map"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector("#cgweb059Threshold").addEventListener("change",render);
    m.addEventListener("click",(ev)=>{
      if(ev.target===m||ev.target.closest("[data-cg59-close]"))close();
      if(ev.target.closest("[data-cg59-run]"))run();
      if(ev.target.closest("[data-cg59-export]"))exportCsv();
    });
    return m;
  }

  function render(){
    const m=ensureModal(),stats=m.querySelector("#cgweb059Stats"),map=m.querySelector("#cgweb059Map");
    const d=state.data;
    if(!d){
      const old=lastSummary();
      stats.innerHTML=old?`
        <article><span>Questions</span><strong>${Number(old.total||0).toLocaleString("fr-FR")}</strong></article>
        <article><span>Mégathèmes</span><strong>${Number(old.megatheme_count||0)}</strong></article>
        <article><span>Thèmes</span><strong>${Number(old.theme_count||0)}</strong></article>
        <article><span>Thèmes &lt;25</span><strong>${Number(old.under25||0)}</strong></article>`:"";
      map.innerHTML=`<p class="cgweb059-empty">Lance une analyse pour afficher la cartographie actuelle.</p>`;
      return;
    }
    const threshold=Number(m.querySelector("#cgweb059Threshold").value||25);
    const allThemes=d.megathemes.flatMap((x)=>x.themes);
    const under=allThemes.filter((x)=>x.count<threshold).length;
    stats.innerHTML=`
      <article><span>Questions</span><strong>${d.total.toLocaleString("fr-FR")}</strong></article>
      <article><span>Mégathèmes</span><strong>${d.megathemes.length}</strong></article>
      <article><span>Thèmes</span><strong>${d.theme_count}</strong></article>
      <article><span>Thèmes &lt; ${threshold}</span><strong>${under}</strong></article>`;
    map.innerHTML=d.megathemes.map((mega)=>`
      <details class="cgweb059-mega" open>
        <summary>
          <span><strong>${esc(mega.name)}</strong><small>${mega.count.toLocaleString("fr-FR")} questions</small></span>
          <span>Images ${(pct(mega.images,mega.count)).toFixed(0)} % · Sources ${(pct(mega.sources,mega.count)).toFixed(0)} %</span>
        </summary>
        <div class="cgweb059-themes">
          ${mega.themes.map((t)=>{
            const low=t.count<threshold;
            return `<article class="${low?"low":""}">
              <div><strong>${esc(t.name)}</strong><small>${t.count.toLocaleString("fr-FR")} questions${low?` · sous ${threshold}`:""}</small></div>
              <div class="cgweb059-bars">
                <span title="Couverture image"><i style="width:${pct(t.images,t.count).toFixed(1)}%"></i></span><small>images ${pct(t.images,t.count).toFixed(0)} %</small>
                <span title="Couverture source"><i style="width:${pct(t.sources,t.count).toFixed(1)}%"></i></span><small>sources ${pct(t.sources,t.count).toFixed(0)} %</small>
              </div>
            </article>`;
          }).join("")}
        </div>
      </details>`).join("");
  }

  async function run(){
    const m=ensureModal(),status=m.querySelector("#cgweb059Status"),btn=m.querySelector("[data-cg59-run]");
    btn.disabled=true;
    try{
      if(!window.CGWEB055?.catalog)throw new Error("CGWEB055 requis pour lire le catalogue.");
      const rows=await window.CGWEB055.catalog(false,({loaded,total})=>{
        status.textContent=`Lecture du catalogue… ${loaded.toLocaleString("fr-FR")}${total?` / ${total.toLocaleString("fr-FR")}`:""}`;
      });
      status.textContent="Agrégation Mégathème → Thème…";
      const result=aggregate(rows);
      status.textContent=`Cartographie prête · ${result.theme_count} thème(s).`;
      render();return result;
    }catch(e){status.textContent=e?.message||String(e);throw e}
    finally{btn.disabled=false}
  }

  function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`}
  function exportCsv(){
    if(!state.data)return alert("Lance d'abord l'analyse.");
    const rows=[["megatheme","theme","questions","avec_image","couverture_image_pct","avec_source","couverture_source_pct","non_trouve"]];
    state.data.megathemes.forEach((m)=>m.themes.forEach((t)=>rows.push([
      m.name,t.name,t.count,t.images,pct(t.images,t.count).toFixed(1),t.sources,pct(t.sources,t.count).toFixed(1),t.missing
    ])));
    const blob=new Blob(["\ufeff"+rows.map((r)=>r.map(csvCell).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
    const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`CGWEB059_COUVERTURE_${new Date().toISOString().slice(0,10)}.csv`});
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  function open(){const m=ensureModal();render();m.hidden=false}
  function close(){ensureModal().hidden=true}
  function installButton(){
    if(document.getElementById("cgweb059Open"))return;
    const host=document.querySelector('[data-cg16-page-panel="more"]');if(!host)return;
    const b=document.createElement("button");b.type="button";b.id="cgweb059Open";b.textContent="Couverture de la base";b.addEventListener("click",open);host.appendChild(b);
  }
  installButton();
  let timer=null;
  new MutationObserver((muts)=>{
    if(!muts.some((m)=>m.addedNodes.length))return;
    clearTimeout(timer);timer=setTimeout(installButton,120);
  }).observe(document.body,{childList:true,subtree:true});

  window.CGWEB059={version:VERSION,open,run,aggregate,data:()=>state.data,lastSummary};
})();
