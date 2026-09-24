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

/* ============================================================
   CGWEB115 FIX3
   TABS_EQUAL001 / HISTORY_RESULT_COMPACT001
   SELECT_TRIANGLE002 / CSV_ODS_FUSION001
   ============================================================ */
/* CGWEB115_FIX3_TABS_EQUAL001 */

(() => {
  "use strict";

  const esc = (value) => String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");


  /* ----------------------------------------------------------
     1. HISTORIQUE
     ---------------------------------------------------------- */

  function fixHistoryCard(card) {
    if (!card || card.dataset.cg115Fix3 === "1") return;

    const left =
      card.querySelector(".cg35-history-left");

    const right =
      card.querySelector(".cg35-history-right");

    if (!left || !right) return;


    /*
      Horodatage d'origine.
    */
    const dateNode =
      left.querySelector("header b");

    const header =
      left.querySelector("header");

    const timeNode =
      left.querySelector(".cg114-history-time");


    if (dateNode && header) {
      const date =
        dateNode.textContent.trim();

      const time =
        timeNode?.textContent.trim() || "";

      /*
        Format final :
        24/09/2026 05:58:51 (5,5 s)
      */
      header.innerHTML =
        `<b class="cg115-fix3-date">${
          esc(date)
        }${
          time ? ` (${esc(time)})` : ""
        }</b>`;
    }

    if (timeNode) {
      timeNode.remove();
    }


    /*
      Les réponses sont actuellement contenues dans :
        .cg35-history-answer > span + b

      On ne récupère QUE le texte des <b>.
      Ainsi les libellés gris :
        "Réponse donnée"
        "Bonne réponse au moment du jeu"
      disparaissent totalement.
    */
    const answers =
      [...right.querySelectorAll(
        ".cg35-history-answer b"
      )]
      .map(el => el.textContent.trim())
      .filter(Boolean);


    const isGood =
      card.classList.contains(
        "cg114-result-good"
      );

    const isBad =
      card.classList.contains(
        "cg114-result-bad"
      );


    if (isGood) {
      /*
        Bonne réponse :
        une seule ligne VERTE.
      */
      const correct =
        answers[1] ||
        answers[0] ||
        "—";

      right.innerHTML =
        `<div class="cg115-fix3-good">${
          esc(correct)
        }</div>`;

    } else if (isBad) {
      /*
        Mauvaise réponse :
        ligne 1 = réponse donnée ROUGE
        ligne 2 = bonne réponse VERTE.
      */
      const given =
        answers[0] || "—";

      const correct =
        answers[1] || "—";

      right.innerHTML =
        `<div class="cg115-fix3-bad">${
          esc(given)
        }</div>` +
        `<div class="cg115-fix3-good">${
          esc(correct)
        }</div>`;
    }

    card.dataset.cg115Fix3 = "1";
  }


  function fixHistory() {
    document
      .querySelectorAll(
        "#cgweb035Panel .cg114-history-card"
      )
      .forEach(fixHistoryCard);
  }


  /* ----------------------------------------------------------
     2. FUSION IMPORT CSV / ODS
     ---------------------------------------------------------- */

  function fuseImportPanels() {
    const bulk =
      document.getElementById(
        "cgimport011Bulk"
      );

    const control =
      document.getElementById(
        "cgweb040ControlCenter"
      );

    if (!bulk || !control) {
      return false;
    }


    bulk.classList.add(
      "cg115-import-host"
    );

    control.classList.add(
      "cg115-import-fused"
    );


    /*
      On transfère le bouton Actualiser dans
      l'en-tête du bloc CSV / ODS.
    */
    const bulkHead =
      bulk.querySelector(
        ".cgimport011-head"
      );

    const refresh =
      control.querySelector(
        "#cgweb040Refresh"
      );

    if (
      bulkHead &&
      refresh &&
      !bulkHead.contains(refresh)
    ) {
      bulkHead.appendChild(refresh);
    }


    /*
      Le Centre de contrôle devient une sous-zone
      du même bloc, juste après les contrôles
      CSV / ODS.
    */
    if (
      control.parentElement !== bulk
    ) {
      bulk.appendChild(control);
    }


    /*
      Libellé plus court du seul bouton
      réellement spécifique conservé.
    */
    const retry =
      control.querySelector(
        "#cgweb040Retry"
      );

    if (retry) {
      retry.textContent =
        "Relancer les erreurs";
    }


    control.dataset.cg115Fix3 =
      "1";

    return true;
  }


  /* ----------------------------------------------------------
     3. INSTALLATION
     ---------------------------------------------------------- */

  function installFix3() {
    /*
      Paramètres a déjà été retiré par FIX2.
      Les 4 éléments restants sont donc
      automatiquement distribués par le CSS.
    */
    fixHistory();
    fuseImportPanels();
  }


  /*
    L'historique et les outils d'import sont rendus
    dynamiquement : observer nécessaire.
  */
  let scheduled = false;

  function scheduleInstall() {
    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      installFix3();
    });
  }


  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      installFix3,
      { once:true }
    );
  } else {
    installFix3();
  }


  const observer =
    new MutationObserver(
      scheduleInstall
    );

  observer.observe(
    document.documentElement,
    {
      childList:true,
      subtree:true
    }
  );

})();

/* ============================================================
   CGWEB115 FIX4
   CSV_ODS_COMPACT002 / IMPORT_ACTION_ROW001
   ============================================================ */
/* CGWEB115_FIX4_CSV_ODS_COMPACT002 */

