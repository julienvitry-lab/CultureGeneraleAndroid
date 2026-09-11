// CGIMAGE002 · Gestion avancée des images côté Web.
// Dépend de CGIMAGE001 pour les uploads/suppressions Firebase Storage
// et de CGWEB006_API pour les lectures/écritures révisionnées Firestore.
import { getApp, getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  collection, getDocs, getFirestore, limit, query, where
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const VERSION = "CGIMAGE002_1";
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let selected = null;
let rows = [];

async function waitContext() {
  for (let i = 0; i < 120; i++) {
    const user = window.CGWEB001?.getUser?.();
    const api = window.CGWEB006_API;
    const images = window.CGIMAGE001;
    if (user && api && images && getApps().length) {
      return { user, api, images, db: getFirestore(getApp()) };
    }
    await sleep(100);
  }
  throw new Error("Contexte Firebase CGIMAGE002 indisponible.");
}

function fmtBytes(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

function fmtDate(ms) {
  const n = Number(ms || 0);
  if (!n) return "—";
  try { return new Date(n).toLocaleString("fr-FR"); }
  catch { return "—"; }
}

function cloudPath(record) {
  const path = String(record?.image_file || "").trim();
  return Boolean(path) && window.CGIMAGE001?.isCloudPath?.(path);
}

function imageState(record) {
  const has = Number(record?.is_image || 0) === 1 || Boolean(String(record?.image_file || "").trim());
  const missing = Number(record?.non_trouve || 0) === 1;
  if (has && cloudPath(record)) return { label: "Image Cloud", cls: "ok" };
  if (has) return { label: "Image historique", cls: "warn" };
  if (missing) return { label: "Introuvable", cls: "bad" };
  return { label: "Sans image", cls: "muted" };
}

function ensurePanel() {
  if ($("cgimage002Panel")) return;
  const panel = document.createElement("section");
  panel.id = "cgimage002Panel";
  panel.className = "cgimg2-panel";
  panel.innerHTML = `
    <div class="cgimg2-kicker">CGIMAGE002</div>
    <h2 class="cgimg2-title">Gestion avancée des images</h2>
    <p class="cgimg2-sub">Recherche, contrôle, remplacement, provenance et suivi des images associées aux questions.</p>

    <div class="cgimg2-toolbar">
      <select id="cgimg2SearchMode">
        <option value="id">ID exact</option>
        <option value="question">Début de question</option>
      </select>
      <input id="cgimg2Search" type="search" placeholder="ID ou début de question…">
      <button id="cgimg2SearchBtn" type="button" class="cgimg2-btn cgimg2-primary">Rechercher</button>
      <button id="cgimg2CloudBtn" type="button" class="cgimg2-btn">Images Cloud</button>
      <button id="cgimg2MissingBtn" type="button" class="cgimg2-btn">Introuvables</button>
    </div>

    <div id="cgimg2Status" class="cgimg2-status">Prêt.</div>
    <div id="cgimg2Rows" class="cgimg2-rows"></div>

    <div id="cgimg2Editor" class="cgimg2-editor cgimg2-hidden">
      <div class="cgimg2-editor-head">
        <div>
          <div class="cgimg2-kicker">QUESTION <span id="cgimg2Id">—</span></div>
          <h3 id="cgimg2Question">—</h3>
          <div id="cgimg2Path" class="cgimg2-path">—</div>
        </div>
        <button id="cgimg2Close" type="button" class="cgimg2-btn">Fermer</button>
      </div>

      <div class="cgimg2-editor-grid">
        <div>
          <div id="cgimg2Preview" class="cgimg2-preview"><span>Aucune image</span></div>
          <div id="cgimg2Meta" class="cgimg2-meta"></div>
        </div>
        <div class="cgimg2-form">
          <label>Provenance / URL source
            <input id="cgimg2SourceUrl" type="url" placeholder="https://…">
          </label>
          <div class="cgimg2-inline-actions">
            <button id="cgimg2SaveSource" type="button" class="cgimg2-btn">Enregistrer la source</button>
            <button id="cgimg2OpenSource" type="button" class="cgimg2-btn">Ouvrir la source</button>
          </div>

          <label>Nouvelle image
            <input id="cgimg2File" type="file" accept="image/*">
          </label>
          <div class="cgimg2-inline-actions">
            <button id="cgimg2Upload" type="button" class="cgimg2-btn cgimg2-primary">Ajouter / remplacer</button>
            <button id="cgimg2Delete" type="button" class="cgimg2-btn cgimg2-danger">Supprimer l’image</button>
          </div>

          <div class="cgimg2-inline-actions">
            <button id="cgimg2Missing" type="button" class="cgimg2-btn">Marquer introuvable</button>
            <button id="cgimg2Retry" type="button" class="cgimg2-btn">Réactiver la recherche</button>
          </div>
          <div id="cgimg2EditorState" class="cgimg2-editor-state"></div>
        </div>
      </div>
    </div>`;

  const anchor = $("cgimport002Panel") || document.body.lastElementChild;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
  else document.body.appendChild(panel);

  $("cgimg2SearchBtn").onclick = search;
  $("cgimg2Search").onkeydown = event => { if (event.key === "Enter") search(); };
  $("cgimg2CloudBtn").onclick = () => loadFlag("is_image", 1, "Images Cloud / déclarées");
  $("cgimg2MissingBtn").onclick = () => loadFlag("non_trouve", 1, "Images introuvables");
  $("cgimg2Close").onclick = closeEditor;
  $("cgimg2File").onchange = previewSelectedFile;
  $("cgimg2Upload").onclick = uploadSelected;
  $("cgimg2Delete").onclick = deleteSelected;
  $("cgimg2SaveSource").onclick = saveSource;
  $("cgimg2OpenSource").onclick = openSource;
  $("cgimg2Missing").onclick = markMissing;
  $("cgimg2Retry").onclick = retrySearch;
}

function setStatus(message, type = "") {
  const node = $("cgimg2Status");
  if (!node) return;
  node.textContent = message;
  node.className = `cgimg2-status${type ? ` cgimg2-${type}` : ""}`;
}

function setEditorState(message, type = "") {
  const node = $("cgimg2EditorState");
  if (!node) return;
  node.textContent = message;
  node.className = `cgimg2-editor-state${type ? ` cgimg2-${type}` : ""}`;
}

function rowHtml(record) {
  const state = imageState(record);
  return `<article class="cgimg2-row">
    <div class="cgimg2-row-main">
      <div class="cgimg2-row-head">
        <strong>#${esc(record.original_id ?? record.id)}</strong>
        <span class="cgimg2-pill cgimg2-pill-${state.cls}">${esc(state.label)}</span>
      </div>
      <div class="cgimg2-row-question">${esc(record.question || "(question vide)")}</div>
      <div class="cgimg2-row-path">${esc(record.megatheme || "")}${record.theme ? ` › ${esc(record.theme)}` : ""}</div>
    </div>
    <button type="button" class="cgimg2-btn cgimg2-open" data-id="${esc(record.id)}">Ouvrir</button>
  </article>`;
}

function render(list) {
  rows = Array.isArray(list) ? list : [];
  const host = $("cgimg2Rows");
  host.innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : '<div class="cgimg2-empty">Aucune question trouvée.</div>';
  host.querySelectorAll("[data-id]").forEach(button => {
    button.onclick = () => openEditor(button.dataset.id);
  });
}

async function search() {
  const term = $("cgimg2Search").value.trim();
  const mode = $("cgimg2SearchMode").value;
  if (!term) {
    setStatus("Saisis un ID ou un début de question.", "warn");
    render([]);
    return;
  }
  setStatus("Recherche…");
  try {
    const { api } = await waitContext();
    let found;
    if (mode === "id") {
      const one = await api.byId(term);
      found = one ? [one] : [];
    } else {
      found = await api.questionPrefix(term, 50);
    }
    render(found || []);
    setStatus(`${(found || []).length} résultat(s).`, "ok");
  } catch (error) {
    render([]);
    setStatus(`❌ ${error?.message || String(error)}`, "bad");
  }
}

async function loadFlag(field, value, label) {
  setStatus(`Chargement : ${label}…`);
  try {
    const { user, db } = await waitContext();
    const ref = collection(db, "users", user.uid, "questions");
    const snap = await getDocs(query(ref, where(field, "==", value), limit(100)));
    const found = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    render(found);
    setStatus(`${label} : ${found.length} résultat(s), 100 maximum.`, "ok");
  } catch (error) {
    render([]);
    setStatus(`❌ ${error?.message || String(error)}`, "bad");
  }
}

async function openEditor(id) {
  setEditorState("Chargement…");
  try {
    const { api } = await waitContext();
    const record = await api.byId(id);
    if (!record) throw new Error(`Question ${id} introuvable.`);
    selected = record;
    $("cgimg2Editor").classList.remove("cgimg2-hidden");
    $("cgimg2Id").textContent = record.original_id ?? record.id;
    $("cgimg2Question").textContent = record.question || "(question vide)";
    $("cgimg2Path").textContent = `${record.megatheme || ""}${record.theme ? ` › ${record.theme}` : ""}`;
    $("cgimg2SourceUrl").value = String(record.image_source_url || record.url_internet || "");
    $("cgimg2File").value = "";
    await renderPreview(record);
    renderMeta(record);
    setEditorState("");
    $("cgimg2Editor").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  }
}

function closeEditor() {
  selected = null;
  $("cgimg2Editor")?.classList.add("cgimg2-hidden");
}

async function renderPreview(record) {
  const box = $("cgimg2Preview");
  const path = String(record?.image_file || "").trim();
  if (!path) {
    box.innerHTML = "<span>Aucune image</span>";
    return;
  }
  if (!window.CGIMAGE001?.isCloudPath?.(path)) {
    box.innerHTML = `<span>Image locale historique<br><small>${esc(path)}</small></span>`;
    return;
  }
  box.innerHTML = "<span>Chargement…</span>";
  try {
    const url = await window.CGIMAGE001.urlForPath(path);
    if (!selected || String(selected.id) !== String(record.id)) return;
    box.innerHTML = '<img alt="Illustration de la question">';
    box.querySelector("img").src = url;
  } catch (error) {
    box.innerHTML = `<span class="cgimg2-error">${esc(error?.message || String(error))}</span>`;
  }
}

function renderMeta(record) {
  const state = imageState(record);
  $("cgimg2Meta").innerHTML = `
    <div><span>État</span><strong>${esc(state.label)}</strong></div>
    <div><span>Dimensions</span><strong>${esc(record.image_width || "—")} × ${esc(record.image_height || "—")}</strong></div>
    <div><span>Poids</span><strong>${esc(fmtBytes(record.image_bytes))}</strong></div>
    <div><span>MIME</span><strong>${esc(record.image_mime || "—")}</strong></div>
    <div><span>Origine</span><strong>${esc(record.image_origin || "—")}</strong></div>
    <div><span>Dernière MAJ image</span><strong>${esc(fmtDate(record.image_updated_ms))}</strong></div>
    <div class="cgimg2-meta-wide"><span>Fichier</span><strong>${esc(record.image_file || "—")}</strong></div>
    <div class="cgimg2-meta-wide"><span>SHA-256</span><strong>${esc(record.image_sha256 || "—")}</strong></div>`;
}

function previewSelectedFile() {
  const file = $("cgimg2File")?.files?.[0];
  if (!file) {
    if (selected) renderPreview(selected);
    return;
  }
  const box = $("cgimg2Preview");
  const url = URL.createObjectURL(file);
  box.innerHTML = '<img alt="Nouvelle image sélectionnée">';
  const img = box.querySelector("img");
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
}

async function refreshSelected(message = "") {
  if (!selected) return;
  const { api } = await waitContext();
  const fresh = await api.byId(selected.id);
  if (!fresh) throw new Error("Question introuvable après mise à jour.");
  selected = fresh;
  const row = rows.find(item => String(item.id) === String(fresh.id));
  if (row) Object.assign(row, fresh);
  render(rows);
  $("cgimg2SourceUrl").value = String(fresh.image_source_url || fresh.url_internet || "");
  await renderPreview(fresh);
  renderMeta(fresh);
  if (message) setEditorState(message, "ok");
}

async function revisionedPatch(patch, source) {
  if (!selected) throw new Error("Aucune question sélectionnée.");
  const { api } = await waitContext();
  const expectedRevision = Number(selected.cg_revision || 0);
  const result = await api.update(selected.id, patch, { expectedRevision, source });
  if (result?.conflict) throw new Error("Conflit de révision : recharge la question et recommence.");
  if (result?.revision !== undefined) selected.cg_revision = Number(result.revision || 0);
  return result;
}

async function uploadSelected() {
  if (!selected) return;
  const file = $("cgimg2File")?.files?.[0];
  if (!file) { setEditorState("Choisis une image.", "warn"); return; }
  const button = $("cgimg2Upload");
  button.disabled = true;
  setEditorState("Conversion WebP et envoi vers Firebase Storage…");
  try {
    const { images } = await waitContext();
    const sourceUrl = $("cgimg2SourceUrl").value.trim();
    const expectedRevision = Number(selected.cg_revision || 0);
    const response = await images.uploadForQuestion(selected.id, file, {
      expectedRevision,
      sourceUrl,
      sourceOrigin: "CGIMAGE002"
    });
    selected.cg_revision = Number(response?.result?.revision ?? selected.cg_revision ?? 0);
    if (Number(selected.non_trouve || 0) === 1) {
      await revisionedPatch({ non_trouve: 0 }, "CGIMAGE002_UPLOAD_CLEAR_MISSING");
    }
    $("cgimg2File").value = "";
    await refreshSelected("✅ Image enregistrée dans Firebase Storage.");
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  } finally {
    button.disabled = false;
  }
}

async function deleteSelected() {
  if (!selected) return;
  if (!String(selected.image_file || "").trim()) {
    setEditorState("Aucune image à supprimer.", "warn");
    return;
  }
  if (!confirm("Supprimer l’image associée à cette question ?")) return;
  const button = $("cgimg2Delete");
  button.disabled = true;
  setEditorState("Suppression…");
  try {
    const sourceUrl = $("cgimg2SourceUrl").value.trim();
    const { images } = await waitContext();
    const response = await images.removeForQuestion(selected.id, { expectedRevision: Number(selected.cg_revision || 0) });
    selected.cg_revision = Number(response?.result?.revision ?? selected.cg_revision ?? 0);
    if (sourceUrl) {
      await revisionedPatch({ image_source_url: sourceUrl }, "CGIMAGE002_DELETE_KEEP_SOURCE");
    }
    await refreshSelected("✅ Image supprimée.");
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  } finally {
    button.disabled = false;
  }
}

async function saveSource() {
  if (!selected) return;
  const url = $("cgimg2SourceUrl").value.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    setEditorState("L’URL source doit commencer par http:// ou https://", "warn");
    return;
  }
  try {
    await revisionedPatch({ image_source_url: url }, "CGIMAGE002_SOURCE");
    await refreshSelected("✅ Provenance enregistrée.");
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  }
}

function openSource() {
  const url = $("cgimg2SourceUrl").value.trim();
  if (!/^https?:\/\//i.test(url)) {
    setEditorState("Aucune URL source exploitable.", "warn");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function markMissing() {
  if (!selected) return;
  if (String(selected.image_file || "").trim()) {
    setEditorState("Supprime d’abord l’image actuelle avant de la marquer introuvable.", "warn");
    return;
  }
  try {
    const sourceUrl = $("cgimg2SourceUrl").value.trim();
    const patch = { non_trouve: 1, is_image: 0 };
    if (sourceUrl) patch.image_source_url = sourceUrl;
    await revisionedPatch(patch, "CGIMAGE002_MARK_MISSING");
    await refreshSelected("✅ Image marquée introuvable.");
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  }
}

async function retrySearch() {
  if (!selected) return;
  try {
    await revisionedPatch({ non_trouve: 0 }, "CGIMAGE002_RETRY_IMAGE_SEARCH");
    await refreshSelected("✅ Recherche d’image réactivée.");
  } catch (error) {
    setEditorState(`❌ ${error?.message || String(error)}`, "bad");
  }
}

ensurePanel();
document.documentElement.dataset.cgimage002 = "1";
window.CGIMAGE002 = { version: VERSION, openEditor, search, loadFlag };
console.info("CGIMAGE002 actif · gestion avancée des images Web");
