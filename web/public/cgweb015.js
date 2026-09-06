// CGWEB015 FIX1 — pagination plein texte + surlignage
(() => {
  const state = { page: 0, pageSize: 50, total: 0, tokens: [], ids: [] };
  const $ = id => document.getElementById(id);

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function highlightElement(root, tokens) {
    if (!root || !tokens?.length) return;

    const normTokens = [...new Set(tokens.map(normalize).filter(Boolean))]
      .sort((a, b) => b.length - a.length);

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (["SCRIPT","STYLE","BUTTON","SELECT","OPTION","INPUT","TEXTAREA","MARK"].includes(p.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const original = node.nodeValue;
      const lower = normalize(original);
      const matches = [];

      for (const token of normTokens) {
        let from = 0;
        while (true) {
          const idx = lower.indexOf(token, from);
          if (idx < 0) break;
          matches.push([idx, idx + token.length]);
          from = idx + Math.max(token.length, 1);
        }
      }

      if (!matches.length) continue;
      matches.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

      const merged = [];
      for (const m of matches) {
        if (!merged.length || m[0] >= merged[merged.length - 1][1]) {
          merged.push(m);
        }
      }

      const frag = document.createDocumentFragment();
      let pos = 0;

      for (const [a, b] of merged) {
        if (a > pos) frag.appendChild(document.createTextNode(original.slice(pos, a)));

        const mark = document.createElement("mark");
        mark.className = "cg15-mark";
        mark.textContent = original.slice(a, b);
        frag.appendChild(mark);
        pos = b;
      }

      if (pos < original.length) {
        frag.appendChild(document.createTextNode(original.slice(pos)));
      }

      node.parentNode.replaceChild(frag, node);
    }
  }

  function decorateCurrentResults(tokens) {
    const panel = $("cgweb006Panel");
    if (!panel) return;
    panel.querySelectorAll(".cg6-row").forEach(row => highlightElement(row, tokens));
  }

  function getPageSize() {
    const perPage = $("cg6PerPage");
    const n = Number(perPage?.value || 50);
    return [20, 50, 100].includes(n) ? n : 50;
  }

  function ensurePanel() {
    if ($("cgweb015Panel")) return;

    const panel = document.createElement("section");
    panel.id = "cgweb015Panel";
    panel.className = "cg15-panel";
    panel.innerHTML = `
      <div class="cg15-head">
        <div>
          <div class="cg15-kicker">CGWEB015</div>
          <h2>Navigation plein texte</h2>
          <div class="cg15-sub">
            Pagination réelle des correspondances et surlignage des termes recherchés.
          </div>
        </div>
        <div id="cg15Count" class="cg15-count">Aucune recherche plein texte</div>
      </div>
      <div class="cg15-controls">
        <button id="cg15Prev" class="cg15-btn" disabled>← Précédent</button>
        <div id="cg15Page" class="cg15-page">Page —</div>
        <button id="cg15Next" class="cg15-btn" disabled>Suivant →</button>
      </div>
    `;

    const directory = $("cgweb006Panel");
    if (directory?.parentElement) {
      directory.insertAdjacentElement("afterend", panel);
    } else {
      (document.querySelector("main") || document.body).appendChild(panel);
    }

    $("cg15Prev").onclick = async () => {
      if (state.page <= 0) return;
      state.page--;
      await window.CGWEB015_API.renderPage();
    };

    $("cg15Next").onclick = async () => {
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page >= pages - 1) return;
      state.page++;
      await window.CGWEB015_API.renderPage();
    };
  }

  function updateUi() {
    ensurePanel();
    state.pageSize = getPageSize();

    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));

    $("cg15Count").textContent =
      `${new Intl.NumberFormat("fr-FR").format(state.total)} correspondance(s)`;

    $("cg15Page").textContent =
      `Page ${Math.min(state.page + 1, pages)} / ${pages}`;

    $("cg15Prev").disabled = state.page <= 0;
    $("cg15Next").disabled = state.page >= pages - 1;
  }

  async function renderPage() {
    if (!state.ids?.length) return;
    if (!window.CGWEB006_API?.byId || !window.CGWEB006_render) return;

    state.pageSize = getPageSize();

    const start = state.page * state.pageSize;
    const end = start + state.pageSize;
    const ids = state.ids.slice(start, end);

    const rows = (
      await Promise.all(ids.map(id => window.CGWEB006_API.byId(String(id))))
    ).filter(Boolean);

    let filtered = rows;

    if (typeof window.CGWEB015_FILTER === "function") {
      filtered = window.CGWEB015_FILTER(rows);
    }

    if (typeof window.CGWEB015_REVALIDATE === "function") {
      filtered = window.CGWEB015_REVALIDATE(filtered, state.tokens);
    }

    window.CGWEB006_render(filtered);

    setTimeout(() => decorateCurrentResults(state.tokens), 40);
    updateUi();

    const info = $("cg6Page");
    if (info) {
      info.textContent =
        `${new Intl.NumberFormat("fr-FR").format(state.total)} correspondance(s) · ` +
        `${new Intl.NumberFormat("fr-FR").format(filtered.length)} affichée(s)`;
    }
  }

  window.CGWEB015_API = {
    setSearch({ ids, tokens, page = 0 }) {
      state.ids = [...new Set((ids || []).map(String))];
      state.tokens = [...new Set((tokens || []).map(String).filter(Boolean))];
      state.total = state.ids.length;
      state.page = Math.max(0, Number(page) || 0);
      state.pageSize = getPageSize();
      updateUi();
    },

    renderPage,

    reset() {
      state.ids = [];
      state.tokens = [];
      state.total = 0;
      state.page = 0;
      updateUi();
    },

    decorate(tokens) {
      decorateCurrentResults(tokens || state.tokens);
    }
  };

  ensurePanel();

  const perPage = $("cg6PerPage");
  if (perPage) {
    perPage.addEventListener("change", async () => {
      state.pageSize = getPageSize();
      state.page = 0;
      if (state.ids.length) await renderPage();
      else updateUi();
    });
  }
})();
