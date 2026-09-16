(() => {
  "use strict";

  const VERSION = "DUPLICATE_REVIEW002";
  const KEY = "cgweb054.duplicate_review.v1";
  const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const esc = (v) => norm(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (_) { return {}; }
  }
  function save(v) { localStorage.setItem(KEY, JSON.stringify(v)); }
  function pairKey(card) { return norm(card?.dataset?.key); }

  function setDecision(key, status) {
    if (!key) return;
    const all = load();
    const previous = all[key] || {};
    const label = status === "later" ? "À revoir"
      : status === "not_duplicate" ? "Pas doublon"
      : status === "confirmed" ? "Doublon confirmé" : "";
    all[key] = { ...previous, status, label, updatedAt: Date.now() };
    save(all);
    refresh();
  }

  function setNote(key) {
    if (!key) return;
    const all = load();
    const old = norm(all[key]?.note);
    const note = prompt("Note locale pour cette paire :", old);
    if (note === null) return;
    all[key] = { ...(all[key] || {}), note: norm(note), updatedAt: Date.now() };
    save(all);
    refresh();
  }

  function decisions() { return load(); }

  function summary() {
    const vals = Object.values(load());
    return {
      total: vals.length,
      later: vals.filter((x) => x.status === "later").length,
      not_duplicate: vals.filter((x) => x.status === "not_duplicate").length,
      confirmed: vals.filter((x) => x.status === "confirmed").length
    };
  }

  function updateSummaryBar() {
    const panel = document.getElementById("cgweb025Panel");
    if (!panel) return;
    let bar = document.getElementById("cgweb054Summary");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "cgweb054Summary";
      bar.className = "cgweb054-summary";
      const toolbar = panel.querySelector(".cg25-toolbar");
      if (toolbar) toolbar.insertAdjacentElement("afterend", bar);
      else panel.prepend(bar);
      bar.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-cg54-ledger]")) openLedger();
        if (ev.target.closest("[data-cg54-export]")) exportCsv();
      });
    }
    const s = summary();
    const sig = JSON.stringify(s);
    if (bar.dataset.cg54Sig !== sig) {
      bar.dataset.cg54Sig = sig;
      bar.innerHTML = `
        <span><strong>${s.total}</strong> décision(s) locale(s)</span>
        <span>À revoir <b>${s.later}</b></span>
        <span>Pas doublon <b>${s.not_duplicate}</b></span>
        <span>Confirmés <b>${s.confirmed}</b></span>
        <button type="button" data-cg54-ledger>Revue locale</button>
        <button type="button" data-cg54-export>Exporter CSV</button>`;
    }
  }

  function augmentCard(card) {
    const key = pairKey(card);
    if (!key) return;
    let box = card.querySelector(".cgweb054-triage");
    if (!box) {
      box = document.createElement("div");
      box.className = "cgweb054-triage";
      card.appendChild(box);
      box.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-cg54-status]");
        if (b) setDecision(key, b.dataset.cg54Status);
        if (ev.target.closest("[data-cg54-note]")) setNote(key);
      });
    }
    const d = load()[key] || {};
    const sig = JSON.stringify([d.status || "", d.note || ""]);
    if (box.dataset.cg54Sig !== sig) {
      box.dataset.cg54Sig = sig;
      box.innerHTML = `
        <span>Revue CGWEB054</span>
        <button type="button" data-cg54-status="later" class="${d.status === "later" ? "active" : ""}">À revoir</button>
        <button type="button" data-cg54-status="not_duplicate" class="${d.status === "not_duplicate" ? "active" : ""}">Pas doublon</button>
        <button type="button" data-cg54-status="confirmed" class="${d.status === "confirmed" ? "active" : ""}">Confirmé</button>
        <button type="button" data-cg54-note>Note${d.note ? " ✓" : ""}</button>`;
    }
  }

  function refresh() {
    document.querySelectorAll("#cg25List .cg25-card[data-key]").forEach(augmentCard);
    updateSummaryBar();
    if (!ensureLedger().hidden) renderLedger();
  }

  function ensureLedger() {
    let m = document.getElementById("cgweb054Ledger");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb054Ledger";
    m.className = "cgweb054-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb054-dialog" role="dialog" aria-modal="true" aria-label="Revue locale des doublons">
        <header><div><strong>Revue locale des doublons</strong><small>Décisions de triage — aucune suppression</small></div><button type="button" data-cg54-close>×</button></header>
        <div class="cgweb054-ledger-actions"><button type="button" data-cg54-export>Exporter CSV</button><button type="button" data-cg54-clear>Effacer les décisions locales</button></div>
        <div id="cgweb054LedgerList"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg54-close]")) m.hidden = true;
      if (ev.target.closest("[data-cg54-export]")) exportCsv();
      if (ev.target.closest("[data-cg54-clear]") && confirm("Effacer uniquement les décisions locales CGWEB054 ?")) {
        localStorage.removeItem(KEY); refresh();
      }
      const del = ev.target.closest("[data-cg54-del]");
      if (del) {
        const all = load(); delete all[del.dataset.cg54Del]; save(all); refresh();
      }
    });
    return m;
  }

  function renderLedger() {
    const m = ensureLedger();
    const all = load();
    const entries = Object.entries(all).sort((a,b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0));
    const list = m.querySelector("#cgweb054LedgerList");
    const sig = JSON.stringify(entries);
    if (list.dataset.cg54Sig === sig) return;
    list.dataset.cg54Sig = sig;
    list.innerHTML = entries.length ? entries.map(([key, d]) => `
      <article class="cgweb054-ledger-row">
        <div><strong>${esc(key)}</strong><span>${esc(d.label || d.status || "—")}</span>${d.note ? `<small>${esc(d.note)}</small>` : ""}</div>
        <button type="button" data-cg54-del="${esc(key)}">Retirer</button>
      </article>`).join("") : `<p class="cgweb054-empty">Aucune décision locale enregistrée.</p>`;
  }
  function openLedger() { const m = ensureLedger(); renderLedger(); m.hidden = false; }

  function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function exportCsv() {
    const rows = [["paire","statut","libelle","note","date"]];
    Object.entries(load()).forEach(([key,d]) => rows.push([
      key, d.status || "", d.label || "", d.note || "",
      d.updatedAt ? new Date(d.updatedAt).toISOString() : ""
    ]));
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], { type:"text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download:`CGWEB054_REVUE_DOUBLONS_${new Date().toISOString().slice(0,10)}.csv`
    });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer); timer = setTimeout(refresh, 100);
  }).observe(document.body, { childList:true, subtree:true });
  refresh();

  window.CGWEB054 = { version:VERSION, refresh, decisions, summary, openLedger, setDecision };
})();
