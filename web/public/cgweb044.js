(() => {
  "use strict";

  const VERSION = "UX_POLISH001";
  const STORAGE_KEY = "cgweb044.ui_state.v1";

  const rt = {
    initialized: false,
    observer: null,
    refreshTimer: null
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");

  function readState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function writeState(patch) {
    try {
      const next = { ...readState(), ...patch, savedAt: Date.now() };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function isTechnicalMarkerText(text) {
    const t = norm(text);
    if (!t || t.length > 90) return false;

    // Standalone development labels only. Never hide normal prose containing those tokens.
    return /^(?:CG(?:WEB|IMPORT|IMAGE|HISTORY|LEARN|PLAY|STATS|QUALITY|DIAG|ANDROID)\d{3,}|WEB\d{3,}|CGSYNC\d+|REPERE\d+)(?:\s*[·._\-:]\s*[A-Z0-9_ .-]+)?(?:\s+ACTIF(?:S)?)?$/i.test(t);
  }

  function hideTechnicalMarkers(root = document) {
    const selector = "small,.kicker,.eyebrow,.subtitle,.meta,.label,div,span,p";
    for (const el of root.querySelectorAll(selector)) {
      if (el.dataset.cgweb044Checked === "1") continue;
      el.dataset.cgweb044Checked = "1";

      if (el.closest("button,a,input,select,textarea,option,pre,code")) continue;
      if (el.children.length > 0) continue;

      const text = norm(el.textContent);
      if (!isTechnicalMarkerText(text)) continue;

      el.dataset.cgweb044Technical = "1";
      el.hidden = true;
      el.style.display = "none";
    }
  }

  function tagPrimaryNav() {
    const buttons = [...document.querySelectorAll("button[data-cg16-page]")];
    if (!buttons.length) return;

    const parent = buttons[0].parentElement;
    if (parent && buttons.every((b) => b.parentElement === parent)) {
      parent.classList.add("cgweb044-primary-nav");
      for (const b of buttons) b.classList.add("cgweb044-primary-nav-button");
    }
  }

  function tagPlusNav() {
    const plusPanel = document.querySelector('[data-cg16-page-panel="more"]');
    if (!plusPanel) return;

    plusPanel.classList.add("cgweb044-plus-panel");

    const buttons = [...plusPanel.querySelectorAll("button")].filter((b) =>
      !b.closest("[data-cg16-plus-panel]") &&
      !b.closest("#cgweb041Panel") &&
      !b.closest("#cgweb039Modal")
    );

    for (const b of buttons) {
      const txt = norm(b.textContent);
      if (!txt) continue;
      b.classList.add("cgweb044-plus-button");
    }

    // Label groups already visible in Plus become proper visual sections.
    for (const el of plusPanel.querySelectorAll("div,section,p,span")) {
      if (el.children.length > 0) continue;
      const t = lower(el.textContent);
      if (["pages","qualité","qualite","contenu et médias","contenu et medias","données","donnees","système","systeme","outils et maintenance"].includes(t)) {
        el.classList.add("cgweb044-plus-group-title");
      }
    }
  }

  function tagLearningTabs() {
    const learning = document.querySelector('[data-cg16-page-panel="learning"]');
    if (!learning) return;

    const difficulty = [...learning.querySelectorAll("button")].find((b) => lower(b.textContent) === "difficulté");
    if (!difficulty?.parentElement) return;

    const parent = difficulty.parentElement;
    const texts = [...parent.querySelectorAll("button")].map((b) => lower(b.textContent));
    if (!texts.includes("historique") || !texts.includes("maîtrise")) return;

    parent.classList.add("cgweb044-learning-tabs");
    parent.querySelectorAll("button").forEach((b) => b.classList.add("cgweb044-learning-tab"));
  }

  function tagActionRows() {
    const selectors = [
      "#cgweb037Tools .cgweb037-queryline",
      "#cgweb038Workspace .cgweb038-actions",
      "#cgweb039Toolbar .cgweb039-actions",
      "#cgweb040ControlCenter .cgweb040-actions",
      "#cgweb041Panel .cgweb041-tools",
      "#cgweb042Analysis .cgweb042-domain-actions"
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => el.classList.add("cgweb044-action-row"));
    }
  }

  function normalizeHeadings() {
    document.querySelectorAll("h1,h2,h3").forEach((h) => {
      if (!norm(h.textContent)) return;
      h.classList.add("cgweb044-heading");
    });
  }

  function rememberClicks() {
    document.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;

      if (b.dataset.cg16Page) {
        writeState({ page: b.dataset.cg16Page });
        return;
      }
      if (b.dataset.cg16Plus) {
        writeState({ plus: b.dataset.cg16Plus });
        return;
      }

      const learning = b.closest(".cgweb044-learning-tabs");
      if (learning) {
        writeState({ learning: norm(b.textContent) });
      }
    }, true);
  }

  function restoreState() {
    const s = readState();

    if (s.page) {
      const b = document.querySelector(`button[data-cg16-page="${CSS.escape(String(s.page))}"]`);
      if (b && !b.disabled) {
        setTimeout(() => b.click(), 120);
      }
    }

    if (s.page === "learning" && s.learning) {
      setTimeout(() => {
        const learning = document.querySelector('[data-cg16-page-panel="learning"]');
        const b = [...(learning?.querySelectorAll("button") || [])]
          .find((x) => norm(x.textContent) === s.learning);
        if (b && !b.disabled) b.click();
      }, 500);
    }

    if (s.page === "more" && s.plus) {
      setTimeout(() => {
        const b = document.querySelector(`button[data-cg16-plus="${CSS.escape(String(s.plus))}"]`);
        if (b && !b.disabled) b.click();
      }, 500);
    }
  }

  function markResponsiveTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.dataset.cgweb044Table === "1") return;
      table.dataset.cgweb044Table = "1";
      const wrap = table.parentElement;
      if (wrap) wrap.classList.add("cgweb044-table-wrap");
    });
  }

  function polish() {
    hideTechnicalMarkers();
    tagPrimaryNav();
    tagPlusNav();
    tagLearningTabs();
    tagActionRows();
    normalizeHeadings();
    markResponsiveTables();
  }

  function schedulePolish() {
    clearTimeout(rt.refreshTimer);
    rt.refreshTimer = setTimeout(polish, 100);
  }

  function boot() {
    if (rt.initialized) return;
    rt.initialized = true;

    document.documentElement.dataset.cgweb044 = VERSION;

    polish();
    rememberClicks();

    // Restore only within the current tab/session. It never changes user data.
    restoreState();

    rt.observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => m.addedNodes.length > 0);
      if (relevant) schedulePolish();
    });
    rt.observer.observe(document.body, { childList: true, subtree: true });

    window.CGWEB044 = {
      version: VERSION,
      refresh: polish,
      state: readState
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

