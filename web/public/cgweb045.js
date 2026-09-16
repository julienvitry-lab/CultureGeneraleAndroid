(() => {
  "use strict";

  const VERSION = "COMMAND_PALETTE001";
  const state = { open: false, index: 0, commands: [], filtered: [] };
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");
  const esc = (s) => norm(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function visible(el) {
    if (!el || !el.isConnected || el.hidden || el.disabled) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function buildCommands() {
    const out = [];
    const seen = new Set();

    function add(el, group, explicitLabel = "") {
      if (!el || seen.has(el) || !visible(el)) return;
      const label = explicitLabel || norm(el.textContent);
      if (!label) return;
      seen.add(el);
      out.push({
        label,
        group,
        run: () => {
          try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) {}
          el.click();
        }
      });
    }

    document.querySelectorAll('button[data-cg16-page]').forEach((b) => add(b, "Pages"));
    document.querySelectorAll('button[data-cg16-plus]').forEach((b) => add(b, "Plus"));
    document.querySelectorAll('.cgweb044-learning-tabs button').forEach((b) => add(b, "Apprentissage"));

    const safe = new Set([
      "accueil","recherche","apprentissage","répertoire","repertoire","répertoire de questions",
      "plus","historique","maîtrise","maitrise","difficulté","difficulte","temps de réponse",
      "temps de reponse","analyse croisée","analyse croisee","tableau qualité","tableau qualite",
      "contrôle qualité","controle qualite","doublons intelligents","bibliothèque d’images",
      "bibliothèque d'images","bibliotheque d'images","centre de contrôle des imports",
      "centre de controle des imports","modifications massives"
    ]);
    document.querySelectorAll("button").forEach((b) => {
      if (safe.has(lower(b.textContent))) add(b, "Raccourcis");
    });

    return out.sort((a, b) => a.group.localeCompare(b.group, "fr") || a.label.localeCompare(b.label, "fr"));
  }

  function ensureUi() {
    let root = document.getElementById("cgweb045Palette");
    if (root) return root;

    root = document.createElement("div");
    root.id = "cgweb045Palette";
    root.className = "cgweb045-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="cgweb045-dialog" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <div class="cgweb045-head">
          <input id="cgweb045Input" type="search" autocomplete="off" placeholder="Aller à… ou chercher une commande" aria-label="Chercher une commande">
          <button type="button" id="cgweb045Close" aria-label="Fermer">×</button>
        </div>
        <div id="cgweb045List" class="cgweb045-list" role="listbox"></div>
        <div class="cgweb045-help">Ctrl/⌘ + K · ↑ ↓ · Entrée · Échap</div>
      </div>`;
    document.body.appendChild(root);

    root.addEventListener("click", (ev) => {
      if (ev.target === root) close();
      const item = ev.target.closest("[data-cg45-index]");
      if (item) run(Number(item.dataset.cg45Index));
    });
    root.querySelector("#cgweb045Close").addEventListener("click", close);
    root.querySelector("#cgweb045Input").addEventListener("input", () => {
      state.index = 0;
      render();
    });
    return root;
  }

  function render() {
    const root = ensureUi();
    const q = lower(root.querySelector("#cgweb045Input").value);
    state.filtered = state.commands.filter((c) => !q || lower(`${c.group} ${c.label}`).includes(q));
    if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);

    const list = root.querySelector("#cgweb045List");
    list.innerHTML = state.filtered.length
      ? state.filtered.map((c, i) => `
          <button type="button" role="option" aria-selected="${i === state.index ? "true" : "false"}"
                  class="cgweb045-item ${i === state.index ? "active" : ""}" data-cg45-index="${i}">
            <span>${esc(c.label)}</span><small>${esc(c.group)}</small>
          </button>`).join("")
      : `<div class="cgweb045-empty">Aucune commande</div>`;

    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }

  function open() {
    state.commands = buildCommands();
    state.index = 0;
    const root = ensureUi();
    root.hidden = false;
    state.open = true;
    root.querySelector("#cgweb045Input").value = "";
    render();
    setTimeout(() => root.querySelector("#cgweb045Input").focus(), 0);
  }

  function close() {
    const root = ensureUi();
    root.hidden = true;
    state.open = false;
  }

  function run(i) {
    const cmd = state.filtered[i];
    if (!cmd) return;
    close();
    setTimeout(cmd.run, 0);
  }

  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && lower(ev.key) === "k") {
      ev.preventDefault();
      state.open ? close() : open();
      return;
    }
    if (!state.open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      state.index = Math.min(state.filtered.length - 1, state.index + 1);
      render();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      state.index = Math.max(0, state.index - 1);
      render();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      run(state.index);
    }
  });

  window.CGWEB045 = { version: VERSION, open, close, commands: buildCommands };
})();
