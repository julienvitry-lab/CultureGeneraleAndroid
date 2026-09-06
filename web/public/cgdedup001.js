// CGDEDUP001 — déduplication assistée
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const FIELDS = [
    ["megatheme", "Mégathème"],
    ["theme", "Thème"],
    ["question", "Question"],
    ["detail", "Détail"],
    ["proposition_a", "Proposition A"],
    ["proposition_b", "Proposition B"],
    ["proposition_c", "Proposition C"],
    ["proposition_d", "Proposition D"],
    ["correct_index", "Réponse correcte"],
    ["url_quizypedia", "URL Quizypedia"],
    ["url_internet", "URL Internet"],
    ["image_file", "Image"],
    ["non_trouve", "non_trouve"],
    ["status", "Statut"],
    ["is_image", "is_image"]
  ];

  const CGD = {
    report: null,
    groups: [],
    index: 0,
    rows: [],
    pair: null,
    busy: false,
    resolved: new Set()
  };

  function fmt(n) {
    return new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
  }

  function status(text, kind = "") {
    const el = $("cgdStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "cgd-status " + (kind ? `cgd-${kind}` : "");
  }

  function rev(row) {
    const n = Number(row?.cg_revision ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  }

  function visibleGroups() {
    return CGD.groups.filter(g => !CGD.resolved.has(g.group_id));
  }

  function updateSummary() {
    if (!CGD.report) return;
    $("cgdGroupCount").textContent = fmt(visibleGroups().length);
    $("cgdQuestionCount").textContent = fmt(CGD.report.duplicate_question_count);
    $("cgdExactCount").textContent = fmt(CGD.report.exact_content_group_count);
    $("cgdGenerated").textContent =
      `Snapshot ${CGD.report.source_db || ""} · ${
        new Date(CGD.report.generated_at).toLocaleString("fr-FR")
      }`;
  }

  function normalizeComparable(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function chooseDefault(a, b, key) {
    const av = normalizeComparable(a?.[key]);
    const bv = normalizeComparable(b?.[key]);

    if (!av && bv) return "b";
    if (av && !bv) return "a";

    if (key === "detail") {
      if (bv.length > av.length) return "b";
    }

    return "a";
  }

  function cellValue(value) {
    if (value === null || value === undefined || value === "") {
      return '<span class="cgd-empty">∅</span>';
    }
    return esc(value);
  }

  function diffClass(a, b) {
    return normalizeComparable(a) === normalizeComparable(b)
      ? "cgd-same"
      : "cgd-diff";
  }

  function renderPair() {
    const box = $("cgdPair");
    const pair = CGD.pair;

    if (!pair) {
      box.innerHTML = '<div class="cgd-empty-card">Choisis un groupe de doublons.</div>';
      return;
    }

    const [a, b] = pair.rows;
    const labels = pair.labels;

    const rows = FIELDS.map(([key, label]) => {
      const choice = chooseDefault(a, b, key);
      return `
        <tr class="${diffClass(a?.[key], b?.[key])}">
          <th>${esc(label)}</th>
          <td>
            <label class="cgd-radio">
              <input type="radio" name="cgd-${esc(key)}" value="a"
                ${choice === "a" ? "checked" : ""}>
              <span>${cellValue(a?.[key])}</span>
            </label>
          </td>
          <td>
            <label class="cgd-radio">
              <input type="radio" name="cgd-${esc(key)}" value="b"
                ${choice === "b" ? "checked" : ""}>
              <span>${cellValue(b?.[key])}</span>
            </label>
          </td>
        </tr>`;
    }).join("");

    box.innerHTML = `
      <div class="cgd-pair-head">
        <div>
          <div class="cgd-kicker">Comparaison</div>
          <h3>${esc(pair.group.question)}</h3>
        </div>
        <div class="cgd-confidence">
          ${pair.group.exact_content
            ? "Contenu intégral identique"
            : "Question identique · champs à comparer"}
        </div>
      </div>

      <div class="cgd-two-cards">
        <div class="cgd-question-card">
          <strong>A · #${esc(a.id)}</strong>
          <span>révision ${rev(a)}</span>
        </div>
        <div class="cgd-question-card">
          <strong>B · #${esc(b.id)}</strong>
          <span>révision ${rev(b)}</span>
        </div>
      </div>

      <div class="cgd-table-wrap">
        <table class="cgd-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>A · #${esc(a.id)}</th>
              <th>B · #${esc(b.id)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="cgd-actions">
        <button class="cgd-btn cgd-safe" id="cgdKeepA">
          Conserver A · supprimer B
        </button>
        <button class="cgd-btn cgd-safe" id="cgdKeepB">
          Conserver B · supprimer A
        </button>
        <button class="cgd-btn cgd-merge" id="cgdMergeA">
          Fusionner les choix vers A · supprimer B
        </button>
        <button class="cgd-btn cgd-merge" id="cgdMergeB">
          Fusionner les choix vers B · supprimer A
        </button>
      </div>

      <div class="cgd-note">
        Aucune suppression automatique : chaque opération demande confirmation.
        La fusion et la suppression sont atomiques dans Firestore.
      </div>
    `;

    $("cgdKeepA").onclick = () => execute("keep-a");
    $("cgdKeepB").onclick = () => execute("keep-b");
    $("cgdMergeA").onclick = () => execute("merge-a");
    $("cgdMergeB").onclick = () => execute("merge-b");
  }

  function buildPatch(target) {
    const pair = CGD.pair;
    const [a, b] = pair.rows;
    const patch = {};

    for (const [key] of FIELDS) {
      const selected = document.querySelector(
        `input[name="cgd-${CSS.escape(key)}"]:checked`
      )?.value || "a";
      const source = selected === "b" ? b : a;
      const targetRow = target === "a" ? a : b;
      const value = source?.[key];

      if (normalizeComparable(value) !== normalizeComparable(targetRow?.[key])) {
        patch[key] = value ?? "";
      }
    }

    return patch;
  }

  async function execute(mode) {
    if (CGD.busy || !CGD.pair) return;

    const [a, b] = CGD.pair.rows;
    const merge = mode.startsWith("merge");
    const keepA = mode.endsWith("a");

    const keep = keepA ? a : b;
    const del = keepA ? b : a;
    const patch = merge ? buildPatch(keepA ? "a" : "b") : {};

    const title = merge
      ? `Fusionner vers #${keep.id} puis supprimer #${del.id} ?`
      : `Conserver #${keep.id} et supprimer #${del.id} ?`;

    const details = merge
      ? `\n\n${Object.keys(patch).length} champ(s) du document conservé seront modifiés.`
      : "";

    const ok = confirm(
      `${title}${details}\n\n` +
      `La question #${del.id} recevra un tombstone et disparaîtra également d'Android.`
    );

    if (!ok) return;

    if (!window.CGDEDUP001_API?.resolvePair) {
      status("API CGDEDUP001 indisponible.", "error");
      return;
    }

    CGD.busy = true;
    status("Transaction de déduplication…");

    try {
      const result = await window.CGDEDUP001_API.resolvePair({
        keepId: String(keep.id),
        deleteId: String(del.id),
        expectedKeepRevision: rev(keep),
        expectedDeleteRevision: rev(del),
        patch,
        mode
      });

      if (result?.conflict) {
        status(
          `Conflit détecté : une des deux questions a changé. ` +
          `Le couple va être rechargé ; aucune suppression effectuée.`,
          "warn"
        );
        await loadGroup(CGD.pair.group);
        return;
      }

      if (!result?.ok) {
        throw new Error("Transaction non validée.");
      }

      CGD.resolved.add(CGD.pair.group.group_id);
      saveResolved();
      status(
        `✅ #${result.keepId} conservée · #${result.deleteId} supprimée.`,
        "ok"
      );

      updateSummary();
      await nextGroup();

    } catch (error) {
      status(error?.message || String(error), "error");
    } finally {
      CGD.busy = false;
    }
  }

  function loadResolved() {
    try {
      const raw = JSON.parse(localStorage.getItem("CGDEDUP001_RESOLVED") || "[]");
      CGD.resolved = new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (_) {
      CGD.resolved = new Set();
    }
  }

  function saveResolved() {
    try {
      localStorage.setItem(
        "CGDEDUP001_RESOLVED",
        JSON.stringify([...CGD.resolved])
      );
    } catch (_) { }
  }

  async function getRows(ids) {
    if (!window.CGWEB006_API?.byId) {
      throw new Error("Répertoire CGWEB006 indisponible.");
    }

    const rows = (
      await Promise.all(ids.map(id =>
        window.CGWEB006_API.byId(String(id)).catch(() => null)
      ))
    ).filter(Boolean);

    return rows;
  }

  async function loadGroup(group) {
    if (!group) return;

    status(`Chargement du groupe ${group.ids.join(" / ")}…`);

    const rows = await getRows(group.ids);

    // Le snapshot statique peut contenir un groupe déjà traité depuis.
    if (rows.length < 2) {
      CGD.resolved.add(group.group_id);
      saveResolved();
      updateSummary();
      status("Groupe déjà résolu dans le Cloud.", "ok");
      return nextGroup();
    }

    // Pour les groupes > 2, on traite deux questions à la fois.
    const chosen = rows.slice(0, 2);
    CGD.pair = {
      group,
      rows: chosen,
      labels: ["A", "B"]
    };

    renderPair();
    status(
      rows.length > 2
        ? `${rows.length} questions dans ce groupe · traitement deux par deux.`
        : "Deux questions chargées.",
      "ok"
    );
  }

  async function nextGroup() {
    const groups = visibleGroups();
    if (!groups.length) {
      CGD.pair = null;
      renderPair();
      status("🎯 Tous les groupes du snapshot sont traités.", "ok");
      return;
    }

    if (CGD.index >= groups.length) CGD.index = 0;
    await loadGroup(groups[CGD.index]);
  }

  async function previousGroup() {
    const groups = visibleGroups();
    if (!groups.length) return;
    CGD.index = (CGD.index - 1 + groups.length) % groups.length;
    await loadGroup(groups[CGD.index]);
  }

  async function searchId() {
    const value = $("cgdSearch")?.value?.trim();
    if (!value) return;

    const group = CGD.groups.find(g =>
      (g.ids || []).some(id => String(id) === value)
    );

    if (!group) {
      status(`ID ${value} absent du catalogue de doublons.`, "warn");
      return;
    }

    await loadGroup(group);
  }

  async function loadReport() {
    const response = await fetch(
      "./cgdedup001_pairs.json?v=CGDEDUP001_1",
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Catalogue CGDEDUP001 introuvable.");
    }

    CGD.report = await response.json();
    CGD.groups = Array.isArray(CGD.report.groups)
      ? CGD.report.groups
      : [];

    loadResolved();
    updateSummary();

    if (!CGD.groups.length) {
      status("Aucun doublon exact détecté 🎯", "ok");
      return;
    }

    status("Catalogue chargé. Choisis « Premier groupe ».", "ok");
  }

  function init() {
    if ($("cgdedup001Panel")) return;

    const panel = document.createElement("section");
    panel.id = "cgdedup001Panel";
    panel.className = "cgd-panel";
    panel.innerHTML = `
      <div class="cgd-head">
        <div>
          <div class="cgd-kicker">CGDEDUP001</div>
          <h2>Déduplication assistée</h2>
          <div id="cgdGenerated" class="cgd-generated"></div>
        </div>
      </div>

      <div class="cgd-summary">
        <div><span>Groupes à traiter</span><strong id="cgdGroupCount">—</strong></div>
        <div><span>Questions concernées</span><strong id="cgdQuestionCount">—</strong></div>
        <div><span>Contenu intégral identique</span><strong id="cgdExactCount">—</strong></div>
      </div>

      <div class="cgd-toolbar">
        <button id="cgdFirst" class="cgd-btn">Premier groupe</button>
        <button id="cgdPrev" class="cgd-btn">← Précédent</button>
        <button id="cgdNext" class="cgd-btn">Suivant →</button>
        <div class="cgd-search-wrap">
          <input id="cgdSearch" placeholder="ID exact">
          <button id="cgdSearchBtn" class="cgd-btn">Rechercher</button>
        </div>
      </div>

      <div id="cgdPair" class="cgd-pair">
        <div class="cgd-empty-card">Chargement du catalogue…</div>
      </div>

      <div id="cgdStatus" class="cgd-status"></div>
    `;

    const quality = $("cgweb013Panel");
    const bulk = $("cgweb014Panel");
    const directory = $("cgweb006Panel");

    if (quality?.parentElement) {
      quality.insertAdjacentElement("afterend", panel);
    } else if (bulk?.parentElement) {
      bulk.insertAdjacentElement("beforebegin", panel);
    } else if (directory?.parentElement) {
      directory.insertAdjacentElement("afterend", panel);
    } else {
      (document.querySelector("main") || document.body).appendChild(panel);
    }

    $("cgdFirst").onclick = async () => {
      CGD.index = 0;
      await nextGroup();
    };
    $("cgdPrev").onclick = previousGroup;
    $("cgdNext").onclick = async () => {
      const groups = visibleGroups();
      if (!groups.length) return;
      CGD.index = (CGD.index + 1) % groups.length;
      await nextGroup();
    };
    $("cgdSearchBtn").onclick = searchId;
    $("cgdSearch").onkeydown = event => {
      if (event.key === "Enter") searchId();
    };

    loadReport().catch(error =>
      status(error?.message || String(error), "error")
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
