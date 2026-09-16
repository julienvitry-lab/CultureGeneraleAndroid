(() => {
  "use strict";

  const VERSION = "ACCESSIBILITY001";
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function visible(el) {
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }
  function installSkipLink() {
    if (document.getElementById("cgweb051Skip")) return;
    const main = document.querySelector("main") || document.querySelector("[role=main]");
    if (!main) return;
    if (!main.id) main.id = "cgwebMain";
    const a = document.createElement("a");
    a.id = "cgweb051Skip";
    a.className = "cgweb051-skip";
    a.href = `#${main.id}`;
    a.textContent = "Aller au contenu";
    document.body.prepend(a);
  }
  function labelButtons() {
    document.querySelectorAll("button").forEach((b) => {
      if (b.hasAttribute("aria-label") || b.hasAttribute("title")) return;
      const text = norm(b.textContent);
      if (text) b.title = text;
    });
  }
  function markCurrentNav() {
    const current = [...document.querySelectorAll("[data-cg16-page-panel]")].find(visible)?.dataset?.cg16PagePanel;
    document.querySelectorAll("button[data-cg16-page]").forEach((b) => {
      if (b.dataset.cg16Page === current) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }
  function improveTables() {
    document.querySelectorAll(".cgweb044-table-wrap").forEach((wrap) => {
      if (!wrap.hasAttribute("tabindex")) wrap.tabIndex = 0;
      if (!wrap.hasAttribute("role")) wrap.setAttribute("role", "region");
      if (!wrap.hasAttribute("aria-label")) wrap.setAttribute("aria-label", "Tableau défilable");
    });
  }
  function refresh() {
    installSkipLink();
    labelButtons();
    markCurrentNav();
    improveTables();
  }

  document.addEventListener("click", () => setTimeout(markCurrentNav, 0), true);

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }).observe(document.body, { childList: true, subtree: true });

  refresh();
  window.CGWEB051 = { version: VERSION, refresh };
})();
