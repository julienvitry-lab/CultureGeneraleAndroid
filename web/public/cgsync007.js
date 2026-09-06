// CGSYNC007 — registre Web des conflits
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  async function waitApi() {
    for (let i = 0; i < 80; i++) {
      if (window.CGSYNC007_API && $("cgweb006Panel")) return window.CGSYNC007_API;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  function ensureButton() {
    if ($("cg7Registry")) return $("cg7Registry");
    const panel = $("cgweb006Panel");
    if (!panel) return null;

    const button = document.createElement("button");
    button.id = "cg7Registry";
    button.className = "cg7-registry-btn";
    button.textContent = "Conflits : …";
    panel.querySelector(".cg6-title")?.insertAdjacentElement("afterend", button);
    button.onclick = openRegistry;
    return button;
  }

  function dateText(value) {
    try {
      if (value?.toDate) return value.toDate().toLocaleString("fr-FR");
    } catch (_) { }
    return "date inconnue";
  }

  async function refresh() {
    const api = await waitApi();
    const button = ensureButton();
    if (!api || !button) return;

    try {
      const rows = await api.listOpen(100);
      const count = rows.length;
      button.textContent = `Conflits : ${count}${count >= 100 ? "+" : ""}`;
      button.classList.toggle("cg7-has-conflicts", count > 0);
      button.dataset.count = String(count);
    } catch (error) {
      button.textContent = "Conflits : ?";
      console.warn("CGSYNC007 registry", error);
    }
  }

  async function openRegistry() {
    const api = await waitApi();
    if (!api) return;

    $("cg7Overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "cg7Overlay";
    overlay.className = "cg7-overlay";
    overlay.innerHTML = `
      <div class="cg7-dialog">
        <div class="cg7-dialog-head">
          <div><div class="cg6-kicker">CGSYNC007</div><h3>Conflits d'édition ouverts</h3></div>
          <button id="cg7Close" class="cg7-close">×</button>
        </div>
        <div id="cg7List" class="cg7-list"><div class="cg7-empty">Chargement…</div></div>
      </div>`;
    document.body.appendChild(overlay);
    $("cg7Close").onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    try {
      const rows = await api.listOpen(100);
      const list = $("cg7List");
      if (!rows.length) {
        list.innerHTML = '<div class="cg7-empty">Aucun conflit ouvert ✅</div>';
        return;
      }

      list.innerHTML = rows.map(row => `
        <div class="cg7-item" data-conflict="${esc(row.id)}">
          <div class="cg7-item-title">Question #${esc(row.question_id)} · ${esc(row.operation || "update")}</div>
          <div class="cg7-item-meta">Révision ouverte : ${esc(row.expected_revision ?? "—")} · Cloud : ${esc(row.cloud_revision ?? "—")} · ${esc(dateText(row.created_at))}</div>
          <div class="cg7-item-meta">${esc(row.writer_label || row.source || "Web")}</div>
          <div class="cg7-item-actions">
            <button class="cg6-btn" data-open-question="${esc(row.question_id)}">Ouvrir la question</button>
            <button class="cg6-btn" data-ack="${esc(row.id)}">Marquer traité</button>
          </div>
        </div>`).join("");

      list.querySelectorAll("[data-open-question]").forEach(button => {
        button.onclick = () => {
          const id = button.dataset.openQuestion;
          const mode = $("cg6SearchMode");
          const input = $("cg6Search");
          if (mode) mode.value = "id";
          if (input) input.value = id;
          $("cg6SearchBtn")?.click();
          overlay.remove();
        };
      });

      list.querySelectorAll("[data-ack]").forEach(button => {
        button.onclick = async () => {
          button.disabled = true;
          try {
            await api.resolveConflict(button.dataset.ack, "acknowledged");
            button.closest(".cg7-item")?.remove();
            await refresh();
          } catch (error) {
            alert(error?.message || String(error));
            button.disabled = false;
          }
        };
      });
    } catch (error) {
      $("cg7List").innerHTML = `<div class="cg7-empty">${esc(error?.message || String(error))}</div>`;
    }
  }

  window.addEventListener("cgsync007-conflicts-changed", refresh);
  setInterval(refresh, 30000);
  refresh();
})();
