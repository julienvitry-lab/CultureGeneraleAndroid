(() => {
  "use strict";

  const VERSION = "SOURCE_AUDIT001";
  const SUMMARY_KEY = "cgweb056.source_audit.summary.v1";
  const state = { analysis: null };

  const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const esc = (v) => norm(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function urlsOf(row) {
    return [
      ["quizypedia", norm(row?.url_quizypedia)],
      ["internet", norm(row?.url_internet)],
      ["image", norm(row?.image_source_url)]
    ].filter(([,u]) => u);
  }

  function parseHttp(url) {
    if (!/^https?:\/\//i.test(url)) return null;
    try { return new URL(url); } catch (_) { return null; }
  }

  function analyze(rows) {
    const all = Array.isArray(rows) ? rows : [];
    const domains = new Map();
    const anomalies = [];
    let noSource = 0, invalid = 0, http = 0, sourced = 0, urlCount = 0;

    for (const row of all) {
      const urls = urlsOf(row);
      if (!urls.length) {
        noSource++;
        anomalies.push({
          id:norm(row?.id ?? row?.original_id), question:norm(row?.question),
          megatheme:norm(row?.megatheme), theme:norm(row?.theme),
          type:"no_source", detail:"Aucune URL source"
        });
        continue;
      }
      sourced++;
      for (const [field, raw] of urls) {
        urlCount++;
        if (!/^https?:\/\//i.test(raw)) {
          invalid++;
          anomalies.push({
            id:norm(row?.id ?? row?.original_id), question:norm(row?.question),
            megatheme:norm(row?.megatheme), theme:norm(row?.theme),
            type:"invalid_url", field, detail:raw
          });
          continue;
        }
        const u = parseHttp(raw);
        if (!u) {
          invalid++;
          anomalies.push({
            id:norm(row?.id ?? row?.original_id), question:norm(row?.question),
            megatheme:norm(row?.megatheme), theme:norm(row?.theme),
            type:"invalid_url", field, detail:raw
          });
          continue;
        }
        if (u.protocol === "http:") {
          http++;
          anomalies.push({
            id:norm(row?.id ?? row?.original_id), question:norm(row?.question),
            megatheme:norm(row?.megatheme), theme:norm(row?.theme),
            type:"http", field, detail:raw
          });
        }
        const host = u.hostname.toLowerCase().replace(/^www\./,"");
        const d = domains.get(host) || { domain:host, urls:0, questions:new Set(), fields:{} };
        d.urls++;
        d.questions.add(norm(row?.id ?? row?.original_id));
        d.fields[field] = (d.fields[field] || 0) + 1;
        domains.set(host, d);
      }
    }

    const result = {
      counts:{ total:all.length, sourced, no_source:noSource, urls:urlCount, invalid_url:invalid, http },
      domains:[...domains.values()].map((d) => ({
        domain:d.domain, urls:d.urls, questions:d.questions.size, fields:d.fields
      })).sort((a,b) => b.questions - a.questions || b.urls - a.urls || a.domain.localeCompare(b.domain)),
      anomalies,
      analyzedAt:Date.now()
    };
    state.analysis = result;
    try {
      localStorage.setItem(SUMMARY_KEY, JSON.stringify({
        analyzedAt:result.analyzedAt, counts:result.counts,
        domain_count:result.domains.length, anomaly_count:result.anomalies.length
      }));
    } catch (_) {}
    return result;
  }

  function lastSummary() {
    if (state.analysis) return {
      analyzedAt:state.analysis.analyzedAt, counts:state.analysis.counts,
      domain_count:state.analysis.domains.length, anomaly_count:state.analysis.anomalies.length
    };
    try { return JSON.parse(localStorage.getItem(SUMMARY_KEY) || "null"); }
    catch (_) { return null; }
  }

  function ensureModal() {
    let m = document.getElementById("cgweb056Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb056Modal";
    m.className = "cgweb056-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb056-dialog" role="dialog" aria-modal="true" aria-label="Audit des sources">
        <header><div><strong>Audit des sources</strong><small>Domaines, couverture et URL suspectes — lecture seule</small></div><button type="button" data-cg56-close>×</button></header>
        <div class="cgweb056-actions">
          <button type="button" data-cg56-run>Analyser le catalogue</button>
          <button type="button" data-cg56-export>Exporter CSV</button>
        </div>
        <div id="cgweb056Status" class="cgweb056-status"></div>
        <div id="cgweb056Stats" class="cgweb056-stats"></div>
        <div class="cgweb056-grid">
          <section><h3>Domaines les plus utilisés</h3><div id="cgweb056Domains"></div></section>
          <section><h3>Anomalies</h3><div id="cgweb056Anomalies"></div></section>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg56-close]")) close();
      if (ev.target.closest("[data-cg56-run]")) run();
      if (ev.target.closest("[data-cg56-export]")) exportCsv();
      const open = ev.target.closest("[data-cg56-open]");
      if (open) window.CGWEB019_API?.open?.(open.dataset.cg56Open, [open.dataset.cg56Open]);
    });
    return m;
  }

  function render() {
    const m = ensureModal();
    const s = m.querySelector("#cgweb056Stats");
    const d = m.querySelector("#cgweb056Domains");
    const a = m.querySelector("#cgweb056Anomalies");
    const x = state.analysis;
    if (!x) {
      const old = lastSummary();
      s.innerHTML = old ? `
        <article><span>Dernière analyse</span><strong>${new Date(old.analyzedAt || 0).toLocaleString("fr-FR")}</strong></article>
        <article><span>Domaines</span><strong>${Number(old.domain_count || 0).toLocaleString("fr-FR")}</strong></article>
        <article><span>Anomalies</span><strong>${Number(old.anomaly_count || 0).toLocaleString("fr-FR")}</strong></article>` : "";
      d.innerHTML = a.innerHTML = `<p class="cgweb056-empty">Analyse actuelle non chargée dans cet onglet.</p>`;
      return;
    }
    const c = x.counts;
    s.innerHTML = `
      <article><span>Questions</span><strong>${c.total.toLocaleString("fr-FR")}</strong></article>
      <article><span>Avec source</span><strong>${c.sourced.toLocaleString("fr-FR")}</strong><small>${c.total ? (100*c.sourced/c.total).toFixed(1)+" %" : "—"}</small></article>
      <article><span>Sans source</span><strong>${c.no_source.toLocaleString("fr-FR")}</strong></article>
      <article><span>URL</span><strong>${c.urls.toLocaleString("fr-FR")}</strong></article>
      <article><span>URL invalides</span><strong>${c.invalid_url.toLocaleString("fr-FR")}</strong></article>
      <article><span>HTTP</span><strong>${c.http.toLocaleString("fr-FR")}</strong></article>`;

    d.innerHTML = x.domains.slice(0,100).map((r) => `
      <div class="cgweb056-domain"><strong>${esc(r.domain)}</strong><span>${r.questions.toLocaleString("fr-FR")} question(s) · ${r.urls.toLocaleString("fr-FR")} URL</span></div>
    `).join("") || `<p class="cgweb056-empty">Aucun domaine HTTP(S) détecté.</p>`;

    a.innerHTML = x.anomalies.slice(0,250).map((r) => `
      <div class="cgweb056-anomaly">
        <div><strong>${esc(r.type === "no_source" ? "Sans source" : r.type === "http" ? "HTTP" : "URL invalide")}</strong>
        <span>${esc(r.question || `Question #${r.id || "?"}`)}</span><small>${esc(r.detail || "")}</small></div>
        ${r.id ? `<button type="button" data-cg56-open="${esc(r.id)}">Ouvrir</button>` : ""}
      </div>`).join("") || `<p class="cgweb056-empty">Aucune anomalie détectée.</p>`;
  }

  async function run() {
    const m = ensureModal();
    const status = m.querySelector("#cgweb056Status");
    const btn = m.querySelector("[data-cg56-run]");
    btn.disabled = true;
    try {
      if (!window.CGWEB055?.catalog) throw new Error("CGWEB055 requis pour lire le catalogue.");
      const rows = await window.CGWEB055.catalog(false, ({loaded,total}) => {
        status.textContent = `Lecture du catalogue… ${loaded.toLocaleString("fr-FR")}${total ? ` / ${total.toLocaleString("fr-FR")}` : ""}`;
      });
      status.textContent = "Analyse des sources…";
      const result = analyze(rows);
      status.textContent = `Analyse terminée · ${result.domains.length} domaine(s).`;
      render();
      return result;
    } catch (e) {
      status.textContent = e?.message || String(e);
      throw e;
    } finally { btn.disabled = false; }
  }

  function csvCell(v) { return `"${String(v ?? "").replace(/"/g,'""')}"`; }
  function exportCsv() {
    if (!state.analysis) return alert("Lance d'abord l'audit.");
    const rows = [["type","id","megatheme","theme","question","champ","detail"]];
    state.analysis.anomalies.forEach((r) => rows.push([
      r.type,r.id,r.megatheme,r.theme,r.question,r.field || "",r.detail || ""
    ]));
    const blob = new Blob(["\ufeff"+rows.map((r)=>r.map(csvCell).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
    const a = Object.assign(document.createElement("a"),{
      href:URL.createObjectURL(blob),download:`CGWEB056_AUDIT_SOURCES_${new Date().toISOString().slice(0,10)}.csv`
    });
    a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  function open(){const m=ensureModal();render();m.hidden=false}
  function close(){ensureModal().hidden=true}

  function installButton(){
    if(document.getElementById("cgweb056Open"))return;
    const host=document.querySelector('[data-cg16-page-panel="more"]');if(!host)return;
    const b=document.createElement("button");b.type="button";b.id="cgweb056Open";b.textContent="Audit sources";
    b.addEventListener("click",open);host.appendChild(b);
  }
  installButton();
  let timer=null;
  new MutationObserver((muts)=>{
    if(!muts.some((m)=>m.addedNodes.length))return;
    clearTimeout(timer);timer=setTimeout(installButton,120);
  }).observe(document.body,{childList:true,subtree:true});

  window.CGWEB056={version:VERSION,open,run,analyze,analysis:()=>state.analysis,lastSummary};
})();
