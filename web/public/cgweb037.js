(() => {
  "use strict";

  const VERSION = "DIRECTORY_SEARCH002";
  const LS_STATE = "cgweb037.directory.state.v1";
  const LS_RECENT = "cgweb037.directory.recent.v1";
  const LS_SAVED = "cgweb037.directory.saved.v1";
  const MAX_RECENT = 10;

  const rt = {
    directoryPanel: null,
    searchPanel: null,
    searchInput: null,
    searchButton: null,
    directoryTable: null,
    searchActive: false,
    restoring: false,
    initialized: false
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");

  function readJson(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "");
      return v ?? fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function isVisible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function panelByKey(key) {
    return document.querySelector(`[data-cg16-page-panel="${CSS.escape(key)}"]`);
  }

  function headingByExact(text) {
    const wanted = lower(text);
    return [...document.querySelectorAll("h1,h2,h3,h4")]
      .find((h) => lower(h.textContent) === wanted);
  }

  function closestPagePanel(el) {
    return el?.closest("[data-cg16-page-panel],section,.panel,.card,[class*='panel'],[class*='card']") || null;
  }

  function findDirectoryPanel() {
    return panelByKey("directory") || closestPagePanel(headingByExact("Répertoire")) ||
      closestPagePanel(headingByExact("Répertoire de questions"));
  }

  function findSearchPanel() {
    return panelByKey("search") || closestPagePanel(headingByExact("Recherche"));
  }

  function findSearchInput(panel) {
    const els = [...(panel || document).querySelectorAll('input[type="search"],input[type="text"]')];
    return els.find((e) => lower(e.placeholder).includes("mots recherch")) ||
      els.find((e) => lower(e.getAttribute("aria-label")).includes("mots recherch")) ||
      els[0] || null;
  }

  function findButton(panel, text) {
    const wanted = lower(text);
    return [...(panel || document).querySelectorAll("button")]
      .find((b) => lower(b.textContent) === wanted) || null;
  }

  function labelTextFor(el) {
    if (!el) return "";
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return norm(lab.textContent);
    }
    const parentLab = el.closest("label");
    if (parentLab) return norm(parentLab.textContent);
    const wrap = el.parentElement;
    if (wrap) {
      const lab = wrap.querySelector(":scope > label");
      if (lab) return norm(lab.textContent);
    }
    return "";
  }

  function directoryControls() {
    const p = rt.directoryPanel;
    if (!p) return [];
    return [...p.querySelectorAll("input,select")]
      .filter((e) => !e.closest("#cgweb037Tools") && !e.closest(".cgweb037-search-engine"));
  }

  function controlKey(el) {
    const label = lower(labelTextFor(el));
    if (label) return `label:${label}`;
    if (el.name) return `name:${el.name}`;
    if (el.id) return `id:${el.id}`;
    const ph = lower(el.placeholder);
    if (ph) return `ph:${ph}`;
    return "";
  }

  function snapshotDirectoryState() {
    const controls = {};
    for (const el of directoryControls()) {
      const key = controlKey(el);
      if (!key) continue;
      controls[key] = el.type === "checkbox" ? !!el.checked : el.value;
    }
    return {
      controls,
      fullText: rt.searchInput?.value || "",
      scrollY: window.scrollY,
      savedAt: Date.now()
    };
  }

  function saveDirectoryState() {
    if (rt.restoring) return;
    writeJson(LS_STATE, snapshotDirectoryState());
  }

  function setNativeValue(el, value) {
    if (!el) return;
    if (el instanceof HTMLSelectElement) {
      const desired = String(value ?? "");
      const byValue = [...el.options].find((o) => o.value === desired);
      const byText = [...el.options].find((o) => lower(o.textContent) === lower(desired));
      if (byValue) el.value = byValue.value;
      else if (byText) el.value = byText.value;
      else return;
    } else if (el.type === "checkbox") {
      el.checked = !!value;
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc?.set) desc.set.call(el, String(value ?? ""));
      else el.value = String(value ?? "");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restoreDirectoryState() {
    const saved = readJson(LS_STATE, null);
    if (!saved) return;
    rt.restoring = true;
    try {
      const map = saved.controls || {};
      for (const el of directoryControls()) {
        const key = controlKey(el);
        if (key && Object.prototype.hasOwnProperty.call(map, key)) {
          setNativeValue(el, map[key]);
        }
      }
      if (rt.searchInput && saved.fullText) {
        setNativeValue(rt.searchInput, saved.fullText);
        setStatus("Filtres restaurés. Clique sur « Rechercher » pour relancer la recherche plein texte.", "info");
      }
    } finally {
      rt.restoring = false;
    }
  }

  function findDirectoryControl(labelNeedle) {
    const wanted = lower(labelNeedle);
    return directoryControls().find((e) => lower(labelTextFor(e)).includes(wanted)) || null;
  }

  function searchControls() {
    return [...(rt.searchPanel || document).querySelectorAll("input,select")]
      .filter((e) => e !== rt.searchInput && !e.closest("#cgweb037Tools"));
  }

  function searchControlByLabel(labelNeedle) {
    const wanted = lower(labelNeedle);
    return searchControls().find((e) => lower(labelTextFor(e)).includes(wanted)) || null;
  }

  function syncDirectoryFiltersToSearch() {
    const megaDir = findDirectoryControl("mégathème");
    const themeDir = findDirectoryControl("thème");
    const imageDir = findDirectoryControl("image");
    const perPageDir = findDirectoryControl("par page");

    const megaSearch = searchControlByLabel("mégathème");
    const themeSearch = searchControlByLabel("thème");
    const imageSearch = searchControlByLabel("image");
    const limitSearch = searchControls().find((e) =>
      e instanceof HTMLSelectElement && [...e.options].some((o) => ["50","100","200","300"].includes(norm(o.value || o.textContent)))
    );

    if (megaDir && megaSearch) {
      const v = megaDir instanceof HTMLSelectElement
        ? norm(megaDir.selectedOptions?.[0]?.textContent || megaDir.value)
        : megaDir.value;
      if (!/^(tous|toutes)$/i.test(v)) setNativeValue(megaSearch, v);
      else setNativeValue(megaSearch, "");
    }
    if (themeDir && themeSearch) setNativeValue(themeSearch, themeDir.value);
    if (imageDir && imageSearch) {
      const v = imageDir instanceof HTMLSelectElement
        ? norm(imageDir.selectedOptions?.[0]?.textContent || imageDir.value)
        : imageDir.value;
      setNativeValue(imageSearch, v);
    }
    if (perPageDir && limitSearch) {
      const v = perPageDir instanceof HTMLSelectElement
        ? norm(perPageDir.selectedOptions?.[0]?.textContent || perPageDir.value)
        : perPageDir.value;
      setNativeValue(limitSearch, v);
    }
  }

  function findDirectoryTable() {
    const p = rt.directoryPanel;
    if (!p) return null;
    return [...p.querySelectorAll("table")].find((t) => {
      if (t.closest(".cgweb037-search-engine")) return false;
      const heads = lower([...t.querySelectorAll("th")].map((x) => x.textContent).join(" "));
      return heads.includes("question") && heads.includes("thème");
    }) || null;
  }

  function directoryResultRegion(show) {
    const table = rt.directoryTable || findDirectoryTable();
    rt.directoryTable = table;
    if (!table) return;
    table.style.display = show ? "" : "none";

    // Compactly hide directory-only selection controls while full-text results are shown.
    const candidates = [...rt.directoryPanel.querySelectorAll("button,div,span")];
    for (const el of candidates) {
      if (el.closest("#cgweb037Tools") || el.closest(".cgweb037-search-engine")) continue;
      const txt = lower(el.textContent);
      if (
        txt === "tout visible" || txt === "vider" || txt === "copier les id" ||
        /^0 sélectionnée/.test(txt) || txt.includes("sélectionnée(s)")
      ) {
        el.dataset.cgweb037DirOnly = "1";
        el.style.display = show ? "" : "none";
      }
    }
  }

  function setSearchPanelVisible(visible) {
    const p = rt.searchPanel;
    if (!p) return;
    rt.searchActive = visible;
    if (visible) {
      p.hidden = false;
      p.removeAttribute("hidden");
      p.style.display = "block";
      p.classList.add("cgweb037-search-open");
    } else {
      p.classList.remove("cgweb037-search-open");
      p.style.display = "none";
    }
    directoryResultRegion(!visible);
    document.querySelector("#cgweb037Clear")?.toggleAttribute("disabled", !visible && !norm(rt.searchInput?.value));
  }

  function addRecent(term) {
    term = norm(term);
    if (!term) return;
    const arr = readJson(LS_RECENT, []).filter((x) => lower(x) !== lower(term));
    arr.unshift(term);
    writeJson(LS_RECENT, arr.slice(0, MAX_RECENT));
    renderMemory();
  }

  function saveNamedFilter() {
    const name = norm(prompt("Nom de ce filtre :") || "");
    if (!name) return;
    const state = snapshotDirectoryState();
    const saved = readJson(LS_SAVED, []);
    const next = saved.filter((x) => lower(x.name) !== lower(name));
    next.unshift({ name, state, createdAt: Date.now() });
    writeJson(LS_SAVED, next.slice(0, 20));
    renderMemory();
    setStatus(`Filtre « ${name} » enregistré.`, "ok");
  }

  function applySaved(item) {
    if (!item?.state) return;
    writeJson(LS_STATE, item.state);
    restoreDirectoryState();
    const term = norm(item.state.fullText);
    if (term) runFullTextSearch(term);
    else {
      setSearchPanelVisible(false);
      const apply = findButton(rt.directoryPanel, "Appliquer");
      apply?.click();
    }
  }

  function deleteSaved(name) {
    const saved = readJson(LS_SAVED, []).filter((x) => x.name !== name);
    writeJson(LS_SAVED, saved);
    renderMemory();
  }

  function renderMemory() {
    const recentHost = document.querySelector("#cgweb037Recent");
    const savedHost = document.querySelector("#cgweb037Saved");
    if (recentHost) {
      const recent = readJson(LS_RECENT, []);
      recentHost.innerHTML = "";
      if (!recent.length) {
        recentHost.innerHTML = '<span class="cgweb037-empty">Aucune recherche récente</span>';
      } else {
        for (const term of recent) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "cgweb037-chip";
          b.textContent = term;
          b.addEventListener("click", () => {
            setNativeValue(rt.searchInput, term);
            runFullTextSearch(term);
          });
          recentHost.appendChild(b);
        }
      }
    }
    if (savedHost) {
      const saved = readJson(LS_SAVED, []);
      savedHost.innerHTML = "";
      if (!saved.length) {
        savedHost.innerHTML = '<span class="cgweb037-empty">Aucun filtre enregistré</span>';
      } else {
        for (const item of saved) {
          const wrap = document.createElement("span");
          wrap.className = "cgweb037-saved-chip";
          const b = document.createElement("button");
          b.type = "button";
          b.className = "cgweb037-chip";
          b.textContent = item.name;
          b.addEventListener("click", () => applySaved(item));
          const x = document.createElement("button");
          x.type = "button";
          x.className = "cgweb037-chip-x";
          x.textContent = "×";
          x.title = `Supprimer « ${item.name} »`;
          x.addEventListener("click", () => deleteSaved(item.name));
          wrap.append(b, x);
          savedHost.appendChild(wrap);
        }
      }
    }
  }

  function setStatus(text, kind = "") {
    const el = document.querySelector("#cgweb037Status");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.kind = kind;
  }

  function runFullTextSearch(forcedTerm) {
    const term = norm(forcedTerm ?? rt.searchInput?.value);
    if (!term) {
      setSearchPanelVisible(false);
      saveDirectoryState();
      setStatus("Recherche plein texte désactivée : résultats du Répertoire.", "info");
      return;
    }
    if (!rt.searchButton) {
      setStatus("Moteur CGWEB032 indisponible : bouton Rechercher introuvable.", "error");
      return;
    }
    setNativeValue(rt.searchInput, term);
    syncDirectoryFiltersToSearch();
    saveDirectoryState();
    addRecent(term);
    setSearchPanelVisible(true);
    setStatus(`Recherche dans question, détail, thème et mégathème : « ${term} »`, "ok");
    rt.searchButton.click();
  }

  function clearFullText() {
    setNativeValue(rt.searchInput, "");
    saveDirectoryState();
    setSearchPanelVisible(false);
    setStatus("Recherche plein texte effacée.", "info");
    document.querySelector("#cgweb037Query")?.focus();
  }

  function createTools() {
    let tools = document.querySelector("#cgweb037Tools");
    if (tools) return tools;

    tools = document.createElement("section");
    tools.id = "cgweb037Tools";
    tools.className = "cgweb037-tools";
    tools.innerHTML = `
      <div class="cgweb037-queryline">
        <label class="cgweb037-querylabel">
          <span>La fiche contient</span>
          <span id="cgweb037InputHost"></span>
        </label>
        <span id="cgweb037ButtonHost"></span>
        <button type="button" id="cgweb037Clear">Effacer</button>
        <button type="button" id="cgweb037Save">Enregistrer ce filtre</button>
      </div>
      <div class="cgweb037-hint">Recherche plein texte CGWEB032 : question, détail, thème et mégathème. Les autres filtres du Répertoire restent combinables.</div>
      <div class="cgweb037-memory">
        <div><strong>Récentes</strong><span id="cgweb037Recent" class="cgweb037-chips"></span></div>
        <div><strong>Filtres enregistrés</strong><span id="cgweb037Saved" class="cgweb037-chips"></span></div>
      </div>
      <div id="cgweb037Status" class="cgweb037-status"></div>`;

    // Place immediately before the first directory filter/control block where possible.
    const heading = [...rt.directoryPanel.querySelectorAll("h1,h2,h3")][0];
    if (heading) {
      const after = heading.nextElementSibling;
      if (after) after.insertAdjacentElement("afterend", tools);
      else heading.insertAdjacentElement("afterend", tools);
    } else {
      rt.directoryPanel.prepend(tools);
    }

    return tools;
  }

  function hideLegacySearchChrome() {
    if (!rt.searchPanel) return;
    rt.searchPanel.classList.add("cgweb037-search-engine");

    // Hide the old Search title/subtitle and obsolete reload-index control.
    for (const h of rt.searchPanel.querySelectorAll("h1,h2,h3")) {
      if (lower(h.textContent) === "recherche") h.style.display = "none";
    }
    const reload = [...rt.searchPanel.querySelectorAll("button")]
      .find((b) => lower(b.textContent).includes("recharger l'index"));
    if (reload) reload.style.display = "none";

    // Hide helper description and remaining filter controls; Directory is now the visible filter source.
    const searchControls = [...rt.searchPanel.querySelectorAll("input,select")].filter((e) => e !== rt.searchInput);
    for (const el of searchControls) {
      const wrap = el.closest("label") || el.parentElement;
      if (wrap && !wrap.closest("table")) wrap.style.display = "none";
    }
    const p = [...rt.searchPanel.querySelectorAll("p")].find((e) =>
      lower(e.textContent).includes("question") &&
      lower(e.textContent).includes("mégathème") &&
      lower(e.textContent).includes("détail")
    );
    if (p) p.style.display = "none";
  }

  function rehomeSearchEngine() {
    if (!rt.directoryPanel || !rt.searchPanel) return;
    if (rt.searchPanel.parentElement !== rt.directoryPanel) {
      rt.directoryPanel.appendChild(rt.searchPanel);
    }
    rt.searchPanel.dataset.cgweb037Embedded = "1";
    setSearchPanelVisible(false);
  }

  function wireDirectoryPersistence() {
    rt.directoryPanel.addEventListener("change", (ev) => {
      if (ev.target.closest("#cgweb037Tools") || ev.target.closest(".cgweb037-search-engine")) return;
      saveDirectoryState();
    });
    rt.directoryPanel.addEventListener("input", (ev) => {
      if (ev.target.closest("#cgweb037Tools") || ev.target.closest(".cgweb037-search-engine")) return;
      saveDirectoryState();
    });
    rt.directoryPanel.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const txt = lower(b.textContent);
      if (txt === "appliquer" || txt === "suivant →" || txt === "← précédent") {
        setTimeout(saveDirectoryState, 0);
      }
      if (txt === "ouvrir") {
        saveDirectoryState();
        const state = readJson(LS_STATE, {});
        state.scrollY = window.scrollY;
        writeJson(LS_STATE, state);
      }
    });
  }

  function restoreScrollWhenDirectoryVisible() {
    const saved = readJson(LS_STATE, null);
    if (!saved?.scrollY) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (isVisible(rt.directoryPanel)) {
        window.scrollTo({ top: Number(saved.scrollY) || 0, behavior: "instant" });
        clearInterval(timer);
      } else if (attempts > 20) clearInterval(timer);
    }, 150);
  }

  function init() {
    if (rt.initialized) return true;

    rt.directoryPanel = findDirectoryPanel();
    rt.searchPanel = findSearchPanel();
    if (!rt.directoryPanel || !rt.searchPanel || rt.directoryPanel === rt.searchPanel) return false;

    rt.searchInput = findSearchInput(rt.searchPanel);
    rt.searchButton = findButton(rt.searchPanel, "Rechercher");
    if (!rt.searchInput || !rt.searchButton) return false;

    rt.directoryTable = findDirectoryTable();

    const tools = createTools();
    const inputHost = tools.querySelector("#cgweb037InputHost");
    const buttonHost = tools.querySelector("#cgweb037ButtonHost");

    // Move the real CGWEB032 controls: event listeners stay attached.
    rt.searchInput.id = "cgweb037Query";
    rt.searchInput.placeholder = "Question, détail, thème ou mégathème…";
    rt.searchInput.classList.add("cgweb037-query");
    inputHost.appendChild(rt.searchInput);

    rt.searchButton.classList.add("cgweb037-run");
    buttonHost.appendChild(rt.searchButton);

    rehomeSearchEngine();
    hideLegacySearchChrome();

    // Capture phase ensures our filter sync/state happens before CGWEB032's original listener.
    rt.searchButton.addEventListener("click", () => {
      const term = norm(rt.searchInput.value);
      if (!term) {
        clearFullText();
        return;
      }
      syncDirectoryFiltersToSearch();
      saveDirectoryState();
      addRecent(term);
      setSearchPanelVisible(true);
      setStatus(`Recherche dans question, détail, thème et mégathème : « ${term} »`, "ok");
    }, true);

    rt.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        rt.searchButton.click();
      }
    });
    rt.searchInput.addEventListener("input", saveDirectoryState);

    tools.querySelector("#cgweb037Clear")?.addEventListener("click", clearFullText);
    tools.querySelector("#cgweb037Save")?.addEventListener("click", saveNamedFilter);

    wireDirectoryPersistence();
    restoreDirectoryState();
    renderMemory();
    restoreScrollWhenDirectoryVisible();

    // Keep embedded search visible while active even if legacy navigation toggles [hidden].
    new MutationObserver(() => {
      if (rt.searchActive && rt.searchPanel) {
        rt.searchPanel.hidden = false;
        rt.searchPanel.removeAttribute("hidden");
        rt.searchPanel.style.display = "block";
      }
    }).observe(rt.searchPanel, { attributes: true, attributeFilter: ["hidden","style","class"] });

    rt.initialized = true;
    window.CGWEB037 = {
      version: VERSION,
      search: runFullTextSearch,
      clear: clearFullText,
      saveFilter: saveNamedFilter,
      snapshot: snapshotDirectoryState
    };
    setStatus("Répertoire prêt. Recherche plein texte intégrée à CGWEB032.", "ok");
    return true;
  }

  let tries = 0;
  function boot() {
    if (init()) return;
    tries++;
    if (tries < 120) setTimeout(boot, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

