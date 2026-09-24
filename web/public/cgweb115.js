/* ============================================================
   CGWEB115 FIX1
   HISTORY_CLEANUP002 / CREATE_FORM_TIGHTEN002 / NAV_PRUNE001
   ============================================================ */

(() => {
  "use strict";

  const LETTER_TO_NUMBER = { A: "1", B: "2", C: "3", D: "4" };
  const NUMBER_TO_LETTER = { "1": "A", "2": "B", "3": "C", "4": "D" };

  function fieldLabel(el) {
    return el?.closest("label") || null;
  }

  function normalizeAnswerDisplay(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (NUMBER_TO_LETTER[raw]) return NUMBER_TO_LETTER[raw];
    if (LETTER_TO_NUMBER[raw]) return raw;
    return "";
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function replaceStatusWithSelect(statusOld) {
    if (!statusOld) return null;
    if (statusOld.tagName === "SELECT") return statusOld;

    const statusSelect = document.createElement("select");
    statusSelect.id = "cg16CreateStatus";
    statusSelect.name = statusOld.name || "";
    statusSelect.setAttribute("aria-label", "Statut");

    const currentValue = String(statusOld.value || "").trim();

    [
      ["", ""],
      ["A", "A"],
      ["R", "R"],
      ["P", "P"],
      ["T", "T"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusSelect.appendChild(option);
    });

    if (["A","R","P","T"].includes(currentValue)) {
      statusSelect.value = currentValue;
    }

    statusOld.replaceWith(statusSelect);
    return statusSelect;
  }

  function replaceCorrectWithLetterInput(correctOld) {
    if (!correctOld) return null;

    if (correctOld.tagName === "INPUT") {
      correctOld.placeholder = "A, B, C, D";
      correctOld.value = normalizeAnswerDisplay(correctOld.value);
      return correctOld;
    }

    const correctInput = document.createElement("input");
    correctInput.id = "cg16CreateCorrect";
    correctInput.name = correctOld.name || "";
    correctInput.type = "text";
    correctInput.autocomplete = "off";
    correctInput.maxLength = 1;
    correctInput.placeholder = "A, B, C, D";
    correctInput.setAttribute("aria-label", "Bonne réponse");
    correctInput.value = normalizeAnswerDisplay(correctOld.value);

    correctInput.addEventListener("input", () => {
      let raw = String(correctInput.value || "").toUpperCase().replace(/[^ABCD1234]/g, "");
      if (raw.length > 1) raw = raw.slice(0, 1);
      correctInput.value = normalizeAnswerDisplay(raw);
    });

    correctOld.replaceWith(correctInput);
    return correctInput;
  }

  function installCreateForm() {
    const form = document.getElementById("cg16CreateForm");
    if (!form) return false;

    const identityRow = form.querySelector(".cg112-row-identity");
    const idInput = document.getElementById("cg16CreateId");
    const imageInput = document.getElementById("cg16CreateImage");
    let statusField = document.getElementById("cg16CreateStatus");
    let correctField = document.getElementById("cg16CreateCorrect");

    if (!identityRow || !imageInput || !statusField || !correctField) return false;

    if (idInput) {
      idInput.value = "";
      idInput.setAttribute("type", "hidden");
      idInput.removeAttribute("placeholder");
      idInput.tabIndex = -1;
    }

    const imageLabel = fieldLabel(imageInput);
    if (imageLabel && imageLabel.parentElement !== identityRow) {
      identityRow.appendChild(imageLabel);
    }
    imageLabel?.querySelectorAll("small").forEach(el => el.remove());

    statusField = replaceStatusWithSelect(statusField);
    const statusLabel = fieldLabel(statusField);
    if (statusLabel && statusLabel.parentElement !== identityRow) {
      identityRow.appendChild(statusLabel);
    }

    correctField = replaceCorrectWithLetterInput(correctField);

    if (!form.dataset.cgweb115SubmitHook) {
      form.addEventListener("submit", () => {
        const correct = document.getElementById("cg16CreateCorrect");
        if (!correct) return;
        const raw = String(correct.value || "").trim().toUpperCase();
        if (LETTER_TO_NUMBER[raw]) {
          correct.value = LETTER_TO_NUMBER[raw];
        }
      }, true);

      form.dataset.cgweb115SubmitHook = "1";
    }

    form.dataset.cgweb115 = "fix1";
    return true;
  }

  function removeLearningCards() {
    const root = document.getElementById("cg16PageLearning") || document;
    if (!root || root.dataset.cgweb115LearningPruned === "1") return false;

    const targets = new Set([
      "file d'apprentissage",
      "file d’apprentissage",
      "plan de revision",
      "plan de révision"
    ]);

    let removed = 0;

    root.querySelectorAll("h1,h2,h3,h4").forEach(title => {
      const text = normalizeText(title.textContent);
      if (!targets.has(text)) return;

      let block =
        title.closest("section") ||
        title.closest("article") ||
        title.parentElement?.parentElement ||
        title.parentElement;

      if (block && block !== root && block.parentElement) {
        block.remove();
        removed += 1;
      }
    });

    if (removed > 0) {
      root.dataset.cgweb115LearningPruned = "1";
    }

    return removed > 0;
  }

  function installDirectoryBackupButton() {
    const directoryPage = document.getElementById("cg16PageDirectory");
    const directoryMount = document.getElementById("cg16DirectoryMount");
    if (!directoryPage || !directoryMount) return false;
    if (document.getElementById("cg115DirectoryTools")) return true;

    const tools = document.createElement("div");
    tools.id = "cg115DirectoryTools";
    tools.className = "cg115-directory-tools";
    tools.innerHTML = `
      <button type="button" id="cg115OpenBackup">Sauvegardes</button>
    `;

    directoryMount.parentElement.insertBefore(tools, directoryMount);

    tools.querySelector("#cg115OpenBackup")?.addEventListener("click", () => {
      if (window.CGWEB016_API?.navigatePlus) {
        window.CGWEB016_API.navigatePlus("backup");
      }
    });

    return true;
  }

  function install() {
    installCreateForm();
    removeLearningCards();
    installDirectoryBackupButton();
  }

  let obs;
  function startObserver() {
    install();
    obs = new MutationObserver(() => install());
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
