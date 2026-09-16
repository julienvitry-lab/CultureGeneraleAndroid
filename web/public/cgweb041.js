(() => {
  "use strict";

  const VERSION = "QUALITY_DASHBOARD001";
  const KEY = "quality_dashboard";

  const rt = {
    plusButton: null,
    plusPanel: null,
    button: null,
    panel: null,
    timer: null
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");
  const intFrom = (s) => {
    const m = String(s ?? "").match(/(\d[\d\s\u00a0]*)/);
    if (!m) return null;
    const n = Number(m[1].replace(/[\s\u00a0]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (n) => Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : "—";

  function visible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function buttonByText(text, root = document) {
    const wanted = lower(text);
    return [...root.querySelectorAll("button")].find((b) => lower(b.textContent) === wanted) || null;
  }

  function plusPanel() {
    return document.querySelector('[data-cg16-page-panel="more"]') ||
      [...document.querySelectorAll("section,.panel,.card,div")].find((el) => {
        if (!visible(el)) return false;
        const buttons = [...el.querySelectorAll(":scope > button, :scope > div > button")];
        const texts = buttons.map((b) => lower(b.textContent));
        return texts.includes("contrôle qualité") &&
               texts.includes("doublons intelligents") &&
               texts.includes("bibliothèque d’images");
      }) || null;
  }

  function plusButton() {
    return document.querySelector('button[data-cg16-page="more"]') || buttonByText("Plus");
  }

  function homeStat(label) {
    const wanted = lower(label);
    const nodes = [...document.querySelectorAll("div,section,article,span,p")];
    for (const el of nodes) {
      if (lower(el.textContent) !== wanted) continue;
      const box = el.closest("article,section,[class*='card'],[class*='stat'],div");
      if (!box) continue;
      const candidates = [
        ...box.querySelectorAll("strong,b,[class*='value'],[class*='count'],div,span")
      ];
      for (const c of candidates) {
        if (c === el) continue;
        const v = intFrom(norm(c.textContent));
        if (Number.isFinite(v)) return v;
      }
      const sibling = el.nextElementSibling;
      const v = intFrom(norm(sibling?.textContent));
      if (Number.isFinite(v)) return v;
    }
    return null;
  }

  function exactMetricFromDocument(regex) {
    const text = norm(document.body.innerText);
    const m = text.match(regex);
    return m ? Number(String(m[1]).replace(/[\s\u00a0]/g, "")) : null;
  }

  function collectMetrics() {
    const questions =
      homeStat("Questions") ??
      exactMetricFromDocument(/Questions\s+(\d[\d\s\u00a0]*)/i);

    const withImage =
      homeStat("Avec image") ??
      exactMetricFromDocument(/Avec image\s+(\d[\d\s\u00a0]*)/i);

    const imageSearch =
      homeStat("Images à rechercher") ??
      exactMetricFromDocument(/Images à rechercher\s+(\d[\d\s\u00a0]*)/i);

    const duplicatePairs =
      exactMetricFromDocument(/(\d[\d\s\u00a0]*)\s+paire\(s\)/i);

    const withoutImage =
      Number.isFinite(questions) && Number.isFinite(withImage) && questions >= withImage
        ? questions - withImage
        : null;

    const coverage =
      Number.isFinite(questions) && questions > 0 && Number.isFinite(withImage)
        ? Math.round((withImage / questions) * 1000) / 10
        : null;

    return {
      questions,
      withImage,
      withoutImage,
      imageSearch,
      duplicatePairs,
      coverage
    };
  }

  function findToolButton(label) {
    const p = rt.plusPanel || plusPanel();
    if (!p) return null;
    return buttonByText(label, p) || buttonByText(label);
  }

  function openPlusTool(label) {
    const more = rt.plusButton || plusButton();
    more?.click();
    setTimeout(() => {
      const b = findToolButton(label);
      if (b) b.click();
      else setMessage(`Outil « ${label} » introuvable.`, "error");
    }, 80);
  }

  function openDirectory() {
    const b = document.querySelector('button[data-cg16-page="directory"]') || buttonByText("Répertoire");
    if (b) b.click();
    else setMessage("Onglet Répertoire introuvable.", "error");
  }

  function hideOtherPlusPanels() {
    document.querySelectorAll("[data-cg16-plus-panel]").forEach((p) => {
      if (p !== rt.panel) {
        p.hidden = true;
        p.style.display = "none";
      }
    });
  }

  function clearOtherPlusActive() {
    const p = rt.plusPanel || plusPanel();
    if (!p) return;
    p.querySelectorAll("button").forEach((b) => {
      if (b !== rt.button) {
        b.classList.remove("active","is-active","selected","cgweb041-active");
        b.removeAttribute("aria-current");
      }
    });
  }

  function showDashboard() {
    hideOtherPlusPanels();
    if (rt.panel) {
      rt.panel.hidden = false;
      rt.panel.style.display = "block";
    }
    clearOtherPlusActive();
    rt.button?.classList.add("cgweb041-active");
    rt.button?.setAttribute("aria-current", "page");
    render();
  }

  function createButtonAndPanel() {
    rt.plusButton = plusButton();
    rt.plusPanel = plusPanel();
    if (!rt.plusPanel) return false;

    let button = rt.plusPanel.querySelector('[data-cg16-plus="quality_dashboard"]');
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset.cg16Plus = KEY;
      button.className = "cgweb041-plus-button";
      button.textContent = "Tableau qualité";

      const qualityButton =
        buttonByText("Contrôle qualité", rt.plusPanel) ||
        buttonByText("Doublons intelligents", rt.plusPanel);

      if (qualityButton) {
        qualityButton.insertAdjacentElement("beforebegin", button);
      } else {
        rt.plusPanel.appendChild(button);
      }
    }

    let panel = document.querySelector('[data-cg16-plus-panel="quality_dashboard"]');
    if (!panel) {
      panel = document.createElement("section");
      panel.dataset.cg16PlusPanel = KEY;
      panel.id = "cgweb041Panel";
      panel.className = "cgweb041-panel";
      panel.hidden = true;
      panel.style.display = "none";
      panel.innerHTML = `
        <div class="cgweb041-head">
          <div>
            <h2>Qualité de la base</h2>
            <p>Vue synthétique des indicateurs disponibles et accès direct aux outils de contrôle.</p>
          </div>
          <button type="button" id="cgweb041Refresh">Actualiser</button>
        </div>

        <div id="cgweb041Stats" class="cgweb041-stats"></div>

        <section class="cgweb041-section">
          <h3>Outils de contrôle</h3>
          <div class="cgweb041-tools">
            <article>
              <div>
                <strong>Contrôle qualité</strong>
                <span>Questions incomplètes, incohérences et anomalies détectables par l'outil existant.</span>
              </div>
              <button type="button" data-cgweb041-open="Contrôle qualité">Ouvrir</button>
            </article>
            <article>
              <div>
                <strong>Doublons intelligents</strong>
                <span>Doublons exacts et formulations proches. Aucune suppression n'est lancée depuis ce tableau.</span>
              </div>
              <button type="button" data-cgweb041-open="Doublons intelligents">Ouvrir</button>
            </article>
            <article>
              <div>
                <strong>Bibliothèque d'images</strong>
                <span>Couverture image, fichiers et maintenance de la bibliothèque.</span>
              </div>
              <button type="button" data-cgweb041-open="Bibliothèque d’images">Ouvrir</button>
            </article>
            <article>
              <div>
                <strong>Répertoire</strong>
                <span>Rechercher et ouvrir directement les fiches concernées.</span>
              </div>
              <button type="button" id="cgweb041Directory">Ouvrir</button>
            </article>
          </div>
        </section>

        <section class="cgweb041-section">
          <h3>Lecture des indicateurs</h3>
          <div id="cgweb041Interpretation" class="cgweb041-interpretation"></div>
        </section>

        <div id="cgweb041Message" class="cgweb041-message"></div>
        <div id="cgweb041Stamp" class="cgweb041-stamp"></div>`;

      rt.plusPanel.insertAdjacentElement("afterend", panel);
    }

    rt.button = button;
    rt.panel = panel;

    if (button.dataset.cgweb041Wired !== "1") {
      button.dataset.cgweb041Wired = "1";
      button.addEventListener("click", showDashboard);
    }

    panel.querySelector("#cgweb041Refresh")?.addEventListener("click", render);
    panel.querySelectorAll("[data-cgweb041-open]").forEach((b) => {
      if (b.dataset.cgweb041Wired === "1") return;
      b.dataset.cgweb041Wired = "1";
      b.addEventListener("click", () => openPlusTool(b.dataset.cgweb041Open));
    });
    panel.querySelector("#cgweb041Directory")?.addEventListener("click", openDirectory);

    return true;
  }

  function statCard(label, value, note, kind = "") {
    const card = document.createElement("article");
    card.className = `cgweb041-stat ${kind ? `cgweb041-${kind}` : ""}`;
    card.innerHTML = `
      <span class="cgweb041-stat-label"></span>
      <strong class="cgweb041-stat-value"></strong>
      <span class="cgweb041-stat-note"></span>`;
    card.querySelector(".cgweb041-stat-label").textContent = label;
    card.querySelector(".cgweb041-stat-value").textContent = value;
    card.querySelector(".cgweb041-stat-note").textContent = note;
    return card;
  }

  function render() {
    if (!rt.panel) return;
    const m = collectMetrics();

    const stats = rt.panel.querySelector("#cgweb041Stats");
    stats.innerHTML = "";
    stats.append(
      statCard("Questions", fmt(m.questions), "Taille de la base visible"),
      statCard("Avec image", fmt(m.withImage),
        Number.isFinite(m.coverage) ? `${m.coverage.toLocaleString("fr-FR")} % de la base` : "Indicateur indisponible"),
      statCard("Sans image", fmt(m.withoutImage),
        "Indicateur de couverture uniquement : une image n'est pas nécessaire pour chaque question"),
      statCard("Images à rechercher", fmt(m.imageSearch),
        "Questions explicitement signalées pour recherche d'image",
        Number.isFinite(m.imageSearch) && m.imageSearch > 0 ? "warn" : ""),
      statCard("Doublons affichés", Number.isFinite(m.duplicatePairs) ? fmt(m.duplicatePairs) : "Non analysé",
        "Dernier état actuellement présent dans l'interface",
        Number.isFinite(m.duplicatePairs) && m.duplicatePairs > 0 ? "warn" : "")
    );

    const interpretation = rt.panel.querySelector("#cgweb041Interpretation");
    interpretation.innerHTML = "";

    const lines = [];
    if (Number.isFinite(m.coverage)) {
      lines.push(`Couverture image actuelle : ${m.coverage.toLocaleString("fr-FR")} %.`);
    }
    if (Number.isFinite(m.imageSearch)) {
      lines.push(m.imageSearch > 0
        ? `${fmt(m.imageSearch)} question(s) sont explicitement marquées « image à rechercher ».`
        : "Aucune question n'est actuellement signalée « image à rechercher ».");
    }
    if (Number.isFinite(m.duplicatePairs)) {
      lines.push(`${fmt(m.duplicatePairs)} paire(s) sont actuellement affichées dans l'état du détecteur de doublons.`);
    } else {
      lines.push("Le détecteur de doublons n'expose pas encore de résultat exploitable dans cette session.");
    }
    lines.push("Les cartes n'effectuent aucune analyse destructive : elles résument uniquement les informations déjà disponibles dans CGWEB.");

    const ul = document.createElement("ul");
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
    interpretation.appendChild(ul);

    rt.panel.querySelector("#cgweb041Stamp").textContent =
      `Dernière lecture : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(new Date())}`;
  }

  function setMessage(text, kind = "") {
    const el = rt.panel?.querySelector("#cgweb041Message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.kind = kind;
  }

  function boot() {
    let attempts = 0;
    const tick = () => {
      attempts++;
      if (createButtonAndPanel()) {
        window.CGWEB041 = {
          version: VERSION,
          show: showDashboard,
          refresh: render,
          metrics: collectMetrics
        };
        rt.timer = setInterval(() => {
          if (rt.panel && visible(rt.panel)) render();
        }, 15000);
        return;
      }
      if (attempts < 120) setTimeout(tick, 250);
    };
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

