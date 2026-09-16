(() => {
  "use strict";

  const VERSION = "QUESTION_HISTORY002";
  const FIELDS = {
    megatheme: "Mégathème", theme: "Thème", question: "Question", detail: "Détail",
    proposition_a: "Proposition A", proposition_b: "Proposition B",
    proposition_c: "Proposition C", proposition_d: "Proposition D",
    correct_index: "Bonne réponse", status: "Statut",
    is_image: "Image", image_file: "Fichier image", image_source_url: "Source image",
    url_quizypedia: "Quizypedia", url_internet: "Source Internet",
    non_trouve: "Introuvable"
  };

  const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const esc = (v) => norm(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const fmtDate = (v) => {
    if (!v) return "—";
    try {
      const d = typeof v?.toDate === "function" ? v.toDate()
        : v?.seconds ? new Date(Number(v.seconds) * 1000) : new Date(v);
      return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR");
    } catch (_) { return "—"; }
  };

  let state = { id: "", rows: [], current: null };

  function currentId() {
    const ctx = window.CGWEB038?.context?.();
    if (norm(ctx?.id)) return norm(ctx.id);
    const raw = norm(document.getElementById("cg19Id")?.textContent);
    const m = raw.match(/#?([A-Za-z0-9_.:-]+)/);
    return m ? m[1] : "";
  }

  function valueText(v) {
    if (v === null || v === undefined || v === "") return "∅";
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch (_) { return String(v); }
    }
    return String(v);
  }

  function rowChanges(row) {
    const before = row?.before_snapshot && typeof row.before_snapshot === "object" ? row.before_snapshot : null;
    const after = row?.after_snapshot && typeof row.after_snapshot === "object" ? row.after_snapshot : null;
    const patch = row?.patch && typeof row.patch === "object" ? row.patch : {};
    const keys = new Set([
      ...Object.keys(patch || {}),
      ...Object.keys(before || {}),
      ...Object.keys(after || {})
    ]);
    return [...keys]
      .filter((key) => FIELDS[key] || Object.prototype.hasOwnProperty.call(patch, key))
      .map((key) => {
        const a = before ? before[key] : undefined;
        const b = after ? after[key] : (Object.prototype.hasOwnProperty.call(patch, key) ? patch[key] : undefined);
        if (before && after && valueText(a) === valueText(b)) return null;
        return { key, label: FIELDS[key] || key, before: a, after: b };
      })
      .filter(Boolean);
  }

  async function copyJson(obj) {
    const text = JSON.stringify(obj, null, 2);
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
  }

  function editorIsHidden() {
    const ed = document.getElementById("cg19Editor");
    return !ed || ed.classList.contains("cg19-hidden");
  }

  function prepareEditor(row) {
    const id = state.id || currentId();
    if (!id) return alert("Aucune question courante.");
    const payload = row?.after_snapshot && typeof row.after_snapshot === "object"
      ? row.after_snapshot
      : (row?.patch && typeof row.patch === "object" ? row.patch : null);
    if (!payload || !Object.keys(payload).length) {
      return alert("Cette entrée historique ne contient aucun état réutilisable.");
    }

    window.CGWEB019_API?.open?.(id, [id]);
    setTimeout(() => {
      if (editorIsHidden()) document.getElementById("cg19EditBtn")?.click();

      const map = {
        megatheme:"cg19EditMega", theme:"cg19EditTheme", question:"cg19EditQuestion",
        detail:"cg19EditDetail", proposition_a:"cg19EditA", proposition_b:"cg19EditB",
        proposition_c:"cg19EditC", proposition_d:"cg19EditD",
        correct_index:"cg19EditCorrect", status:"cg19EditStatusEdit"
      };
      let count = 0;
      for (const [key, idField] of Object.entries(map)) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
        const el = document.getElementById(idField);
        if (!el) continue;
        el.value = payload[key] ?? "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        count++;
      }
      alert(
        `${count} champ(s) préparé(s) dans l'éditeur.\n\n` +
        `AUCUNE donnée n'a été enregistrée. Vérifie le formulaire puis utilise toi-même « Enregistrer » si tu le souhaites.`
      );
    }, 350);
  }

  function ensureModal() {
    let m = document.getElementById("cgweb053Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb053Modal";
    m.className = "cgweb053-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb053-dialog" role="dialog" aria-modal="true" aria-label="Historique détaillé de la question">
        <header>
          <div><strong>Historique détaillé</strong><small id="cgweb053Subtitle">Question —</small></div>
          <button type="button" data-cg53-close aria-label="Fermer">×</button>
        </header>
        <div class="cgweb053-actions">
          <button type="button" data-cg53-refresh>Actualiser</button>
          <button type="button" data-cg53-export>Exporter JSON</button>
        </div>
        <div id="cgweb053Status" class="cgweb053-status"></div>
        <div id="cgweb053List"></div>
      </div>`;
    document.body.appendChild(m);

    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg53-close]")) close();
      if (ev.target.closest("[data-cg53-refresh]")) open(state.id || currentId());
      if (ev.target.closest("[data-cg53-export]")) exportJson();
      const copy = ev.target.closest("[data-cg53-copy]");
      if (copy) {
        const row = state.rows[Number(copy.dataset.cg53Copy)];
        if (row) copyJson(row);
      }
      const prep = ev.target.closest("[data-cg53-prepare]");
      if (prep) {
        const row = state.rows[Number(prep.dataset.cg53Prepare)];
        if (row) prepareEditor(row);
      }
    });
    return m;
  }

  function render() {
    const m = ensureModal();
    m.querySelector("#cgweb053Subtitle").textContent =
      state.id ? `Question #${state.id} · ${state.rows.length} entrée(s)` : "Question —";
    const list = m.querySelector("#cgweb053List");
    if (!state.rows.length) {
      list.innerHTML = `<p class="cgweb053-empty">Aucun historique disponible pour cette question.</p>`;
      return;
    }

    list.innerHTML = state.rows.map((row, i) => {
      const changes = rowChanges(row);
      const canPrepare = !!(
        (row?.after_snapshot && Object.keys(row.after_snapshot || {}).length) ||
        (row?.patch && Object.keys(row.patch || {}).length)
      );
      return `
        <article class="cgweb053-entry">
          <div class="cgweb053-entry-head">
            <div>
              <strong>${esc(row.operation || "update")}</strong>
              <span>rév. ${esc(row.revision_before ?? "—")} → ${esc(row.revision_after ?? "—")}</span>
            </div>
            <small>${esc(fmtDate(row.created_at))}</small>
          </div>
          <div class="cgweb053-meta">${esc(row.writer_label || row.writer_id || "—")} · ${esc(row.source || "—")}</div>
          <div class="cgweb053-changes">
            ${changes.length ? changes.slice(0, 30).map((c) => `
              <div>
                <b>${esc(c.label)}</b>
                <span class="before">${esc(valueText(c.before))}</span>
                <span aria-hidden="true">→</span>
                <span class="after">${esc(valueText(c.after))}</span>
              </div>`).join("") : `<span class="cgweb053-muted">Aucun détail de champ exploitable dans cette entrée.</span>`}
          </div>
          <div class="cgweb053-entry-actions">
            <button type="button" data-cg53-copy="${i}">Copier JSON</button>
            ${canPrepare ? `<button type="button" data-cg53-prepare="${i}">Préparer dans l’éditeur</button>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  async function load(id) {
    const qid = norm(id || currentId());
    if (!qid) throw new Error("Aucune fiche question courante détectée.");
    if (!window.CGWEB019_DATA_API?.history) throw new Error("API d'historique CGWEB019 indisponible.");
    state.id = qid;
    const [rows, current] = await Promise.all([
      window.CGWEB019_DATA_API.history(qid, 100),
      window.CGWEB006_API?.byId?.(qid).catch?.(() => null) ?? Promise.resolve(null)
    ]);
    state.rows = Array.isArray(rows) ? rows : [];
    state.current = current || null;
    return state.rows;
  }

  async function open(id = "") {
    const m = ensureModal();
    m.hidden = false;
    const status = m.querySelector("#cgweb053Status");
    status.textContent = "Chargement de l’historique…";
    try {
      await load(id);
      status.textContent = `Historique chargé · ${new Date().toLocaleTimeString("fr-FR")}`;
      render();
    } catch (e) {
      status.textContent = e?.message || String(e);
      m.querySelector("#cgweb053List").innerHTML = "";
    }
  }

  function close() { ensureModal().hidden = true; }

  function exportJson() {
    const data = {
      schema: "cgweb053-question-history-v1",
      exportedAt: new Date().toISOString(),
      questionId: state.id,
      current: state.current,
      history: state.rows
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `CGWEB053_HISTORIQUE_${state.id || "question"}_${new Date().toISOString().slice(0,10)}.json`
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function installButton() {
    const host = document.getElementById("cgweb038Workspace");
    if (!host || document.getElementById("cgweb053Open")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb053Open";
    b.textContent = "Historique détaillé";
    b.addEventListener("click", () => open());
    host.appendChild(b);
  }

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installButton, 120);
  }).observe(document.body, { childList: true, subtree: true });
  installButton();

  window.CGWEB053 = { version: VERSION, open, close, load, rows: () => state.rows.slice(), prepareEditor };
})();
