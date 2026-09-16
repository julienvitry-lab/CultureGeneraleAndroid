(() => {
  "use strict";

  const VERSION = "IMAGE_QUALITY001";
  const SUMMARY_KEY = "cgweb055.image_quality.summary.v1";
  const MAX_ROWS = 75000;
  const state = { rows: null, loading: null, analysis: null, scannedAt: null };

  const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const esc = (v) => norm(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const pct = (a,b) => b ? `${(100 * a / b).toFixed(1)} %` : "—";

  function hasImage(row) {
    return Number(row?.is_image || 0) === 1 || !!norm(row?.image_file);
  }
  function hasImageSource(row) {
    return !!norm(row?.image_source_url);
  }

  async function catalog(force = false, onProgress = null) {
    if (state.rows && !force) return state.rows;
    if (state.loading && !force) return state.loading;

    const run = (async () => {
      const api = window.CGWEB032_API?.query;
      if (!api) throw new Error("API CGWEB032.query indisponible : impossible d'analyser tout le catalogue.");
      const rows = [];
      const seen = new Set();
      let offset = 0;
      let total = null;
      let guard = 0;

      while (guard++ < 400) {
        const d = await api({
          term: "", limit: 300, offset,
          sortField: "id", sortDirection: "asc"
        });
        const batch = Array.isArray(d?.rows) ? d.rows : [];
        total = Number(d?.total ?? d?.catalogSize ?? total ?? 0);
        for (const row of batch) {
          const id = norm(row?.id ?? row?.original_id);
          const key = id || `anon:${rows.length}`;
          if (seen.has(key)) continue;
          seen.add(key); rows.push(row);
        }
        if (typeof onProgress === "function") {
          try { onProgress({ loaded: rows.length, total, offset }); } catch (_) {}
        }
        if (rows.length >= MAX_ROWS) break;
        const next = d?.nextOffset;
        if (next === null || next === undefined || !batch.length) break;
        const n = Number(next);
        if (!Number.isFinite(n) || n <= offset) break;
        offset = n;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      state.rows = rows;
      state.scannedAt = Date.now();
      return rows;
    })();

    state.loading = run;
    try { return await run; }
    finally { state.loading = null; }
  }

  function issueLabel(code) {
    return ({
      no_image:"Sans image",
      non_trouve:"Image introuvable",
      flag_without_file:"Indicateur image sans fichier",
      file_without_flag:"Fichier image sans indicateur",
      missing_source:"Source image absente",
      insecure_url:"URL image en HTTP",
      duplicate_path:"Même fichier utilisé plusieurs fois"
    })[code] || code;
  }

  function analyze(rows) {
    const all = Array.isArray(rows) ? rows : [];
    const pathCount = new Map();
    for (const row of all) {
      const p = norm(row?.image_file);
      if (p) pathCount.set(p, (pathCount.get(p) || 0) + 1);
    }

    const counts = {
      total: all.length, with_image: 0, no_image: 0, non_trouve: 0,
      cloud: 0, external: 0, missing_source: 0, insecure_url: 0,
      flag_without_file: 0, file_without_flag: 0, duplicate_paths: 0
    };
    const dupPaths = [...pathCount.entries()].filter(([,n]) => n > 1);
    counts.duplicate_paths = dupPaths.length;

    const anomalies = [];
    for (const row of all) {
      const file = norm(row?.image_file);
      const source = norm(row?.image_source_url);
      const flag = Number(row?.is_image || 0) === 1;
      const has = flag || !!file;
      const issues = [];

      if (has) counts.with_image++; else { counts.no_image++; issues.push("no_image"); }
      if (Number(row?.non_trouve || 0) === 1) { counts.non_trouve++; issues.push("non_trouve"); }
      if (flag && !file) { counts.flag_without_file++; issues.push("flag_without_file"); }
      if (file && !flag) { counts.file_without_flag++; issues.push("file_without_flag"); }
      if (has && !source) { counts.missing_source++; issues.push("missing_source"); }
      if (/^http:\/\//i.test(file) || /^http:\/\//i.test(source)) {
        counts.insecure_url++; issues.push("insecure_url");
      }
      if (file && (row?.image_origin === "firebase_storage" || file.startsWith("users/"))) counts.cloud++;
      else if (file && /^https?:\/\//i.test(file)) counts.external++;

      if (file && (pathCount.get(file) || 0) > 1) issues.push("duplicate_path");

      if (issues.length) anomalies.push({
        id: norm(row?.id ?? row?.original_id),
        question: norm(row?.question),
        megatheme: norm(row?.megatheme),
        theme: norm(row?.theme),
        image_file: file,
        image_source_url: source,
        issues: [...new Set(issues)]
      });
    }

    const result = { counts, anomalies, analyzedAt: Date.now() };
    state.analysis = result;
    try {
      localStorage.setItem(SUMMARY_KEY, JSON.stringify({
        analyzedAt: result.analyzedAt,
        counts: result.counts,
        anomaly_count: result.anomalies.length
      }));
    } catch (_) {}
    return result;
  }

  function lastSummary() {
    if (state.analysis) return {
      analyzedAt: state.analysis.analyzedAt,
      counts: state.analysis.counts,
      anomaly_count: state.analysis.anomalies.length
    };
    try { return JSON.parse(localStorage.getItem(SUMMARY_KEY) || "null"); }
    catch (_) { return null; }
  }

  function ensureModal() {
    let m = document.getElementById("cgweb055Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb055Modal";
    m.className = "cgweb055-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb055-dialog" role="dialog" aria-modal="true" aria-label="Qualité des images">
        <header><div><strong>Qualité des images</strong><small>Audit des métadonnées du catalogue — lecture seule</small></div><button type="button" data-cg55-close>×</button></header>
        <div class="cgweb055-actions">
          <button type="button" data-cg55-scan>Analyser le catalogue</button>
          <select id="cgweb055Filter" aria-label="Filtrer les anomalies"><option value="">Toutes les anomalies</option></select>
          <button type="button" data-cg55-export>Exporter CSV</button>
        </div>
        <div id="cgweb055Status" class="cgweb055-status">Aucune analyse complète lancée dans cet onglet.</div>
        <div id="cgweb055Stats" class="cgweb055-stats"></div>
        <div id="cgweb055List"></div>
      </div>`;
    document.body.appendChild(m);

    const codes = ["no_image","non_trouve","flag_without_file","file_without_flag","missing_source","insecure_url","duplicate_path"];
    m.querySelector("#cgweb055Filter").insertAdjacentHTML("beforeend",
      codes.map((c) => `<option value="${c}">${esc(issueLabel(c))}</option>`).join(""));
    m.querySelector("#cgweb055Filter").addEventListener("change", render);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg55-close]")) close();
      if (ev.target.closest("[data-cg55-scan]")) run();
      if (ev.target.closest("[data-cg55-export]")) exportCsv();
      const open = ev.target.closest("[data-cg55-open]");
      if (open) window.CGWEB019_API?.open?.(open.dataset.cg55Open, [open.dataset.cg55Open]);
    });
    return m;
  }

  function render() {
    const m = ensureModal();
    const stats = m.querySelector("#cgweb055Stats");
    const list = m.querySelector("#cgweb055List");
    const a = state.analysis;
    if (!a) {
      const old = lastSummary();
      stats.innerHTML = old ? `
        <article><span>Dernière analyse</span><strong>${new Date(old.analyzedAt || 0).toLocaleString("fr-FR")}</strong></article>
        <article><span>Questions</span><strong>${Number(old.counts?.total || 0).toLocaleString("fr-FR")}</strong></article>
        <article><span>Anomalies</span><strong>${Number(old.anomaly_count || 0).toLocaleString("fr-FR")}</strong></article>` : "";
      list.innerHTML = `<p class="cgweb055-empty">Clique « Analyser le catalogue » pour produire un audit actuel.</p>`;
      return;
    }

    const c = a.counts;
    stats.innerHTML = `
      <article><span>Questions</span><strong>${c.total.toLocaleString("fr-FR")}</strong></article>
      <article><span>Avec image</span><strong>${c.with_image.toLocaleString("fr-FR")}</strong><small>${pct(c.with_image,c.total)}</small></article>
      <article><span>Sans image</span><strong>${c.no_image.toLocaleString("fr-FR")}</strong></article>
      <article><span>Introuvables</span><strong>${c.non_trouve.toLocaleString("fr-FR")}</strong></article>
      <article><span>Source image absente</span><strong>${c.missing_source.toLocaleString("fr-FR")}</strong></article>
      <article><span>Chemins dupliqués</span><strong>${c.duplicate_paths.toLocaleString("fr-FR")}</strong></article>`;

    const filter = m.querySelector("#cgweb055Filter").value;
    const rows = a.anomalies.filter((x) => !filter || x.issues.includes(filter)).slice(0, 300);
    list.innerHTML = rows.length ? rows.map((x) => `
      <article class="cgweb055-row">
        <div>
          <strong>${esc(x.question || `(Question #${x.id || "?"})`)}</strong>
          <small>${esc([x.megatheme,x.theme,x.id ? `#${x.id}` : ""].filter(Boolean).join(" · "))}</small>
          <code>${esc(x.image_file || "aucun fichier")}</code>
          <span>${x.issues.map((i) => `<em>${esc(issueLabel(i))}</em>`).join("")}</span>
        </div>
        ${x.id ? `<button type="button" data-cg55-open="${esc(x.id)}">Ouvrir</button>` : ""}
      </article>`).join("") : `<p class="cgweb055-empty">Aucune anomalie pour ce filtre.</p>`;
  }

  async function run(force = false) {
    const m = ensureModal();
    const status = m.querySelector("#cgweb055Status");
    const button = m.querySelector("[data-cg55-scan]");
    button.disabled = true;
    try {
      const rows = await catalog(force, ({loaded,total}) => {
        status.textContent = `Lecture du catalogue… ${loaded.toLocaleString("fr-FR")}${total ? ` / ${total.toLocaleString("fr-FR")}` : ""}`;
      });
      status.textContent = "Analyse locale des métadonnées…";
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = analyze(rows);
      status.textContent = `Analyse terminée · ${result.anomalies.length.toLocaleString("fr-FR")} question(s) avec au moins une anomalie.`;
      render();
      return result;
    } catch (e) {
      status.textContent = e?.message || String(e);
      throw e;
    } finally { button.disabled = false; }
  }

  function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function exportCsv() {
    if (!state.analysis) return alert("Lance d'abord une analyse complète.");
    const rows = [["id","megatheme","theme","question","image_file","image_source_url","anomalies"]];
    state.analysis.anomalies.forEach((x) => rows.push([
      x.id,x.megatheme,x.theme,x.question,x.image_file,x.image_source_url,x.issues.map(issueLabel).join(" | ")
    ]));
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], {type:"text/csv;charset=utf-8"});
    const a = Object.assign(document.createElement("a"), {
      href:URL.createObjectURL(blob), download:`CGWEB055_QUALITE_IMAGES_${new Date().toISOString().slice(0,10)}.csv`
    });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function open() { const m = ensureModal(); render(); m.hidden = false; }
  function close() { ensureModal().hidden = true; }

  function installButton() {
    if (document.getElementById("cgweb055Open")) return;
    const host = document.querySelector('[data-cg16-page-panel="more"]');
    if (!host) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "cgweb055Open"; b.textContent = "Qualité images";
    b.addEventListener("click", open); host.appendChild(b);
  }
  installButton();
  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer); timer = setTimeout(installButton, 120);
  }).observe(document.body, {childList:true,subtree:true});

  window.CGWEB055 = {
    version: VERSION, open, run, catalog,
    rows: () => state.rows ? state.rows.slice() : [],
    analyze, analysis: () => state.analysis, lastSummary,
    hasImage, hasImageSource
  };
})();
