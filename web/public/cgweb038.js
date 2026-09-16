(() => {
  "use strict";

  const VERSION = "QUESTION_WORKSPACE001";
  const SS_CTX = "cgweb038.question.context.v1";

  const state = {
    ctx: null,
    injectedInto: null,
    observer: null,
    renderTimer: null,
    wiredRoot: null,
    active: false
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");

  function saveCtx(ctx) {
    state.ctx = ctx;
    try { sessionStorage.setItem(SS_CTX, JSON.stringify(ctx)); } catch (_) {}
  }

  function loadCtx() {
    if (state.ctx) return state.ctx;
    try {
      const raw = sessionStorage.getItem(SS_CTX);
      if (raw) state.ctx = JSON.parse(raw);
    } catch (_) {}
    return state.ctx;
  }

  function clearCtx() {
    state.ctx = null;
    state.injectedInto = null;
    try { sessionStorage.removeItem(SS_CTX); } catch (_) {}
  }

  function cellText(row, headerNeedles) {
    const table = row?.closest("table");
    if (!table) return "";
    const headers = [...table.querySelectorAll("thead th")].map((th) => lower(th.textContent));
    const cells = [...row.querySelectorAll("td")];
    for (const needle of headerNeedles) {
      const idx = headers.findIndex((h) => h === needle || h.includes(needle));
      if (idx >= 0 && cells[idx]) return norm(cells[idx].textContent);
    }
    return "";
  }

  function captureRowContext(button) {
    const row = button.closest("tr");
    if (!row) return null;

    const id =
      cellText(row, ["id"]) ||
      norm(row.dataset.id || row.dataset.questionId || "") ||
      norm(row.querySelector("[data-id],[data-question-id]")?.dataset?.id || "");

    const question = cellText(row, ["question"]);
    const megatheme = cellText(row, ["mégathème", "megatheme"]);
    const theme = cellText(row, ["thème", "theme"]);

    return {
      id,
      question,
      megatheme,
      theme,
      capturedAt: Date.now(),
      source: button.closest(".cgweb037-search-engine") ? "search" : "directory"
    };
  }

  function isWorkspaceOpenButton(button) {
    if (!button || lower(button.textContent) !== "ouvrir") return false;
    if (button.closest("#cgweb038Workspace")) return false;
    const inDirectory = !!button.closest('[data-cg16-page-panel="directory"]');
    const inSearch = !!button.closest(".cgweb037-search-engine");
    return inDirectory || inSearch;
  }

  function labelFor(el) {
    if (!el) return "";
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return norm(lab.textContent);
    }
    const parent = el.closest("label");
    if (parent) return norm(parent.textContent);
    const wrap = el.parentElement;
    const lab = wrap?.querySelector(":scope > label");
    return norm(lab?.textContent || "");
  }

  function candidateScore(root) {
    if (!root || root.id === "cgweb038Workspace") return -999;
    if (root.closest('[data-cg16-page-panel="directory"]')) return -999;
    if (root.closest(".cgweb037-search-engine")) return -999;

    let score = 0;
    const text = lower(root.textContent);
    const controls = [...root.querySelectorAll("input,textarea,select")];

    if (text.includes("question")) score += 2;
    if (text.includes("réponse") || text.includes("reponse")) score += 2;
    if (text.includes("détail") || text.includes("detail")) score += 1;
    if (text.includes("source")) score += 1;
    if (controls.length >= 3) score += 2;

    const labels = controls.map(labelFor).map(lower).join(" | ");
    if (labels.includes("question")) score += 3;
    if (labels.includes("réponse") || labels.includes("reponse")) score += 3;
    if (labels.includes("thème") || labels.includes("theme")) score += 1;

    return score;
  }

  function visible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function findDetailRoot() {
    const selectors = [
      '[role="dialog"]',
      '.modal',
      '.dialog',
      '[class*="modal"]',
      '[class*="dialog"]',
      '[data-cg16-page-panel]:not([data-cg16-page-panel="directory"])',
      'main section',
      'main .card',
      'main .panel'
    ];

    const seen = new Set();
    const candidates = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el) || !visible(el)) continue;
        seen.add(el);
        const score = candidateScore(el);
        if (score >= 5) candidates.push({ el, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function fieldByNeedles(root, needles) {
    const controls = [...root.querySelectorAll("input,textarea,select")];
    for (const el of controls) {
      const label = lower(labelFor(el));
      const placeholder = lower(el.placeholder);
      if (needles.some((n) => label.includes(n) || placeholder.includes(n))) return el;
    }
    return null;
  }

  function fieldValue(el) {
    if (!el) return "";
    if (el instanceof HTMLSelectElement) {
      return norm(el.selectedOptions?.[0]?.textContent || el.value);
    }
    if (el.type === "checkbox") return el.checked ? "Oui" : "Non";
    return norm(el.value || el.textContent);
  }

  function answerFields(root) {
    return [...root.querySelectorAll("input,textarea")].filter((el) => {
      const label = lower(labelFor(el));
      const ph = lower(el.placeholder);
      return label.includes("réponse") || label.includes("reponse") ||
        ph.includes("réponse") || ph.includes("reponse") ||
        /prop(?:osition)?\s*[1-4]/i.test(label);
    });
  }

  function imageInfo(root) {
    const img = [...root.querySelectorAll("img")].find((i) => {
      const src = String(i.currentSrc || i.src || "");
      return src && !src.startsWith("data:image/svg");
    });
    if (!img) return { present: false, src: "" };
    return { present: true, src: img.currentSrc || img.src || "" };
  }

  function deriveLiveSummary(root, ctx) {
    const questionEl = fieldByNeedles(root, ["question"]);
    const detailEl = fieldByNeedles(root, ["détail", "detail"]);
    const sourceEl = fieldByNeedles(root, ["source"]);
    const themeEl = fieldByNeedles(root, ["thème", "theme"]);
    const megaEl = fieldByNeedles(root, ["mégathème", "megatheme"]);
    const answers = answerFields(root).map(fieldValue).filter(Boolean);
    const image = imageInfo(root);

    return {
      id: ctx?.id || "",
      question: fieldValue(questionEl) || ctx?.question || "",
      detail: fieldValue(detailEl),
      source: fieldValue(sourceEl),
      theme: fieldValue(themeEl) || ctx?.theme || "",
      megatheme: fieldValue(megaEl) || ctx?.megatheme || "",
      answers,
      image
    };
  }

  function chip(label, value) {
    if (!value) return "";
    const safe = String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `<span class="cgweb038-chip"><strong>${label}</strong> ${safe}</span>`;
  }

  function buildWorkspace(root, ctx) {
    let ws = root.querySelector(":scope > #cgweb038Workspace");
    if (ws) return ws;

    ws = document.createElement("section");
    ws.id = "cgweb038Workspace";
    ws.className = "cgweb038-workspace";
    ws.innerHTML = `
      <div class="cgweb038-top">
        <div>
          <div class="cgweb038-kicker">Fiche question</div>
          <h2 id="cgweb038Title">Question</h2>
          <div id="cgweb038Chips" class="cgweb038-chips"></div>
        </div>
        <div class="cgweb038-actions">
          <button type="button" id="cgweb038CopyId">Copier ID</button>
          <button type="button" id="cgweb038Back">Retour au Répertoire</button>
        </div>
      </div>

      <div class="cgweb038-grid">
        <article class="cgweb038-card">
          <h3>Question</h3>
          <div id="cgweb038Question" class="cgweb038-question">—</div>
        </article>
        <article class="cgweb038-card">
          <h3>Réponses</h3>
          <div id="cgweb038Answers" class="cgweb038-answers">—</div>
        </article>
        <article class="cgweb038-card">
          <h3>Détail / source</h3>
          <div id="cgweb038Detail">—</div>
          <div id="cgweb038Source" class="cgweb038-source"></div>
        </article>
        <article class="cgweb038-card">
          <h3>Image</h3>
          <div id="cgweb038Image">—</div>
        </article>
      </div>

      <div class="cgweb038-note">
        Les champs ci-dessus sont une synthèse de la fiche actuellement ouverte. L'éditeur existant reste la source de vérité et continue de fonctionner normalement sous ce bandeau.
      </div>`;

    root.insertBefore(ws, root.firstChild);

    ws.querySelector("#cgweb038Back")?.addEventListener("click", () => {
      const dirButton = document.querySelector('button[data-cg16-page="directory"]');
      if (dirButton) dirButton.click();
      else history.back();
      clearCtx();
    });

    ws.querySelector("#cgweb038CopyId")?.addEventListener("click", async () => {
      const id = loadCtx()?.id || "";
      if (!id) return;
      try {
        await navigator.clipboard.writeText(id);
        const b = ws.querySelector("#cgweb038CopyId");
        const old = b.textContent;
        b.textContent = "ID copié";
        setTimeout(() => { b.textContent = old; }, 1200);
      } catch (_) {}
    });

    return ws;
  }

  function renderWorkspace(root, ctx) {
    const ws = buildWorkspace(root, ctx);
    const live = deriveLiveSummary(root, ctx);

    ws.querySelector("#cgweb038Title").textContent =
      live.question || ctx?.question || "Question";

    ws.querySelector("#cgweb038Chips").innerHTML = [
      chip("ID", live.id),
      chip("Mégathème", live.megatheme),
      chip("Thème", live.theme)
    ].join("");

    ws.querySelector("#cgweb038Question").textContent = live.question || "—";

    const answersHost = ws.querySelector("#cgweb038Answers");
    answersHost.innerHTML = "";
    if (live.answers.length) {
      const ol = document.createElement("ol");
      for (const a of live.answers) {
        const li = document.createElement("li");
        li.textContent = a;
        ol.appendChild(li);
      }
      answersHost.appendChild(ol);
    } else {
      answersHost.textContent = "Réponses non exposées dans cette vue.";
    }

    ws.querySelector("#cgweb038Detail").textContent = live.detail || "—";
    ws.querySelector("#cgweb038Source").textContent = live.source ? `Source : ${live.source}` : "";

    const imageHost = ws.querySelector("#cgweb038Image");
    imageHost.innerHTML = "";
    if (live.image.present) {
      const img = document.createElement("img");
      img.src = live.image.src;
      img.alt = "";
      img.className = "cgweb038-preview-image";
      imageHost.appendChild(img);
    } else {
      imageHost.textContent = "Aucune image visible dans la fiche.";
    }

    state.injectedInto = root;
    state.active = true;
  }

  function scheduleWorkspaceRender(root, ctx) {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      if (root?.isConnected) renderWorkspace(root, ctx || loadCtx());
    }, 120);
  }

  function wireDetailRoot(root, ctx) {
    if (state.wiredRoot === root) return;
    state.wiredRoot = root;

    const refreshFromEditor = (ev) => {
      if (ev.target?.closest?.("#cgweb038Workspace")) return;
      scheduleWorkspaceRender(root, ctx);
    };
    root.addEventListener("input", refreshFromEditor, true);
    root.addEventListener("change", refreshFromEditor, true);
  }

  function waitForDetail(ctx) {
    let attempts = 0;
    const maxAttempts = 80;

    const tick = () => {
      attempts++;
      const root = findDetailRoot();
      if (root) {
        renderWorkspace(root, ctx);
        wireDetailRoot(root, ctx);

        if (state.observer) state.observer.disconnect();
        state.observer = new MutationObserver((mutations) => {
          const relevant = mutations.some((m) => {
            if (m.target?.closest?.("#cgweb038Workspace")) return false;
            return [...m.addedNodes].some((n) => {
              if (n.nodeType !== 1) return false;
              if (n.matches?.("#cgweb038Workspace")) return false;
              if (n.closest?.("#cgweb038Workspace")) return false;
              return true;
            });
          });
          if (relevant) scheduleWorkspaceRender(root, loadCtx());
        });
        state.observer.observe(root, {
          childList: true,
          subtree: true
        });
        return;
      }
      if (attempts < maxAttempts) setTimeout(tick, 150);
    };
    tick();
  }

  document.addEventListener("click", (ev) => {
    const button = ev.target.closest("button");
    if (!isWorkspaceOpenButton(button)) return;

    const ctx = captureRowContext(button);
    if (!ctx) return;
    saveCtx(ctx);

    // Do not prevent the existing open behaviour.
    setTimeout(() => waitForDetail(ctx), 50);
  }, true);

  // If the page was already opened before CGWEB038 loaded, try to restore context.
  const existing = loadCtx();
  if (existing) setTimeout(() => waitForDetail(existing), 500);

  window.CGWEB038 = {
    version: VERSION,
    state,
    context: () => loadCtx(),
    refresh() {
      const root = state.injectedInto || findDetailRoot();
      if (root) renderWorkspace(root, loadCtx());
    }
  };
})();

