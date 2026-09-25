// CGWEB116_FIX3_FIX4_FIX2_PIPELINE_UNIFICATION001
// CGWEB116_FIX3_FIX3_TXT_ONLY001_BATCH_MEGATHEME001_BATCH_CLASSIFICATION_LOCK001
// CGWEB116_FIX3_FIX2_MULTI_URL_PIPELINE_REPAIR001
(() => {
  "use strict";

  // CGWEB111_FIX2_MULTI_URL_MOUNT_RESTORE001_IMPORT_SCOPE_DECOUPLE001

  const STORAGE_KEY = "cgimport011.bulkThemeFile.v1";
  const MAX_URLS = 5000;
  const IMPORT_TIMEOUT_MS = 45 * 60 * 1000;
  const QUIET_MS = 4500;

  const state = {
    items: [],
    running: false,
    pauseRequested: false,
    stopRequested: false,
    currentIndex: -1,
    sourceName: "",
    megatheme: "",
    startedAt: null
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s)
    .replace(/[’‘`´]/g, "'")
    .replace(/\u00a0/g, " ")
    .toLocaleLowerCase("fr-FR");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function saveState() {
    try {
      const payload = {
        items: state.items,
        sourceName: state.sourceName,
        megatheme: state.megatheme,
        startedAt: state.startedAt,
        currentIndex: state.currentIndex
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.items)) return;
      state.items = saved.items.map((x) => {
        const item = { ...x };
        if (item.status === "running") {
          item.status = "pending";
          item.message = "Interrompu lors de la session précédente — prêt à reprendre.";
        }
        return item;
      });
      state.sourceName = saved.sourceName || "";
      state.megatheme = saved.megatheme || "";
      state.startedAt = saved.startedAt || null;
      state.currentIndex = Number.isInteger(saved.currentIndex) ? saved.currentIndex : -1;
    } catch (_) {}
  }

  function canonicalizeUrl(raw) {
    const value = norm(raw);
    if (!value) return null;
    try {
      const u = new URL(value);
      if (!/^https?:$/.test(u.protocol)) return null;
      const host = u.hostname.toLowerCase();
      if (host !== "quizypedia.fr" && host !== "www.quizypedia.fr") return null;
      if (!u.pathname.toLowerCase().includes("/quiz/")) return null;
      u.hash = "";
      u.hostname = "www.quizypedia.fr";
      u.pathname = u.pathname.replace(/\/+$/, "") + "/";
      return u.toString();
    } catch (_) {
      return null;
    }
  }

  // CGWEB116 FIX3 FIX3 · TXT_ONLY001
  // Un fichier TXT = un lot.
  // Une URL Quizypedia par ligne.
  async function parseFile(file, megatheme) {

    if (!file) {
      throw new Error(
        "Sélectionne d’abord un fichier .txt."
      );
    }

    const ext =
      (file.name.split(".").pop() || "")
        .toLowerCase();

    if (ext !== "txt") {
      throw new Error(
        "Format non pris en charge. Utilise uniquement un fichier .txt."
      );
    }

    if (!String(megatheme || "").trim()) {
      throw new Error(
        "Choisis le mégathème du lot avant de lire le fichier."
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new Error(
        "Fichier trop volumineux (maximum 20 Mo)."
      );
    }

    const text =
      (await file.text())
        .replace(/^\uFEFF/, "");

    const rawLines =
      text
        .split(/\r?\n/)
        .map(line => norm(line))
        .filter(
          line =>
            line &&
            !line.startsWith("#")
        );

    const unique =
      new Map();

    let invalid = 0;
    let duplicates = 0;

    for (const raw of rawLines) {

      const url =
        canonicalizeUrl(raw);

      if (!url) {
        invalid++;
        continue;
      }

      if (unique.has(url)) {
        duplicates++;
        continue;
      }

      unique.set(
        url,
        {
          url,
          megatheme:
            String(megatheme).trim(),

          status:"pending",
          message:"",
          startedAt:null,
          endedAt:null,
          durationSec:null,
          added:null,
          duplicates:null,
          errors:null
        }
      );

      if (unique.size > MAX_URLS) {
        throw new Error(
          `Trop d’URL : maximum ${MAX_URLS}.`
        );
      }
    }

    if (!unique.size) {
      throw new Error(
        "Aucune URL Quizypedia valide trouvée dans le fichier TXT."
      );
    }

    state.items =
      [...unique.values()];

    state.sourceName =
      file.name;

    state.megatheme =
      String(megatheme).trim();

    state.currentIndex =
      -1;

    state.startedAt =
      new Date().toISOString();

    state.pauseRequested =
      false;

    state.stopRequested =
      false;

    saveState();
    render();

    return {
      count:state.items.length,
      invalid,
      duplicates,
      megatheme:state.megatheme
    };
  }


  function visible(el) {
    if (!el || !el.isConnected) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  // CGWEB111 FIX2 · MULTI_URL_MOUNT_RESTORE001 / IMPORT_SCOPE_DECOUPLE001
  // Depuis CGWEB111, le titre « Import Quizypedia par URL » a volontairement disparu.
  // Le mode multi-URL ne doit donc plus dépendre d'un texte de présentation.
  function findImportHeading() {
    return [...document.querySelectorAll("h1,h2,h3,h4")]
      .find((e) => lower(e.textContent).includes("import quizypedia par url")) || null;
  }

  function findImportScope() {
    // Référence structurelle actuelle, stable et indépendante du libellé affiché.
    const direct = document.querySelector("#cgimport002Panel");
    if (direct) return direct;

    // Fallback historique uniquement pour rollback / anciennes versions.
    const heading = findImportHeading();
    if (!heading) return null;
    return heading.closest("section,.card,.panel,[class*='card'],[class*='panel']") || heading.parentElement;
  }

  function findUrlInput(scope) {
    const inputs = [...(scope || document).querySelectorAll('input[type="url"],input[type="text"],textarea')];
    return inputs.find((e) => {
      const p = lower(e.getAttribute("placeholder"));
      const a = lower(e.getAttribute("aria-label"));
      return p.includes("quizypedia.fr/quiz") || a.includes("adresse quizypedia");
    }) || inputs.find((e) => lower(e.closest("label")?.textContent).includes("adresse quizypedia"));
  }

  // CGWEB116 FIX3 FIX2 · STABLE_CONTROL_IDS001
  // Les automatismes ne doivent plus dépendre d'un libellé visible.
  function findAnalyzeButton(scope) {
    const direct = document.getElementById("cgimp2Analyze");

    if (
      direct &&
      direct.isConnected &&
      (!scope || scope.contains(direct)) &&
      !direct.closest("#cgimport011Bulk")
    ) {
      return direct;
    }

    return [...(scope || document).querySelectorAll("button")]
      .find((b) => {
        if (b.closest("#cgimport011Bulk")) return false;

        const t = lower(b.textContent);

        return (
          t === "analyser" ||
          t === "analyser l'url" ||
          t === "analyser l’url"
        );
      }) || null;
  }

  function findImportButton(scope) {
    const direct = document.getElementById("cgimp2Import");

    if (
      direct &&
      direct.isConnected &&
      (!scope || scope.contains(direct)) &&
      !direct.closest("#cgimport011Bulk")
    ) {
      return direct;
    }

    return [...(scope || document).querySelectorAll("button")]
      .find((b) => {
        if (b.closest("#cgimport011Bulk")) return false;

        return lower(b.textContent) === "importer";
      }) || null;
  }

  function findThemeInput(scope) {
    const candidates = [...(scope || document).querySelectorAll('input[type="text"]')];
    return candidates.find((e) => {
      const p = lower(e.placeholder);
      const lab = lower(e.closest("label")?.textContent);
      return p.includes("détecté depuis") || (lab.startsWith("thème") && !lab.includes("mégathème"));
    });
  }

  function nativeSetValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // CGWEB116 FIX3 FIX3 · BATCH_CLASSIFICATION_LOCK001
  function applyBatchMegatheme(scope, requestedMega) {

    const mega =
      String(requestedMega || "")
        .trim();

    if (!mega) {
      throw new Error(
        "Aucun mégathème n’est associé à ce lot."
      );
    }

    const select =
      document.getElementById(
        "cgimp2Mega"
      );

    if (!select) {
      throw new Error(
        "Menu Mégathème de l’importeur introuvable."
      );
    }

    const target =
      [...select.options]
        .find(option => {

          const value =
            norm(option.value);

          const label =
            norm(option.textContent);

          return (
            value === norm(mega) ||
            label === norm(mega)
          );
        });

    if (!target) {
      throw new Error(
        `Mégathème inconnu : ${mega}`
      );
    }

    select.value =
      target.value;

    select.dispatchEvent(
      new Event(
        "input",
        { bubbles:true }
      )
    );

    select.dispatchEvent(
      new Event(
        "change",
        { bubbles:true }
      )
    );

    return true;
  }


  function snapshotText(scope) {
    return norm((scope || document.body).innerText).slice(-12000);
  }

  function extractStats(text) {
    const t = norm(text);
    const firstNum = (patterns) => {
      for (const rx of patterns) {
        const m = t.match(rx);
        if (m) return Number(m[1]);
      }
      return null;
    };
    return {
      added: firstNum([
        /(\d+)\s+questions?\s+(?:ajoutée?s?|importée?s?|créée?s?)/i,
        /(?:ajoutées?|importées?|créées?)\s*[:=]\s*(\d+)/i
      ]),
      duplicates: firstNum([
        /(\d+)\s+doublons?/i,
        /doublons?\s*[:=]\s*(\d+)/i,
        /(\d+)\s+déjà\s+présentes?/i
      ]),
      errors: firstNum([
        /(\d+)\s+erreurs?/i,
        /erreurs?\s*[:=]\s*(\d+)/i
      ])
    };
  }

  async function waitImporterCycle(
    scope,
    button,
    beforeText,
    resolver = findAnalyzeButton
  ) {
    const started = Date.now();
    let sawDisabled = !!button.disabled;
    let lastMutation = Date.now();
    let changed = false;

    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
      changed = true;
      if (button.disabled) sawDisabled = true;
    });
    observer.observe(scope, { subtree: true, childList: true, attributes: true, characterData: true });

    try {
      while (Date.now() - started < IMPORT_TIMEOUT_MS) {
        await sleep(500);
        if (!button.isConnected) {
          button =
            resolver(scope) ||
            resolver(document);

          if (!button) continue;
        }
        if (button.disabled) sawDisabled = true;

        const currentText = snapshotText(scope);
        const terminal = /(?:terminé|terminee|terminée|import terminé|capture terminée|analyse terminée|échec|erreur fatale|aucune fiche|aucun questionnaire)/i.test(currentText);

        if (sawDisabled && !button.disabled && Date.now() - lastMutation > 1200) {
          return { ok: true, text: currentText, reason: "button-cycle" };
        }
        if (changed && terminal && !button.disabled && Date.now() - lastMutation > 1800) {
          return { ok: !/(?:échec|erreur fatale)/i.test(currentText), text: currentText, reason: "terminal-text" };
        }
        if (!sawDisabled && changed && !button.disabled &&
            currentText !== beforeText && Date.now() - lastMutation > QUIET_MS &&
            Date.now() - started > 7000) {
          return { ok: true, text: currentText, reason: "quiet-dom" };
        }
      }
      throw new Error("Délai maximal dépassé pour ce thème.");
    } finally {
      observer.disconnect();
    }
  }

  async function runOne(item) {

    const scope =
      findImportScope();

    if (!scope) {
      throw new Error(
        "Importeur Quizypedia introuvable."
      );
    }


    const input =
      findUrlInput(scope);

    let importer =
      findAnalyzeButton(scope);


    if (!input) {
      throw new Error(
        "Champ « Adresse Quizypedia » introuvable."
      );
    }

    if (!importer) {
      throw new Error(
        "Bouton principal « Importer » introuvable."
      );
    }


    /*
      Attendre uniquement la disponibilité
      du pipeline principal.
    */
    for (
      let i = 0;
      i < 60 && importer.disabled;
      i++
    ) {
      await sleep(250);
    }

    if (importer.disabled) {
      throw new Error(
        "L’importeur Quizypedia est encore occupé."
      );
    }


    /*
      Le mégathème du TXT est réappliqué
      AVANT chaque URL.
    */
    const batchMega =
      String(
        item.megatheme ||
        state.megatheme ||
        ""
      ).trim();

    applyBatchMegatheme(
      scope,
      batchMega
    );


    /*
      Le thème sera détecté par Quizypedia.
    */
    const themeInput =
      findThemeInput(scope);

    nativeSetValue(
      themeInput,
      ""
    );

    nativeSetValue(
      input,
      item.url
    );


    item.status =
      "running";

    item.startedAt =
      new Date().toISOString();

    item.message =
      "Import en cours…";

    saveState();
    render();


    /*
      POINT CLE :

      ce clic appelle maintenant EXACTEMENT
      oneClickImport(), comme un clic manuel.

      Donc :
      découverte
      -> capture
      -> import Firestore
      -> fin
    */
    const before =
      snapshotText(scope);

    importer.click();


    const result =
      await waitImporterCycle(
        scope,
        importer,
        before,
        findAnalyzeButton
      );


    const statusNode =
      document.getElementById(
        "cgimp2Status"
      );

    const statusText =
      norm(
        statusNode?.textContent || ""
      );

    const statusError =
      statusNode
        ?.classList
        ?.contains("err") ||
      /^❌/.test(statusText) ||
      /(?:échec|erreur|impossible|incomplète)/i
        .test(statusText);


    const finalText =
      result.text ||
      snapshotText(scope);


    Object.assign(
      item,
      extractStats(finalText)
    );


    item.status =
      result.ok && !statusError
        ? "done"
        : "error";


    item.message =
      item.status === "done"
        ? "Import terminé"
        : (
            statusText ||
            "Échec pendant l’import"
          );


    item.endedAt =
      new Date().toISOString();


    item.durationSec =
      Math.max(
        1,
        Math.round(
          (
            new Date(item.endedAt) -
            new Date(item.startedAt)
          ) / 1000
        )
      );


    saveState();
    render();
  }

  async function startQueue() {
    if (state.running || !state.items.length) return;

    if (!state.megatheme) {
      setGlobalMessage(
        "Choisis le mégathème du lot avant de lancer l’import.",
        "error"
      );
      return;
    }

    if (!findImportScope()) {
      setGlobalMessage("Importeur Quizypedia introuvable.", "error");
      return;
    }

    state.running = true;
    state.pauseRequested = false;
    state.stopRequested = false;
    render();

    try {
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        if (state.stopRequested) break;
        if (item.status === "done") continue;

        if (state.pauseRequested) {
          setGlobalMessage("Pause demandée — reprise possible.", "warn");
          break;
        }

        state.currentIndex = i;
        try {
          await runOne(item);
        } catch (err) {
          item.status = "error";
          item.endedAt = new Date().toISOString();
          item.message = err?.message || String(err);
          if (item.startedAt) {
            item.durationSec = Math.max(1, Math.round((new Date(item.endedAt) - new Date(item.startedAt)) / 1000));
          }
          saveState(); render();
        }

        await sleep(1200);
      }
    } finally {
      state.running = false;
      state.currentIndex = -1;
      saveState();
      render();
      if (state.stopRequested) setGlobalMessage("Traitement arrêté. Les lignes non traitées restent disponibles.", "warn");
      else if (state.pauseRequested) setGlobalMessage("Traitement en pause.", "warn");
      else if (state.items.length && state.items.every((x) => x.status === "done" || x.status === "error")) {
        setGlobalMessage("Traitement terminé.", "ok");
      }
    }
  }

  function pauseQueue() {
    if (!state.running) return;
    state.pauseRequested = true;
    setGlobalMessage("Pause après le thème en cours…", "warn");
    render();
  }

  function resumeQueue() {
    state.pauseRequested = false;
    state.stopRequested = false;
    startQueue();
  }

  function stopQueue() {
    if (!state.running) return;
    state.stopRequested = true;
    state.pauseRequested = false;
    setGlobalMessage("Arrêt après le thème en cours…", "warn");
    render();
  }

  function resetQueue() {
    if (state.running) return;
    state.items = [];
    state.sourceName = "";
    state.megatheme = "";
    state.currentIndex = -1;
    state.startedAt = null;
    localStorage.removeItem(STORAGE_KEY);
    render();
    setGlobalMessage("Liste effacée.", "ok");
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadReport() {
    if (!state.items.length) return;
    const rows = [
      ["URL", "Etat", "Duree_s", "Questions_ajoutees", "Doublons", "Erreurs", "Message"],
      ...state.items.map((x) => [
        x.url, x.status, x.durationSec ?? "", x.added ?? "", x.duplicates ?? "", x.errors ?? "", x.message || ""
      ])
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport-import-quizypedia-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function setGlobalMessage(message, kind = "") {
    const el = document.querySelector("#cgimport011Message");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind;
  }

  function stats() {
    return {
      total: state.items.length,
      done: state.items.filter((x) => x.status === "done").length,
      errors: state.items.filter((x) => x.status === "error").length,
      pending: state.items.filter((x) => x.status === "pending").length,
      running: state.items.filter((x) => x.status === "running").length
    };
  }

  function renderTable() {
    const body = document.querySelector("#cgimport011Rows");
    if (!body) return;
    body.innerHTML = "";
    const max = Math.min(state.items.length, 200);
    for (let i = 0; i < max; i++) {
      const x = state.items[i];
      const tr = document.createElement("tr");
      const statusLabel = {
        pending: "En attente",
        running: "En cours",
        done: "Terminé",
        error: "Erreur"
      }[x.status] || x.status;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td class="cgimport011-url"></td>
        <td><span class="cgimport011-status cgimport011-${x.status}">${statusLabel}</span></td>
        <td>${x.durationSec ?? "—"}</td>
        <td>${x.added ?? "—"}</td>
        <td>${x.duplicates ?? "—"}</td>
        <td class="cgimport011-msg"></td>`;
      tr.querySelector(".cgimport011-url").textContent = x.url;
      tr.querySelector(".cgimport011-msg").textContent = x.message || "";
      body.appendChild(tr);
    }
    if (state.items.length > max) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7">… ${state.items.length - max} ligne(s) supplémentaires non affichées.</td>`;
      body.appendChild(tr);
    }
  }

  function render() {
    const root = document.querySelector("#cgimport011Bulk");
    if (!root) return;
    const s = stats();
    const summary = root.querySelector("#cgimport011Summary");
    if (summary) {
      summary.textContent = state.items.length
        ? `${s.total} thème(s) · ${s.done} terminé(s) · ${s.errors} erreur(s) · ${s.pending} en attente${state.sourceName ? ` · ${state.sourceName}` : ""}${state.megatheme ? ` · Mégathème : ${state.megatheme}` : " · Mégathème à définir"}`
        : "Aucun fichier TXT chargé.";
    }
    const progress = root.querySelector("#cgimport011Progress");
    if (progress) {
      progress.max = Math.max(1, s.total);
      progress.value = s.done + s.errors;
    }

    const start = root.querySelector("#cgimport011Start");
    const pause = root.querySelector("#cgimport011Pause");
    const resume = root.querySelector("#cgimport011Resume");
    const stop = root.querySelector("#cgimport011Stop");
    const report = root.querySelector("#cgimport011Report");
    const reset = root.querySelector("#cgimport011Reset");
    const megaSelect = root.querySelector("#cgimport011Mega");

    if (megaSelect) {

      if (
        state.megatheme &&
        megaSelect.value !== state.megatheme
      ) {
        megaSelect.value =
          state.megatheme;
      }

      megaSelect.disabled =
        state.running ||
        (
          state.items.length > 0 &&
          Boolean(state.megatheme)
        );
    }

    if (start) start.disabled =
      state.running ||
      !state.items.length ||
      !state.megatheme;
    if (pause) pause.disabled = !state.running || state.pauseRequested;
    if (resume) resume.disabled =
      state.running ||
      !state.megatheme ||
      !state.items.some(
        (x) => x.status !== "done"
      );
    if (stop) stop.disabled = !state.running;
    if (report) report.disabled = !state.items.length;
    if (reset) reset.disabled = state.running;
    renderTable();
  }

  function buildUi() {
    const root = document.createElement("section");
    root.id = "cgimport011Bulk";
    root.className = "cgimport011-bulk";
    root.innerHTML = `
      <div class="cgimport011-head">
        <div>
          <h3>Import multiple</h3>
          <p>Un fichier <strong>.txt</strong> = un lot d’un seul mégathème. Une URL Quizypedia par ligne.</p>
        </div>
      </div>

      <div class="cgimport011-fileline">

        <input
          id="cgimport011File"
          type="file"
          accept=".txt,text/plain"
          aria-label="Fichier TXT d’URL Quizypedia"
        >

        <select
          id="cgimport011Mega"
          aria-label="Mégathème du lot"
        >
          <option value="">Mégathème du lot</option>
          <option>Animaux et Plantes</option>
          <option>Culture Classique</option>
          <option>Culture Générale</option>
          <option>Culture Moderne</option>
          <option>Géographie</option>
          <option>Histoire</option>
          <option>Sciences et Techniques</option>
          <option>Sport</option>
        </select>

        <button
          id="cgimport011Load"
          type="button"
        >Lire</button>

      </div>

      <div id="cgimport011Summary" class="cgimport011-summary">Aucun fichier chargé.</div>
      <progress id="cgimport011Progress" value="0" max="1"></progress>

      <div class="cgimport011-actions">
        <button id="cgimport011Start" type="button">Lancer l'import</button>
        <button id="cgimport011Pause" type="button">Pause</button>
        <button id="cgimport011Resume" type="button">Reprendre</button>
        <button id="cgimport011Stop" type="button">Arrêter</button>
        <button id="cgimport011Report" type="button">Télécharger le rapport CSV</button>
        <button id="cgimport011Reset" type="button">Effacer la liste</button>
      </div>

      <div id="cgimport011Message" class="cgimport011-message"></div>

      <details class="cgimport011-details">
        <summary>Voir la file d'import</summary>
        <div class="cgimport011-tablewrap">
          <table>
            <thead><tr><th>#</th><th>URL</th><th>État</th><th>s</th><th>Ajoutées</th><th>Doublons</th><th>Message</th></tr></thead>
            <tbody id="cgimport011Rows"></tbody>
          </table>
        </div>
      </details>

      <p class="cgimport011-note">Traitement séquentiel : un thème à la fois, en réutilisant l'importeur Quizypedia existant. Tu peux demander une pause ou un arrêt après le thème en cours.</p>`;
    return root;
  }

  function wireUi(root) {
    root.querySelector("#cgimport011Load")?.addEventListener("click", async () => {

      const file =
        root.querySelector(
          "#cgimport011File"
        )?.files?.[0];

      const megatheme =
        root.querySelector(
          "#cgimport011Mega"
        )?.value?.trim() || "";

      try {

        setGlobalMessage(
          "Lecture du fichier TXT…"
        );

        const r =
          await parseFile(
            file,
            megatheme
          );
        setGlobalMessage(
          `${r.count} thème(s) unique(s) chargé(s) · ` +
          `Mégathème : ${r.megatheme} · ` +
          `${r.duplicates} doublon(s) ignoré(s) · ` +
          `${r.invalid} ligne(s) invalide(s) ignorée(s).`,
          "ok"
        );
      } catch (e) {
        setGlobalMessage(e?.message || String(e), "error");
      }
    });
    root.querySelector("#cgimport011Mega")?.addEventListener("change", (event) => {

      const select =
        event.currentTarget;

      const requested =
        String(
          select.value || ""
        ).trim();

      if (
        state.items.length &&
        state.megatheme
      ) {
        select.value =
          state.megatheme;

        return;
      }

      state.megatheme =
        requested;

      if (
        state.items.length &&
        requested
      ) {
        state.items.forEach(
          item => {
            item.megatheme =
              requested;
          }
        );
      }

      saveState();
      render();

      if (
        state.items.length &&
        requested
      ) {
        setGlobalMessage(
          `Mégathème « ${requested} » associé au lot et verrouillé.`,
          "ok"
        );
      }
    });


    root.querySelector("#cgimport011Start")?.addEventListener("click", startQueue);
    root.querySelector("#cgimport011Pause")?.addEventListener("click", pauseQueue);
    root.querySelector("#cgimport011Resume")?.addEventListener("click", resumeQueue);
    root.querySelector("#cgimport011Stop")?.addEventListener("click", stopQueue);
    root.querySelector("#cgimport011Report")?.addEventListener("click", downloadReport);
    root.querySelector("#cgimport011Reset")?.addEventListener("click", resetQueue);
  }

  function ensureUi() {
    if (document.querySelector("#cgimport011Bulk")) return;

    const scope = findImportScope();
    if (!scope) return;
    const ui = buildUi();
    scope.appendChild(ui);
    wireUi(ui);
    render();
  }

  loadState();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUi);
  } else {
    ensureUi();
  }
  new MutationObserver(ensureUi).observe(document.documentElement, { childList: true, subtree: true });

  window.CGIMPORT011 = {
    version: "CGWEB111_FIX2_MULTI_URL_MOUNT_RESTORE001",
    state,
    parseFile,
    start: startQueue,
    pause: pauseQueue,
    resume: resumeQueue,
    stop: stopQueue,
    downloadReport
  };
})();
