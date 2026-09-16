(() => {
  "use strict";

  const VERSION = "LEARNING_ANALYTICS002";
  const TAB_LABELS = ["Historique","Maîtrise","Points faibles","Temps de réponse","Difficulté"];

  const rt = {
    panel: null,
    tabBar: null,
    analysisButton: null,
    analysisPanel: null,
    hiddenNodes: [],
    scanning: false,
    snapshots: {}
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");
  const num = (s) => {
    const n = Number(String(s ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  function buttonByText(text, root = document) {
    const wanted = lower(text);
    return [...root.querySelectorAll("button")].find((b) => lower(b.textContent) === wanted) || null;
  }

  function findLearningPanel() {
    const direct = document.querySelector('[data-cg16-page-panel="learning"]');
    if (direct) return direct;
    const h = [...document.querySelectorAll("h1,h2,h3")].find((x) => lower(x.textContent) === "apprentissage");
    return h?.closest('[data-cg16-page-panel],section,.panel,.card,main') || h?.parentElement || null;
  }

  function findTabBar(panel) {
    const buttons = [...panel.querySelectorAll("button")];
    const difficulty = buttons.find((b) => lower(b.textContent) === "difficulté");
    if (!difficulty) return null;
    const parent = difficulty.parentElement;
    if (!parent) return null;
    const texts = [...parent.querySelectorAll("button")].map((b) => lower(b.textContent));
    return texts.includes("historique") && texts.includes("maîtrise") ? parent : null;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForView(label, previousText) {
    const wanted = lower(label);
    for (let i = 0; i < 20; i++) {
      await wait(180);
      const text = norm(rt.panel?.innerText || "");
      if (text !== previousText && !lower(text).includes("initialisation")) return text;
      const active = [...rt.tabBar.querySelectorAll("button")].find((b) =>
        (b.matches(".active,.selected,[aria-current='page']") || b.getAttribute("aria-pressed") === "true")
      );
      if (active && lower(active.textContent) === wanted && !lower(text).includes("initialisation")) return text;
    }
    return norm(rt.panel?.innerText || "");
  }

  function snapshotText() {
    if (!rt.panel) return "";
    const clone = rt.panel.cloneNode(true);
    clone.querySelector("#cgweb042Analysis")?.remove();
    clone.querySelector("#cgweb042Overlay")?.remove();
    return norm(clone.innerText);
  }

  function parseDifficulty(text) {
    const out = [];
    const re = /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ0-9'’()\- ]{1,70})\s+(\d+)\s+question(?:\(s\)|s)?\s*[·\-]\s*(?:(\d+(?:[.,]\d+)?)\s*%\s+réussite|aucune réponse évaluée)\s+Difficulté\s*(?:(\d+(?:[.,]\d+)?)\s*\/\s*100|—)\s*[·\-]\s*(?:(\d+)\s+réponse(?:\(s\)|s)?|données insuffisantes)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const domain = norm(m[1]);
      if (!domain || lower(domain).includes("choisis un domaine")) continue;
      out.push({
        domain,
        questions: num(m[2]),
        success: m[3] != null ? num(m[3]) : null,
        difficulty: m[4] != null ? num(m[4]) : null,
        responses: m[5] != null ? num(m[5]) : 0
      });
    }
    return dedupeByDomain(out);
  }

  function parseResponse(text) {
    const out = [];
    const re = /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ0-9'’()\- ]{1,70})\s+(\d+)\s+chrono(?:s)?\s*[·\-]\s*médiane\s*(\d+(?:[.,]\d+)?)\s*s\s*[·\-]\s*moyenne\s*(\d+(?:[.,]\d+)?)\s*s(?:\s+(\d+)\s+[^\n]{0,50}lente)?/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const domain = norm(m[1]);
      if (!domain || lower(domain).includes("temps de réponse")) continue;
      out.push({
        domain,
        chronos: num(m[2]),
        median: num(m[3]),
        average: num(m[4]),
        slower: m[5] != null ? num(m[5]) : null
      });
    }
    return dedupeByDomain(out);
  }

  function parseMastery(text) {
    const seen = /(\d+)\s+question(?:s)?\s+vue(?:s)?/i.exec(text);
    const success = /(\d+(?:[.,]\d+)?)\s*%\s+réussite/i.exec(text);
    const mastered = /(\d+)\s+maîtrisé(?:e|es|s)?/i.exec(text);
    const known = /(\d+)\s+connue(?:s)?/i.exec(text);
    const fragile = /(\d+)\s+fragile(?:s)?/i.exec(text);
    const discovered = /(\d+)\s+découverte(?:s)?/i.exec(text);
    const review = /(\d+)\s+à réviser/i.exec(text);
    return {
      seen: seen ? num(seen[1]) : null,
      success: success ? num(success[1]) : null,
      mastered: mastered ? num(mastered[1]) : null,
      known: known ? num(known[1]) : null,
      fragile: fragile ? num(fragile[1]) : null,
      discovered: discovered ? num(discovered[1]) : null,
      review: review ? num(review[1]) : null
    };
  }

  function parseHistory(text) {
    const shown = /(\d+)\s+affiché(?:s)?\s*[·\-]\s*(\d+)\s+derniers maximum/i.exec(text);
    const attempts = (text.match(/Tentative\s+\d+\s*\/\s*\d+/gi) || []).length;
    const qcm = (text.match(/\bQCM\b/gi) || []).length;
    const mental = (text.match(/\bMental\b/gi) || []).length;
    const revision = (text.match(/\bRévision\b/gi) || []).length;
    return {
      shown: shown ? num(shown[1]) : attempts || null,
      limit: shown ? num(shown[2]) : 100,
      attempts,
      qcm,
      mental,
      revision
    };
  }

  function dedupeByDomain(arr) {
    const map = new Map();
    for (const x of arr) {
      const key = lower(x.domain);
      if (!map.has(key)) map.set(key, x);
    }
    return [...map.values()];
  }

  function domainMap(difficulty, response) {
    const map = new Map();
    for (const d of difficulty) {
      map.set(lower(d.domain), { domain: d.domain, difficulty: d, response: null });
    }
    for (const r of response) {
      const key = lower(r.domain);
      const row = map.get(key) || { domain: r.domain, difficulty: null, response: null };
      row.response = r;
      map.set(key, row);
    }
    return [...map.values()];
  }

  function flagsFor(row) {
    const flags = [];
    const d = row.difficulty;
    const r = row.response;

    if (d && d.responses < 3) flags.push({ text: "Peu de réponses évaluées", kind: "muted" });
    if (r && r.chronos < 3) flags.push({ text: "Peu de chronos", kind: "muted" });
    if (d?.difficulty != null && d.difficulty >= 60) flags.push({ text: "Difficulté élevée", kind: "warn" });
    if (d?.success != null && d.success < 60) flags.push({ text: "Réussite fragile", kind: "warn" });
    if (r?.median != null && r.median >= 15) flags.push({ text: "Réponse lente", kind: "warn" });

    if (
      d?.success != null && d.success >= 80 &&
      d?.difficulty != null && d.difficulty < 40 &&
      r?.median != null && r.median < 15 &&
      (d.responses ?? 0) >= 3 && (r.chronos ?? 0) >= 3
    ) {
      flags.push({ text: "Profil solide", kind: "ok" });
    }

    if (!flags.length) flags.push({ text: "Pas de signal particulier", kind: "ok" });
    return flags;
  }

  function priorityCount(row) {
    return flagsFor(row).filter((x) => x.kind === "warn").length;
  }

  function fmt(v, suffix = "") {
    return v == null || !Number.isFinite(Number(v)) ? "—" : `${String(v).replace(".", ",")}${suffix}`;
  }

  function renderAnalysis(data) {
    const host = rt.analysisPanel;
    if (!host) return;

    const mastery = data.mastery;
    const history = data.history;
    const rows = domainMap(data.difficulty, data.response)
      .sort((a, b) => priorityCount(b) - priorityCount(a) || a.domain.localeCompare(b.domain, "fr"));

    host.innerHTML = `
      <div class="cgweb042-head">
        <div>
          <h2>Analyse croisée</h2>
          <p>Lecture conjointe des vues Maîtrise, Historique, Temps de réponse et Difficulté déjà calculées par CGWEB035.</p>
        </div>
        <button type="button" id="cgweb042Rescan">Recalculer</button>
      </div>

      <div class="cgweb042-global">
        <article><span>Questions vues</span><strong>${fmt(mastery.seen)}</strong></article>
        <article><span>Réussite globale</span><strong>${fmt(mastery.success, " %")}</strong></article>
        <article><span>Maîtrisées</span><strong>${fmt(mastery.mastered)}</strong></article>
        <article><span>À réviser</span><strong>${fmt(mastery.review)}</strong></article>
        <article><span>Historique affiché</span><strong>${fmt(history.shown)}</strong></article>
      </div>

      <section class="cgweb042-section">
        <div class="cgweb042-section-head">
          <div>
            <h3>Lecture par domaine</h3>
            <p>Les seuils servent uniquement de repères visuels : difficulté ≥ 60/100, réussite &lt; 60 %, médiane ≥ 15 s.</p>
          </div>
        </div>
        <div id="cgweb042Domains" class="cgweb042-domains"></div>
      </section>

      <section class="cgweb042-section">
        <h3>Résumé maîtrise</h3>
        <div class="cgweb042-mastery">
          <span>Maîtrisées <strong>${fmt(mastery.mastered)}</strong></span>
          <span>Connues <strong>${fmt(mastery.known)}</strong></span>
          <span>Fragiles <strong>${fmt(mastery.fragile)}</strong></span>
          <span>Découvertes <strong>${fmt(mastery.discovered)}</strong></span>
          <span>À réviser <strong>${fmt(mastery.review)}</strong></span>
        </div>
      </section>

      <div class="cgweb042-note">
        Cette analyse est en lecture seule. Elle réutilise les résultats déjà affichés par les modules d'apprentissage et n'écrit aucune donnée Firebase.
        Une valeur « — » signifie que la vue source n'expose pas encore assez d'information pour cette mesure.
      </div>`;

    const domainHost = host.querySelector("#cgweb042Domains");
    if (!rows.length) {
      domainHost.innerHTML = `<div class="cgweb042-empty">Aucune donnée croisée exploitable pour le moment.</div>`;
    } else {
      for (const row of rows) {
        const d = row.difficulty;
        const r = row.response;
        const card = document.createElement("article");
        card.className = "cgweb042-domain";
        const flags = flagsFor(row);

        card.innerHTML = `
          <div class="cgweb042-domain-top">
            <strong></strong>
            <div class="cgweb042-flags"></div>
          </div>
          <div class="cgweb042-metrics">
            <div><span>Réussite</span><strong>${fmt(d?.success, " %")}</strong></div>
            <div><span>Difficulté</span><strong>${d?.difficulty == null ? "—" : `${fmt(d.difficulty)} / 100`}</strong></div>
            <div><span>Réponses évaluées</span><strong>${fmt(d?.responses)}</strong></div>
            <div><span>Médiane</span><strong>${fmt(r?.median, " s")}</strong></div>
            <div><span>Moyenne</span><strong>${fmt(r?.average, " s")}</strong></div>
            <div><span>Chronos</span><strong>${fmt(r?.chronos)}</strong></div>
          </div>
          <div class="cgweb042-domain-actions">
            <button type="button" data-open-learning="Maîtrise">Maîtrise</button>
            <button type="button" data-open-learning="Temps de réponse">Temps de réponse</button>
            <button type="button" data-open-learning="Difficulté">Difficulté</button>
          </div>`;
        card.querySelector(".cgweb042-domain-top > strong").textContent = row.domain;

        const flagHost = card.querySelector(".cgweb042-flags");
        for (const flag of flags) {
          const span = document.createElement("span");
          span.className = `cgweb042-flag cgweb042-${flag.kind}`;
          span.textContent = flag.text;
          flagHost.appendChild(span);
        }
        domainHost.appendChild(card);
      }
    }

    host.querySelector("#cgweb042Rescan")?.addEventListener("click", runScan);
    host.querySelectorAll("[data-open-learning]").forEach((b) => {
      b.addEventListener("click", () => openSourceTab(b.dataset.openLearning));
    });
  }

  function showOverlay(show, text = "Analyse des vues d’apprentissage…") {
    let overlay = document.querySelector("#cgweb042Overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "cgweb042Overlay";
      overlay.className = "cgweb042-overlay";
      overlay.innerHTML = `<div class="cgweb042-overlay-box"><strong></strong><span>Les données existantes sont relues sans écriture.</span></div>`;
      document.body.appendChild(overlay);
    }
    overlay.querySelector("strong").textContent = text;
    overlay.hidden = !show;
  }

  function hideExistingContent() {
    restoreExistingContent();
    if (!rt.tabBar) return;
    const parent = rt.tabBar.parentElement || rt.panel;
    const children = [...parent.children];
    const idx = children.indexOf(rt.tabBar);
    if (idx < 0) return;
    for (let i = idx + 1; i < children.length; i++) {
      const el = children[i];
      if (el === rt.analysisPanel) continue;
      if (el.id === "cgweb042Analysis") continue;
      rt.hiddenNodes.push({ el, display: el.style.display, hidden: el.hidden });
      el.style.display = "none";
    }
  }

  function restoreExistingContent() {
    for (const item of rt.hiddenNodes) {
      if (!item.el?.isConnected) continue;
      item.el.style.display = item.display;
      item.el.hidden = item.hidden;
    }
    rt.hiddenNodes = [];
  }

  function activateAnalysisVisual() {
    [...rt.tabBar.querySelectorAll("button")].forEach((b) => {
      b.classList.remove("cgweb042-active");
      if (b !== rt.analysisButton) b.removeAttribute("data-cgweb042-current");
    });
    rt.analysisButton.classList.add("cgweb042-active");
    rt.analysisButton.dataset.cgweb042Current = "1";
  }

  function showAnalysisPanel() {
    hideExistingContent();
    rt.analysisPanel.hidden = false;
    rt.analysisPanel.style.display = "block";
    activateAnalysisVisual();
  }

  function hideAnalysisPanel() {
    restoreExistingContent();
    if (rt.analysisPanel) {
      rt.analysisPanel.hidden = true;
      rt.analysisPanel.style.display = "none";
    }
    rt.analysisButton?.classList.remove("cgweb042-active");
    rt.analysisButton?.removeAttribute("data-cgweb042-current");
  }

  function openSourceTab(label) {
    hideAnalysisPanel();
    const b = buttonByText(label, rt.tabBar);
    b?.click();
  }

  async function captureTab(label) {
    const b = buttonByText(label, rt.tabBar);
    if (!b) return "";
    const before = snapshotText();
    b.click();
    const text = await waitForView(label, before);
    rt.snapshots[label] = text;
    return text;
  }

  async function runScan() {
    if (rt.scanning) return;
    rt.scanning = true;
    showOverlay(true);

    try {
      const snapshots = {};
      for (const label of TAB_LABELS) {
        showOverlay(true, `Lecture : ${label}…`);
        snapshots[label] = await captureTab(label);
      }

      const data = {
        mastery: parseMastery(snapshots["Maîtrise"] || ""),
        history: parseHistory(snapshots["Historique"] || ""),
        difficulty: parseDifficulty(snapshots["Difficulté"] || ""),
        response: parseResponse(snapshots["Temps de réponse"] || "")
      };

      renderAnalysis(data);
      showAnalysisPanel();
    } catch (e) {
      rt.analysisPanel.innerHTML = `
        <div class="cgweb042-error">
          Analyse interrompue : ${String(e?.message || e)}
        </div>`;
      showAnalysisPanel();
    } finally {
      showOverlay(false);
      rt.scanning = false;
    }
  }

  function createUi() {
    rt.panel = findLearningPanel();
    if (!rt.panel) return false;
    rt.tabBar = findTabBar(rt.panel);
    if (!rt.tabBar) return false;

    let button = buttonByText("Analyse croisée", rt.tabBar);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.textContent = "Analyse croisée";
      button.className = "cgweb042-tab";
      const difficulty = buttonByText("Difficulté", rt.tabBar);
      if (difficulty) difficulty.insertAdjacentElement("afterend", button);
      else rt.tabBar.appendChild(button);
    }

    let panel = rt.panel.querySelector("#cgweb042Analysis");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "cgweb042Analysis";
      panel.className = "cgweb042-analysis";
      panel.hidden = true;
      panel.style.display = "none";
      rt.tabBar.insertAdjacentElement("afterend", panel);
    }

    rt.analysisButton = button;
    rt.analysisPanel = panel;

    if (button.dataset.cgweb042Wired !== "1") {
      button.dataset.cgweb042Wired = "1";
      button.addEventListener("click", runScan);
    }

    for (const b of rt.tabBar.querySelectorAll("button")) {
      if (b === button || b.dataset.cgweb042SourceWired === "1") continue;
      b.dataset.cgweb042SourceWired = "1";
      b.addEventListener("click", () => {
        if (!rt.scanning) hideAnalysisPanel();
      });
    }

    return true;
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries++;
      if (createUi()) {
        window.CGWEB042 = {
          version: VERSION,
          scan: runScan,
          snapshots: () => ({ ...rt.snapshots })
        };
        return;
      }
      if (tries < 120) setTimeout(tick, 250);
    };
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

