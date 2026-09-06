// CGWEB014 — opérations en masse sur le répertoire
const CG14 = {
  selected: new Set(),
  observer: null,
  running: false
};

const cg14$ = id => document.getElementById(id);

function cg14Status(text, type = "") {
  const el = cg14$("cg14Status");
  if (!el) return;
  el.textContent = text;
  el.className = "cg14-status " + (type ? `cg14-${type}` : "");
}

function cg14Fmt(n) {
  return new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
}

function cg14UpdateCounter() {
  const count = CG14.selected.size;
  const el = cg14$("cg14SelectedCount");
  if (el) el.textContent = `${cg14Fmt(count)} sélectionnée(s)`;

  const clear = cg14$("cg14Clear");
  if (clear) clear.disabled = count === 0;

  const apply = cg14$("cg14Apply");
  if (apply) apply.disabled = count === 0 || CG14.running;

  const exp = cg14$("cg14Export");
  if (exp) exp.disabled = count === 0 || CG14.running;
}

function cg14ExtractId(row) {
  if (!row) return null;

  const candidates = [
    row.dataset?.id,
    row.dataset?.questionId,
    row.getAttribute?.("data-id"),
    row.getAttribute?.("data-question-id")
  ].filter(Boolean);

  for (const value of candidates) {
    const id = String(value).trim();
    if (id) return id;
  }

  const text = row.textContent || "";
  const m = text.match(/#\s*([A-Za-z0-9_-]+)/);
  if (m) return m[1];

  return null;
}

function cg14DecorateRows() {
  const panel = cg14$("cgweb006Panel");
  if (!panel) return;

  const rows = panel.querySelectorAll(".cg6-row");

  rows.forEach(row => {
    if (row.querySelector(".cg14-check")) return;

    const id = cg14ExtractId(row);
    if (!id) return;

    const wrap = document.createElement("label");
    wrap.className = "cg14-check";
    wrap.title = `Sélectionner ${id}`;
    wrap.innerHTML = `
      <input type="checkbox" ${CG14.selected.has(id) ? "checked" : ""}>
      <span>Lot</span>
    `;

    wrap.querySelector("input").onchange = event => {
      if (event.target.checked) CG14.selected.add(id);
      else CG14.selected.delete(id);
      cg14UpdateCounter();
    };

    row.insertAdjacentElement("afterbegin", wrap);
  });

  cg14UpdateCounter();
}

function cg14VisibleIds() {
  const panel = cg14$("cgweb006Panel");
  if (!panel) return [];

  return [...panel.querySelectorAll(".cg6-row")]
    .map(cg14ExtractId)
    .filter(Boolean);
}

function cg14SelectVisible() {
  for (const id of cg14VisibleIds()) CG14.selected.add(id);
  cg14DecorateRows();

  cg14$("cgweb006Panel")
    ?.querySelectorAll(".cg14-check input")
    .forEach(input => { input.checked = true; });

  cg14UpdateCounter();
  cg14Status("Toutes les questions visibles sont sélectionnées.", "ok");
}

function cg14Clear() {
  CG14.selected.clear();

  document.querySelectorAll(".cg14-check input")
    .forEach(input => { input.checked = false; });

  cg14UpdateCounter();
  cg14Status("Sélection vidée.");
}

async function cg14RunPool(items, worker, concurrency = 5) {
  let cursor = 0;
  let done = 0;
  let failed = 0;
  const failures = [];

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      const item = items[index];

      try {
        await worker(item);
        done++;
      } catch (error) {
        failed++;
        failures.push({
          id: item,
          error: error?.message || String(error)
        });
      }

      cg14Status(
        `Traitement ${cg14Fmt(done + failed)} / ${cg14Fmt(items.length)} · ` +
        `${cg14Fmt(failed)} échec(s)`
      );
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner()
    )
  );

  return { done, failed, failures };
}

function cg14GetAction() {
  return cg14$("cg14Action")?.value || "";
}

function cg14GetValue() {
  return cg14$("cg14Value")?.value?.trim() || "";
}

function cg14BuildPatch(action, value) {
  if (action === "theme") return { theme: value };
  if (action === "megatheme") return { megatheme: value };
  if (action === "status") return { status: value };
  return null;
}

