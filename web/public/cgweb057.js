(() => {
  "use strict";

  const VERSION = "SMART_REVIEW_BRIDGE001";
  const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

  function queueCount() { return window.CGWEB048?.queue?.()?.length || 0; }
  function recentCount() { return window.CGWEB047?.history?.()?.length || 0; }

  function smartButton() {
    return document.querySelector('[data-cg35-tab="smart"]') ||
      [...document.querySelectorAll("button")].find((b) =>
        /session intelligente/i.test(norm(b.textContent))) || null;
  }

  function openLearning() {
    const b = [...document.querySelectorAll('button[data-cg16-page]')]
      .find((x) => /apprentissage/i.test(norm(x.textContent)));
    b?.click();
  }

  function openSmart() {
    openLearning();
    setTimeout(() => {
      const b = smartButton();
      if (b) b.click();
      else alert("Le sous-onglet « Session intelligente » CGPLAY001 n'est pas disponible dans cette version.");
    }, 180);
  }

  function addItems(items, max = 20) {
    if (!window.CGWEB048?.add) return { added:0, skipped:0, error:"File CGWEB048 indisponible." };
    let added = 0, skipped = 0;
    for (const item of (items || []).slice(0, max)) {
      if (window.CGWEB048.add(item)) added++; else skipped++;
    }
    window.CGWEB048.refresh?.();
    return { added, skipped };
  }

  function addRecent() {
    const max = Number(document.getElementById("cgweb057Count")?.value || 20);
    const rows = window.CGWEB047?.history?.() || [];
    const r = addItems(rows, max);
    alert(r.error || `${r.added} question(s) récente(s) ajoutée(s) à la file locale · ${r.skipped} déjà présente(s).`);
    refresh();
  }

  async function addRecentlyModified() {
    const status = document.getElementById("cgweb057Status");
    const max = Number(document.getElementById("cgweb057Count")?.value || 20);
    if (status) status.textContent = "Lecture des modifications récentes…";
    try {
      if (!window.CGWEB017_API?.stats) throw new Error("Statistiques CGWEB017 indisponibles.");
      const s = await window.CGWEB017_API.stats();
      const rows = Array.isArray(s?.recent) ? s.recent : [];
      const r = addItems(rows, max);
      if (status) status.textContent = `${r.added} question(s) modifiée(s) ajoutée(s) · ${r.skipped} déjà présente(s).`;
      refresh();
    } catch (e) {
      if (status) status.textContent = e?.message || String(e);
    }
  }

  function ensurePanel() {
    const host = document.querySelector('[data-cg16-page-panel="learning"]');
    if (!host) return null;
    let p = document.getElementById("cgweb057Panel");
    if (p) return p;
    p = document.createElement("section");
    p.id = "cgweb057Panel";
    p.className = "cgweb057-panel";
    p.innerHTML = `
      <div class="cgweb057-head">
        <div><h3>Plan de révision</h3>
        <small>CGWEB057 orchestre les outils existants sans recréer le moteur « Session intelligente ».</small></div>
        <button type="button" data-cg57-smart>Ouvrir Session intelligente</button>
      </div>
      <div class="cgweb057-stats">
        <span>File locale <strong id="cgweb057Queue">0</strong></span>
        <span>Questions récentes <strong id="cgweb057Recent">0</strong></span>
        <span>Session intelligente <strong id="cgweb057Smart">—</strong></span>
      </div>
      <div class="cgweb057-actions">
        <label>Maximum<select id="cgweb057Count"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></label>
        <button type="button" data-cg57-recent>Ajouter les fiches récemment ouvertes</button>
        <button type="button" data-cg57-modified>Ajouter les récemment modifiées</button>
      </div>
      <p id="cgweb057Status" class="cgweb057-status">La maîtrise, les points faibles et les révisions échues restent calculés par CGPLAY001.</p>`;
    host.appendChild(p);
    p.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-cg57-smart]")) openSmart();
      if (ev.target.closest("[data-cg57-recent]")) addRecent();
      if (ev.target.closest("[data-cg57-modified]")) addRecentlyModified();
    });
    return p;
  }

  function setText(el, value) {
    const next = String(value);
    if (el && el.textContent !== next) el.textContent = next;
  }
  function refresh() {
    const p = ensurePanel(); if (!p) return;
    setText(p.querySelector("#cgweb057Queue"), queueCount());
    setText(p.querySelector("#cgweb057Recent"), recentCount());
    setText(p.querySelector("#cgweb057Smart"), smartButton() ? "disponible" : "indisponible");
  }

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer); timer = setTimeout(refresh, 120);
  }).observe(document.body, {childList:true,subtree:true});
  refresh();

  window.CGWEB057 = {
    version: VERSION, refresh, openSmart, addRecent, addRecentlyModified,
    summary: () => ({ queue:queueCount(), recent:recentCount(), smart_available:!!smartButton() })
  };
})();
