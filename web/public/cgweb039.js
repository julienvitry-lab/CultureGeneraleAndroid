(() => {
  "use strict";

  const VERSION = "CGWEB108_MASS_SELECTION_ENABLE001";
  // CGWEB108_DIRECTORY_COMPACT_LAYOUT001_MAIN_TABS_REORDER001_MASS_SELECTION_ENABLE001
  const SS_SELECTION = "cgweb039.bulk.selection.v1";
  const SS_CONTEXTS = "cgweb039.bulk.contexts.v1";

  const state = {
    ids: new Set(),
    contexts: new Map(),
    directoryPanel: null,
    toolbar: null,
    modal: null,
    observer: null,
    observerTimer: null,
    initialized: false
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLocaleLowerCase("fr-FR");

  function readJson(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function restoreState() {
    const ids = readJson(SS_SELECTION, []);
    const ctx = readJson(SS_CONTEXTS, {});
    state.ids = new Set(Array.isArray(ids) ? ids.map(String) : []);
    state.contexts = new Map(Object.entries(ctx || {}));
  }

  function persistState() {
    writeJson(SS_SELECTION, [...state.ids]);
    writeJson(SS_CONTEXTS, Object.fromEntries(state.contexts.entries()));
  }

  function findDirectoryPanel() {
    return document.querySelector('[data-cg16-page-panel="directory"]') ||
      [...document.querySelectorAll("section,.panel,.card")].find((el) =>
        lower(el.querySelector("h1,h2,h3")?.textContent).includes("répertoire")
      ) || null;
  }

  function directoryTable() {
    const p = state.directoryPanel || findDirectoryPanel();
    if (!p) return null;
    return [...p.querySelectorAll("table")].find((t) => {
      if (t.closest(".cgweb037-search-engine")) return false;
      const headers = lower([...t.querySelectorAll("thead th")].map((x) => x.textContent).join(" "));
      return headers.includes("id") && headers.includes("question");
    }) || null;
  }

  function tableHeaders(table) {
    return [...table.querySelectorAll("thead th")].map((th) => lower(th.textContent));
  }

  function rowCell(row, needles) {
    const table = row?.closest("table");
    if (!table) return "";
    const headers = tableHeaders(table);
    const cells = [...row.querySelectorAll("td")];
    for (const needle of needles) {
      const idx = headers.findIndex((h) => h === needle || h.includes(needle));
      if (idx >= 0 && cells[idx]) return norm(cells[idx].textContent);
    }
    return "";
  }

  function rowId(row) {
    const fromCell = rowCell(row, ["id"]);
    if (fromCell) return fromCell.replace(/^#/, "");
    const ds = row.dataset || {};
    return norm(ds.id || ds.questionId || ds.questionid || "");
  }

  function rowContext(row) {
    const id = rowId(row);
    if (!id) return null;
    return {
      id,
      megatheme: rowCell(row, ["mégathème", "megatheme"]),
      theme: rowCell(row, ["thème", "theme"]),
      question: rowCell(row, ["question"])
    };
  }

  function rowCheckbox(row) {
    return row?.querySelector('input[type="checkbox"]') || null;
  }

  function syncVisibleRows() {
    const table = directoryTable();
    if (!table) return;
    for (const row of table.querySelectorAll("tbody tr")) {
      const id = rowId(row);
      const cb = rowCheckbox(row);
      if (!id || !cb) continue;
      const ctx = rowContext(row);
      if (cb.checked) {
        state.ids.add(id);
        if (ctx) state.contexts.set(id, ctx);
      } else {
        state.ids.delete(id);
        state.contexts.delete(id);
      }
    }
    persistState();
    renderToolbar();
  }

  function clearSelectionMirror() {
    state.ids.clear();
    state.contexts.clear();
    persistState();
    renderToolbar();
  }
  function syncFromDirectoryApi() {
    const source = window.CGWEB018_API?.selectedIds?.();
    if (!Array.isArray(source)) return false;
    const next = new Set(source.map(String));
    state.ids = next;
    for (const id of [...state.contexts.keys()]) if (!next.has(String(id))) state.contexts.delete(String(id));
    const table = directoryTable();
    if (table) for (const row of table.querySelectorAll("tbody tr")) {
      const id = rowId(row);
      if (!id || !next.has(String(id))) continue;
      const ctx = rowContext(row);
      if (ctx) state.contexts.set(String(id), ctx);
    }
    persistState();
    return true;
  }


  function setStatus(text, kind = "") {
    const el = document.querySelector("#cgweb039Status");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.kind = kind;
  }

  function buildToolbar() {
    if (document.querySelector("#cgweb039Toolbar")) {
      state.toolbar = document.querySelector("#cgweb039Toolbar");
      return state.toolbar;
    }
    const p = state.directoryPanel || findDirectoryPanel();
    if (!p) return null;

    const toolbar = document.createElement("section");
    toolbar.id = "cgweb039Toolbar";
    toolbar.className = "cgweb039-toolbar";
    toolbar.innerHTML = `
      <div class="cgweb039-mainline">
        <div class="cgweb039-count"><strong id="cgweb039Count">0</strong> question(s) dans la sélection massive</div>
        <div class="cgweb039-actions">
          <button type="button" id="cgweb039Preview">Préparer une action massive</button>
          <button type="button" id="cgweb039Export">Exporter la sélection CSV</button>
          <button type="button" id="cgweb039Clear">Vider la sélection massive</button>
        </div>
      </div>
      <div id="cgweb039Status" class="cgweb039-status">
        Sélectionne des questions dans le Répertoire puis prépare l'action.
      </div>`;

    const table = directoryTable();
    if (table) table.insertAdjacentElement("beforebegin", toolbar);
    else p.appendChild(toolbar);

    toolbar.querySelector("#cgweb039Preview")?.addEventListener("click", openPreview);
    toolbar.querySelector("#cgweb039Export")?.addEventListener("click", exportCsv);
    toolbar.querySelector("#cgweb039Clear")?.addEventListener("click", () => {
      clearSelectionMirror();
      const tableNow = directoryTable();
      tableNow?.querySelectorAll('tbody input[type="checkbox"]:checked').forEach((cb) => {
        cb.checked = false;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      });
      setStatus("Sélection massive vidée.", "info");
    });

    state.toolbar = toolbar;
    return toolbar;
  }

  function renderToolbar() {
    const tb = buildToolbar();
    if (!tb) return;
    const n = state.ids.size;
    const count = tb.querySelector("#cgweb039Count");
    if (count) count.textContent = String(n);
    const preview = tb.querySelector("#cgweb039Preview");
    const exp = tb.querySelector("#cgweb039Export");
    const clear = tb.querySelector("#cgweb039Clear");
    if (preview) preview.disabled = n === 0;
    if (exp) exp.disabled = n === 0;
    if (clear) clear.disabled = n === 0;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function themeSummary() {
    const counts = new Map();
    for (const id of state.ids) {
      const ctx = state.contexts.get(id);
      const key = norm(ctx?.theme) || "Thème non disponible";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function ensureModal() {
    if (state.modal?.isConnected) return state.modal;
    const modal = document.createElement("div");
    modal.id = "cgweb039Modal";
    modal.className = "cgweb039-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="cgweb039-backdrop" data-close="1"></div>
      <section class="cgweb039-dialog" role="dialog" aria-modal="true" aria-labelledby="cgweb039Title">
        <div class="cgweb039-dialog-head">
          <div>
            <div class="cgweb039-kicker">Prévisualisation obligatoire</div>
            <h2 id="cgweb039Title">Action massive</h2>
          </div>
          <button type="button" id="cgweb039Close">Fermer</button>
        </div>
        <div id="cgweb039Summary" class="cgweb039-summary"></div>
        <div class="cgweb039-previewgrid">
          <article>
            <h3>Répartition par thème</h3>
            <div id="cgweb039Themes"></div>
          </article>
          <article>
            <h3>ID sélectionnés</h3>
            <textarea id="cgweb039Ids" readonly></textarea>
          </article>
        </div>
        <div class="cgweb039-safety">
          Aucune modification n'est appliquée depuis cet écran. Le bouton ci-dessous ouvre l'outil
          existant « Modifications massives » et y transfère uniquement la liste des ID.
        </div>
        <div class="cgweb039-dialog-actions">
          <button type="button" id="cgweb039Copy">Copier les ID</button>
          <button type="button" id="cgweb039Continue">Continuer vers Modifications massives</button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelector("#cgweb039Close")?.addEventListener("click", closePreview);
    modal.querySelector(".cgweb039-backdrop")?.addEventListener("click", closePreview);
    modal.querySelector("#cgweb039Copy")?.addEventListener("click", copyIds);
    modal.querySelector("#cgweb039Continue")?.addEventListener("click", goToBulkTool);

    state.modal = modal;
    return modal;
  }

  function openPreview() {
    syncVisibleRows();
    if (!state.ids.size) {
      setStatus("Aucune question sélectionnée.", "error");
      return;
    }
    const modal = ensureModal();
    const ids = [...state.ids];
    modal.querySelector("#cgweb039Summary").innerHTML =
      `<strong>${ids.length}</strong> question(s) sélectionnée(s). ` +
      `La modification restera à confirmer dans l'outil « Modifications massives ».`;

    const themes = modal.querySelector("#cgweb039Themes");
    themes.innerHTML = "";
    for (const [theme, count] of themeSummary().slice(0, 20)) {
      const line = document.createElement("div");
      line.className = "cgweb039-theme-line";
      line.innerHTML = `<span>${esc(theme)}</span><strong>${count}</strong>`;
      themes.appendChild(line);
    }
    if (!themes.children.length) themes.textContent = "Répartition indisponible pour les lignes non visibles.";

    modal.querySelector("#cgweb039Ids").value = ids.join("\n");
    modal.hidden = false;
    document.documentElement.classList.add("cgweb039-modal-open");
  }

  function closePreview() {
    const modal = ensureModal();
    modal.hidden = true;
    document.documentElement.classList.remove("cgweb039-modal-open");
  }

  async function copyIds() {
    const text = [...state.ids].join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const b = state.modal?.querySelector("#cgweb039Copy");
      if (b) {
        const old = b.textContent;
        b.textContent = "ID copiés";
        setTimeout(() => { b.textContent = old; }, 1200);
      }
    } catch (_) {
      const ta = state.modal?.querySelector("#cgweb039Ids");
      ta?.focus();
      ta?.select();
    }
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    syncVisibleRows();
    if (!state.ids.size) return;

    const rows = [["ID","Megatheme","Theme","Question"]];
    for (const id of state.ids) {
      const ctx = state.contexts.get(id) || {};
      rows.push([id, ctx.megatheme || "", ctx.theme || "", ctx.question || ""]);
    }
    const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `selection-questions-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function findTextButton(text) {
    const wanted = lower(text);
    return [...document.querySelectorAll("button")]
      .find((b) => !b.closest("#cgweb039Modal") && !b.closest("#cgweb039Transfer") &&
        lower(b.textContent) === wanted) || null;
  }

  function goToBulkTool() {
    persistState();
    closePreview();

    const plus = document.querySelector('button[data-cg16-page="more"]') || findTextButton("Plus");
    plus?.click();

    setTimeout(() => {
      const bulk = findTextButton("Modifications massives");
      if (!bulk) {
        setStatus("Outil « Modifications massives » introuvable dans Plus.", "error");
        return;
      }
      bulk.click();
      setTimeout(installTransferPanel, 250);
    }, 120);
  }

  function findBulkPanel() {
    const heading = [...document.querySelectorAll("h1,h2,h3,h4")]
      .find((h) => lower(h.textContent) === "modifications massives");
    if (!heading) return null;
    return heading.closest("section,.panel,.card,[data-cg16-plus-panel]") || heading.parentElement;
  }

  function findIdTarget(panel) {
    const controls = [...panel.querySelectorAll("textarea,input[type='text'],input[type='search']")]
      .filter((el) => !el.closest("#cgweb039Transfer"));
    return controls.find((el) => {
      const label = lower(
        el.closest("label")?.textContent ||
        (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "") ||
        el.placeholder || ""
      );
      return label.includes("id") || label.includes("identifiant") || label.includes("questions");
    }) || null;
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

  function installTransferPanel() {
    const panel = findBulkPanel();
    if (!panel || panel.querySelector("#cgweb039Transfer")) return;

    const ids = [...state.ids];
    if (!ids.length) return;

    const transfer = document.createElement("section");
    transfer.id = "cgweb039Transfer";
    transfer.className = "cgweb039-transfer";
    transfer.innerHTML = `
      <div>
        <strong>Sélection du Répertoire : ${ids.length} question(s)</strong>
        <div class="cgweb039-transfer-note">
          La liste est prête. Rien n'est appliqué automatiquement.
        </div>
      </div>
      <div class="cgweb039-transfer-actions">
        <button type="button" id="cgweb039TransferCopy">Copier les ID</button>
        <button type="button" id="cgweb039TransferInsert">Insérer les ID dans le champ</button>
        <button type="button" id="cgweb039TransferBack">Retour au Répertoire</button>
      </div>`;

    const heading = panel.querySelector("h1,h2,h3,h4");
    if (heading) heading.insertAdjacentElement("afterend", transfer);
    else panel.prepend(transfer);

    const target = findIdTarget(panel);
    const insertBtn = transfer.querySelector("#cgweb039TransferInsert");
    if (!target) {
      insertBtn.disabled = true;
      insertBtn.title = "Aucun champ ID/identifiants reconnu dans l'outil actuel.";
    }

    transfer.querySelector("#cgweb039TransferCopy")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ids.join("\n")); } catch (_) {}
    });

    insertBtn?.addEventListener("click", () => {
      const currentTarget = findIdTarget(panel);
      if (!currentTarget) return;
      nativeSetValue(currentTarget, ids.join("\n"));
      currentTarget.focus();
    });

    transfer.querySelector("#cgweb039TransferBack")?.addEventListener("click", () => {
      const dir = document.querySelector('button[data-cg16-page="directory"]') || findTextButton("Répertoire");
      dir?.click();
    });
  }

  function wireDirectory() {
    const p = state.directoryPanel;
    if (!p || p.dataset.cgweb039Wired === "1") return;
    p.dataset.cgweb039Wired = "1";

    p.addEventListener("change", (ev) => {
      const cb = ev.target.closest('tbody input[type="checkbox"]');
      if (!cb) return;
      const row = cb.closest("tr");
      const id = rowId(row);
      if (!id) return;
      if (cb.checked) {
        state.ids.add(id);
        const ctx = rowContext(row);
        if (ctx) state.contexts.set(id, ctx);
      } else {
        state.ids.delete(id);
        state.contexts.delete(id);
      }
      persistState();
      renderToolbar();
    }, false);

    p.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const txt = lower(b.textContent);
      if (txt === "tout visible") {
        setTimeout(syncVisibleRows, 60);
      } else if (txt === "vider") {
        setTimeout(() => {
          clearSelectionMirror();
          syncVisibleRows();
        }, 60);
      } else if (txt === "suivant →" || txt === "← précédent" || txt === "appliquer") {
        setTimeout(() => {
          buildToolbar();
          syncVisibleRows();
        }, 180);
      }
    }, true);
  }

  function boot() {
    state.directoryPanel = findDirectoryPanel();
    if (!state.directoryPanel) {
      setTimeout(boot, 250);
      return;
    }
    restoreState();
    wireDirectory();
    buildToolbar();
    syncFromDirectoryApi();
    syncVisibleRows();

    state.observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) =>
        [...m.addedNodes].some((n) => {
          if (n.nodeType !== 1) return false;
          return n.matches?.("table,[data-cg16-plus-panel],button") ||
            n.querySelector?.("table,[data-cg16-plus-panel],button");
        })
      );
      if (!relevant) return;

      clearTimeout(state.observerTimer);
      state.observerTimer = setTimeout(() => {
        state.directoryPanel = findDirectoryPanel() || state.directoryPanel;
        buildToolbar();
        syncFromDirectoryApi();
        renderToolbar();
        installTransferPanel();
      }, 120);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("cgweb018-selection-change", (ev) => {
      const ids = Array.isArray(ev.detail?.ids) ? ev.detail.ids.map(String) : [];
      state.ids = new Set(ids);
      const table = directoryTable();
      if (table) for (const row of table.querySelectorAll("tbody tr")) {
        const id = rowId(row);
        if (!id || !state.ids.has(String(id))) continue;
        const ctx = rowContext(row);
        if (ctx) state.contexts.set(String(id), ctx);
      }
      for (const id of [...state.contexts.keys()]) if (!state.ids.has(String(id))) state.contexts.delete(String(id));
      persistState();
      renderToolbar();
    });

    state.initialized = true;
    window.CGWEB039 = {
      version: VERSION,
      state,
      ids: () => [...state.ids],
      preview: openPreview,
      clear: clearSelectionMirror,
      exportCsv
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
