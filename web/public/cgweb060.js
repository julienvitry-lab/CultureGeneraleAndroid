(() => {
  "use strict";

  const VERSION = "CONTROL_TOWER001";
  const state = { report:null };

  const clean=(v)=>String(v??"").replace(/\s+/g," ").trim();
  const esc=(v)=>clean(v).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
  const fmt=(v)=>num(v)===null?"—":new Intl.NumberFormat("fr-FR").format(Number(v));

  async function lightReport(){
    const report={
      generatedAt:new Date().toISOString(),
      online:navigator.onLine,
      stats:null, health:null, queue:null, recent:null, duplicateReview:null,
      imageQuality:window.CGWEB055?.lastSummary?.()||null,
      sourceAudit:window.CGWEB056?.lastSummary?.()||null,
      coverage:window.CGWEB059?.lastSummary?.()||null,
      backup:null
    };

    try{ if(window.CGWEB017_API?.stats)report.stats=await window.CGWEB017_API.stats() }catch(e){report.stats_error=e?.message||String(e)}
    try{ if(window.CGWEB052?.runChecks)report.health=await window.CGWEB052.runChecks() }catch(e){report.health_error=e?.message||String(e)}
    try{ report.queue=window.CGWEB048?.queue?.()?.length??null }catch(_){}
    try{ report.recent=window.CGWEB047?.history?.()?.length??null }catch(_){}
    try{ report.duplicateReview=window.CGWEB054?.summary?.()||null }catch(_){}
    try{
      const p=window.CGWEB049?.exportPayload?.();
      if(p)report.backup={localKeys:Object.keys(p.localStorage||{}).length,sessionKeys:Object.keys(p.sessionStorage||{}).length};
    }catch(_){}
    state.report=report;
    return report;
  }

  async function fullReport(){
    const ok=confirm(
      "L'analyse complète va lire tout le catalogue par pages puis calculer localement :\n"+
      "• qualité images\n• audit des sources\n• couverture éditoriale\n\n"+
      "Aucune question ne sera modifiée. Continuer ?"
    );
    if(!ok)return null;
    const status=document.getElementById("cgweb060Status");
    if(!window.CGWEB055?.catalog)throw new Error("CGWEB055 indisponible.");
    const rows=await window.CGWEB055.catalog(false,({loaded,total})=>{
      if(status)status.textContent=`Lecture du catalogue… ${loaded.toLocaleString("fr-FR")}${total?` / ${total.toLocaleString("fr-FR")}`:""}`;
    });
    if(status)status.textContent="Analyses locales…";
    const image=window.CGWEB055.analyze(rows);
    const source=window.CGWEB056?.analyze?.(rows)||null;
    const coverage=window.CGWEB059?.aggregate?.(rows)||null;
    const base=await lightReport();
    base.full={
      catalogRows:rows.length,
      image:{counts:image?.counts||null,anomaly_count:image?.anomalies?.length??null},
      source:source?{counts:source.counts,domain_count:source.domains.length,anomaly_count:source.anomalies.length}:null,
      coverage:coverage?{
        total:coverage.total,megatheme_count:coverage.megathemes.length,theme_count:coverage.theme_count,
        under25:coverage.megathemes.flatMap((m)=>m.themes).filter((t)=>t.count<25).length
      }:null
    };
    state.report=base;
    return base;
  }

  function healthSummary(r){
    const h=Array.isArray(r?.health)?r.health:[];
    return h.length?`${h.filter((x)=>x.ok).length}/${h.length} OK`:"—";
  }

  function ensureModal(){
    let m=document.getElementById("cgweb060Modal");if(m)return m;
    m=document.createElement("div");m.id="cgweb060Modal";m.className="cgweb060-overlay";m.hidden=true;
    m.innerHTML=`
      <div class="cgweb060-dialog" role="dialog" aria-modal="true" aria-label="Tour de contrôle">
        <header><div><strong>Tour de contrôle CGWEB</strong><small>Synthèse des briques existantes — aucun traitement lourd automatique</small></div><button type="button" data-cg60-close>×</button></header>
        <div class="cgweb060-actions">
          <button type="button" data-cg60-light>Actualiser léger</button>
          <button type="button" data-cg60-full>Analyse complète</button>
          <button type="button" data-cg60-export>Exporter JSON</button>
        </div>
        <div id="cgweb060Status" class="cgweb060-status"></div>
        <div id="cgweb060Cards" class="cgweb060-cards"></div>
        <section class="cgweb060-tools">
          <h3>Outils</h3>
          <div>
            <button type="button" data-cg60-open="053">Historique détaillé</button>
            <button type="button" data-cg60-open="054">Revue doublons</button>
            <button type="button" data-cg60-open="055">Qualité images</button>
            <button type="button" data-cg60-open="056">Audit sources</button>
            <button type="button" data-cg60-open="057">Plan de révision</button>
            <button type="button" data-cg60-open="059">Couverture</button>
            <button type="button" data-cg60-open="049">Sauvegarde locale</button>
            <button type="button" data-cg60-open="052">Diagnostic CGWEB</button>
          </div>
        </section>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click",async(ev)=>{
      if(ev.target===m||ev.target.closest("[data-cg60-close]"))close();
      if(ev.target.closest("[data-cg60-light]"))await refreshLight();
      if(ev.target.closest("[data-cg60-full]"))await refreshFull();
      if(ev.target.closest("[data-cg60-export]"))exportJson();
      const b=ev.target.closest("[data-cg60-open]");
      if(b)openTool(b.dataset.cg60Open);
    });
    return m;
  }

  function render(report=state.report){
    const m=ensureModal(),cards=m.querySelector("#cgweb060Cards");
    if(!report){cards.innerHTML=`<p class="cgweb060-empty">Clique « Actualiser léger ».</p>`;return}
    const s=report.stats||{};
    const d=report.duplicateReview||{};
    const iq=report.full?.image||report.imageQuality||null;
    const sa=report.full?.source||report.sourceAudit||null;
    const cv=report.full?.coverage||report.coverage||null;
    cards.innerHTML=`
      <article><span>Réseau</span><strong>${report.online?"En ligne":"Hors ligne"}</strong></article>
      <article><span>Questions</span><strong>${fmt(s.total)}</strong></article>
      <article><span>Avec image</span><strong>${fmt(s.with_image)}</strong></article>
      <article><span>Introuvables</span><strong>${fmt(s.non_trouve)}</strong></article>
      <article><span>Diagnostic</span><strong>${esc(healthSummary(report))}</strong></article>
      <article><span>File apprentissage</span><strong>${fmt(report.queue)}</strong></article>
      <article><span>Récentes locales</span><strong>${fmt(report.recent)}</strong></article>
      <article><span>Décisions doublons</span><strong>${fmt(d.total)}</strong></article>
      <article><span>Anomalies images</span><strong>${fmt(iq?.anomaly_count)}</strong></article>
      <article><span>Anomalies sources</span><strong>${fmt(sa?.anomaly_count)}</strong></article>
      <article><span>Thèmes</span><strong>${fmt(cv?.theme_count)}</strong></article>
      <article><span>Thèmes &lt;25</span><strong>${fmt(cv?.under25)}</strong></article>`;
  }

  async function refreshLight(){
    const m=ensureModal(),status=m.querySelector("#cgweb060Status");
    status.textContent="Actualisation légère…";
    try{
      const r=await lightReport();render(r);
      status.textContent=`À jour · ${new Date().toLocaleTimeString("fr-FR")} · aucune analyse catalogue forcée.`;
      return r;
    }catch(e){status.textContent=e?.message||String(e);throw e}
  }

  async function refreshFull(){
    const m=ensureModal(),status=m.querySelector("#cgweb060Status");
    try{
      const r=await fullReport();
      if(!r){status.textContent="Analyse complète annulée.";return null}
      render(r);status.textContent=`Analyse complète terminée · ${r.full?.catalogRows?.toLocaleString("fr-FR")||"—"} question(s) lues.`;
      return r;
    }catch(e){status.textContent=e?.message||String(e);throw e}
  }

  function openTool(code){
    if(code==="053")window.CGWEB053?.open?.();
    if(code==="054")window.CGWEB054?.openLedger?.();
    if(code==="055")window.CGWEB055?.open?.();
    if(code==="056")window.CGWEB056?.open?.();
    if(code==="057"){
      const b=[...document.querySelectorAll('button[data-cg16-page]')].find((x)=>/apprentissage/i.test(clean(x.textContent)));b?.click();
      setTimeout(()=>document.getElementById("cgweb057Panel")?.scrollIntoView({behavior:"smooth",block:"center"}),180);
    }
    if(code==="059")window.CGWEB059?.open?.();
    if(code==="049")window.CGWEB049?.open?.();
    if(code==="052")window.CGWEB052?.open?.();
  }

  function exportJson(){
    if(!state.report)return alert("Actualise d'abord la tour de contrôle.");
    const blob=new Blob([JSON.stringify({schema:"cgweb060-control-tower-v1",...state.report},null,2)],{type:"application/json;charset=utf-8"});
    const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`CGWEB060_CONTROL_TOWER_${new Date().toISOString().replace(/[:.]/g,"-")}.json`});
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  function open(){const m=ensureModal();m.hidden=false;refreshLight()}
  function close(){ensureModal().hidden=true}
  function installButton(){
    if(document.getElementById("cgweb060Open"))return;
    const host=document.querySelector('[data-cg16-page-panel="more"]');if(!host)return;
    const b=document.createElement("button");b.type="button";b.id="cgweb060Open";b.textContent="Tour de contrôle";b.addEventListener("click",open);host.prepend(b);
  }
  installButton();
  let timer=null;
  new MutationObserver((muts)=>{
    if(!muts.some((m)=>m.addedNodes.length))return;
    clearTimeout(timer);timer=setTimeout(installButton,120);
  }).observe(document.body,{childList:true,subtree:true});

  window.CGWEB060={version:VERSION,open,lightReport,fullReport,report:()=>state.report,refreshLight,refreshFull};
})();
