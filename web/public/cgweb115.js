/* ============================================================
   CGWEB115 FIX2
   NAV_REMOVE002 / BACKUP_REHOME002
   CREATE_WIDTH_BALANCE003 / CUSTOM_SELECT001
   ============================================================ */

(() => {
  "use strict";

  const LETTER_TO_NUMBER = {
    A:"1",
    B:"2",
    C:"3",
    D:"4"
  };

  const NUMBER_TO_LETTER = {
    "1":"A",
    "2":"B",
    "3":"C",
    "4":"D"
  };


  /* ----------------------------------------------------------
     OUTILS
     ---------------------------------------------------------- */

  function fieldLabel(el) {
    return el?.closest("label") || null;
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g," ")
      .trim()
      .toLowerCase();
  }

  function normalizeAnswerDisplay(value) {
    const raw=String(value || "").trim().toUpperCase();

    if (NUMBER_TO_LETTER[raw]) {
      return NUMBER_TO_LETTER[raw];
    }

    if (LETTER_TO_NUMBER[raw]) {
      return raw;
    }

    return "";
  }


  /* ----------------------------------------------------------
     STATUT TECHNIQUE
     ---------------------------------------------------------- */

  function ensureStatusSelect(oldField) {
    if (!oldField) return null;

    if (oldField.tagName === "SELECT") {
      return oldField;
    }

    const select=document.createElement("select");
    select.id="cg16CreateStatus";
    select.name=oldField.name || "";
    select.setAttribute("aria-label","Statut");

    [
      ["",""],
      ["A","A"],
      ["R","R"],
      ["P","P"],
      ["T","T"]
    ].forEach(([value,label]) => {
      const option=document.createElement("option");
      option.value=value;
      option.textContent=label;
      select.appendChild(option);
    });

    const current=String(oldField.value || "").trim();

    if (["A","R","P","T"].includes(current)) {
      select.value=current;
    }

    oldField.replaceWith(select);

    return select;
  }


  /* ----------------------------------------------------------
     CUSTOM SELECT 100 % COMFORTAA
     ---------------------------------------------------------- */

  function installCustomSelect(select) {
    if (!select) return null;

    if (select.dataset.cg115Custom === "1") {
      return select.nextElementSibling;
    }

    select.dataset.cg115Custom="1";
    select.classList.add("cg115-native-select");

    const root=document.createElement("div");
    root.className="cg115-select";

    const button=document.createElement("button");
    button.type="button";
    button.className="cg115-select-button";
    button.setAttribute("aria-haspopup","listbox");
    button.setAttribute("aria-expanded","false");

    const menu=document.createElement("div");
    menu.className="cg115-select-menu";
    menu.setAttribute("role","listbox");

    function selectedLabel() {
      const option=select.options[select.selectedIndex];
      return option ? option.textContent : "";
    }

    function sync() {
      button.textContent=selectedLabel();

      menu.querySelectorAll(".cg115-select-option")
        .forEach(item => {
          item.classList.toggle(
            "active",
            item.dataset.value === select.value
          );
        });
    }

    [...select.options].forEach(option => {
      const item=document.createElement("button");
      item.type="button";
      item.className="cg115-select-option";
      item.dataset.value=option.value;
      item.textContent=option.textContent || " ";

      item.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        select.value=item.dataset.value;
        select.dispatchEvent(
          new Event("change",{bubbles:true})
        );

        sync();

        root.classList.remove("open");
        button.setAttribute("aria-expanded","false");
      });

      menu.appendChild(item);
    });

    button.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();

      document
        .querySelectorAll(".cg115-select.open")
        .forEach(other => {
          if (other !== root) {
            other.classList.remove("open");
            other
              .querySelector(".cg115-select-button")
              ?.setAttribute("aria-expanded","false");
          }
        });

      const open=!root.classList.contains("open");

      root.classList.toggle("open",open);
      button.setAttribute(
        "aria-expanded",
        open ? "true" : "false"
      );
    });

    select.addEventListener("change",sync);

    root.appendChild(button);
    root.appendChild(menu);

    select.insertAdjacentElement("afterend",root);

    sync();

    root.cg115Sync=sync;

    return root;
  }


  /* ----------------------------------------------------------
     BONNE REPONSE : A / B / C / D
     ---------------------------------------------------------- */

  function ensureCorrectInput(oldField) {
    if (!oldField) return null;

    if (oldField.tagName === "INPUT") {
      oldField.placeholder="A, B, C, D";
      oldField.value=normalizeAnswerDisplay(oldField.value);
      oldField.maxLength=1;
      return oldField;
    }

    const input=document.createElement("input");

    input.id="cg16CreateCorrect";
    input.name=oldField.name || "";
    input.type="text";
    input.autocomplete="off";
    input.maxLength=1;
    input.placeholder="A, B, C, D";
    input.setAttribute("aria-label","Bonne réponse");

    input.value=normalizeAnswerDisplay(oldField.value);

    oldField.replaceWith(input);

    return input;
  }


  /* ----------------------------------------------------------
     CREATION DE QUESTIONS
     ---------------------------------------------------------- */

  function installCreateForm() {
    const form=document.getElementById("cg16CreateForm");

    if (!form) return false;

    const identityRow=form.querySelector(".cg112-row-identity");

    const idInput=
      document.getElementById("cg16CreateId");

    const mega=
      document.getElementById("cg16CreateMega");

    const imageInput=
      document.getElementById("cg16CreateImage");

    let status=
      document.getElementById("cg16CreateStatus");

    let correct=
      document.getElementById("cg16CreateCorrect");

    if (
      !identityRow ||
      !mega ||
      !imageInput ||
      !status ||
      !correct
    ) {
      return false;
    }


    /* ID automatique uniquement */
    if (idInput) {
      idInput.value="";
      idInput.type="hidden";
      idInput.tabIndex=-1;
      idInput.removeAttribute("placeholder");
    }


    /* Image sur première ligne */
    const imageLabel=fieldLabel(imageInput);

    if (
      imageLabel &&
      imageLabel.parentElement !== identityRow
    ) {
      identityRow.appendChild(imageLabel);
    }

    imageLabel
      ?.querySelectorAll("small")
      .forEach(el => el.remove());


    /* Statut sur première ligne */
    status=ensureStatusSelect(status);

    const statusLabel=fieldLabel(status);

    if (
      statusLabel &&
      statusLabel.parentElement !== identityRow
    ) {
      identityRow.appendChild(statusLabel);
    }


    /* Menus visuels Comfortaa */
    installCustomSelect(mega);
    installCustomSelect(status);


    /* Bonne réponse */
    correct=ensureCorrectInput(correct);

    if (!correct.dataset.cg115InputHook) {
      correct.addEventListener("input",() => {
        let raw=
          String(correct.value || "")
            .toUpperCase()
            .replace(/[^ABCD1234]/g,"");

        if (raw.length > 1) {
          raw=raw.slice(0,1);
        }

        correct.value=normalizeAnswerDisplay(raw);
      });

      correct.dataset.cg115InputHook="1";
    }


    /*
      Le moteur historique attend toujours 1/2/3/4.
      Conversion seulement au moment exact du submit.
    */
    if (!form.dataset.cg115SubmitHook) {
      form.addEventListener(
        "submit",
        () => {
          const answer=
            document.getElementById("cg16CreateCorrect");

          if (!answer) return;

          const raw=
            String(answer.value || "")
              .trim()
              .toUpperCase();

          if (LETTER_TO_NUMBER[raw]) {
            answer.value=LETTER_TO_NUMBER[raw];
          }
        },
        true
      );

      form.dataset.cg115SubmitHook="1";
    }


    /*
      Après Réinitialiser, resynchroniser les deux menus visuels.
    */
    const reset=
      document.getElementById("cg16CreateReset");

    if (reset && !reset.dataset.cg115Hook) {
      reset.addEventListener("click",() => {
        setTimeout(() => {
          document
            .querySelectorAll(".cg115-select")
            .forEach(el => el.cg115Sync?.());

          const answer=
            document.getElementById("cg16CreateCorrect");

          if (answer) {
            answer.value=
              normalizeAnswerDisplay(answer.value);
          }
        },0);
      });

      reset.dataset.cg115Hook="1";
    }

    form.dataset.cgweb115="fix2";

    return true;
  }


  /* ----------------------------------------------------------
     SUPPRESSION DES BLOCS APPRENTISSAGE
     ---------------------------------------------------------- */

  function removeLearningCards() {
    const root=
      document.getElementById("cg16PageLearning");

    if (!root) return false;

    const targets=new Set([
      "file d'apprentissage",
      "file d’apprentissage",
      "plan de revision",
      "plan de révision"
    ]);

    let removed=false;

    root
      .querySelectorAll("h1,h2,h3,h4")
      .forEach(title => {
        const text=normalizeText(title.textContent);

        if (!targets.has(text)) {
          return;
        }

        const block=
          title.closest("section") ||
          title.closest("article") ||
          title.parentElement?.parentElement ||
          title.parentElement;

        if (
          block &&
          block !== root &&
          block.parentElement
        ) {
          block.remove();
          removed=true;
        }
      });

    return removed;
  }


  /* ----------------------------------------------------------
     SUPPRESSION DE PARAMETRES
     ---------------------------------------------------------- */

  function removeSettingsNavigation() {
    /*
      La roue dentée est réellement retirée du DOM.
      Plus simplement masquée.
    */
    document
      .querySelectorAll('[data-cg16-page="more"]')
      .forEach(el => el.remove());

    /*
      L'ancien sous-menu complet disparaît.
    */
    const secondary=
      document.getElementById("cg16SecondaryNav");

    if (secondary) {
      secondary.remove();
    }

    return true;
  }


  /* ----------------------------------------------------------
     SAUVEGARDES JUSTE APRES EXPORTER CSV
     ---------------------------------------------------------- */

  function installDirectoryBackupButton() {
    /*
      Supprime l'ancien bouton installé au-dessus du Répertoire.
    */
    document
      .getElementById("cg115DirectoryTools")
      ?.remove();

    const exportButton=
      document.getElementById("cgweb109ExportCsv");

    if (!exportButton) {
      return false;
    }

    let button=
      document.getElementById("cg115OpenBackup");

    if (!button) {
      button=document.createElement("button");

      button.id="cg115OpenBackup";
      button.type="button";
      button.className="cg18-btn";
      button.textContent="Sauvegardes";

      button.addEventListener("click",() => {
        window.CGWEB016_API
          ?.navigatePlus
          ?.("backup");
      });
    }

    /*
      Emplacement exact demandé :
      immédiatement à droite de Exporter CSV.
    */
    if (
      exportButton.nextElementSibling !== button
    ) {
      exportButton.insertAdjacentElement(
        "afterend",
        button
      );
    }

    return true;
  }


  /* ----------------------------------------------------------
     FERMETURE DES MENUS CUSTOM AU CLIC EXTERIEUR
     ---------------------------------------------------------- */

  document.addEventListener("click",() => {
    document
      .querySelectorAll(".cg115-select.open")
      .forEach(root => {
        root.classList.remove("open");

        root
          .querySelector(".cg115-select-button")
          ?.setAttribute("aria-expanded","false");
      });
  });


  /* ----------------------------------------------------------
     INSTALLATION
     ---------------------------------------------------------- */

  function install() {
    removeSettingsNavigation();
    installCreateForm();
    removeLearningCards();
    installDirectoryBackupButton();
  }

  function start() {
    install();

    const observer=
      new MutationObserver(() => install());

    observer.observe(
      document.documentElement,
      {
        childList:true,
        subtree:true
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {once:true}
    );
  } else {
    start();
  }

})();
