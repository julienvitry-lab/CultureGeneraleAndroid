(() => {
  const MARK = "CGWEB116 FIX3";

  function norm(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function commonAncestor(a, b) {
    if (!a || !b) return null;
    let current = a;
    while (current) {
      if (current.contains(b)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function findButtonsByExactText(texts) {
    const wanted = texts.map(norm);
    return [...document.querySelectorAll("button, a, [role='tab']")]
      .filter(el => wanted.includes(norm(el.textContent)));
  }

  function smallestContainer(predicate) {
    const candidates = [...document.querySelectorAll("section, article, form, div")]
      .filter(el => predicate(el));

    if (!candidates.length) return null;

    candidates.sort((a, b) =>
      a.querySelectorAll("*").length - b.querySelectorAll("*").length
    );

    return candidates[0];
  }

  function getSingleImportPanel() {
    return smallestContainer(el => {
      const t = norm(el.textContent);
      return (
        t.includes("adresse quizypedia") &&
        (el.querySelector("#cgimp2Analyze") || t.includes("analyser"))
      );
    });
  }

  function getMultiImportPanel() {
    return smallestContainer(el => {
      const t = norm(el.textContent);
      return (
        t.includes("voir la file dimport") &&
        (
          t.includes("effacer la liste") ||
          t.includes("actualiser")
        )
      );
    });
  }

  function getQuizSubtabBar() {
    const buttons = findButtonsByExactText([
      "URL unique",
      "Plusieurs URL - CSV / ODS"
    ]);

    if (buttons.length < 2) return null;

    let parent = commonAncestor(buttons[0], buttons[1]);
    if (!parent) return null;

    return parent;
  }

  function ensureQuizypediaStack() {
    const single = getSingleImportPanel();
    const multi = getMultiImportPanel();

    if (!single || !multi) return;

    const subtabBar = getQuizSubtabBar();
    if (subtabBar) {
      subtabBar.classList.add("cg116fix3-hidden");
    }

    let wrapper = document.querySelector(".cg116fix3-quiz-stack");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "cg116fix3-quiz-stack";

      if (subtabBar && subtabBar.parentElement) {
        subtabBar.insertAdjacentElement("afterend", wrapper);
      } else if (single.parentElement) {
        single.parentElement.insertBefore(wrapper, single);
      }
    }

    [single, multi].forEach(panel => {
      panel.hidden = false;
      panel.style.display = "";
      panel.removeAttribute("hidden");
      panel.classList.add("cg116fix3-panel");

      if (panel.parentElement !== wrapper) {
        wrapper.appendChild(panel);
      }
    });
  }

  function ensureAuthButtonsSportWebStyle() {
    const connectedEls = [...document.querySelectorAll("button, a")]
      .filter(el => norm(el.textContent) === "connecte");

    const disconnectEls = [...document.querySelectorAll("button, a")]
      .filter(el => norm(el.textContent) === "deconnexion");

    connectedEls.forEach(el => {
      el.classList.add(
        "cg116fix3-auth-btn",
        "cg116fix3-auth-connected"
      );

      const parent = el.parentElement;
      if (parent) parent.classList.add("cg116fix3-auth-wrap");
    });

    disconnectEls.forEach(el => {
      el.classList.add(
        "cg116fix3-auth-btn",
        "cg116fix3-auth-disconnect"
      );

      const parent = el.parentElement;
      if (parent) parent.classList.add("cg116fix3-auth-wrap");
    });
  }

  function runFix3() {
    ensureQuizypediaStack();
    ensureAuthButtonsSportWebStyle();
  }

  let scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runFix3();
    });
  }

  document.addEventListener("DOMContentLoaded", runFix3);
  window.addEventListener("load", runFix3);

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  console.info(MARK, "prêt");
})();
