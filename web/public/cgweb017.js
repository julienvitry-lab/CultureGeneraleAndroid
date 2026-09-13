const CGWEB017_VERSION = "CGWEB017_DASHBOARD001";
const cg17$ = id => document.getElementById(id);
const cg17Sleep = ms => new Promise(r => setTimeout(r, ms));
const cg17Fmt = v => new Intl.NumberFormat("fr-FR").format(Number(v || 0));

function cg17Date(value) {
  if (!value) return "—";
  try {
    const d = typeof value?.toDate === "function" ? value.toDate()
      : value?.seconds ? new Date(value.seconds * 1000)
      : new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR");
  } catch (_) { return "—"; }
}

function cg17Status(text, type = "") {
  const el = cg17$("cg17Status");
  if (!el) return;
  el.textContent = text;
  el.className = `cg17-status${type ? " cg17-" + type : ""}`;
}

async function cg17Wait() {
  for (let i = 0; i < 120; i++) {
    if (window.CGWEB001?.getUser?.() && window.CGWEB017_API && window.CGSYNC005_API) return;
    await cg17Sleep(100);
  }
  throw new Error("Contexte Dashboard indisponible.");
}

function cg17Card(label, value, sub, key = "") {
  return `<button type="button" class="cg17-card" ${key ? `data-cg17-go="${key}"` : ""}>
    <span>${label}</span><strong>${value}</strong><small>${sub || ""}</small>
  </button>`;
}

function cg17WireCards() {
  document.querySelectorAll("[data-cg17-go]").forEach(button => {
    button.onclick = () => window.CGWEB016_API?.navigate?.("directory");
  });
  document.querySelectorAll("[data-cg17-open]").forEach(button => {
    button.onclick = () => window.CGWEB019_API?.open?.(button.dataset.cg17Open);
  });
}

async function cg17Load() {
  cg17Status("Chargement des indicateurs…");
  try {
    await cg17Wait();
    const [stats, health, quality, conflicts] = await Promise.all([
      window.CGWEB017_API.stats(),
      window.CGSYNC005_API.health(),
      fetch("./cgweb013_quality.json?v=CGWEB013_1", {cache:"no-store"})
        .then(r => r.ok ? r.json() : null).catch(() => null),
      window.CGSYNC007_API?.listOpen?.(100).catch?.(() => []) || []
    ]);

    const legacyImages = Math.max(0, Number(stats.with_image || 0) - Number(stats.cloud_images || 0));
    const qualityScore = quality ? `${Number(quality.quality_score || 0).toFixed(2)} %` : "—";

    cg17$("cg17Cards").innerHTML = [
      cg17Card("Questions", cg17Fmt(stats.total), "Total Firestore", "directory"),
      cg17Card("Avec image", cg17Fmt(stats.with_image), "Toutes origines", "directory"),
      cg17Card("Images Firebase", cg17Fmt(stats.cloud_images), "Stockage central", "directory"),
      cg17Card("Images historiques", cg17Fmt(legacyImages), "Encore hors Storage", "directory"),
      cg17Card("Introuvables", cg17Fmt(stats.non_trouve), "non_trouve = 1", "directory"),
      cg17Card("Modifiées 7 j", cg17Fmt(stats.updated_7d), "Activité récente", "directory"),
      cg17Card("Qualité", qualityScore, quality ? `${cg17Fmt(quality.problem_question_count)} à vérifier` : "Rapport indisponible"),
      cg17Card("Conflits ouverts", cg17Fmt(conflicts?.length || 0), "CGSYNC007")
    ].join("");

    cg17$("cg17Health").innerHTML = `
      <div><span>Index recherche</span><strong>${cg17Fmt(health.delta_count)}</strong></div>
      <div><span>Tombstones</span><strong>${cg17Fmt(health.tombstones_count)}</strong></div>
      <div><span>Dernière question</span><strong>${cg17Date(health.latest_question_update)}</strong></div>
      <div><span>Dernier index</span><strong>${cg17Date(health.latest_delta_update)}</strong></div>`;

    const recent = stats.recent || [];
    cg17$("cg17Recent").innerHTML = recent.length ? recent.map(row => `
      <button type="button" class="cg17-recent" data-cg17-open="${String(row.id).replaceAll('"','&quot;')}">
        <span>#${row.id}</span>
        <strong>${String(row.question || "Question sans libellé").replaceAll("<","&lt;").replaceAll(">","&gt;")}</strong>
        <small>${String(row.megatheme || "")}${row.theme ? " › " + String(row.theme) : ""}</small>
      </button>`).join("") : `<div class="cg17-empty">Aucune modification récente détectée.</div>`;

    cg17WireCards();
    cg17Status(`Dashboard à jour · ${new Date().toLocaleTimeString("fr-FR")}`, "ok");
  } catch (error) {
    cg17Status(error?.message || String(error), "error");
  }
}

function cg17Init() {
  if (cg17$("cgweb017Panel")) return;
  const panel = document.createElement("section");
  panel.id = "cgweb017Panel";
  panel.className = "cg17-panel";
  panel.innerHTML = `
    <div class="cg17-head">
      <div><div class="cg17-kicker">CGWEB017 · DASHBOARD001</div><h2>Tableau de bord</h2>
      <p>Vue d'ensemble de la base, des images, de la qualité et de la synchronisation.</p></div>
      <button id="cg17Refresh" class="cg17-btn">Actualiser</button>
    </div>
    <div id="cg17Cards" class="cg17-cards"></div>
    <div class="cg17-grid">
      <section><h3>État Cloud</h3><div id="cg17Health" class="cg17-health"></div></section>
      <section><h3>Questions récemment modifiées</h3><div id="cg17Recent" class="cg17-recent-list"></div></section>
    </div>
    <div id="cg17Status" class="cg17-status">Initialisation…</div>`;
  (document.querySelector("main") || document.body).appendChild(panel);
  cg17$("cg17Refresh").onclick = cg17Load;
  cg17Load();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cg17Init);
else cg17Init();
