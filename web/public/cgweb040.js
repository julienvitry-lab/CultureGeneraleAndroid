(() => {
  "use strict";

  const VERSION = "IMPORT_CONTROL_CENTER001";
  const HISTORY_KEY = "cgweb040.import.history.v1";
  const MAX_HISTORY = 30;

  const rt = {
    root: null,
    lastSignature: "",
    timer: null
  };

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function getQueue() {
    const api = window.CGIMPORT011;
    const state = api?.state;
    if (!state || !Array.isArray(state.items)) return null;
    return state;
  }

  function queueStats(items) {
    const total = items.length;
    const done = items.filter((x) => x.status === "done").length;
    const errors = items.filter((x) => x.status === "error").length;
    const running = items.filter((x) => x.status === "running").length;
    const pending = items.filter((x) => x.status === "pending").length;
    const finished = done + errors;
    return { total, done, errors, running, pending, finished };
  }

  function fmtDate(isoOrMs) {
    if (!isoOrMs) return "—";
    try {
      const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
      return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(d);
    } catch (_) {
      return "—";
    }
  }

  function fmtDuration(sec) {
    sec = Number(sec);
    if (!Number.isFinite(sec) || sec < 0) return "—";
    if (sec < 60) return `${Math.round(sec)} s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m} min ${String(s).padStart(2, "0")} s`;
  }

  function safeInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function aggregate(items) {
    return items.reduce((acc, x) => {
      acc.added += safeInt(x.added);
      acc.duplicates += safeInt(x.duplicates);
      acc.errors += safeInt(x.errors);
      acc.duration += safeInt(x.durationSec);
      return acc;
    }, { added: 0, duplicates: 0, errors: 0, duration: 0 });
  }

  function snapshotFromQueue(state) {
    const stats = queueStats(state.items);
    const agg = aggregate(state.items);
    return {
      id: `${state.startedAt || "nostart"}|${state.sourceName || "sans-fichier"}|${state.items.length}`,
      sourceName: state.sourceName || "Sans nom",
      startedAt: state.startedAt || null,
      capturedAt: Date.now(),
      stats,
      aggregate: agg,
      items: state.items.map((x) => ({
        url: x.url || "",
        status: x.status || "pending",
        message: x.message || "",
        durationSec: x.durationSec ?? null,
        added: x.added ?? null,
        duplicates: x.duplicates ?? null,
        errors: x.errors ?? null
      }))
    };
  }

  function maybeArchiveCompletedQueue() {
    const state = getQueue();
    if (!state || !state.items.length) return;

    const stats = queueStats(state.items);
    const completed = stats.total > 0 && stats.running === 0 && stats.pending === 0;
    if (!completed) return;

    const snap = snapshotFromQueue(state);
    const history = readJson(HISTORY_KEY, []);
    const exists = history.some((h) => h.id === snap.id);

    if (!exists) {
      history.unshift(snap);
      writeJson(HISTORY_KEY, history.slice(0, MAX_HISTORY));
    } else {
      const next = history.map((h) => h.id === snap.id ? snap : h);
      writeJson(HISTORY_KEY, next.slice(0, MAX_HISTORY));
    }
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadSnapshot(snapshot) {
    if (!snapshot?.items?.length) return;
    const rows = [
      ["URL","Etat","Duree_s","Questions_ajoutees","Doublons","Erreurs","Message"],
      ...snapshot.items.map((x) => [
        x.url, x.status, x.durationSec ?? "", x.added ?? "", x.duplicates ?? "", x.errors ?? "", x.message || ""
      ])
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date(snapshot.capturedAt || Date.now()).toISOString().slice(0, 10);
    a.download = `historique-import-quizypedia-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  async function replaceQueueWithUrls(urls, label) {
    if (!urls.length) {
      setMessage("Aucune URL à relancer.", "warn");
      return;
    }
    if (!window.CGIMPORT011?.parseFile) {
      setMessage("CGIMPORT011.parseFile indisponible. Recharge la page.", "error");
      return;
    }

    const csv = "\uFEFFURL\r\n" + urls
      .map((u) => `"${String(u).replace(/"/g, '""')}"`)
      .join("\r\n");

    const file = new File(
      [csv],
      `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`,
      { type: "text/csv;charset=utf-8" }
    );

    try {
      const result = await window.CGIMPORT011.parseFile(file);
      setMessage(`${result?.count || urls.length} URL chargée(s) dans une nouvelle file. Clique sur « Lancer / reprendre ».`, "ok");
      render();
      document.querySelector("#cgimport011Bulk")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setMessage(e?.message || String(e), "error");
    }
  }

  async function retryCurrentErrors() {
    const state = getQueue();
    if (!state) return;
    const urls = state.items.filter((x) => x.status === "error" && x.url).map((x) => x.url);
    await replaceQueueWithUrls(urls, "retry-erreurs");
  }

  async function retryHistoryErrors(snapshot) {
    const urls = (snapshot?.items || []).filter((x) => x.status === "error" && x.url).map((x) => x.url);
    await replaceQueueWithUrls(urls, "retry-historique");
  }

  function clearHistory() {
    if (!confirm("Effacer l'historique local des imports Quizypedia sur ce navigateur ?")) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    setMessage("Historique local effacé.", "ok");
  }

  function setMessage(text, kind = "") {
    const el = document.querySelector("#cgweb040Message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.kind = kind;
  }

  function createUi() {
    if (document.querySelector("#cgweb040ControlCenter")) {
      rt.root = document.querySelector("#cgweb040ControlCenter");
      return rt.root;
    }

    const bulk = document.querySelector("#cgimport011Bulk");
    if (!bulk) return null;

    const root = document.createElement("section");
    root.id = "cgweb040ControlCenter";
    root.className = "cgweb040-control";
    root.innerHTML = `
      <div class="cgweb040-head">
        <div>
          <h3>Centre de contrôle des imports</h3>
          <p>Suivi de la file actuelle, reprise des échecs et historique local des lots Quizypedia.</p>
        </div>
        <button type="button" id="cgweb040Refresh">Actualiser</button>
      </div>

      <div class="cgweb040-current">
        <div class="cgweb040-stat"><span>Lot actuel</span><strong id="cgweb040Source">—</strong></div>
        <div class="cgweb040-stat"><span>Progression</span><strong id="cgweb040Progress">—</strong></div>
        <div class="cgweb040-stat"><span>Ajoutées</span><strong id="cgweb040Added">—</strong></div>
        <div class="cgweb040-stat"><span>Erreurs</span><strong id="cgweb040Errors">—</strong></div>
      </div>

      <progress id="cgweb040ProgressBar" value="0" max="1"></progress>

      <div class="cgweb040-actions">
        <button type="button" id="cgweb040Run">Lancer / reprendre</button>
        <button type="button" id="cgweb040Retry">Relancer uniquement les erreurs</button>
        <button type="button" id="cgweb040Report">Télécharger le rapport actuel</button>
      </div>

      <div id="cgweb040Message" class="cgweb040-message"></div>

      <details class="cgweb040-history" open>
        <summary>Historique local des imports</summary>
        <div class="cgweb040-history-head">
          <span>Conservé uniquement dans ce navigateur · 30 lots maximum</span>
          <button type="button" id="cgweb040ClearHistory">Effacer l'historique</button>
        </div>
        <div id="cgweb040HistoryList" class="cgweb040-history-list"></div>
      </details>`;

    bulk.insertAdjacentElement("beforebegin", root);

    root.querySelector("#cgweb040Refresh")?.addEventListener("click", render);
    root.querySelector("#cgweb040Run")?.addEventListener("click", () => {
      const api = window.CGIMPORT011;
      if (!api?.state?.items?.length) {
        setMessage("Aucune file d'import chargée.", "warn");
        return;
      }
      if (api.state.running) {
        setMessage("Un import est déjà en cours.", "warn");
        return;
      }
      if (api.state.pauseRequested || api.state.stopRequested) {
        api.resume?.();
      } else {
        api.start?.();
      }
      setTimeout(render, 300);
    });
    root.querySelector("#cgweb040Retry")?.addEventListener("click", retryCurrentErrors);
    root.querySelector("#cgweb040Report")?.addEventListener("click", () => {
      if (window.CGIMPORT011?.downloadReport) {
        window.CGIMPORT011.downloadReport();
      } else {
        setMessage("Export du rapport actuel indisponible.", "error");
      }
    });
    root.querySelector("#cgweb040ClearHistory")?.addEventListener("click", clearHistory);

    rt.root = root;
    return root;
  }

  function renderCurrent() {
    const root = createUi();
    if (!root) return;

    const state = getQueue();
    if (!state || !state.items.length) {
      root.querySelector("#cgweb040Source").textContent = "Aucun lot";
      root.querySelector("#cgweb040Progress").textContent = "0 / 0";
      root.querySelector("#cgweb040Added").textContent = "0";
      root.querySelector("#cgweb040Errors").textContent = "0";
      const bar = root.querySelector("#cgweb040ProgressBar");
      bar.max = 1;
      bar.value = 0;
      root.querySelector("#cgweb040Run").disabled = true;
      root.querySelector("#cgweb040Retry").disabled = true;
      root.querySelector("#cgweb040Report").disabled = true;
      return;
    }

    const stats = queueStats(state.items);
    const agg = aggregate(state.items);

    root.querySelector("#cgweb040Source").textContent = state.sourceName || "Sans nom";
    root.querySelector("#cgweb040Progress").textContent =
      `${stats.finished} / ${stats.total}${stats.running ? " · en cours" : ""}${stats.pending ? ` · ${stats.pending} attente` : ""}`;
    root.querySelector("#cgweb040Added").textContent = String(agg.added);
    root.querySelector("#cgweb040Errors").textContent = String(stats.errors);

    const bar = root.querySelector("#cgweb040ProgressBar");
    bar.max = Math.max(1, stats.total);
    bar.value = stats.finished;

    root.querySelector("#cgweb040Run").disabled = !!state.running || stats.total === 0 || stats.pending === 0 && stats.errors === 0;
    root.querySelector("#cgweb040Retry").disabled = !!state.running || stats.errors === 0;
    root.querySelector("#cgweb040Report").disabled = stats.total === 0;
  }

  function renderHistory() {
    const root = createUi();
    if (!root) return;

    const host = root.querySelector("#cgweb040HistoryList");
    const history = readJson(HISTORY_KEY, []);
    host.innerHTML = "";

    if (!history.length) {
      host.innerHTML = '<div class="cgweb040-empty">Aucun lot terminé enregistré sur ce navigateur.</div>';
      return;
    }

    for (const snap of history) {
      const card = document.createElement("article");
      card.className = "cgweb040-history-card";

      const s = snap.stats || {};
      const a = snap.aggregate || {};
      const title = document.createElement("div");
      title.className = "cgweb040-history-title";
      title.innerHTML = `
        <div>
          <strong class="cgweb040-source-name"></strong>
          <div class="cgweb040-meta">${fmtDate(snap.capturedAt)} · ${s.total || 0} thème(s)</div>
        </div>
        <div class="cgweb040-badges">
          <span>${s.done || 0} terminés</span>
          <span class="${(s.errors || 0) ? "cgweb040-error-badge" : ""}">${s.errors || 0} erreurs</span>
          <span>${a.added || 0} ajoutées</span>
          <span>${fmtDuration(a.duration || 0)}</span>
        </div>`;
      title.querySelector(".cgweb040-source-name").textContent = snap.sourceName || "Sans nom";

      const actions = document.createElement("div");
      actions.className = "cgweb040-history-actions";
      const report = document.createElement("button");
      report.type = "button";
      report.textContent = "Rapport CSV";
      report.addEventListener("click", () => downloadSnapshot(snap));

      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Relancer les erreurs";
      retry.disabled = !(snap.items || []).some((x) => x.status === "error");
      retry.addEventListener("click", () => retryHistoryErrors(snap));

      actions.append(report, retry);
      card.append(title, actions);
      host.appendChild(card);
    }
  }

  function render() {
    maybeArchiveCompletedQueue();
    renderCurrent();
    renderHistory();
  }

  function signature() {
    const state = getQueue();
    if (!state) return "noqueue";

    const stats = queueStats(state.items);
    const agg = aggregate(state.items);
    return [
      state.sourceName || "",
      state.startedAt || "",
      state.running ? 1 : 0,
      state.pauseRequested ? 1 : 0,
      state.stopRequested ? 1 : 0,
      stats.total,
      stats.done,
      stats.errors,
      stats.running,
      stats.pending,
      agg.added,
      agg.duplicates,
      agg.errors,
      Math.round(agg.duration)
    ].join("|");
  }

  function poll() {
    const sig = signature();
    if (sig !== rt.lastSignature) {
      rt.lastSignature = sig;
      render();
    }
  }

  function boot() {
    if (!window.CGIMPORT011) {
      setTimeout(boot, 250);
      return;
    }
    if (!document.querySelector("#cgimport011Bulk")) {
      setTimeout(boot, 250);
      return;
    }

    createUi();
    render();
    rt.timer = setInterval(() => {
      if (!document.hidden) poll();
    }, 2000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        rt.lastSignature = "";
        poll();
      }
    });

    window.CGWEB040 = {
      version: VERSION,
      render,
      retryCurrentErrors,
      history: () => readJson(HISTORY_KEY, [])
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

