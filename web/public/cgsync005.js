// CGSYNC005 — tableau de santé Cloud / Web
const cgs5$ = id => document.getElementById(id);

function cgs5FmtInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : "—";
}

function cgs5FmtDate(v) {
  if (!v) return "—";
  try {
    if (typeof v.toDate === "function") return v.toDate().toLocaleString("fr-FR");
    if (typeof v === "string" || typeof v === "number") return new Date(v).toLocaleString("fr-FR");
  } catch (_) {}
  return "—";
}

function cgs5Card(label, value, detail = "", state = "") {
  return `
    <div class="cgs5-card ${state ? `cgs5-${state}` : ""}">
      <div class="cgs5-label">${label}</div>
      <div class="cgs5-value">${value}</div>
      ${detail ? `<div class="cgs5-detail">${detail}</div>` : ""}
    </div>
  `;
}

function cgs5Status(text, type = "") {
  const el = cgs5$("cgs5Status");
  if (!el) return;
  el.textContent = text;
  el.className = "cgs5-status " + (type ? `cgs5-${type}` : "");
}

async function cgs5FetchJson(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

function cgs5ReplaceObsoleteNote() {
  const nodes = document.querySelectorAll("#cgweb006Panel .cg6-note, #cgweb006Panel p, #cgweb006Panel div");
  for (const el of nodes) {
    const text = (el.textContent || "").trim();
    if (/recherche.+contient.+nécessitera.+index/i.test(text)) {
      el.textContent = "Recherche plein texte disponible sur les questions, détails, thèmes et propositions.";
      el.classList.add("cgs5-note-fixed");
      break;
    }
  }
}

async function cgs5Refresh() {
  const button = cgs5$("cgs5Refresh");
  if (button) button.disabled = true;
  cgs5Status("Contrôle en cours…");

  try {
    if (!window.CGSYNC005_API) {
      throw new Error("API CGSYNC005 indisponible.");
    }

    const [cloud, fulltext, catalog] = await Promise.all([
      window.CGSYNC005_API.health(),
      cgs5FetchJson("./cgweb012_index/manifest.json?v=CGSYNC005_1"),
      cgs5FetchJson("./cgweb008_catalog.json?v=CGSYNC005_1")
    ]);

    const qCloud = Number(cloud.questions_count || 0);
    const qIndex = Number(fulltext?.question_count || 0);
    const delta = Number(cloud.delta_count || 0);
    const tombstones = Number(cloud.tombstones_count || 0);

    let globalState = "ok";
    let globalText = "Synchronisation saine";

    if (!cloud.authenticated) {
      globalState = "error";
      globalText = "Utilisateur Firebase non connecté";
    } else if (!qCloud) {
      globalState = "warn";
      globalText = "Aucune question Cloud détectée";
    } else if (!qIndex) {
      globalState = "warn";
      globalText = "Index plein texte statique indisponible";
    } else if (Math.abs(qCloud - qIndex) > 1000) {
      globalState = "warn";
      globalText = "Écart important entre Cloud et index statique";
    }

    cgs5$("cgs5Headline").textContent = globalText;
    cgs5$("cgs5Headline").className = `cgs5-headline cgs5-${globalState}`;

    cgs5$("cgs5Grid").innerHTML = [
      cgs5Card("Questions Firestore", cgs5FmtInt(qCloud), "Collection Cloud actuelle", qCloud ? "ok" : "warn"),
      cgs5Card("Index plein texte", cgs5FmtInt(qIndex), `${cgs5FmtInt(fulltext?.token_count)} mots · ${cgs5FmtInt(fulltext?.shards?.length)} shards`, qIndex ? "ok" : "warn"),
      cgs5Card("Delta live", cgs5FmtInt(delta), "Questions ajoutées/modifiées depuis le snapshot", "ok"),
      cgs5Card("Suppressions en mémoire", cgs5FmtInt(tombstones), "Tombstones conservés pour Android", tombstones ? "warn" : "ok"),
      cgs5Card("Catalogue thèmes", cgs5FmtInt(catalog?.theme_count), `${cgs5FmtInt(Object.keys(catalog?.megathemes || {}).length)} mégathèmes`, catalog?.theme_count ? "ok" : "warn"),
      cgs5Card("Dernière modification", cgs5FmtDate(cloud.latest_question_update), "cg_updated_at le plus récent"),
      cgs5Card("Dernière suppression", cgs5FmtDate(cloud.latest_tombstone), "deleted_at le plus récent"),
      cgs5Card("Dernière mise à jour index", cgs5FmtDate(cloud.latest_delta_update), "cgindex_updated_at le plus récent")
    ].join("");

    const diff = qCloud && qIndex ? qCloud - qIndex : 0;
    cgs5$("cgs5Summary").textContent =
      `Cloud ${cgs5FmtInt(qCloud)} · index statique ${cgs5FmtInt(qIndex)} · ` +
      `écart ${diff >= 0 ? "+" : ""}${cgs5FmtInt(diff)} · delta live ${cgs5FmtInt(delta)}.`;

    cgs5Status("Contrôle terminé.", "ok");
  } catch (error) {
    cgs5Status(error?.message || String(error), "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function cgs5Init() {
  if (cgs5$("cgsync005Panel")) return;

  const panel = document.createElement("section");
  panel.id = "cgsync005Panel";
  panel.className = "cgs5-panel";
  panel.innerHTML = `
    <div class="cgs5-top">
      <div>
        <div class="cgs5-kicker">CGSYNC005</div>
        <h2>État de synchronisation</h2>
        <div id="cgs5Headline" class="cgs5-headline">Contrôle non lancé</div>
      </div>
      <button id="cgs5Refresh" class="cgs5-refresh">Actualiser</button>
    </div>
    <div id="cgs5Grid" class="cgs5-grid"></div>
    <div id="cgs5Summary" class="cgs5-summary"></div>
    <div id="cgs5Status" class="cgs5-status"></div>
  `;

  const anchor = document.getElementById("cgweb006Panel");
  if (anchor?.parentElement) anchor.insertAdjacentElement("afterend", panel);
  else (document.querySelector("main") || document.body).appendChild(panel);

  cgs5$("cgs5Refresh").onclick = cgs5Refresh;
  cgs5ReplaceObsoleteNote();
  setTimeout(cgs5Refresh, 250);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cgs5Init);
} else {
  cgs5Init();
}