(() => {
  "use strict";

  function compactCsvImport() {
    const root =
      document.getElementById(
        "cgimport011Bulk"
      );

    if (!root) return false;

    const fileLine =
      root.querySelector(
        ".cgimport011-fileline"
      );

    const load =
      root.querySelector(
        "#cgimport011Load"
      );

    const start =
      root.querySelector(
        "#cgimport011Start"
      );

    const pause =
      root.querySelector(
        "#cgimport011Pause"
      );

    const resume =
      root.querySelector(
        "#cgimport011Resume"
      );

    const stop =
      root.querySelector(
        "#cgimport011Stop"
      );

    const reset =
      root.querySelector(
        "#cgimport011Reset"
      );

    const report =
      root.querySelector(
        "#cgimport011Report"
      );

    if (
      !fileLine ||
      !load ||
      !start ||
      !pause ||
      !resume ||
      !stop
    ) {
      return false;
    }


    /* ---------------------------------------------
       Libellé demandé
       --------------------------------------------- */

    load.textContent = "Lire";


    /* ---------------------------------------------
       Ordre final :

       fichier
       Lire
       Lancer l'import
       Pause
       Reprendre
       Arrêter
       Effacer la liste
       Actualiser
       --------------------------------------------- */

    [
      load,
      start,
      pause,
      resume,
      stop,
      reset
    ]
      .filter(Boolean)
      .forEach(button => {
        fileLine.appendChild(button);
      });


    /*
      Le bouton Actualiser de CGWEB040 a été
      transféré dans l'en-tête par FIX3.
      On le place maintenant au bout de la même ligne.
    */
    const refresh =
      document.getElementById(
        "cgweb040Refresh"
      );

    if (refresh) {
      fileLine.appendChild(refresh);
    }


    /*
      Rapport CSV :
      on le laisse techniquement dans le DOM si un moteur
      le référence encore, mais il est caché par CSS.
    */
    if (report) {
      report.setAttribute(
        "aria-hidden",
        "true"
      );
      report.tabIndex = -1;
    }


    root.dataset.cg115Fix4 = "1";

    return true;
  }


  function installFix4() {
    compactCsvImport();
  }


  /*
    CGIMPORT011 est monté dynamiquement.
  */
  let scheduled = false;

  function schedule() {
    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      installFix4();
    });
  }


  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      installFix4,
      { once:true }
    );
  } else {
    installFix4();
  }


  new MutationObserver(
    schedule
  ).observe(
    document.documentElement,
    {
      childList:true,
      subtree:true
    }
  );

})();

/* ============================================================
   CGWEB115 FIX5
   DETAIL_METRICS_DENSITY001
   ============================================================ */
/* CGWEB115_FIX5_DETAIL_METRICS_DENSITY001 */

(() => {
  "use strict";

  function compactDetailMetrics() {

    const root =
      document.querySelector(
        "#cgweb035Panel .cg113-detail"
      );

    if (!root) return false;


    const summary =
      root.querySelector(
        ".cg113-summary-grid"
      );

    const mastery =
      root.querySelector(
        ".cg113-mastery-grid"
      );

    const performance =
      root.querySelector(
        ".cg113-performance-grid"
      );

    if (
      !summary ||
      !mastery ||
      !performance
    ) {
      return false;
    }


    /*
      Si le bloc compact existe déjà pour ce rendu,
      aucune nouvelle intervention.
    */
    if (
      root.querySelector(
        ".cg115-detail-metrics-combined"
      )
    ) {
      return true;
    }


    const masterySection =
      mastery.closest(
        ".cg113-detail-section"
      );

    const performanceSection =
      performance.closest(
        ".cg113-detail-section"
      );


    const combined =
      document.createElement("section");

    combined.className =
      "cg115-detail-metrics-combined";


    /*
      Ligne des deux intitulés :
      5 cartes Maîtrise | 5 cartes Performance
    */
    const headings =
      document.createElement("div");

    headings.className =
      "cg115-detail-metrics-head";

    headings.innerHTML = `
      <div class="cg115-mastery-title">
        Maîtrise
      </div>
      <div class="cg115-performance-title">
        Temps de réponse et difficulté
      </div>
    `;


    /*
      Ligne unique de 10 cartes.
    */
    const row =
      document.createElement("div");

    row.className =
      "cg115-detail-metrics-row";


    /*
      On déplace les 5 cartes de Maîtrise,
      puis les 5 cartes Temps/Difficulté.
      Les éléments eux-mêmes sont conservés :
      aucune valeur n'est recalculée.
    */
    [
      ...mastery.querySelectorAll(
        ":scope > article"
      ),
      ...performance.querySelectorAll(
        ":scope > article"
      )
    ].forEach(card => {
      row.appendChild(card);
    });


    combined.appendChild(headings);
    combined.appendChild(row);


    /*
      Le nouveau bloc vient juste après les
      8 indicateurs généraux.
    */
    summary.insertAdjacentElement(
      "afterend",
      combined
    );


    /*
      Les anciennes coquilles avec leurs titres
      sont désormais inutiles.
    */
    masterySection?.classList.add(
      "cg115-detail-source-hidden"
    );

    performanceSection?.classList.add(
      "cg115-detail-source-hidden"
    );


    return true;
  }


  function installFix5() {
    compactDetailMetrics();
  }


  /*
    Le panneau Détail est reconstruit lorsqu'on
    passe de Total à un mégathème.
  */
  let scheduled = false;

  function schedule() {
    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      installFix5();
    });
  }


  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      installFix5,
      { once:true }
    );
  } else {
    installFix5();
  }


  new MutationObserver(
    schedule
  ).observe(
    document.documentElement,
    {
      childList:true,
      subtree:true
    }
  );

})();
