(() => {
  "use strict";

  const VERSION = "QUESTION_RECENTS001";
  const KEY = "cgweb047.question_recents.v1";
  const MAX = 50;
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const esc = (s) => norm(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  function save(v) { localStorage.setItem(KEY, JSON.stringify(v.slice(0, MAX))); }

  function capture() {
    const ctx = window.CGWEB038?.context?.();
    if (!ctx) return;
    const id = norm(ctx.id);
    const question = norm(ctx.question);
    if (!id && !question) return;
    const key = id ? `id:${id}` : `q:${question}`;
    const all = load().filter((x) => x.key !== key);
    all.unshift({
      key, id, question,
      megatheme: norm(ctx.megatheme),
      theme: norm(ctx.theme),
      source: norm(ctx.source),
      viewedAt: Date.now()
    });
    save(all);
    render();
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }
  function exportCsv() {
    const rows = [["date","id","megatheme","theme","question"]];
    load().forEach((x) => rows.push([
      new Date(x.viewedAt || 0).toISOString(), x.id, x.megatheme, x.theme, x.question
    ]));
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cgweb_questions_recentes_${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(String(text ?? "")); } catch (_) {}
  }

  function ensureModal() {
    let m = document.getElementById("cgweb047Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb047Modal";
    m.className = "cgweb047-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb047-dialog" role="dialog" aria-modal="true" aria-label="Questions récentes">
        <header><div><strong>Questions récentes</strong><small>50 dernières fiches ouvertes sur cet appareil</small></div><button type="button" data-cg47-close>×</button></header>
        <div class="cgweb047-actions"><button type="button" data-cg47-export>Exporter CSV</button><button type="button" data-cg47-clear>Effacer l’historique local</button></div>
        <div id="cgweb047List"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg47-close]")) close();
      if (ev.target.closest("[data-cg47-export]")) exportCsv();
      if (ev.target.closest("[data-cg47-clear]") && confirm("Effacer uniquement l'historique local des questions récentes ?")) {
        save([]); render();
      }
      const c = ev.target.closest("[data-cg47-copy]");
      if (c) copy(c.dataset.cg47Copy);
    });
    return m;
  }
  function render() {
    const list = ensureModal().querySelector("#cgweb047List");
    const all = load();
    list.innerHTML = all.length ? all.map((x) => `
      <article class="cgweb047-row">
        <div>
          <strong>${esc(x.question || "(question non exposée)")}</strong>
          <small>${esc([x.megatheme,x.theme].filter(Boolean).join(" · "))}</small>
          <small>${new Date(x.viewedAt || 0).toLocaleString("fr-FR")}${x.id ? ` · ID ${esc(x.id)}` : ""}</small>
        </div>
        ${x.id ? `<button type="button" data-cg47-copy="${esc(x.id)}">Copier ID</button>` : ""}
      </article>`).join("") : `<p class="cgweb047-empty">Aucune question ouverte depuis l’activation de CGWEB047.</p>`;
  }
  function open() { render(); ensureModal().hidden = false; }
  function close() { ensureModal().hidden = true; }

  function installButton() {
    const ws = document.getElementById("cgweb038Workspace");
    if (!ws || document.getElementById("cgweb047Open")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb047Open";
    b.textContent = "Questions récentes";
    b.addEventListener("click", open);
    ws.appendChild(b);
  }

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || norm(b.textContent).toLocaleLowerCase("fr-FR") !== "ouvrir") return;
    setTimeout(capture, 90);
    setTimeout(capture, 500);
  }, true);

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installButton, 120);
  }).observe(document.body, { childList: true, subtree: true });
  installButton();

  window.CGWEB047 = { version: VERSION, open, capture, history: load, clear: () => save([]) };
})();
