// CGWEB013 — contrôle qualité statique des questions
const CG13 = {
  report: null,
  selected: null
};

const cg13$ = id => document.getElementById(id);

function cg13Fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : "—";
}

function cg13Status(text, type = "") {
  const el = cg13$("cg13Status");
  if (!el) return;
  el.textContent = text;
  el.className = "cg13-status " + (type ? `cg13-${type}` : "");
}

function cg13SeverityLabel(v) {
  if (v === "error") return "Erreur";
  if (v === "warn") return "Avertissement";
  return "Info";
}

function cg13BuildCards() {
  const report = CG13.report;
  const grid = cg13$("cg13Grid");

  const issues = Object.entries(report.issues || {})
    .filter(([, item]) => Number(item.count || 0) > 0)
    .sort((a, b) => {
      const rank = { error: 0, warn: 1, info: 2 };
      return (rank[a[1].severity] ?? 9) - (rank[b[1].severity] ?? 9)
        || Number(b[1].count || 0) - Number(a[1].count || 0);
    });

  grid.innerHTML = issues.map(([key, item]) => `
    <button class="cg13-card cg13-${item.severity}" data-issue="${key}">
      <div class="cg13-card-top">
        <span>${item.label}</span>
        <span class="cg13-badge">${cg13SeverityLabel(item.severity)}</span>
      </div>
      <div class="cg13-count">${cg13Fmt(item.count)}</div>
      <div class="cg13-desc">${item.description || ""}</div>
    </button>
  `).join("");

  grid.querySelectorAll("[data-issue]").forEach(button => {
    button.onclick = () => cg13ShowIssue(button.dataset.issue);
  });

  if (!issues.length) {
    grid.innerHTML = `<div class="cg13-empty">Aucune anomalie détectée. 🎯</div>`;
  }
}

function cg13ShowIssue(key) {
  const item = CG13.report?.issues?.[key];
  if (!item) return;

  CG13.selected = key;

  cg13$("cg13DetailTitle").textContent =
    `${item.label} — ${cg13Fmt(item.count)}`;

  cg13$("cg13DetailText").textContent =
    item.description || "";

  const ids = item.ids || [];
  const tbody = cg13$("cg13Rows");

  tbody.innerHTML = ids.map(id => `
    <tr>
      <td>${id}</td>
      <td>
        <button class="cg13-open" data-id="${id}">Ouvrir</button>
      </td>
    </tr>
  `).join("");

  cg13$("cg13Detail").classList.remove("cg13-hidden");

  cg13$("cg13DetailMeta").textContent =
    item.count > ids.length
      ? `${cg13Fmt(ids.length)} ID affichés sur ${cg13Fmt(item.count)} occurrence(s).`
      : `${cg13Fmt(ids.length)} ID affichés.`;

  tbody.querySelectorAll("[data-id]").forEach(button => {
    button.onclick = () => cg13OpenQuestion(button.dataset.id);
  });
}

async function cg13OpenQuestion(id) {
  cg13Status(`Ouverture de ${id}…`);

  try {
    if (!window.CGWEB006_API?.byId || !window.CGWEB006_render) {
      throw new Error("Répertoire CGWEB006 indisponible.");
    }

    const row = await window.CGWEB006_API.byId(String(id));
    if (!row) {
      throw new Error(`Question ${id} introuvable dans Firestore.`);
    }

    window.CGWEB006_render([row]);

    const search = cg13$("cg6Search");
    const mode = cg13$("cg6SearchMode");

    if (mode) mode.value = "id";
    if (search) search.value = id;

    cg13$("cgweb006Panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    cg13Status(`Question ${id} ouverte.`, "ok");
  } catch (error) {
    cg13Status(error?.message || String(error), "error");
  }
}

async function cg13Load() {
  cg13Status("Chargement du rapport…");

  const r = await fetch(
    "./cgweb013_quality.json?v=CGWEB013_1",
    { cache: "no-store" }
  );

  if (!r.ok) {
    throw new Error("Rapport CGWEB013 introuvable.");
  }

  CG13.report = await r.json();

  const report = CG13.report;

  cg13$("cg13Score").textContent = `${Number(report.quality_score || 0).toFixed(2)} %`;
  cg13$("cg13Questions").textContent = cg13Fmt(report.question_count);
  cg13$("cg13Clean").textContent = cg13Fmt(report.clean_question_count);
  cg13$("cg13Problems").textContent = cg13Fmt(report.problem_question_count);

  cg13$("cg13Generated").textContent =
    `Snapshot ${report.source_db || ""} · généré le ${
      new Date(report.generated_at).toLocaleString("fr-FR")
    }`;

  cg13$("cg13Info").textContent =
    `Détails vides : ${cg13Fmt(report.info?.empty_detail_count)} · ` +
    `non_trouve : ${cg13Fmt(report.info?.non_trouve_count)}.`;

  cg13BuildCards();
  cg13Status("Rapport qualité chargé.", "ok");
}

function cg13Init() {
  if (cg13$("cgweb013Panel")) return;

  const panel = document.createElement("section");
  panel.id = "cgweb013Panel";
  panel.className = "cg13-panel";

  panel.innerHTML = `
    <div class="cg13-head">
      <div>
        <div class="cg13-kicker">CGWEB013</div>
        <h2>Contrôle qualité des questions</h2>
        <div id="cg13Generated" class="cg13-generated"></div>
      </div>
    </div>

    <div class="cg13-summary">
      <div class="cg13-summary-card">
        <span>Score qualité</span>
        <strong id="cg13Score">—</strong>
      </div>
      <div class="cg13-summary-card">
        <span>Questions analysées</span>
        <strong id="cg13Questions">—</strong>
      </div>
      <div class="cg13-summary-card">
        <span>Sans anomalie</span>
        <strong id="cg13Clean">—</strong>
      </div>
      <div class="cg13-summary-card">
        <span>À vérifier</span>
        <strong id="cg13Problems">—</strong>
      </div>
    </div>

    <div id="cg13Grid" class="cg13-grid"></div>

    <div id="cg13Detail" class="cg13-detail cg13-hidden">
      <div class="cg13-detail-head">
        <div>
          <h3 id="cg13DetailTitle"></h3>
          <div id="cg13DetailText" class="cg13-detail-text"></div>
          <div id="cg13DetailMeta" class="cg13-detail-meta"></div>
        </div>
        <button id="cg13Close" class="cg13-close">Fermer</button>
      </div>

      <div class="cg13-table-wrap">
        <table class="cg13-table">
          <thead>
            <tr><th>ID</th><th></th></tr>
          </thead>
          <tbody id="cg13Rows"></tbody>
        </table>
      </div>
    </div>

    <div id="cg13Info" class="cg13-info"></div>
    <div id="cg13Status" class="cg13-status"></div>
  `;

  const health = cg13$("cgsync005Panel");
  const directory = cg13$("cgweb006Panel");

  if (health?.parentElement) {
    health.insertAdjacentElement("afterend", panel);
  } else if (directory?.parentElement) {
    directory.insertAdjacentElement("afterend", panel);
  } else {
    (document.querySelector("main") || document.body).appendChild(panel);
  }

  cg13$("cg13Close").onclick = () =>
    cg13$("cg13Detail").classList.add("cg13-hidden");

  cg13Load().catch(error =>
    cg13Status(error?.message || String(error), "error")
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cg13Init);
} else {
  cg13Init();
}
