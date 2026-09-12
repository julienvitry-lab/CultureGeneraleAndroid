const CGIMAGE006_VERSION = "CGIMAGE006_1";
const CGIMAGE006_ENDPOINT = "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgimage005MigrateBatch";
const cg6$ = id => document.getElementById(id);
const cg6sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cg6Running = false;
let cg6StopRequested = false;
const cg6Totals = { lots: 0, scanned: 0, candidates: 0, migrated: 0, failed: 0, alreadyCloud: 0, noSource: 0 };
function cg6Number(value) { return new Intl.NumberFormat("fr-FR").format(Number(value || 0)); }
function cg6ResetTotals() { for (const key of Object.keys(cg6Totals)) cg6Totals[key] = 0; }
function cg6SetStatus(text, cls = "") {
  const el = cg6$("cgimg5Status");
  if (!el) return;
  el.textContent = text;
  el.className = "cgimg5-status " + (cls ? `cgimg5-${cls}` : "");
}
function cg6RenderTotals(lastResult = null) {
  const box = cg6$("cgimg6Summary");
  if (!box) return;
  const cursor = String(lastResult?.nextCursor || cg6$("cgimg5Cursor")?.value || "").trim();
  box.innerHTML = `
    <div class="cgimg6-title">Migration automatique</div>
    <div class="cgimg6-metrics">
      <div><span>Lots</span><strong>${cg6Number(cg6Totals.lots)}</strong></div>
      <div><span>Scannées</span><strong>${cg6Number(cg6Totals.scanned)}</strong></div>
      <div><span>Candidates</span><strong>${cg6Number(cg6Totals.candidates)}</strong></div>
      <div><span>Migrées</span><strong>${cg6Number(cg6Totals.migrated)}</strong></div>
      <div><span>Échecs</span><strong>${cg6Number(cg6Totals.failed)}</strong></div>
      <div><span>Déjà Cloud</span><strong>${cg6Number(cg6Totals.alreadyCloud)}</strong></div>
      <div><span>Sans source</span><strong>${cg6Number(cg6Totals.noSource)}</strong></div>
    </div>
    <div class="cgimg6-cursor">Curseur : <code>${cursor || "—"}</code></div>`;
}
function cg6SetButtons(running) {
  for (const id of ["cgimg5Run", "cgimg5Pilot", "cgimg5Continue", "cgimg5Reset"]) {
    const button = cg6$(id);
    if (button) button.disabled = running;
  }
  if (cg6$("cgimg6Auto")) cg6$("cgimg6Auto").disabled = running;
  if (cg6$("cgimg6Stop")) cg6$("cgimg6Stop").disabled = !running;
}
async function cg6WaitContext() {
  for (let i = 0; i < 120; i++) {
    const user = window.CGWEB001?.getUser?.();
    if (user?.getIdToken) return user;
    await cg6sleep(100);
  }
  throw new Error("Utilisateur Firebase indisponible.");
}
async function cg6CallBatch(user, payload) {
  const token = await user.getIdToken();
  const response = await fetch(CGIMAGE006_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; }
  catch (_) { throw new Error(`Réponse serveur illisible (HTTP ${response.status}).`); }
  if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
  return result;
}
async function cg6CallWithRetry(user, payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await cg6CallBatch(user, payload); }
    catch (error) {
      lastError = error;
      if (cg6StopRequested) throw error;
      cg6SetStatus(`⚠️ Erreur lot (${attempt}/3) : ${error?.message || String(error)}\nNouvelle tentative dans ${attempt * 5} s…`, "warn");
      await cg6sleep(attempt * 5000);
    }
  }
  throw lastError || new Error("Échec après trois tentatives.");
}
function cg6Accumulate(result) {
  const s = result?.stats || {};
  cg6Totals.lots += 1;
  cg6Totals.scanned += Number(s.scanned || 0);
  cg6Totals.candidates += Number(s.candidates || 0);
  cg6Totals.migrated += Number(s.migrated || 0);
  cg6Totals.failed += Number(s.failed || 0);
  cg6Totals.alreadyCloud += Number(s.alreadyCloud || 0);
  cg6Totals.noSource += Number(s.noSource || 0);
}
function cg6SafetyStop(result) {
  const s = result?.stats || {};
  const candidates = Number(s.candidates || 0);
  const failed = Number(s.failed || 0);
  if (failed >= 50) return `sécurité : ${failed} échecs dans le dernier lot`;
  if (candidates >= 20 && failed / candidates > 0.20) return `sécurité : taux d’échec ${(100 * failed / candidates).toFixed(1)} %`;
  return "";
}
async function cg6AutoRun() {
  if (cg6Running) return;
  cg6Running = true;
  cg6StopRequested = false;
  cg6ResetTotals();
  cg6SetButtons(true);
  cg6RenderTotals();
  try {
    const user = await cg6WaitContext();
    const limit = Math.min(Math.max(Number(cg6$("cgimg5Limit")?.value) || 500, 1), 500);
    const scanLimit = Math.min(Math.max(Number(cg6$("cgimg5Scan")?.value) || 1500, limit), 2000);
    if (cg6$("cgimg5DryRun")) cg6$("cgimg5DryRun").checked = false;
    while (!cg6StopRequested) {
      const cursor = String(cg6$("cgimg5Cursor")?.value || "").trim();
      cg6SetStatus(`⏳ Migration automatique en cours…\nLot ${cg6Totals.lots + 1} · curseur ${cursor || "début de base"}`, "warn");
      const payload = {
        limit,
        scanLimit,
        cursor,
        dryRun: false,
        markMissing: Boolean(cg6$("cgimg5MarkMissing")?.checked),
        allowNoImageFlag: Boolean(cg6$("cgimg5AllowNoImage")?.checked)
      };
      const result = await cg6CallWithRetry(user, payload);
      const s = result?.stats || {};
      cg6Accumulate(result);
      const nextCursor = String(result?.nextCursor || "").trim();
      if (nextCursor) {
        cg6$("cgimg5Cursor").value = nextCursor;
        try { localStorage.setItem("CGIMAGE005_LAST_CURSOR", nextCursor); } catch (_) {}
      }
      cg6RenderTotals(result);
      const safety = cg6SafetyStop(result);
      if (safety) {
        cg6SetStatus(`⛔ Migration automatique arrêtée par ${safety}.\nCurseur conservé : ${nextCursor || cursor || "—"}`, "error");
        break;
      }
      if (nextCursor && cursor && nextCursor === cursor) {
        cg6SetStatus(`⛔ Migration arrêtée : le curseur n’avance plus (${nextCursor}).`, "error");
        break;
      }
      const scanned = Number(s.scanned || 0);
      const candidates = Number(s.candidates || 0);
      const hasMore = Boolean(result?.hasMore);
      if (scanned === 0 || (!hasMore && candidates === 0)) {
        cg6SetStatus(`✅ Migration automatique terminée.\n${cg6Number(cg6Totals.migrated)} image(s) migrée(s) · ${cg6Number(cg6Totals.failed)} échec(s) · ${cg6Number(cg6Totals.lots)} lot(s).`, "ok");
        break;
      }
      cg6SetStatus(`✅ Lot ${cg6Totals.lots} terminé · ${cg6Number(s.migrated)} migrée(s) · ${cg6Number(s.failed)} échec(s).\nProchain lot dans 2 secondes…`, "ok");
      await cg6sleep(2000);
    }
    if (cg6StopRequested) {
      cg6SetStatus(`⏹ Migration arrêtée par l’utilisateur.\nCurseur conservé : ${cg6$("cgimg5Cursor")?.value || "—"}\n${cg6Number(cg6Totals.migrated)} image(s) migrée(s) pendant cette session.`, "warn");
    }
  } catch (error) {
    cg6SetStatus(`❌ Migration automatique interrompue : ${error?.message || String(error)}\nLe curseur est conservé ; tu pourras reprendre.`, "error");
  } finally {
    cg6Running = false;
    cg6SetButtons(false);
    cg6RenderTotals();
  }
}
function cg6Stop() {
  if (!cg6Running) return;
  cg6StopRequested = true;
  if (cg6$("cgimg6Stop")) cg6$("cgimg6Stop").disabled = true;
  cg6SetStatus("⏹ Arrêt demandé. Le lot en cours se termine, puis la migration s’arrêtera.", "warn");
}
async function cg6Install() {
  for (let i = 0; i < 150; i++) {
    const actions = document.querySelector("#cgimage005Panel .cgimg5-actions");
    if (actions && cg6$("cgimg5Cursor")) {
      if (cg6$("cgimg6Auto")) return;
      const start = document.createElement("button");
      start.id = "cgimg6Auto";
      start.type = "button";
      start.className = "cgimg5-btn cgimg5-btn-primary";
      start.textContent = "Automatiser tout";
      start.onclick = cg6AutoRun;
      const stop = document.createElement("button");
      stop.id = "cgimg6Stop";
      stop.type = "button";
      stop.className = "cgimg5-btn cgimg5-btn-danger";
      stop.textContent = "Arrêter";
      stop.disabled = true;
      stop.onclick = cg6Stop;
      actions.append(start, stop);
      const summary = document.createElement("div");
      summary.id = "cgimg6Summary";
      summary.innerHTML = `<style>
        #cgimg6Summary{
          margin:12px 0 !important;
          padding:14px !important;
          border:2px solid #60a5fa !important;
          border-radius:14px !important;
          background:#dbeafe !important;
          color:#0f172a !important;
          opacity:1 !important;
        }
        #cgimg6Summary *{
          opacity:1 !important;
          text-shadow:none !important;
        }
        #cgimg6Summary .cgimg6-title{
          font-weight:800 !important;
          margin-bottom:10px !important;
          color:#1e3a8a !important;
          font-size:18px !important;
        }
        #cgimg6Summary .cgimg6-metrics{
          display:grid !important;
          grid-template-columns:repeat(auto-fit,minmax(120px,1fr)) !important;
          gap:8px !important;
        }
        #cgimg6Summary .cgimg6-metrics>div{
          background:#ffffff !important;
          border:1px solid #93c5fd !important;
          border-radius:10px !important;
          padding:8px 10px !important;
        }
        #cgimg6Summary .cgimg6-metrics span{
          display:block !important;
          font-size:12px !important;
          color:#475569 !important;
        }
        #cgimg6Summary .cgimg6-metrics strong{
          display:block !important;
          margin-top:2px !important;
          font-size:20px !important;
          color:#0f172a !important;
        }
        #cgimg6Summary .cgimg6-cursor{
          margin-top:10px !important;
          font-size:13px !important;
          color:#334155 !important;
        }
        #cgimg6Summary .cgimg6-cursor code{
          color:#0f172a !important;
          background:#ffffff !important;
          border:1px solid #93c5fd !important;
          border-radius:6px !important;
          padding:2px 6px !important;
        }

      </style>`;
      cg6$("cgimg5Status")?.insertAdjacentElement("beforebegin", summary);
      cg6RenderTotals();
      console.log(CGIMAGE006_VERSION, "prêt");
      return;
    }
    await cg6sleep(100);
  }
  console.error(CGIMAGE006_VERSION, "panneau CGIMAGE005 introuvable");
}
cg6Install();
