/* ============================================================
   CGWEB115
   CREATE_FORM_REWORK001 / HISTORY_CLEANUP001
   ============================================================ */

(() => {
  "use strict";

  const VERSION = "CGWEB115";

  function fieldLabel(el) {
    return el?.closest("label") || null;
  }

  function installCreateForm() {
    const form = document.getElementById("cg16CreateForm");
    if (!form || form.dataset.cgweb115 === "1") return false;

    const identityRow = form.querySelector(".cg112-row-identity");
    const mediaRow = form.querySelector(".cg112-row-media");

    const idInput = document.getElementById("cg16CreateId");
    const imageInput = document.getElementById("cg16CreateImage");
    const statusOld = document.getElementById("cg16CreateStatus");
    const correctOld = document.getElementById("cg16CreateCorrect");

    if (!identityRow || !imageInput || !statusOld || !correctOld) {
      return false;
    }


    /* --------------------------------------------------------
       1. ID automatique
       -------------------------------------------------------- */

    if (idInput) {
      /*
       * On ne détruit volontairement PAS le contrôle :
       * createQuestion() dans CGWEB016 le connaît encore.
       * Il reste donc vide et invisible.
       */
      idInput.value = "";
      idInput.setAttribute("type", "hidden");
      idInput.removeAttribute("placeholder");
      idInput.tabIndex = -1;
    }


    /* --------------------------------------------------------
       2. Image sur la première ligne
       -------------------------------------------------------- */

    const imageLabel = fieldLabel(imageInput);
    if (imageLabel && imageLabel.parentElement !== identityRow) {
      identityRow.appendChild(imageLabel);
    }

    imageLabel?.querySelectorAll("small").forEach(el => el.remove());


    /* --------------------------------------------------------
       3. Statut -> menu A/R/P/T
       -------------------------------------------------------- */

    let statusSelect;

    if (statusOld.tagName === "SELECT") {
      statusSelect = statusOld;
    } else {
      statusSelect = document.createElement("select");
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
    }

    const statusLabel = fieldLabel(statusSelect);
    if (statusLabel && statusLabel.parentElement !== identityRow) {
      identityRow.appendChild(statusLabel);
    }


    /* --------------------------------------------------------
       4. Bonne réponse -> saisie simple
       --------------------------------------------------------

       Le schéma historique stocke correct_index sous forme numérique.
       On conserve donc 1 / 2 / 3 / 4 :
         1 = A
         2 = B
         3 = C
         4 = D

       Pas de menu déroulant.
       -------------------------------------------------------- */

    if (correctOld.tagName === "SELECT") {
      const correctInput = document.createElement("input");

      correctInput.id = "cg16CreateCorrect";
      correctInput.name = correctOld.name || "";
      correctInput.type = "text";
      correctInput.inputMode = "numeric";
      correctInput.maxLength = 1;
      correctInput.autocomplete = "off";
      correctInput.placeholder = "1–4";
      correctInput.setAttribute("aria-label", "Bonne réponse");
      correctInput.value = correctOld.value || "";

      /*
       * Nettoyage léger de saisie :
       * seules les valeurs 1 à 4 sont conservées.
       */
      correctInput.addEventListener("input", () => {
        let v = correctInput.value.replace(/[^1-4]/g, "");
        if (v.length > 1) v = v.slice(0,1);
        correctInput.value = v;
      });

      correctOld.replaceWith(correctInput);
    }


    /* --------------------------------------------------------
       5. Ligne média devenue vide
       -------------------------------------------------------- */

    if (mediaRow) {
      const usefulChildren = [...mediaRow.children]
        .filter(el => el.offsetParent !== null);

      if (!usefulChildren.length || !mediaRow.textContent.trim()) {
        mediaRow.style.display = "none";
      }
    }


    form.dataset.cgweb115 = "1";
    document.documentElement.dataset.cgweb115 = "active";

    console.info(
      VERSION,
      "CREATE_FORM_REWORK001 installé"
    );

    return true;
  }


  function install() {
    if (installCreateForm()) return;

    const observer = new MutationObserver(() => {
      if (installCreateForm()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      childList:true,
      subtree:true
    });

    setTimeout(() => observer.disconnect(), 30000);
  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once:true });
  } else {
    install();
  }
})();