async function cg14Apply() {
  if (CG14.running) return;

  const ids = [...CG14.selected];
  if (!ids.length) {
    cg14Status("Aucune question sélectionnée.", "error");
    return;
  }

  const action = cg14GetAction();
  const value = cg14GetValue();

  if (!action) {
    cg14Status("Choisis une opération.", "error");
    return;
  }

  if (action !== "delete" && !value) {
    cg14Status("Saisis la nouvelle valeur.", "error");
    return;
  }

  if (action === "delete") {
    const ok = confirm(
      `Supprimer ${ids.length} question(s) du Cloud ?\n\n` +
      `Un tombstone CGSYNC004 sera créé pour chacune afin de propager ` +
      `la suppression vers Android.`
    );
    if (!ok) return;
  } else {
    const label = {
      theme: "thème",
      megatheme: "mégathème",
      status: "statut"
    }[action] || action;

    const ok = confirm(
      `Appliquer « ${value} » comme ${label} à ${ids.length} question(s) ?`
    );
    if (!ok) return;
  }

  if (action === "delete" && !window.CGWEB010_API?.remove) {
    cg14Status("Suppression CGWEB010 indisponible.", "error");
    return;
  }

  if (action !== "delete" && !window.CGWEB006_API?.update) {
    cg14Status("Mise à jour CGWEB006 indisponible.", "error");
    return;
  }

  CG14.running = true;
  cg14UpdateCounter();

  try {
    let result;

    if (action === "delete") {
      result = await cg14RunPool(
        ids,
        id => window.CGWEB010_API.remove(String(id)),
        4
      );
    } else {
      const patch = cg14BuildPatch(action, value);

      result = await cg14RunPool(
        ids,
        id => window.CGWEB006_API.update(String(id), patch),
        5
      );
    }

    const message =
      `${cg14Fmt(result.done)} réussite(s)` +
      (result.failed ? ` · ${cg14Fmt(result.failed)} échec(s)` : "");

    cg14Status(
      message,
      result.failed ? "warn" : "ok"
    );

    if (!result.failed) {
      CG14.selected.clear();
      cg14UpdateCounter();
    }

    if (typeof window.CGWEB006_reload === "function") {
      await window.CGWEB006_reload(true);
    }

    setTimeout(cg14DecorateRows, 300);

  } catch (error) {
    cg14Status(error?.message || String(error), "error");
  } finally {
    CG14.running = false;
    cg14UpdateCounter();
  }
}

