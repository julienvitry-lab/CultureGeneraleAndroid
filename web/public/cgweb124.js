(() => {
  "use strict";

  const ENDPOINT = "https://europe-west1-culturegeneralesync.cloudfunctions.net/cgweb124RawTextExtract";
  const BATCH_SIZE = 10;
  const state = { urls: [], texts: [], failures: [], running: false };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function uniqueUrls(raw) {
    const seen = new Set();
    const urls = [];
    let duplicates = 0;
    String(raw || "").split(/\r?\n/).forEach((line) => {
      const url = line.trim();
      if (!url) return;
      if (seen.has(url)) { duplicates += 1; return; }
      seen.add(url);
      urls.push(url);
    });
    return { urls, duplicates };
  }

  async function readJsonSafe(response) {
    try { return await response.json(); }
    catch (_) { return null; }
  }

  function init() {
    if (document.getElementById("cgweb124Launcher")) return;

    const launcher = document.createElement("button");
    launcher.id = "cgweb124Launcher";
    launcher.type = "button";
    launcher.textContent = "Extraction de fiches";
    document.body.appendChild(launcher);

    const modal = document.createElement("div");
    modal.id = "cgweb124Modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="cg124-backdrop" data-cg124-close></div>
      <section class="cg124-card" role="dialog" aria-modal="true" aria-labelledby="cg124Title">
        <div class="cg124-head">
          <div>
            <h2 id="cg124Title">Extraction de fiches</h2>
            <p>CGWEB124 · RAW_TEXT_EXTRACTOR001</p>
          </div>
          <button type="button" class="cg124-close" data-cg124-close aria-label="Fermer">×</button>
        </div>

        <label class="cg124-label" for="cg124Urls">Adresses des fiches — une URL par ligne</label>
        <textarea id="cg124Urls" spellcheck="false" placeholder="https://…\nhttps://…"></textarea>

        <div class="cg124-actions">
          <button id="cg124Extract" type="button">Extraire le texte</button>
          <button id="cg124Export" type="button" disabled>Exporter XLSX</button>
          <button id="cg124Reset" type="button" class="cg124-secondary">Réinitialiser</button>
        </div>

        <div id="cg124Status" class="cg124-status">Aucune extraction en cours.</div>
        <div id="cg124Summary" class="cg124-summary"></div>
        <div id="cg124Failures" class="cg124-failures"></div>
      </section>`;
    document.body.appendChild(modal);

    const $ = (id) => document.getElementById(id);
    const urlsEl = $("cg124Urls");
    const extractBtn = $("cg124Extract");
    const exportBtn = $("cg124Export");
    const resetBtn = $("cg124Reset");
    const statusEl = $("cg124Status");
    const summaryEl = $("cg124Summary");
    const failuresEl = $("cg124Failures");

    function setOpen(open) {
      modal.hidden = !open;
      document.documentElement.classList.toggle("cg124-open", open);
      if (open) setTimeout(() => urlsEl.focus(), 0);
    }

    launcher.addEventListener("click", () => setOpen(true));
    modal.querySelectorAll("[data-cg124-close]").forEach((el) => el.addEventListener("click", () => {
      if (!state.running) setOpen(false);
    }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden && !state.running) setOpen(false);
    });

    function renderFailures() {
      if (!state.failures.length) {
        failuresEl.innerHTML = "";
        return;
      }
      failuresEl.innerHTML = `
        <details open>
          <summary>${state.failures.length} échec(s)</summary>
          <div class="cg124-failure-list">${state.failures.map((f) => `
            <div><strong>Adresse ${f.index + 1}</strong> — ${escapeHtml(f.url)}<br><span>${escapeHtml(f.error)}</span></div>
          `).join("")}</div>
        </details>`;
    }

    function setRunning(running) {
      state.running = running;
      extractBtn.disabled = running;
      resetBtn.disabled = running;
      exportBtn.disabled = running || !state.texts.some(Boolean);
      urlsEl.disabled = running;
    }

    extractBtn.addEventListener("click", async () => {
      if (state.running) return;
      const parsed = uniqueUrls(urlsEl.value);
      if (!parsed.urls.length) {
        statusEl.textContent = "Ajoute au moins une adresse de fiche.";
        return;
      }

      state.urls = parsed.urls;
      /*
       * Une URL peut maintenant fournir plusieurs fiches.
       * Le tableau de sortie contient donc les fiches, et non les URL.
       */
      state.texts = [];
      state.failures = [];
      summaryEl.innerHTML = "";
      failuresEl.innerHTML = "";
      setRunning(true);

      try {
        for (let start = 0; start < state.urls.length; start += BATCH_SIZE) {
          const batch = state.urls.slice(start, start + BATCH_SIZE);
          const end = Math.min(start + batch.length, state.urls.length);
          statusEl.textContent = `Extraction ${start + 1}–${end} / ${state.urls.length}…`;

          try {
            const response = await fetch(ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "extract", urls: batch }),
            });
            const payload = await readJsonSafe(response);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);

            payload.results.forEach((item) => {
              const sourceIndex =
                start +
                Number(item.index || 0);

              if (item.ok) {
                const texts =
                  Array.isArray(item.texts)
                    ? item.texts
                    : (
                        item.text
                          ? [item.text]
                          : []
                      );

                texts
                  .map(text =>
                    String(text || "").trim()
                  )
                  .filter(Boolean)
                  .forEach(text => {
                    state.texts.push(text);
                  });
              } else {
                state.failures.push({
                  index: sourceIndex,
                  url: state.urls[sourceIndex],
                  error:
                    item.error ||
                    "Extraction impossible",
                });
              }
            });
          } catch (err) {
            batch.forEach((url, offset) => state.failures.push({
              index: start + offset,
              url,
              error: err?.message || "Erreur de lot",
            }));
          }
        }

        const success = state.texts.filter(Boolean).length;
        const longCells = state.texts.filter((t) => t.length > 32767).length;
        statusEl.textContent = "Extraction terminée.";
        summaryEl.innerHTML = `
          <div><strong>${success}</strong> fiche(s) extraite(s)</div>
          <div><strong>${state.failures.length}</strong> échec(s)</div>
          ${parsed.duplicates ? `<div><strong>${parsed.duplicates}</strong> URL en doublon ignorée(s)</div>` : ""}
          ${longCells ? `<div class="cg124-warning"><strong>${longCells}</strong> fiche(s) dépassent 32 767 caractères : export XLSX impossible tant qu'elles ne sont pas raccourcies.</div>` : ""}`;
        renderFailures();
      } finally {
        setRunning(false);
      }
    });

    exportBtn.addEventListener("click", async () => {
      if (state.running || !state.texts.some(Boolean)) return;
      setRunning(true);
      statusEl.textContent = "Création du classeur XLSX…";
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "export", texts: state.texts }),
        });
        if (!response.ok) {
          const payload = await readJsonSafe(response);
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const filename = match?.[1] || "CGWEB124_RAW_TEXT.xlsx";
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 30000);
        statusEl.textContent = `Classeur créé : ${filename}`;
      } catch (err) {
        statusEl.textContent = `Export impossible : ${err?.message || "erreur"}`;
      } finally {
        setRunning(false);
      }
    });

    resetBtn.addEventListener("click", () => {
      if (state.running) return;
      state.urls = [];
      state.texts = [];
      state.failures = [];
      urlsEl.value = "";
      statusEl.textContent = "Aucune extraction en cours.";
      summaryEl.innerHTML = "";
      failuresEl.innerHTML = "";
      exportBtn.disabled = true;
      urlsEl.focus();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

