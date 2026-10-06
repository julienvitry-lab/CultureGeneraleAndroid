// CGWEB112 · CREATE_FORM_COMPACT001 / CREATE_FOUR_ROW_LAYOUT001 / CORRECT_LETTER_ONLY001
// CGWEB016 FIX2 · chargement direct depuis index.html
// CGWEB107_HISTORY_MAIN_TAB001
// CGWEB108_DIRECTORY_COMPACT_LAYOUT001_MAIN_TABS_REORDER001_MASS_SELECTION_ENABLE001
// CGWEB109_DIRECTORY_SELECTION_SIMPLIFY001_BULK_EDIT_RETIRE001_QUIZYPEDIA_UNIFIED_FLOW001_IMAGE_TOOLS_RETIRE001
// Couche d'agencement uniquement : conserve les moteurs CGWEB/CGIMPORT existants.

(() => {

  // CGWEB129_MANUAL_CREATE_QR001
  // SINGLE_ANSWER_FIELD001
  // WRONG_OPTIONS_RETIRE002
  // LEGACY_QR_COMPAT002

  "use strict";

  const $ = (id) => document.getElementById(id);
  const SESSION_PAGE = "cgweb016_page";
  const SESSION_PLUS = "cgweb016_plus";
  const SESSION_IMPORT = "cgweb016_import";
  const PAGES = new Set(["directory", "import", "create", "learning", "more"]);
  const PLUS_PAGES = new Set(["home2", "dedup", "quality", "history", "fulltext", "analytics", "backup", "androidpreview", "sync", "diagnostic", "imagescenter"]);
  const IMPORT_PAGES = new Set(["url", "images", "migration", "recovery404", "semantic"]);

  // CGWEB107_FIX2_PRIMARY_NAV_SINGLE_ROW001_DEFAULT_DIRECTORY001
  // À chaque ouverture/rechargement complet de CGWEB, le Répertoire est la page d'accueil.
  let currentPage = "directory";
  sessionStorage.setItem(SESSION_PAGE, currentPage);
  let currentPlus = sessionStorage.getItem(SESSION_PLUS) || "dedup";
  let currentImport = sessionStorage.getItem(SESSION_IMPORT) || "url";
  if (!PAGES.has(currentPage)) currentPage = "directory";
  if (!PLUS_PAGES.has(currentPlus)) currentPlus = "dedup";
  if (!IMPORT_PAGES.has(currentImport)) currentImport = "url";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function buildShell() {
    if ($("cgweb016Shell")) return;

    const appShell = document.querySelector(".app-shell") || document.body;
    const main = appShell.querySelector("main");

    const shell = document.createElement("section");
    shell.id = "cgweb016Shell";
    shell.className = "cg16-shell";
    shell.innerHTML = `
      <div class="cg16-version-proof" id="cg16VersionProof">CGWEB022 · CGWEB025 ACTIFS</div>
      <nav class="cg16-primary-nav" aria-label="Navigation Culture Générale">
        <button type="button" data-cg16-page="import">Quizypedia</button>
        <button type="button" data-cg16-page="create">Création de questions</button>
        <button type="button" data-cg16-page="learning">Historique</button>
        <button type="button" data-cg16-page="directory">Répertoire</button>
        <button type="button" data-cg16-page="more" class="cg16-settings-tab" aria-label="Paramètres" title="Paramètres"><span aria-hidden="true">⚙</span></button>
      </nav>

      <nav id="cg16SecondaryNav" class="cg16-secondary-nav cg16-plus-nav-fix4c cg36-plus-grid" aria-label="Sous-navigation Plus">
          <span class="cg16-plus-group-title">Pages</span>
          <button type="button" data-cg16-plus="home2">Accueil</button>

          <span class="cg16-plus-group-title">Qualité</span>
          <button type="button" data-cg16-plus="dedup">Doublons intelligents</button>
          <button type="button" data-cg16-plus="quality">Contrôle qualité</button>
          <span class="cg16-plus-group-title">Contenu et médias</span>
          <button type="button" data-cg16-plus="history">Historique des modifications</button>
          <button type="button" data-cg16-plus="fulltext">Plein texte</button>
          <span class="cg16-plus-group-title">Données</span>
          <button type="button" data-cg16-plus="analytics">Statistiques</button>
          <button type="button" data-cg16-plus="backup">Sauvegardes</button>
          <span class="cg16-plus-group-title">Système</span>
          <button type="button" data-cg16-plus="androidpreview">Simulateur Android</button>
          <button type="button" data-cg16-plus="sync">Santé synchro</button>
          <button type="button" data-cg16-plus="diagnostic">Diagnostic</button>
          <button type="button" data-cg16-plus="imagescenter">Bibliothèque d’images</button>
        </nav>

      <div class="cg16-workspace">
        <section id="cg16PageHome2" class="cg16-plus-page" data-cg16-plus-panel="home2"><div id="cg16Home2Mount" class="cg16-mount"></div></section>
        <section id="cg16PageSearch" class="cg16-page" data-cg16-page-panel="search"><div id="cg16SearchMount" class="cg16-mount"></div></section>

        <section id="cg16PageLearning" class="cg16-page" data-cg16-page-panel="learning"><div id="cg16LearningMount" class="cg16-mount"></div></section>

        <section id="cg16PageDirectory" class="cg16-page" data-cg16-page-panel="directory">
          <div id="cg16DirectoryMount" class="cg16-mount"></div>
        </section>





        <section id="cg16PageImport" class="cg16-page" data-cg16-page-panel="import">
          <nav id="cg16ImportNav" class="cg16-import-nav" aria-label="Sous-navigation Import Quizypedia">
            <button type="button" data-cg16-import="url">Import Quizypedia par URL</button>
            <button type="button" data-cg16-import="images">Gestion avancée des images</button>
            <button type="button" data-cg16-import="migration">Migration massive des images historiques</button>
            <button type="button" data-cg16-import="recovery404">Récupération ciblée des 404</button>
            <button type="button" data-cg16-import="semantic">Récupération sémantique des images restantes</button>
          </nav>

          <section class="cg16-import-page" data-cg16-import-panel="url">
            <div id="cg16ImportUrlMount" class="cg16-mount"></div>
          </section>
          <section class="cg16-import-page" data-cg16-import-panel="images">
            <div id="cg16ImportImagesMount" class="cg16-mount"></div>
          </section>
          <section class="cg16-import-page" data-cg16-import-panel="migration">
            <div id="cg16ImportMigrationMount" class="cg16-mount"></div>
          </section>
          <section class="cg16-import-page" data-cg16-import-panel="recovery404">
            <div id="cg16Import404Mount" class="cg16-mount"></div>
          </section>
          <section class="cg16-import-page" data-cg16-import-panel="semantic">
            <div id="cg16ImportSemanticMount" class="cg16-mount"></div>
          </section>
        </section>
      <section id="cg16PageCreate" class="cg16-page" data-cg16-page-panel="create">
          <div class="cg16-create-panel">
            <!-- CGWEB112_CREATE_FORM_COMPACT001_CREATE_FOUR_ROW_LAYOUT001_CORRECT_LETTER_ONLY001 -->
            <form id="cg16CreateForm" class="cg16-create-form cg139-create-form">

              <!--
                CGWEB139 · CREATE_TAB_SIMPLIFY001

                Création personnelle :
                Mégathème / Question / Réponse.

                Aucun thème.
                Aucun détail.
              -->
              <div class="cg139-manual-top">

                <label class="cg139-field-mega">
                  Mégathème
                  <select id="cg16CreateMega" required>
                    <option value=""></option>
                    <option>Animaux et Plantes</option>
                    <option>Culture Classique</option>
                    <option>Culture Générale</option>
                    <option>Culture Moderne</option>
                    <option>Géographie</option>
                    <option>Histoire</option>
                    <option>Sciences et Techniques</option>
                    <option>Sport</option>
                  </select>
                </label>

              </div>

              <div class="cg139-manual-content">

                <label>
                  Question
                  <textarea
                    id="cg16CreateQuestion"
                    rows="4"
                    required
                  ></textarea>
                </label>

                <label>
                  Réponse
                  <textarea
                    id="cg16CreateAnswer"
                    rows="4"
                    required
                    placeholder="Bonne réponse attendue"
                  ></textarea>
                </label>

              </div>

              <div class="cg16-create-actions cg139-manual-actions">

                <span
                  id="cg16CreateState"
                  class="cg16-create-state"
                ></span>

                <button
                  id="cg16CreateReset"
                  type="button"
                  class="cg16-btn cg16-secondary"
                >
                  Réinitialiser
                </button>

                <button
                  id="cg16CreateSubmit"
                  type="submit"
                  class="cg16-btn cg16-primary"
                >
                  Créer la question
                </button>

              </div>


              <section class="cg139-import">

                <div class="cg139-import-title">
                  Importer un fichier .txt
                </div>

                <div class="cg139-import-help">
                  Une ligne = une question ·
                  Mégathème ⇥ Question ⇥ Réponse
                </div>

                <div class="cg139-import-controls">

                  <input
                    id="cg139TxtFile"
                    type="file"
                    accept=".txt,text/plain"
                  >

                  <button
                    id="cg139TxtAnalyze"
                    type="button"
                    class="cg16-btn cg16-secondary"
                  >
                    Analyser
                  </button>

                  <button
                    id="cg139TxtImport"
                    type="button"
                    class="cg16-btn cg16-primary"
                    disabled
                  >
                    Importer les questions
                  </button>

                </div>

                <div
                  id="cg139TxtState"
                  class="cg139-import-state"
                ></div>

                <div
                  id="cg139TxtPreview"
                  class="cg139-preview"
                  hidden
                ></div>

              </section>

            </form>
          </div>
        </section>
      <section id="cg16PageMore" class="cg16-page" data-cg16-page-panel="more">

          <section id="cg16PageDashboard" class="cg16-plus-page" data-cg16-plus-panel="dashboard">
          <div id="cg16DashboardMount" class="cg16-mount"></div>
        </section>
          <section id="cg16PageFunlists" class="cg16-plus-page" data-cg16-plus-panel="funlists"><div id="cg16FunlistsMount" class="cg16-mount"></div></section>


          <section class="cg16-plus-page" data-cg16-plus-panel="dedup"><div id="cg16DedupMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="quality"><div id="cg16QualityMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="history"><div id="cg16HistoryMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="imagescenter"><div id="cg16ImageCenterMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="androidpreview"><div id="cg16AndroidPreviewMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="analytics"><div id="cg16AnalyticsMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="backup"><div id="cg16BackupMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="fulltext"><div id="cg16FulltextMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="sync"><div id="cg16SyncMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="diagnostic">
            <div id="cg16DiagnosticMount" class="cg16-mount"></div>
          </section>
        </section>
      </div>
    `;

    if (main?.parentElement === appShell) main.insertAdjacentElement("afterend", shell);
    else appShell.appendChild(shell);

    document.querySelectorAll("[data-cg16-page]").forEach(button => {
      button.addEventListener("click", () => navigate(button.dataset.cg16Page));
    });

    document.querySelectorAll("[data-cg16-plus]").forEach(button => {
      button.addEventListener("click", () => navigatePlus(button.dataset.cg16Plus));
    });
    document.querySelectorAll("[data-cg16-import]").forEach(button => {
      button.addEventListener("click", () => navigateImport(button.dataset.cg16Import));
    });

    wireCreateForm();
    document.body.classList.add("cg16-installed");
    document.documentElement.dataset.cgweb016 = "FIX2";
    renderNavigation();
  }

  function navigate(page) {
    // CGWEB036_FIX3D_ROUTING_BEGIN
    // CGWEB107_HISTORY_MAIN_TAB001
    // "learning" reste la clé technique du nouvel onglet principal Historique.
    if (page === "import") {
      navigateImport(currentImport);
      return;
    }
    // CGWEB036_FIX3D_ROUTING_END
    // CGWEB036_FIX1_NAVIGATION
    if (page === "home2") {
      navigatePlus("home2");
      return;
    }
    if (page === "search") page = "directory";
    if (page === "dashboard") {
      navigatePlus("home2");
      return;
    }
    if (page === "funlists") {
      navigatePlus("home2");
      return;
    }

if (!PAGES.has(page)) page = "directory";
    currentPage = page;
    sessionStorage.setItem(SESSION_PAGE, page);
    renderNavigation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigatePlus(subpage) {
    if (subpage === "learning") {
      navigate("learning");
      return;
    }
    if (!PLUS_PAGES.has(subpage)) subpage = "dedup";
    currentPlus = subpage;
    sessionStorage.setItem(SESSION_PLUS, subpage);
    if (currentPage !== "more") currentPage = "more";
    sessionStorage.setItem(SESSION_PAGE, currentPage);
    renderNavigation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateImport(subpage) {
    if (!IMPORT_PAGES.has(subpage)) subpage = "url";
    currentImport = subpage;
    sessionStorage.setItem(SESSION_IMPORT, subpage);
    if (currentPage !== "import") currentPage = "import";
    sessionStorage.setItem(SESSION_PAGE, currentPage);
    renderNavigation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.CGWEB016_API = { navigate, navigatePlus, navigateImport };


  function renderNavigation() {
    const loggedIn = Boolean(window.CGWEB001?.getUser?.());

    document.querySelectorAll("[data-cg16-page]").forEach(button => {
      const active = button.dataset.cg16Page === currentPage;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    document.querySelectorAll("[data-cg16-page-panel]").forEach(panel => {
      panel.hidden = panel.dataset.cg16PagePanel !== currentPage;
    });

    const secondary = $("cg16SecondaryNav");
    if (secondary) secondary.hidden = currentPage !== "more";

    document.querySelectorAll("[data-cg16-plus]").forEach(button => {
      button.classList.toggle("active", button.dataset.cg16Plus === currentPlus);
    });

    document.querySelectorAll("[data-cg16-plus-panel]").forEach(panel => {
      panel.hidden = panel.dataset.cg16PlusPanel !== currentPlus;
    });
    document.querySelectorAll("[data-cg16-import]").forEach(button => {
      const active = button.dataset.cg16Import === currentImport;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    document.querySelectorAll("[data-cg16-import-panel]").forEach(panel => {
      panel.hidden = panel.dataset.cg16ImportPanel !== currentImport;
    });


    const shell = $("cgweb016Shell");
    if (shell) shell.classList.toggle("cg16-auth-hidden", !loggedIn);

    const main = document.querySelector(".app-shell main");
    if (main) {
      const loginVisible = !$("loginView")?.classList.contains("hidden");
      main.classList.toggle("cg16-login-mode", Boolean(loginVisible));
    }
  }

  function move(id, mountId) {
    const node = $(id);
    const mount = $(mountId);
    if (!node || !mount || node.parentElement === mount) return false;
    mount.appendChild(node);
    return true;
  }

  function hideLegacy() {
    // CGWEB004/005 est fonctionnellement supplanté par CGWEB006 + ses extensions.
    // On le conserve chargé pour compatibilité, sans dupliquer son répertoire.
    $("cgweb004005-panel")?.classList.add("cg16-legacy-hidden");

    const dashboard = $("dashboardView");
    dashboard?.querySelector(".hero")?.classList.add("cg16-legacy-hidden");
    dashboard?.querySelector(".cards-grid")?.classList.add("cg16-legacy-hidden");
    dashboard?.querySelector(".roadmap")?.classList.add("cg16-legacy-hidden");

    // Une seule indication de connexion.
    $("cg45-cloud-state")?.classList.add("cg16-connection-hidden");
    $("cg2-auth")?.classList.add("cg16-connection-hidden");
    dashboard?.querySelector(".hero-state")?.classList.add("cg16-connection-hidden");

    // La création possède désormais son propre onglet.
    $("cg10New")?.classList.add("cg16-legacy-hidden");
  }

  // CGWEB109_FIX3_IMPORT_MOUNT_OWNERSHIP001_PRIMARY_TABS_EQUAL002
  // CGWEB109_FIX4_NO_PERIODIC_LAYOUT001_NO_FORCED_SCROLL001
// CGWEB110_IMPORT_REVIEW_RETIRE001_DIRECT_QUIZYPEDIA_IMPORT001_VALIDATION_UI_REMOVE001
// CGWEB110_FIX1_AUTH_SHELL_VISIBILITY001_LOGIN_MODE_SYNC001
// CGWEB111_QUIZYPEDIA_CLEAN_LAYOUT001_DUPLICATE_AUTO_GUARD001_SETTINGS_NAV001_PRIMARY_NAV_4PLUSGEAR001
  function organizeModules() {
    buildShell();
    hideLegacy();

    move("cgweb031Panel", "cg16Home2Mount");
    move("cgweb032Panel", "cg16SearchMount");
    move("cgweb030Panel", "cg16FunlistsMount");
    move("cgweb035Panel", "cg16LearningMount");
    move("cgweb017Panel", "cg16DashboardMount");
    // CGWEB018 FIX3 : le Répertoire avancé est désormais l'unique
    // vue principale de l'onglet Répertoire de questions.
    move("cgweb018Panel", "cg16DirectoryMount");
    $("cgweb006Panel")?.classList.add("cg16-directory-legacy-hidden");
    // CGWEB109 FIX3 · IMPORT_MOUNT_OWNERSHIP001
    // Quand le flux Quizypedia unifié existe, il devient propriétaire des
    // panneaux URL et Validation. Cela évite le ping-pong toutes les 2,5 s
    // entre CGWEB016 et CGWEB109, responsable des remontées de page.
    move(
      "cgimport002Panel",
      $("cgweb109SingleMount") ? "cgweb109SingleMount" : "cg16ImportUrlMount"
    );
move("cgimage002Panel", "cg16ImportImagesMount");
    move("cgimage005Panel", "cg16ImportMigrationMount");
    move("cgimage007Panel", "cg16Import404Mount");
    move("cgimage008Panel", "cg16ImportSemanticMount");

    move("cgweb025Panel", "cg16DedupMount");
    $("cgdedup001Panel")?.classList.add("cg16-legacy-hidden");
    move("cgweb020Panel", "cg16QualityMount");
    move("cgweb021Panel", "cg16BulkMount");
    move("cgweb022Panel", "cg16HistoryMount");
    move("cgweb026Panel", "cg16ImageCenterMount");
    move("cgweb027Panel", "cg16AndroidPreviewMount");
    move("cgweb028Panel", "cg16AnalyticsMount");
    move("cgweb029Panel", "cg16BackupMount");
    move("cgweb015Panel", "cg16FulltextMount");
    move("cgweb023Panel", "cg16SyncMount");
    if ($("cgweb013Panel")) $("cgweb013Panel").hidden = true;
    if ($("cgweb014Panel")) $("cgweb014Panel").hidden = true;
    if ($("cgsync005Panel")) $("cgsync005Panel").hidden = true;

    // Diagnostic historique : conservé, mais retiré de la page principale.
    const technical = $("dashboardView")?.querySelector(".technical");
    const diagnosticMount = $("cg16DiagnosticMount");
    if (technical && diagnosticMount && technical.parentElement !== diagnosticMount) {
      diagnosticMount.appendChild(technical);
    }
    move("cgcloud002-panel", "cg16DiagnosticMount");

    // CGWEB108 : en-tête minimal
    const brandSub = document.querySelector(".brand p");
    if (brandSub) brandSub.remove();

    renderNavigation();
  }

  function connectionIsComplete() {
    const user = window.CGWEB001?.getUser?.();
    if (!user) return false;

    // L'application historique passe firestoreState à "Connecté" seulement
    // après une lecture Firestore réussie. L'état intermédiaire "Authentifié"
    // reste donc rouge dans CGWEB016.
    const firestoreState = $("firestoreState")?.textContent?.trim() || "";
    return firestoreState === "Connecté";
  }

  function renderUnifiedConnection() {
    const badge = $("cloudBadge");
    if (!badge) return;

    const full = connectionIsComplete();
    const text = full ? "Connecté" : "Non connecté";
    const className = `badge ${full ? "badge-ok" : "badge-error"} cg16-unified-connection`;

    if (badge.textContent !== text) badge.textContent = text;
    if (badge.className !== className) badge.className = className;

    // CGWEB110 FIX1 · AUTH_SHELL_VISIBILITY001 / LOGIN_MODE_SYNC001
    // FIX4 avait cessé d'appeler renderNavigation() ici, ce qui était souhaité
    // pour la stabilité du scroll, mais laissait parfois main.cg16-login-mode
    // figé dans son état initial lorsque Firebase restaurait la session après
    // le premier rendu. Le shell restait alors masqué malgré "Connecté".
    const user = window.CGWEB001?.getUser?.() || null;
    const loginView = $("loginView");
    const loginVisible = Boolean(loginView && !loginView.classList.contains("hidden"));

    const main = document.querySelector(".app-shell main");
    if (main) main.classList.toggle("cg16-login-mode", loginVisible);

    const shell = $("cgweb016Shell");
    if (shell) shell.classList.toggle("cg16-auth-hidden", !user || loginVisible);
  }

  // ==================================================================
  // CGWEB139
  // CUSTOM_TXT_IMPORT001 / THREE_COLUMN_TSV001
  // CREATE_TAB_SIMPLIFY001 / CUSTOM_ORIGIN001
  // ==================================================================

  const CG139_MEGATHEMES = new Set([
    "Animaux et Plantes",
    "Culture Classique",
    "Culture Générale",
    "Culture Moderne",
    "Géographie",
    "Histoire",
    "Sciences et Techniques",
    "Sport"
  ]);

  let cg139TxtRows = [];
  let cg139TxtErrors = [];


  function cg139Escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }


  function cg139ParseTxt(text) {

    const rows = [];
    const errors = [];

    const source =
      String(text ?? "")
        .replace(/^\uFEFF/, "");

    const lines =
      source.split(/\r?\n/);


    lines.forEach(
      (raw, index) => {

        const lineNumber =
          index + 1;

        /*
         * Les lignes réellement vides sont ignorées.
         */
        if (!raw.trim()) {
          return;
        }


        const parts =
          raw.split("\t");


        if (parts.length !== 3) {

          errors.push({
            line:lineNumber,
            reason:
              `3 colonnes tabulées attendues, ${parts.length} trouvée(s)`
          });

          return;
        }


        const megatheme =
          parts[0].trim();

        const question =
          parts[1].trim();

        const answer =
          parts[2].trim();


        if (!megatheme) {

          errors.push({
            line:lineNumber,
            reason:"Mégathème vide"
          });

          return;
        }


        if (!CG139_MEGATHEMES.has(megatheme)) {

          errors.push({
            line:lineNumber,
            reason:
              `Mégathème inconnu : ${megatheme}`
          });

          return;
        }


        if (!question) {

          errors.push({
            line:lineNumber,
            reason:"Question vide"
          });

          return;
        }


        if (!answer) {

          errors.push({
            line:lineNumber,
            reason:"Réponse vide"
          });

          return;
        }


        rows.push({
          line:lineNumber,
          megatheme,
          question,
          answer
        });
      }
    );


    return {
      rows,
      errors,
      totalLines:lines.length
    };
  }


  function cg139RenderTxtPreview() {

    const state =
      $("cg139TxtState");

    const preview =
      $("cg139TxtPreview");

    const importButton =
      $("cg139TxtImport");


    if (!state || !preview || !importButton) {
      return;
    }


    importButton.disabled =
      !cg139TxtRows.length ||
      cg139TxtErrors.length > 0;


    if (
      !cg139TxtRows.length &&
      !cg139TxtErrors.length
    ) {

      state.textContent = "";
      preview.hidden = true;
      preview.innerHTML = "";
      return;
    }


    if (cg139TxtErrors.length) {

      state.textContent =
        `❌ ${cg139TxtErrors.length} ligne(s) invalide(s) · import bloqué`;

    } else {

      state.textContent =
        `✅ ${cg139TxtRows.length} question(s) prête(s) à importer`;
    }


    const sample =
      cg139TxtRows
        .slice(0, 10)
        .map(
          row => `
            <div class="cg139-preview-row">
              <strong>${cg139Escape(row.megatheme)}</strong>
              <span>${cg139Escape(row.question)}</span>
              <span>${cg139Escape(row.answer)}</span>
            </div>
          `
        )
        .join("");


    const failures =
      cg139TxtErrors
        .slice(0, 15)
        .map(
          error => `
            <div class="cg139-preview-error">
              Ligne ${error.line} · ${cg139Escape(error.reason)}
            </div>
          `
        )
        .join("");


    preview.innerHTML = `
      ${
        cg139TxtRows.length
          ? `<div class="cg139-preview-title">
               Aperçu · ${Math.min(10, cg139TxtRows.length)}
               / ${cg139TxtRows.length}
             </div>${sample}`
          : ""
      }

      ${
        cg139TxtErrors.length
          ? `<div class="cg139-preview-errors">${failures}</div>`
          : ""
      }
    `;

    preview.hidden = false;
  }


  async function cg139AnalyzeTxt() {

    const input =
      $("cg139TxtFile");

    const state =
      $("cg139TxtState");


    cg139TxtRows = [];
    cg139TxtErrors = [];


    const file =
      input?.files?.[0] || null;


    if (!file) {

      state.textContent =
        "❌ Sélectionnez un fichier .txt.";

      cg139RenderTxtPreview();
      return false;
    }


    if (
      !String(file.name || "")
        .toLowerCase()
        .endsWith(".txt")
    ) {

      state.textContent =
        "❌ Le fichier doit être au format .txt.";

      cg139RenderTxtPreview();
      return false;
    }


    state.textContent =
      "Analyse du fichier…";


    const parsed =
      cg139ParseTxt(
        await file.text()
      );


    cg139TxtRows =
      parsed.rows;

    cg139TxtErrors =
      parsed.errors;


    cg139RenderTxtPreview();

    return (
      cg139TxtRows.length > 0 &&
      cg139TxtErrors.length === 0
    );
  }


  function resetCreateForm(
    {
      preserveMegatheme = true
    } = {}
  ) {

    const mega =
      preserveMegatheme
        ? (
            $("cg16CreateMega")
              ?.value || ""
          )
        : "";


    if ($("cg16CreateMega")) {
      $("cg16CreateMega").value =
        mega;
    }


    for (
      const id
      of [
        "cg16CreateQuestion",
        "cg16CreateAnswer"
      ]
    ) {

      if ($(id)) {
        $(id).value = "";
      }
    }


    if ($("cg16CreateState")) {
      $("cg16CreateState").textContent = "";
    }
  }


  async function createQuestion(event) {

    event.preventDefault();


    const api =
      window.CGWEB010_API;

    const state =
      $("cg16CreateState");

    const button =
      $("cg16CreateSubmit");


    if (!window.CGWEB001?.getUser?.()) {

      state.textContent =
        "❌ Non connecté.";

      return;
    }


    if (!api?.create) {

      state.textContent =
        "❌ API CGWEB010 indisponible.";

      return;
    }


    const megatheme =
      $("cg16CreateMega")
        ?.value
        ?.trim() || "";

    const question =
      $("cg16CreateQuestion")
        ?.value
        ?.trim() || "";

    const answer =
      $("cg16CreateAnswer")
        ?.value
        ?.trim() || "";


    if (!megatheme) {

      state.textContent =
        "❌ Le mégathème est obligatoire.";

      return;
    }


    if (!question) {

      state.textContent =
        "❌ La question est obligatoire.";

      return;
    }


    if (!answer) {

      state.textContent =
        "❌ La réponse est obligatoire.";

      return;
    }


    const payload = {

      megatheme,

      /*
       * CUSTOM QUESTION :
       * aucun thème et aucun détail.
       */
      theme:"",
      detail:"",

      question,
      answer,

      question_origin:
        "custom_manual",

      status:"",
      image_file:"",
      is_image:0
    };


    button.disabled = true;

    state.textContent =
      "Création…";


    try {

      const id =
        await api.create(
          payload
        );


      state.textContent =
        `✅ Question ${id} créée.`;


      if (
        typeof window.CGWEB006_reload
        === "function"
      ) {

        await window
          .CGWEB006_reload(true);
      }


      resetCreateForm({
        preserveMegatheme:true
      });


      $("cg16CreateState").textContent =
        `✅ Question ${id} créée.`;


    } catch (error) {

      state.textContent =
        "❌ "
        + (
          error?.message ||
          String(error)
        );

    } finally {

      button.disabled = false;
    }
  }


  async function cg139ImportTxt() {

    const api =
      window.CGWEB010_API;

    const state =
      $("cg139TxtState");

    const button =
      $("cg139TxtImport");


    if (!window.CGWEB001?.getUser?.()) {

      state.textContent =
        "❌ Non connecté.";

      return;
    }


    if (!api?.create) {

      state.textContent =
        "❌ API CGWEB010 indisponible.";

      return;
    }


    if (
      !cg139TxtRows.length ||
      cg139TxtErrors.length
    ) {

      const ready =
        await cg139AnalyzeTxt();

      if (!ready) {
        return;
      }
    }


    const rows =
      [...cg139TxtRows];


    button.disabled =
      true;


    let success = 0;
    const failures = [];


    /*
     * ID numérique :
     * compatible avec l'ancien row_number Android.
     *
     * Date.now()*1000 reste largement sous
     * Number.MAX_SAFE_INTEGER.
     */
    const baseId =
      Math.trunc(
        Date.now() * 1000
      );


    for (
      let index=0;
      index<rows.length;
      index++
    ) {

      const row =
        rows[index];


      state.textContent =
        `Import ${index + 1}/${rows.length}…`;


      try {

        await api.create({

          requested_id:
            String(
              baseId + index
            ),

          megatheme:
            row.megatheme,

          theme:"",

          question:
            row.question,

          detail:"",

          answer:
            row.answer,

          question_origin:
            "custom_txt",

          status:"",

          image_file:"",

          is_image:0
        });


        success++;


      } catch (error) {

        failures.push({
          line:row.line,
          reason:
            error?.message ||
            String(error)
        });
      }
    }


    if (
      typeof window.CGWEB006_reload
      === "function"
    ) {

      await window
        .CGWEB006_reload(true);
    }


    if (!failures.length) {

      state.textContent =
        `✅ ${success} question(s) importée(s).`;

      cg139TxtRows = [];
      cg139TxtErrors = [];

      if ($("cg139TxtFile")) {
        $("cg139TxtFile").value = "";
      }

      cg139RenderTxtPreview();

      state.textContent =
        `✅ ${success} question(s) importée(s).`;


    } else {

      state.textContent =
        `⚠ ${success} importée(s) · ${failures.length} échec(s).`;

      cg139TxtErrors =
        failures;

      cg139RenderTxtPreview();
    }


    button.disabled =
      (
        !cg139TxtRows.length ||
        cg139TxtErrors.length > 0
      );
  }


  function wireCreateForm() {

    $("cg16CreateForm")
      ?.addEventListener(
        "submit",
        createQuestion
      );


    $("cg16CreateReset")
      ?.addEventListener(
        "click",
        () => resetCreateForm()
      );


    $("cg139TxtFile")
      ?.addEventListener(
        "change",
        () => {
          cg139AnalyzeTxt()
            .catch(
              error => {

                $("cg139TxtState").textContent =
                  "❌ "
                  + (
                    error?.message ||
                    String(error)
                  );
              }
            );
        }
      );


    $("cg139TxtAnalyze")
      ?.addEventListener(
        "click",
        () => {
          cg139AnalyzeTxt()
            .catch(
              error => {

                $("cg139TxtState").textContent =
                  "❌ "
                  + (
                    error?.message ||
                    String(error)
                  );
              }
            );
        }
      );


    $("cg139TxtImport")
      ?.addEventListener(
        "click",
        () => {
          cg139ImportTxt()
            .catch(
              error => {

                $("cg139TxtState").textContent =
                  "❌ "
                  + (
                    error?.message ||
                    String(error)
                  );
              }
            );
        }
      );
  }


  function initialize() {
    buildShell();
    organizeModules();
    renderUnifiedConnection();

    // CGWEB109 FIX4 · NO_PERIODIC_LAYOUT001
    // Plus aucun réagencement périodique de la page.
    // On n'agit que lorsqu'un panneau historique apparaît réellement.
    const latePanelIds = new Set([
      "cgweb031Panel","cgweb032Panel","cgweb030Panel","cgweb035Panel","cgweb017Panel",
      "cgweb018Panel","cgweb006Panel","cgimport002Panel",
      "cgimage002Panel","cgimage005Panel","cgimage007Panel","cgimage008Panel",
      "cgweb025Panel","cgdedup001Panel","cgweb020Panel","cgweb021Panel",
      "cgweb022Panel","cgweb026Panel","cgweb027Panel","cgweb028Panel",
      "cgweb029Panel","cgweb015Panel","cgweb023Panel","cgcloud002-panel"
    ]);

    let arrangeTimer = null;

    function containsLatePanel(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.id && latePanelIds.has(node.id)) return true;
      for (const id of latePanelIds) {
        if (node.querySelector?.(`#${CSS.escape(id)}`)) return true;
      }
      return false;
    }

    const lateObserver = new MutationObserver(mutations => {
      const relevant = mutations.some(m =>
        [...m.addedNodes].some(containsLatePanel)
      );
      if (!relevant) return;

      clearTimeout(arrangeTimer);
      arrangeTimer = setTimeout(() => {
        organizeModules();
        renderUnifiedConnection();
      }, 40);
    });

    lateObserver.observe(document.body, {subtree:true, childList:true});

    // L'état Firebase peut changer sans modifier la structure de la page :
    // seul le badge et la visibilité du shell sont rafraîchis, jamais les panneaux.
    window.setInterval(renderUnifiedConnection, 2500);

    // Réaction immédiate au basculement Connexion -> application.
    // Observer ultra-ciblé : aucun réagencement de contenu, aucun scroll.
    const loginView = $("loginView");
    if (loginView) {
      const authUiObserver = new MutationObserver(renderUnifiedConnection);
      authUiObserver.observe(loginView, {attributes:true, attributeFilter:["class"]});
    }

    window.addEventListener("focus", renderUnifiedConnection);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