function cg14CsvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function cg14Export() {
  if (CG14.running) return;

  const ids = [...CG14.selected];
  if (!ids.length) {
    cg14Status("Aucune question sélectionnée.", "error");
    return;
  }

  if (!window.CGWEB006_API?.byId) {
    cg14Status("Lecture CGWEB006 indisponible.", "error");
    return;
  }

  CG14.running = true;
  cg14UpdateCounter();
  cg14Status("Préparation du CSV…");

  try {
    const rows = [];
    const result = await cg14RunPool(
      ids,
      async id => {
        const row = await window.CGWEB006_API.byId(String(id));
        if (row) rows.push(row);
      },
      6
    );

    rows.sort((a, b) =>
      String(a.original_id ?? a.id ?? "").localeCompare(
        String(b.original_id ?? b.id ?? ""),
        "fr",
        { numeric: true }
      )
    );

    const fields = [
      "original_id",
      "megatheme",
      "theme",
      "question",
      "detail",
      "proposition_a",
      "proposition_b",
      "proposition_c",
      "proposition_d",
      "correct_index",
      "url_quizypedia",
      "url_internet",
      "image_file",
      "non_trouve",
      "status",
      "is_image"
    ];

    const csv = [
      fields.join(";"),
      ...rows.map(row =>
        fields.map(field =>
          cg14CsvEscape(
            field === "original_id"
              ? (row.original_id ?? row.id ?? "")
              : row[field]
          )
        ).join(";")
      )
    ].join("\r\n");

    const blob = new Blob(
      ["\ufeff", csv],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      `CultureGenerale_selection_${new Date().toISOString().slice(0,10)}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    cg14Status(
      `${cg14Fmt(rows.length)} question(s) exportée(s)` +
      (result.failed ? ` · ${cg14Fmt(result.failed)} échec(s)` : ""),
      result.failed ? "warn" : "ok"
    );

  } catch (error) {
    cg14Status(error?.message || String(error), "error");
  } finally {
    CG14.running = false;
    cg14UpdateCounter();
  }
}

function cg14ActionChanged() {
  const action = cg14GetAction();
  const value = cg14$("cg14Value");

  if (!value) return;

  if (action === "delete") {
    value.value = "";
    value.disabled = true;
    value.placeholder = "Aucune valeur nécessaire";
  } else {
    value.disabled = false;
    value.placeholder = {
      theme: "Nouveau thème",
      megatheme: "Nouveau mégathème",
      status: "Nouveau statut"
    }[action] || "Nouvelle valeur";
  }
}

function cg14InitObserver() {
  const panel = cg14$("cgweb006Panel");
  if (!panel || CG14.observer) return;

  CG14.observer = new MutationObserver(() => {
    window.clearTimeout(CG14.observer._timer);
    CG14.observer._timer = window.setTimeout(
      cg14DecorateRows,
      80
    );
  });

  CG14.observer.observe(panel, {
    childList: true,
    subtree: true
  });

  cg14DecorateRows();
}

function cg14Init() {
  if (cg14$("cgweb014Panel")) return;

  const panel = document.createElement("section");
  panel.id = "cgweb014Panel";
  panel.className = "cg14-panel";

  panel.innerHTML = `
    <div class="cg14-head">
      <div>
        <div class="cg14-kicker">CGWEB014</div>
        <h2>Opérations en masse</h2>
        <div class="cg14-sub">
          Sélectionne les questions visibles dans le répertoire, puis applique
          une modification ou exporte-les en CSV.
        </div>
      </div>
      <div id="cg14SelectedCount" class="cg14-selected">
        0 sélectionnée(s)
      </div>
    </div>

    <div class="cg14-tools">
      <button id="cg14SelectVisible" class="cg14-btn">
        Tout sélectionner sur la page
      </button>

      <button id="cg14Clear" class="cg14-btn" disabled>
        Vider la sélection
      </button>
    </div>

    <div class="cg14-action-row">
      <select id="cg14Action">
        <option value="">Choisir une opération</option>
        <option value="theme">Changer le thème</option>
        <option value="megatheme">Changer le mégathème</option>
        <option value="status">Changer le statut</option>
        <option value="delete">Supprimer du Cloud</option>
      </select>

      <input
        id="cg14Value"
        placeholder="Nouvelle valeur"
      >

      <button id="cg14Apply" class="cg14-btn cg14-primary" disabled>
        Appliquer
      </button>

      <button id="cg14Export" class="cg14-btn" disabled>
        Exporter CSV
      </button>
    </div>

    <div class="cg14-note">
      CGWEB014 agit uniquement sur les questions sélectionnées.
      La suppression utilise CGWEB010 et crée donc les tombstones nécessaires
      à CGSYNC004.
    </div>

    <div id="cg14Status" class="cg14-status"></div>
  `;

  const quality = cg14$("cgweb013Panel");
  const health = cg14$("cgsync005Panel");
  const directory = cg14$("cgweb006Panel");

  if (quality?.parentElement) {
    quality.insertAdjacentElement("afterend", panel);
  } else if (health?.parentElement) {
    health.insertAdjacentElement("afterend", panel);
  } else if (directory?.parentElement) {
    directory.insertAdjacentElement("afterend", panel);
  } else {
    (document.querySelector("main") || document.body).appendChild(panel);
  }

  cg14$("cg14SelectVisible").onclick = cg14SelectVisible;
  cg14$("cg14Clear").onclick = cg14Clear;
  cg14$("cg14Apply").onclick = cg14Apply;
  cg14$("cg14Export").onclick = cg14Export;
  cg14$("cg14Action").onchange = cg14ActionChanged;

  cg14InitObserver();
  cg14UpdateCounter();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cg14Init);
} else {
  cg14Init();
}
