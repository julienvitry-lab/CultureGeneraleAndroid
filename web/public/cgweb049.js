(() => {
  "use strict";

  const VERSION = "LOCAL_BACKUP001";
  const PREFIX = /^(cgweb|cgimport)/i;
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function collectStorage(storage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !PREFIX.test(k)) continue;
      out[k] = storage.getItem(k);
    }
    return out;
  }
  function payload() {
    return {
      schema: "cgweb-local-backup-v1",
      createdAt: new Date().toISOString(),
      location: location.origin + location.pathname,
      localStorage: collectStorage(localStorage),
      sessionStorage: collectStorage(sessionStorage)
    };
  }
  function download() {
    const data = payload();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `cgweb_sauvegarde_locale_${new Date().toISOString().replace(/[:.]/g,"-")}.json`
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  async function importFile(file) {
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (_) { return alert("Fichier JSON invalide."); }
    if (data?.schema !== "cgweb-local-backup-v1") return alert("Ce fichier n'est pas une sauvegarde locale CGWEB049.");

    const l = Object.entries(data.localStorage || {}).filter(([k]) => PREFIX.test(k));
    const s = Object.entries(data.sessionStorage || {}).filter(([k]) => PREFIX.test(k));
    if (!confirm(`Restaurer ${l.length} clé(s) locale(s) et ${s.length} clé(s) de session ?\nLa restauration fusionne les données et ne supprime rien d'autre.`)) return;

    for (const [k,v] of l) localStorage.setItem(k, String(v ?? ""));
    for (const [k,v] of s) sessionStorage.setItem(k, String(v ?? ""));
    alert("Sauvegarde locale restaurée. Recharge la page pour appliquer tous les états UI.");
  }

  function ensureModal() {
    let m = document.getElementById("cgweb049Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb049Modal";
    m.className = "cgweb049-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb049-dialog" role="dialog" aria-modal="true" aria-label="Sauvegarde locale CGWEB">
        <header><div><strong>Sauvegarde locale</strong><small>Préférences, vues, historiques et files locales CGWEB</small></div><button type="button" data-cg49-close>×</button></header>
        <p>Cette sauvegarde ne contient pas la base Firestore. Elle sert uniquement à transférer ou sécuriser les états locaux du navigateur.</p>
        <div class="cgweb049-stats" id="cgweb049Stats"></div>
        <div class="cgweb049-actions">
          <button type="button" data-cg49-export>Exporter JSON</button>
          <label class="cgweb049-import">Importer JSON<input type="file" accept="application/json,.json" data-cg49-file></label>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg49-close]")) close();
      if (ev.target.closest("[data-cg49-export]")) download();
    });
    m.querySelector("[data-cg49-file]").addEventListener("change", (ev) => {
      importFile(ev.target.files?.[0]);
      ev.target.value = "";
    });
    return m;
  }
  function renderStats() {
    const p = payload();
    ensureModal().querySelector("#cgweb049Stats").textContent =
      `${Object.keys(p.localStorage).length} clé(s) locale(s) · ${Object.keys(p.sessionStorage).length} clé(s) de session`;
  }
  function open() {
    renderStats();
    ensureModal().hidden = false;
  }
  function close() { ensureModal().hidden = true; }

  function installButton() {
    if (document.getElementById("cgweb049Open")) return;
    const host = document.querySelector('[data-cg16-page-panel="more"]');
    if (!host) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb049Open";
    b.textContent = "Sauvegarde locale";
    b.addEventListener("click", open);
    host.appendChild(b);
  }
  installButton();
  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installButton, 120);
  }).observe(document.body, { childList: true, subtree: true });

  window.CGWEB049 = { version: VERSION, open, exportPayload: payload, download, importFile };
})();
