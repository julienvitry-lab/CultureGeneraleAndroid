// CGWEB016 FIX2 · chargement direct depuis index.html
// Couche d'agencement uniquement : conserve les moteurs CGWEB/CGIMPORT existants.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const SESSION_PAGE = "cgweb016_page";
  const SESSION_PLUS = "cgweb016_plus";
  const SESSION_IMPORT = "cgweb016_import";
  const PAGES = new Set(["directory", "create", "import", "more"]);
  const PLUS_PAGES = new Set(["dedup", "quality", "bulk", "fulltext", "sync", "diagnostic"]);
  const IMPORT_PAGES = new Set(["url", "images", "migration", "recovery404", "semantic"]);

  let currentPage = sessionStorage.getItem(SESSION_PAGE) || "directory";
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
      <div class="cg16-version-proof" id="cg16VersionProof">CGIMPORT010 FIX1 ACTIF</div>
      <nav class="cg16-primary-nav" aria-label="Navigation Culture Générale">
        <button type="button" data-cg16-page="directory">Répertoire de questions</button>
        <button type="button" data-cg16-page="create">Création de question</button>
        <button type="button" data-cg16-page="import">Import Quizypedia</button>
        <button type="button" data-cg16-page="more">Plus</button>
      </nav>

      <nav id="cg16SecondaryNav" class="cg16-secondary-nav" aria-label="Sous-navigation Plus">
        <button type="button" data-cg16-plus="dedup">Doublons</button>
        <button type="button" data-cg16-plus="quality">Qualité</button>
        <button type="button" data-cg16-plus="bulk">Opérations en masse</button>
        <button type="button" data-cg16-plus="fulltext">Plein texte</button>
        <button type="button" data-cg16-plus="sync">Synchronisation</button>
        <button type="button" data-cg16-plus="diagnostic">Diagnostic</button>
      </nav>

      <div class="cg16-workspace">
        <section id="cg16PageDirectory" class="cg16-page" data-cg16-page-panel="directory">
          <div id="cg16DirectoryMount" class="cg16-mount"></div>
        </section>

        <section id="cg16PageCreate" class="cg16-page" data-cg16-page-panel="create">
          <div class="cg16-create-panel">
            <div class="cg16-section-head">
              <div>
                <div class="cg16-kicker">CRÉATION</div>
                <h2>Nouvelle question</h2>
                <p>Création directe dans Firestore avec le même moteur que CGWEB010.</p>
              </div>
            </div>

            <form id="cg16CreateForm" class="cg16-create-form">
              <label>ID
                <input id="cg16CreateId" placeholder="Vide = ID automatique">
              </label>

              <label>Mégathème
                <select id="cg16CreateMega">
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

              <label class="cg16-wide">Thème
                <input id="cg16CreateTheme">
              </label>

              <label class="cg16-wide">Question
                <textarea id="cg16CreateQuestion" rows="3" required></textarea>
              </label>

              <label class="cg16-wide">Détail
                <textarea id="cg16CreateDetail" rows="3"></textarea>
              </label>

              <label>Proposition A
                <input id="cg16CreateA">
              </label>
              <label>Proposition B
                <input id="cg16CreateB">
              </label>
              <label>Proposition C
                <input id="cg16CreateC">
              </label>
              <label>Proposition D
                <input id="cg16CreateD">
              </label>

              <label>Bonne réponse
                <select id="cg16CreateCorrect">
                  <option value=""></option>
                  <option value="1">A</option>
                  <option value="2">B</option>
                  <option value="3">C</option>
                  <option value="4">D</option>
                </select>
              </label>

              <label>Statut
                <input id="cg16CreateStatus">
              </label>

              <label class="cg16-wide cgimg1-create-label">Image de la question
                <input id="cg16CreateImage" type="file" accept="image/*">
                <small>Firebase Storage sera la source officielle ; Android conservera uniquement un cache automatique.</small>
              </label>

              <div class="cg16-create-actions cg16-wide">
                <span id="cg16CreateState" class="cg16-create-state"></span>
                <button id="cg16CreateReset" type="button" class="cg16-btn cg16-secondary">Réinitialiser</button>
                <button id="cg16CreateSubmit" type="submit" class="cg16-btn cg16-primary">Créer la question</button>
              </div>
            </form>
          </div>
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

        <section id="cg16PageMore" class="cg16-page" data-cg16-page-panel="more">
          <section class="cg16-plus-page" data-cg16-plus-panel="dedup"><div id="cg16DedupMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="quality"><div id="cg16QualityMount" class="cg16-mount"></div></section>
          <section class="cg16-plus-page" data-cg16-plus-panel="bulk"><div id="cg16BulkMount" class="cg16-mount"></div></section>
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
    if (!PAGES.has(page)) page = "directory";
    currentPage = page;
    sessionStorage.setItem(SESSION_PAGE, page);
    renderNavigation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigatePlus(subpage) {
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

  function organizeModules() {
    buildShell();
    hideLegacy();

    move("cgweb006Panel", "cg16DirectoryMount");
    move("cgimport002Panel", "cg16ImportUrlMount");
    move("cgimage002Panel", "cg16ImportImagesMount");
    move("cgimage005Panel", "cg16ImportMigrationMount");
    move("cgimage007Panel", "cg16Import404Mount");
    move("cgimage008Panel", "cg16ImportSemanticMount");

    move("cgdedup001Panel", "cg16DedupMount");
    move("cgweb013Panel", "cg16QualityMount");
    move("cgweb014Panel", "cg16BulkMount");
    move("cgweb015Panel", "cg16FulltextMount");
    move("cgsync005Panel", "cg16SyncMount");

    // Diagnostic historique : conservé, mais retiré de la page principale.
    const technical = $("dashboardView")?.querySelector(".technical");
    const diagnosticMount = $("cg16DiagnosticMount");
    if (technical && diagnosticMount && technical.parentElement !== diagnosticMount) {
      diagnosticMount.appendChild(technical);
    }
    move("cgcloud002-panel", "cg16DiagnosticMount");

    // Libellé d'application plus sobre.
    const brandSub = document.querySelector(".brand p");
    if (brandSub) brandSub.textContent = "Répertoire · création · import · maintenance";

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
    badge.textContent = full ? "Connecté" : "Non connecté";
    badge.className = `badge ${full ? "badge-ok" : "badge-error"} cg16-unified-connection`;

    renderNavigation();
  }

  function resetCreateForm({ preserveClassification = true } = {}) {
    const mega = preserveClassification
      ? ($("cg6Mega")?.value || $("cg16CreateMega")?.value || "")
      : "";
    const theme = preserveClassification
      ? ($("cg6Theme")?.value || $("cg16CreateTheme")?.value || "")
      : "";

    $("cg16CreateId").value = "";
    $("cg16CreateMega").value = mega;
    $("cg16CreateTheme").value = theme;
    for (const id of [
      "cg16CreateQuestion", "cg16CreateDetail",
      "cg16CreateA", "cg16CreateB", "cg16CreateC", "cg16CreateD",
      "cg16CreateCorrect", "cg16CreateStatus"
    ]) {
      if ($(id)) $(id).value = "";
    }
    if ($("cg16CreateImage")) $("cg16CreateImage").value = "";
    if ($("cg16CreateState")) $("cg16CreateState").textContent = "";
  }

  async function createQuestion(event) {
    event.preventDefault();

    const api = window.CGWEB010_API;
    const state = $("cg16CreateState");
    const button = $("cg16CreateSubmit");
    const question = $("cg16CreateQuestion").value.trim();

    if (!window.CGWEB001?.getUser?.()) {
      state.textContent = "❌ Non connecté.";
      return;
    }
    if (!api?.create) {
      state.textContent = "❌ API CGWEB010 indisponible.";
      return;
    }
    if (!question) {
      state.textContent = "❌ La question est obligatoire.";
      return;
    }

    const rawCorrect = $("cg16CreateCorrect").value.trim();
    const payload = {
      requested_id: $("cg16CreateId").value.trim(),
      megatheme: $("cg16CreateMega").value.trim(),
      theme: $("cg16CreateTheme").value.trim(),
      question,
      detail: $("cg16CreateDetail").value,
      proposition_a: $("cg16CreateA").value,
      proposition_b: $("cg16CreateB").value,
      proposition_c: $("cg16CreateC").value,
      proposition_d: $("cg16CreateD").value,
      correct_index: rawCorrect === "" ? null : Number(rawCorrect),
      status: $("cg16CreateStatus").value.trim(),
      image_file: "",
      is_image: 0
    };
    const selectedImage = $("cg16CreateImage")?.files?.[0] || null;

    button.disabled = true;
    state.textContent = "Création…";
    try {
      const id = await api.create(payload);
      let imageMessage = "";
      if (selectedImage) {
        if (!window.CGIMAGE001?.uploadForQuestion) {
          imageMessage = " · ⚠ image non envoyée (CGIMAGE001 indisponible)";
        } else {
          state.textContent = `Question ${id} créée · envoi de l’image…`;
          try {
            await window.CGIMAGE001.uploadForQuestion(id, selectedImage, {expectedRevision: 1, sourceOrigin: "manual_create"});
            imageMessage = " · image enregistrée";
          } catch (imageError) {
            imageMessage = ` · ⚠ image non enregistrée : ${imageError?.message || imageError}`;
          }
        }
      }
      state.textContent = `✅ Question ${id} créée${imageMessage}.`;
      if (typeof window.CGWEB006_reload === "function") {
        await window.CGWEB006_reload(true);
      }
      // Conserver mégathème/thème pour les créations en série.
      const mega = payload.megatheme;
      const theme = payload.theme;
      resetCreateForm({ preserveClassification: false });
      $("cg16CreateMega").value = mega;
      $("cg16CreateTheme").value = theme;
      $("cg16CreateState").textContent = `✅ Question ${id} créée${imageMessage}.`;
    } catch (error) {
      state.textContent = "❌ " + (error?.message || String(error));
    } finally {
      button.disabled = false;
    }
  }

  function wireCreateForm() {
    $("cg16CreateForm")?.addEventListener("submit", createQuestion);
    $("cg16CreateReset")?.addEventListener("click", () => resetCreateForm());
  }

  function initialize() {
    buildShell();
    organizeModules();
    renderUnifiedConnection();

    // Les modules historiques créent certains panneaux après le parsing initial.
    // On les range dès leur apparition, sans modifier leurs moteurs ni listeners.
    let fastPasses = 0;
    const fastTimer = window.setInterval(() => {
      organizeModules();
      renderUnifiedConnection();
      fastPasses += 1;
      if (fastPasses >= 40) window.clearInterval(fastTimer);
    }, 250);

    // Surveillance légère ensuite : auth et éventuels panneaux tardifs.
    window.setInterval(() => {
      organizeModules();
      renderUnifiedConnection();
    }, 2500);

    window.addEventListener("focus", () => {
      organizeModules();
      renderUnifiedConnection();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
