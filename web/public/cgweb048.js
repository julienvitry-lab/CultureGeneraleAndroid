(() => {
  "use strict";

  const VERSION = "STUDY_QUEUE001";
  const KEY = "cgweb048.study_queue.v1";
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
  function save(v) {
    localStorage.setItem(KEY, JSON.stringify(v.slice(0, 500)));
    render();
  }
  function itemKey(x) {
    const id = norm(x.id);
    return id ? `id:${id}` : `q:${norm(x.question)}`;
  }
  function add(item) {
    const x = {
      id: norm(item?.id),
      question: norm(item?.question),
      megatheme: norm(item?.megatheme),
      theme: norm(item?.theme),
      addedAt: Date.now()
    };
    if (!x.id && !x.question) return false;
    const key = itemKey(x);
    const all = load();
    if (all.some((q) => itemKey(q) === key)) return false;
    all.push(x);
    save(all);
    return true;
  }
  function addCurrent() {
    const ctx = window.CGWEB038?.context?.();
    if (!ctx) return alert("Aucune fiche question courante détectée.");
    alert(add(ctx) ? "Question ajoutée à la file d’apprentissage." : "Cette question est déjà dans la file.");
  }
  function importBulk() {
    const ids = window.CGWEB039?.ids?.() || [];
    if (!ids.length) return alert("Aucune sélection CGWEB039 disponible.");
    let count = 0;
    const contexts = window.CGWEB039?.state?.contexts;
    for (const id of ids) {
      let ctx = null;
      try { ctx = contexts?.get?.(String(id)) || contexts?.get?.(id); } catch (_) {}
      if (add({ id, ...(ctx || {}) })) count++;
    }
    render();
    alert(`${count} question(s) ajoutée(s) depuis la sélection du Répertoire.`);
  }
  function removeAt(index) {
    const all = load();
    all.splice(index, 1);
    save(all);
  }
  function move(index, delta) {
    const all = load();
    const target = index + delta;
    if (target < 0 || target >= all.length) return;
    [all[index], all[target]] = [all[target], all[index]];
    save(all);
  }
  function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function exportCsv() {
    const rows = [["ordre","id","megatheme","theme","question"]];
    load().forEach((x, i) => rows.push([i + 1, x.id, x.megatheme, x.theme, x.question]));
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cgweb_file_apprentissage_${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function ensurePanel() {
    let panel = document.getElementById("cgweb048StudyQueue");
    if (panel) return panel;
    const host = document.querySelector('[data-cg16-page-panel="learning"]');
    if (!host) return null;
    panel = document.createElement("section");
    panel.id = "cgweb048StudyQueue";
    panel.className = "cgweb048-panel";
    panel.innerHTML = `
      <div class="cgweb048-head">
        <div><h3>File d’apprentissage</h3><small>Liste locale, indépendante des données de maîtrise</small></div>
        <div><button type="button" data-cg48-import>Importer la sélection</button><button type="button" data-cg48-export>Exporter CSV</button><button type="button" data-cg48-clear>Vider</button></div>
      </div>
      <div id="cgweb048List"></div>`;
    host.appendChild(panel);
    panel.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-cg48-import]")) importBulk();
      if (ev.target.closest("[data-cg48-export]")) exportCsv();
      if (ev.target.closest("[data-cg48-clear]") && confirm("Vider uniquement la file d'apprentissage locale ?")) save([]);
      const r = ev.target.closest("[data-cg48-remove]");
      if (r) removeAt(Number(r.dataset.cg48Remove));
      const up = ev.target.closest("[data-cg48-up]");
      if (up) move(Number(up.dataset.cg48Up), -1);
      const down = ev.target.closest("[data-cg48-down]");
      if (down) move(Number(down.dataset.cg48Down), 1);
    });
    return panel;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return;
    const all = load();
    panel.querySelector("#cgweb048List").innerHTML = all.length
      ? all.map((x, i) => `
          <article class="cgweb048-row">
            <span class="cgweb048-order">${i + 1}</span>
            <div><strong>${esc(x.question || `(ID ${x.id})`)}</strong><small>${esc([x.megatheme,x.theme,x.id ? `ID ${x.id}` : ""].filter(Boolean).join(" · "))}</small></div>
            <div class="cgweb048-row-actions">
              <button type="button" data-cg48-up="${i}" aria-label="Monter">↑</button>
              <button type="button" data-cg48-down="${i}" aria-label="Descendre">↓</button>
              <button type="button" data-cg48-remove="${i}">Retirer</button>
            </div>
          </article>`).join("")
      : `<p class="cgweb048-empty">La file est vide. Ajoute une fiche courante ou importe la sélection du Répertoire.</p>`;
  }

  function installWorkspaceButton() {
    const ws = document.getElementById("cgweb038Workspace");
    if (!ws || document.getElementById("cgweb048AddCurrent")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb048AddCurrent";
    b.textContent = "Ajouter à la file";
    b.addEventListener("click", addCurrent);
    ws.appendChild(b);
  }

  let timer = null;
  function refresh() {
    ensurePanel();
    installWorkspaceButton();
    render();
  }
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }).observe(document.body, { childList: true, subtree: true });
  refresh();

  window.CGWEB048 = { version: VERSION, queue: load, add, addCurrent, importBulk, clear: () => save([]), refresh };
})();
