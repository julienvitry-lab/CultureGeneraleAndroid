(() => {
  "use strict";

  const VERSION = "SAVED_VIEWS001";
  const KEY = "cgweb046.saved_views.v1";
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
    localStorage.setItem(KEY, JSON.stringify(v.slice(0, 30)));
  }
  function visible(el) {
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }
  function pageKey() {
    const panel = [...document.querySelectorAll("[data-cg16-page-panel]")].find(visible);
    return panel?.dataset?.cg16PagePanel || "global";
  }
  function rootForPage() {
    const panel = [...document.querySelectorAll("[data-cg16-page-panel]")].find(visible);
    return panel || document;
  }
  function selectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    const dk = el.getAttribute("data-filter") || el.getAttribute("data-field") || el.getAttribute("data-key");
    if (dk) {
      const attr = el.hasAttribute("data-filter") ? "data-filter" : el.hasAttribute("data-field") ? "data-field" : "data-key";
      return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(dk)}"]`;
    }
    return "";
  }
  function captureValues() {
    const root = rootForPage();
    const values = [];
    root.querySelectorAll("input,select,textarea").forEach((el) => {
      if (["password","file","hidden","submit","button"].includes((el.type || "").toLowerCase())) return;
      const selector = selectorFor(el);
      if (!selector) return;
      values.push({
        selector,
        kind: el.type === "checkbox" || el.type === "radio" ? "checked" : "value",
        value: el.type === "checkbox" || el.type === "radio" ? !!el.checked : String(el.value ?? "")
      });
    });
    return values;
  }
  function applyValues(view) {
    const targetPage = view.page || "global";
    const nav = document.querySelector(`button[data-cg16-page="${CSS.escape(targetPage)}"]`);
    if (nav && pageKey() !== targetPage) nav.click();

    setTimeout(() => {
      let applied = 0;
      for (const item of view.values || []) {
        let el = null;
        try { el = document.querySelector(item.selector); } catch (_) {}
        if (!el) continue;
        if (item.kind === "checked") el.checked = !!item.value;
        else el.value = String(item.value ?? "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        applied++;
      }
      alert(`Vue "${view.name}" chargée : ${applied} champ(s) restauré(s).\nLe bouton Appliquer de l'écran n'est jamais déclenché automatiquement.`);
    }, nav ? 180 : 0);
  }

  function ensureModal() {
    let modal = document.getElementById("cgweb046Modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "cgweb046Modal";
    modal.className = "cgweb046-overlay";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="cgweb046-dialog" role="dialog" aria-modal="true" aria-label="Vues enregistrées">
        <header><div><strong>Vues enregistrées</strong><small>Filtres et champs de l’écran courant</small></div><button type="button" data-cg46-close>×</button></header>
        <div class="cgweb046-actions"><button type="button" data-cg46-save>Enregistrer la vue actuelle</button></div>
        <div id="cgweb046List"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal || ev.target.closest("[data-cg46-close]")) close();
      if (ev.target.closest("[data-cg46-save]")) create();
      const a = ev.target.closest("[data-cg46-apply]");
      if (a) {
        const v = load().find((x) => x.id === a.dataset.cg46Apply);
        if (v) applyValues(v);
      }
      const d = ev.target.closest("[data-cg46-delete]");
      if (d) {
        const all = load();
        const v = all.find((x) => x.id === d.dataset.cg46Delete);
        if (v && confirm(`Supprimer la vue "${v.name}" ?`)) {
          save(all.filter((x) => x.id !== v.id));
          render();
        }
      }
    });
    return modal;
  }

  function render() {
    const modal = ensureModal();
    const list = modal.querySelector("#cgweb046List");
    const all = load();
    list.innerHTML = all.length
      ? all.map((v) => `
          <article class="cgweb046-view">
            <div><strong>${esc(v.name)}</strong><small>${esc(v.page || "global")} · ${(v.values || []).length} champ(s)</small></div>
            <div><button type="button" data-cg46-apply="${esc(v.id)}">Charger</button><button type="button" data-cg46-delete="${esc(v.id)}">Supprimer</button></div>
          </article>`).join("")
      : `<p class="cgweb046-empty">Aucune vue enregistrée.</p>`;
  }
  function create() {
    const values = captureValues();
    if (!values.length) return alert("Aucun champ stable à enregistrer sur cet écran.");
    const name = norm(prompt("Nom de cette vue :", `Vue ${pageKey()}`));
    if (!name) return;
    const all = load();
    all.unshift({
      id: `v${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      name,
      page: pageKey(),
      values,
      createdAt: Date.now()
    });
    save(all);
    render();
  }
  function open() {
    const modal = ensureModal();
    render();
    modal.hidden = false;
  }
  function close() {
    ensureModal().hidden = true;
  }

  function installButton() {
    if (document.getElementById("cgweb046Open")) return;
    const host = document.querySelector("#cgweb037Tools") ||
                 document.querySelector('[data-cg16-page-panel="directory"]') ||
                 document.querySelector('[data-cg16-page-panel="more"]');
    if (!host) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb046Open";
    b.textContent = "Vues";
    b.title = "Enregistrer ou recharger des filtres";
    b.addEventListener("click", open);
    host.prepend(b);
  }

  installButton();
  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installButton, 120);
  }).observe(document.body, { childList: true, subtree: true });

  window.CGWEB046 = { version: VERSION, open, capture: captureValues, views: load, apply: applyValues };
})();
