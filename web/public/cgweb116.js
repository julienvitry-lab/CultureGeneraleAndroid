/* ============================================================
   CGWEB116
   QUIZYPEDIA_CATALOG001 / IMPORT_DUP_GUARD001
   HISTORICAL_REBUILD001 / CATALOG_LIVE_UPDATE001
   ============================================================ */

import {
  getApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const VERSION = "CGWEB116";
const PAGE_SIZE = 1000;

const MEGA_ORDER = [
  "Animaux et Plantes",
  "Culture Classique",
  "Culture Générale",
  "Culture Moderne",
  "Géographie",
  "Histoire",
  "Sciences et Techniques",
  "Sport"
];

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let catalogCache = null;
let rebuildBusy = false;
let remoteSaveTimer = null;


/* ============================================================
   OUTILS
   ============================================================ */

function esc(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function collator(a,b) {
  return String(a || "")
    .localeCompare(
      String(b || ""),
      "fr",
      { sensitivity:"base", numeric:true }
    );
}

function userOrThrow() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Utilisateur Firebase non connecté."
    );
  }

  return user;
}

function localKey(uid) {
  return `CGWEB116_CATALOG_${uid}`;
}

function timestampMs(value) {
  if (!value) return 0;

  if (
    typeof value.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function formatDate(ms) {
  const n = Number(ms || 0);

  if (!n) return "—";

  try {
    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        day:"2-digit",
        month:"2-digit",
        year:"numeric"
      }
    ).format(new Date(n));
  } catch {
    return "—";
  }
}


/* ============================================================
   URL QUIZYPEDIA
   ============================================================ */

function parseQuizypediaUrl(raw) {
  try {
    const u = new URL(
      String(raw || "").trim()
    );

    if (
      !/(^|\.)quizypedia\.fr$/i
        .test(u.hostname)
    ) {
      return null;
    }

    const parts =
      u.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts.length < 2 ||
      normalize(
        decodeURIComponent(parts[0])
      ) !== "quiz"
    ) {
      return null;
    }

    const encodedTheme =
      parts[1];

    const decodedTheme =
      decodeURIComponent(encodedTheme);

    const themeUrl =
      `${u.origin}/quiz/${encodedTheme}/`;

    let questionnaireUrl =
      themeUrl;

    if (parts.length >= 3) {
      questionnaireUrl =
        `${u.origin}/quiz/` +
        `${encodedTheme}/` +
        `${parts[2]}/`;
    }

    return {
      themeUrl,
      questionnaireUrl,
      themeSlug:decodedTheme,
      isQuestionnaire:
        parts.length >= 3
    };

  } catch {
    return null;
  }
}


/* ============================================================
   FORMAT DU CATALOGUE
   ============================================================ */

function emptyCatalog() {
  return {
    schema:1,
    updated_ms:0,
    scanned_questions:0,
    source_questions:0,
    groups:[]
  };
}

function normalizeCatalog(raw) {
  const catalog =
    raw && typeof raw === "object"
      ? raw
      : emptyCatalog();

  const groups =
    Array.isArray(catalog.groups)
      ? catalog.groups
      : [];

  groups.forEach(group => {
    group.megatheme =
      String(
        group.megatheme ||
        "Sans mégathème"
      );

    group.themes =
      Array.isArray(group.themes)
        ? group.themes
        : [];

    group.themes.forEach(item => {
      item.theme =
        String(
          item.theme ||
          item.quizypedia_theme ||
          "Thème sans nom"
        );

      item.quizypedia_theme_url =
        String(
          item.quizypedia_theme_url ||
          ""
        );

      item.questions_count =
        Number(
          item.questions_count || 0
        );

      item.questionnaire_urls =
        Array.isArray(
          item.questionnaire_urls
        )
          ? [
              ...new Set(
                item.questionnaire_urls
                  .map(String)
                  .filter(Boolean)
              )
            ]
          : [];

      item.questionnaire_count =
        item.questionnaire_urls.length;

      item.first_import_ms =
        Number(
          item.first_import_ms || 0
        );

      item.last_import_ms =
        Number(
          item.last_import_ms || 0
        );
    });

    group.themes.sort(
      (a,b) =>
        collator(a.theme,b.theme)
    );
  });

  groups.sort((a,b) => {
    const ai =
      MEGA_ORDER.indexOf(
        a.megatheme
      );

    const bi =
      MEGA_ORDER.indexOf(
        b.megatheme
      );

    if (ai >= 0 && bi >= 0) {
      return ai - bi;
    }

    if (ai >= 0) return -1;
    if (bi >= 0) return 1;

    return collator(
      a.megatheme,
      b.megatheme
    );
  });

  return {
    schema:1,
    updated_ms:
      Number(
        catalog.updated_ms || 0
      ),
    scanned_questions:
      Number(
        catalog.scanned_questions || 0
      ),
    source_questions:
      Number(
        catalog.source_questions || 0
      ),
    groups
  };
}


/* ============================================================
   STOCKAGE LOCAL
   ============================================================ */

function loadLocal() {
  const user = userOrThrow();

  try {
    const raw =
      localStorage.getItem(
        localKey(user.uid)
      );

    if (!raw) return null;

    return normalizeCatalog(
      JSON.parse(raw)
    );

  } catch {
    return null;
  }
}

function saveLocal(catalog) {
  const user = userOrThrow();

  try {
    localStorage.setItem(
      localKey(user.uid),
      JSON.stringify(catalog)
    );

    return true;

  } catch {
    return false;
  }
}


/* ============================================================
   STOCKAGE FIRESTORE
   users/<uid>/quizypedia_theme_catalog
   Un document par mégathème + _meta
   ============================================================ */

function hash32(text) {
  let h = 2166136261;

  for (
    const c of String(text || "")
  ) {
    h ^= c.charCodeAt(0);

    h = Math.imul(
      h,
      16777619
    );
  }

  return (
    h >>> 0
  ).toString(16);
}

async function loadRemote() {
  const user = userOrThrow();

  try {
    const ref =
      collection(
        db,
        "users",
        user.uid,
        "quizypedia_theme_catalog"
      );

    const snap =
      await getDocs(ref);

    if (snap.empty) {
      return null;
    }

    let meta = {};
    const groups = [];

    snap.forEach(d => {
      const data = d.data() || {};

      if (d.id === "_meta") {
        meta = data;
        return;
      }

      groups.push({
        megatheme:
          data.megatheme ||
          "Sans mégathème",
        themes:
          Array.isArray(data.themes)
            ? data.themes
            : []
      });
    });

    if (!groups.length) {
      return null;
    }

    return normalizeCatalog({
      schema:1,
      updated_ms:
        meta.updated_ms || 0,
      scanned_questions:
        meta.scanned_questions || 0,
      source_questions:
        meta.source_questions || 0,
      groups
    });

  } catch (error) {
    console.warn(
      VERSION,
      "catalogue Firestore indisponible",
      error
    );

    return null;
  }
}

async function saveRemote(
  catalog
) {
  const user = userOrThrow();

  try {
    const ref =
      collection(
        db,
        "users",
        user.uid,
        "quizypedia_theme_catalog"
      );

    /*
      Nettoyage du petit catalogue existant.
      Il ne contient normalement que
      8 mégathèmes + _meta.
    */
    const old =
      await getDocs(ref);

    let batch =
      writeBatch(db);

    let ops = 0;

    for (
      const oldDoc of old.docs
    ) {
      batch.delete(oldDoc.ref);
      ops += 1;

      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    for (
      const group of catalog.groups
    ) {
      const id =
        `mega_${hash32(
          group.megatheme
        )}`;

      const refDoc =
        doc(
          db,
          "users",
          user.uid,
          "quizypedia_theme_catalog",
          id
        );

      batch.set(
        refDoc,
        {
          schema:1,
          megatheme:
            group.megatheme,
          themes:
            group.themes,
          updated_ms:
            catalog.updated_ms
        }
      );

      ops += 1;

      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    batch.set(
      doc(
        db,
        "users",
        user.uid,
        "quizypedia_theme_catalog",
        "_meta"
      ),
      {
        schema:1,
        updated_ms:
          catalog.updated_ms,
        scanned_questions:
          catalog.scanned_questions,
        source_questions:
          catalog.source_questions,
        megathemes_count:
          catalog.groups.length,
        themes_count:
          catalog.groups.reduce(
            (n,g) =>
              n + g.themes.length,
            0
          )
      }
    );

    ops += 1;

    if (ops) {
      await batch.commit();
    }

    return true;

  } catch (error) {
    /*
      Le catalogue local reste utilisable
      même si les règles Firestore ne
      permettent pas la nouvelle collection.
    */
    console.warn(
      VERSION,
      "sauvegarde distante impossible",
      error
    );

    return false;
  }
}


/* ============================================================
   CHARGEMENT
   ============================================================ */

async function loadCatalog({
  force=false
}={}) {

  if (
    catalogCache &&
    !force
  ) {
    return catalogCache;
  }

  const remote =
    await loadRemote();

  if (remote) {
    catalogCache = remote;
    saveLocal(remote);

    return catalogCache;
  }

  const local =
    loadLocal();

  catalogCache =
    local ||
    emptyCatalog();

  return catalogCache;
}


/* ============================================================
   RECONSTRUCTION HISTORIQUE
   ============================================================ */

function addQuestionToMap(
  groups,
  data
) {
  const source =
    String(
      data?.url_quizypedia ||
      ""
    ).trim();

  const parsed =
    parseQuizypediaUrl(source);

  if (!parsed) {
    return false;
  }

  const megatheme =
    String(
      data?.megatheme ||
      "Sans mégathème"
    ).trim() ||
    "Sans mégathème";

  const theme =
    String(
      data?.theme ||
      parsed.themeSlug ||
      "Thème sans nom"
    ).trim();

  const groupKey =
    normalize(megatheme);

  if (!groups.has(groupKey)) {
    groups.set(
      groupKey,
      {
        megatheme,
        themes:new Map()
      }
    );
  }

  const mega =
    groups.get(groupKey);

  const themeKey =
    parsed.themeUrl.toLowerCase();

  if (!mega.themes.has(themeKey)) {
    mega.themes.set(
      themeKey,
      {
        theme,
        quizypedia_theme_url:
          parsed.themeUrl,
        questions_count:0,
        questionnaire_urls:
          new Set(),
        first_import_ms:0,
        last_import_ms:0
      }
    );
  }

  const item =
    mega.themes.get(themeKey);

  item.questions_count += 1;

  if (
    parsed.questionnaireUrl
  ) {
    item.questionnaire_urls.add(
      parsed.questionnaireUrl
    );
  }

  const created =
    timestampMs(
      data?.cg_created_at ||
      data?.created_at ||
      data?.updated_at
    );

  if (created) {
    if (
      !item.first_import_ms ||
      created <
      item.first_import_ms
    ) {
      item.first_import_ms =
        created;
    }

    if (
      created >
      item.last_import_ms
    ) {
      item.last_import_ms =
        created;
    }
  }

  return true;
}


function mapToCatalog(
  groups,
  scanned,
  sourced
) {
  const catalog =
    emptyCatalog();

  catalog.updated_ms =
    Date.now();

  catalog.scanned_questions =
    scanned;

  catalog.source_questions =
    sourced;

  catalog.groups =
    [...groups.values()]
      .map(group => ({
        megatheme:
          group.megatheme,

        themes:
          [...group.themes.values()]
            .map(item => ({
              theme:
                item.theme,

              quizypedia_theme_url:
                item.quizypedia_theme_url,

              questions_count:
                item.questions_count,

              questionnaire_urls:
                [
                  ...item
                    .questionnaire_urls
                ].sort(),

              questionnaire_count:
                item
                  .questionnaire_urls
                  .size,

              first_import_ms:
                item.first_import_ms,

              last_import_ms:
                item.last_import_ms
            }))
            .sort(
              (a,b) =>
                collator(
                  a.theme,
                  b.theme
                )
            )
      }));

  return normalizeCatalog(
    catalog
  );
}


async function rebuildCatalog({
  onProgress=null
}={}) {

  if (rebuildBusy) {
    throw new Error(
      "Une reconstruction est déjà en cours."
    );
  }

  const user =
    userOrThrow();

  rebuildBusy = true;

  try {
    const questionsRef =
      collection(
        db,
        "users",
        user.uid,
        "questions"
      );

    const groups =
      new Map();

    let scanned = 0;
    let sourced = 0;
    let lastDoc = null;

    while (true) {

      const parts = [
        orderBy(
          documentId()
        )
      ];

      if (lastDoc) {
        parts.push(
          startAfter(lastDoc)
        );
      }

      parts.push(
        limit(PAGE_SIZE)
      );

      const snap =
        await getDocs(
          query(
            questionsRef,
            ...parts
          )
        );

      if (snap.empty) {
        break;
      }

      for (
        const qDoc of snap.docs
      ) {
        scanned += 1;

        if (
          addQuestionToMap(
            groups,
            qDoc.data()
          )
        ) {
          sourced += 1;
        }
      }

      lastDoc =
        snap.docs[
          snap.docs.length - 1
        ];

      if (
        typeof onProgress ===
        "function"
      ) {
        onProgress({
          scanned,
          sourced,
          themes:
            [...groups.values()]
              .reduce(
                (n,g) =>
                  n +
                  g.themes.size,
                0
              )
        });
      }

      if (
        snap.size <
        PAGE_SIZE
      ) {
        break;
      }
    }

    const catalog =
      mapToCatalog(
        groups,
        scanned,
        sourced
      );

    catalogCache =
      catalog;

    /*
      Sauvegarde locale immédiate.
    */
    saveLocal(catalog);

    /*
      Puis tentative de synchronisation
      Firestore du catalogue condensé.
    */
    const remoteSaved =
      await saveRemote(
        catalog
      );

    return {
      catalog,
      remoteSaved
    };

  } finally {
    rebuildBusy = false;
  }
}


/* ============================================================
   MISE A JOUR INCREMENTALE DES FUTURS IMPORTS
   ============================================================ */

async function persistCacheSoon() {
  if (!catalogCache) return;

  saveLocal(
    catalogCache
  );

  clearTimeout(
    remoteSaveTimer
  );

  remoteSaveTimer =
    setTimeout(
      async () => {
        if (!catalogCache) return;

        await saveRemote(
          catalogCache
        );
      },
      1200
    );
}


async function recordImportedQuestion(
  payload
) {
  const parsed =
    parseQuizypediaUrl(
      payload?.url_quizypedia
    );

  if (!parsed) {
    return false;
  }

  const catalog =
    await loadCatalog();

  let group =
    catalog.groups.find(
      g =>
        normalize(
          g.megatheme
        ) ===
        normalize(
          payload?.megatheme ||
          "Sans mégathème"
        )
    );

  if (!group) {
    group = {
      megatheme:
        String(
          payload?.megatheme ||
          "Sans mégathème"
        ),
      themes:[]
    };

    catalog.groups.push(group);
  }

  let item =
    group.themes.find(
      t =>
        String(
          t.quizypedia_theme_url ||
          ""
        ).toLowerCase() ===
        parsed.themeUrl.toLowerCase()
    );

  if (!item) {
    item = {
      theme:
        String(
          payload?.theme ||
          parsed.themeSlug
        ),

      quizypedia_theme_url:
        parsed.themeUrl,

      questions_count:0,
      questionnaire_urls:[],
      questionnaire_count:0,
      first_import_ms:
        Date.now(),
      last_import_ms:
        Date.now()
    };

    group.themes.push(item);
  }

  item.questions_count =
    Number(
      item.questions_count || 0
    ) + 1;

  item.questionnaire_urls =
    Array.isArray(
      item.questionnaire_urls
    )
      ? item.questionnaire_urls
      : [];

  if (
    parsed.questionnaireUrl &&
    !item.questionnaire_urls
      .includes(
        parsed.questionnaireUrl
      )
  ) {
    item.questionnaire_urls.push(
      parsed.questionnaireUrl
    );
  }

  item.questionnaire_count =
    item.questionnaire_urls.length;

  if (!item.first_import_ms) {
    item.first_import_ms =
      Date.now();
  }

  item.last_import_ms =
    Date.now();

  catalog.source_questions =
    Number(
      catalog.source_questions || 0
    ) + 1;

  catalog.scanned_questions =
    Math.max(
      Number(
        catalog.scanned_questions ||
        0
      ),
      catalog.source_questions
    );

  catalog.updated_ms =
    Date.now();

  normalizeCatalog(
    catalog
  );

  await persistCacheSoon();

  window.dispatchEvent(
    new CustomEvent(
      "cgweb116:catalog-updated"
    )
  );

  return true;
}


/* ============================================================
   RECHERCHE DUPLICATA
   ============================================================ */

async function lookupUrl(
  raw
) {
  const parsed =
    parseQuizypediaUrl(raw);

  if (!parsed) {
    return null;
  }

  const catalog =
    await loadCatalog();

  for (
    const group of catalog.groups
  ) {
    for (
      const item of group.themes
    ) {
      if (
        String(
          item.quizypedia_theme_url ||
          ""
        ).toLowerCase() !==
        parsed.themeUrl.toLowerCase()
      ) {
        continue;
      }

      const exactQuestionnaire =
        parsed.isQuestionnaire &&
        Array.isArray(
          item.questionnaire_urls
        ) &&
        item.questionnaire_urls
          .some(
            url =>
              String(url)
                .toLowerCase() ===
              parsed
                .questionnaireUrl
                .toLowerCase()
          );

      return {
        megatheme:
          group.megatheme,
        theme:
          item.theme,
        questions_count:
          Number(
            item.questions_count || 0
          ),
        questionnaire_count:
          Number(
            item.questionnaire_count ||
            item.questionnaire_urls
              ?.length ||
            0
          ),
        quizypedia_theme_url:
          item.quizypedia_theme_url,
        exact_questionnaire:
          Boolean(
            exactQuestionnaire
          )
      };
    }
  }

  return null;
}


/* ============================================================
   API PUBLIQUE
   ============================================================ */

window.CGWEB116_API = {
  loadCatalog,
  rebuildCatalog,
  recordImportedQuestion,
  lookupUrl,
  parseQuizypediaUrl
};


/* ============================================================
   INTERFACE REPERTOIRE
   ============================================================ */

function ensureDirectoryUi() {

  const page =
    document.getElementById(
      "cg16PageDirectory"
    );

  const mount =
    document.getElementById(
      "cg16DirectoryMount"
    );

  if (
    !page ||
    !mount
  ) {
    return false;
  }

  if (
    document.getElementById(
      "cgweb116DirectoryTabs"
    )
  ) {
    return true;
  }

  const tabs =
    document.createElement(
      "div"
    );

  tabs.id =
    "cgweb116DirectoryTabs";

  tabs.innerHTML = `
    <button
      type="button"
      id="cgweb116TabQuestions"
      class="active"
    >
      Questions
    </button>

    <button
      type="button"
      id="cgweb116TabCatalog"
    >
      Thèmes Quizypedia
    </button>
  `;

  const catalog =
    document.createElement(
      "section"
    );

  catalog.id =
    "cgweb116Catalog";

  catalog.innerHTML = `
    <div class="cg116-toolbar">

      <label class="cg116-search">
        Rechercher
        <input
          id="cgweb116Search"
          type="search"
          placeholder="Thème ou mégathème..."
          autocomplete="off"
        >
      </label>

      <button
        type="button"
        id="cgweb116Refresh"
      >
        Actualiser
      </button>

      <button
        type="button"
        class="cg116-primary"
        id="cgweb116Rebuild"
      >
        Reconstruire le catalogue
      </button>

    </div>

    <div class="cg116-summary">

      <div class="cg116-stat">
        <span>Thèmes Quizypedia</span>
        <strong id="cgweb116ThemeCount">—</strong>
      </div>

      <div class="cg116-stat">
        <span>Questions Quizypedia</span>
        <strong id="cgweb116QuestionCount">—</strong>
      </div>

      <div class="cg116-stat">
        <span>Dernière reconstruction</span>
        <strong id="cgweb116Updated">—</strong>
      </div>

    </div>

    <div id="cgweb116State"></div>

    <div
      class="cg116-progress"
      id="cgweb116Progress"
      hidden
    >
      <div></div>
    </div>

    <div
      class="cg116-groups"
      id="cgweb116Groups"
    ></div>
  `;

  mount.insertAdjacentElement(
    "beforebegin",
    tabs
  );

  mount.insertAdjacentElement(
    "afterend",
    catalog
  );


  const questionsBtn =
    tabs.querySelector(
      "#cgweb116TabQuestions"
    );

  const catalogBtn =
    tabs.querySelector(
      "#cgweb116TabCatalog"
    );


  questionsBtn
    .addEventListener(
      "click",
      () => {
        questionsBtn
          .classList.add(
            "active"
          );

        catalogBtn
          .classList.remove(
            "active"
          );

        mount.style.display =
          "";

        catalog.classList.remove(
          "active"
        );
      }
    );


  catalogBtn
    .addEventListener(
      "click",
      async () => {

        questionsBtn
          .classList.remove(
            "active"
          );

        catalogBtn
          .classList.add(
            "active"
          );

        mount.style.display =
          "none";

        catalog.classList.add(
          "active"
        );

        await showCatalog({
          autoRebuild:true
        });
      }
    );


  document
    .getElementById(
      "cgweb116Search"
    )
    .addEventListener(
      "input",
      () => {
        renderCatalog(
          catalogCache ||
          emptyCatalog()
        );
      }
    );


  document
    .getElementById(
      "cgweb116Refresh"
    )
    .addEventListener(
      "click",
      async () => {
        catalogCache = null;

        await showCatalog({
          force:true,
          autoRebuild:false
        });
      }
    );


  document
    .getElementById(
      "cgweb116Rebuild"
    )
    .addEventListener(
      "click",
      rebuildFromUi
    );


  return true;
}


function setCatalogState(
  text,
  type=""
) {
  const el =
    document.getElementById(
      "cgweb116State"
    );

  if (!el) return;

  el.textContent =
    text || "";

  el.className =
    type || "";
}


function renderCatalog(
  catalog
) {
  const root =
    document.getElementById(
      "cgweb116Groups"
    );

  if (!root) return;

  const search =
    normalize(
      document
        .getElementById(
          "cgweb116Search"
        )
        ?.value
    );

  const themeCount =
    catalog.groups.reduce(
      (n,g) =>
        n + g.themes.length,
      0
    );

  document
    .getElementById(
      "cgweb116ThemeCount"
    )
    .textContent =
      String(themeCount);

  document
    .getElementById(
      "cgweb116QuestionCount"
    )
    .textContent =
      String(
        catalog.source_questions ||
        0
      );

  document
    .getElementById(
      "cgweb116Updated"
    )
    .textContent =
      formatDate(
        catalog.updated_ms
      );


  const visibleGroups = [];

  for (
    const group of catalog.groups
  ) {
    const themes =
      group.themes.filter(
        item => {
          if (!search) return true;

          return (
            normalize(
              group.megatheme
            ).includes(search) ||
            normalize(
              item.theme
            ).includes(search)
          );
        }
      );

    if (themes.length) {
      visibleGroups.push({
        ...group,
        themes
      });
    }
  }


  if (!themeCount) {
    root.innerHTML = `
      <div class="cg116-empty">
        Le catalogue Quizypedia n’a pas encore été reconstitué.
        La première reconstruction analysera l’historique existant
        puis les futurs imports seront ajoutés automatiquement.
      </div>
    `;

    return;
  }


  if (!visibleGroups.length) {
    root.innerHTML = `
      <div class="cg116-empty">
        Aucun thème ne correspond à cette recherche.
      </div>
    `;

    return;
  }


  root.innerHTML =
    visibleGroups
      .map(group => {

        const questions =
          group.themes.reduce(
            (n,t) =>
              n +
              Number(
                t.questions_count || 0
              ),
            0
          );

        return `
          <details
            class="cg116-mega"
            ${search ? "open" : ""}
          >
            <summary>
              <span class="cg116-mega-name">
                ${esc(group.megatheme)}
              </span>

              <span class="cg116-mega-count">
                ${group.themes.length}
                thème(s) ·
                ${questions}
                question(s)
              </span>
            </summary>

            <div class="cg116-table-wrap">
              <table class="cg116-table">

                <thead>
                  <tr>
                    <th>Thème</th>
                    <th>Questions</th>
                    <th>Questionnaires</th>
                    <th>Dernier import</th>
                  </tr>
                </thead>

                <tbody>
                  ${group.themes
                    .map(item => `
                      <tr>
                        <td>
                          ${
                            item.quizypedia_theme_url
                            ? `
                              <a
                                class="cg116-link"
                                href="${esc(
                                  item.quizypedia_theme_url
                                )}"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                ${esc(item.theme)}
                              </a>
                            `
                            : esc(item.theme)
                          }
                        </td>

                        <td>
                          ${Number(
                            item.questions_count ||
                            0
                          )}
                        </td>

                        <td>
                          ${Number(
                            item.questionnaire_count ||
                            item.questionnaire_urls
                              ?.length ||
                            0
                          )}
                        </td>

                        <td>
                          ${formatDate(
                            item.last_import_ms
                          )}
                        </td>
                      </tr>
                    `)
                    .join("")}
                </tbody>

              </table>
            </div>

          </details>
        `;
      })
      .join("");
}


async function showCatalog({
  force=false,
  autoRebuild=false
}={}) {

  setCatalogState(
    "Chargement du catalogue…"
  );

  const catalog =
    await loadCatalog({
      force
    });

  renderCatalog(
    catalog
  );

  const themeCount =
    catalog.groups.reduce(
      (n,g) =>
        n + g.themes.length,
      0
    );

  if (!themeCount) {

    setCatalogState(
      "Aucun catalogue historique disponible.",
      "warn"
    );

    if (
      autoRebuild &&
      !rebuildBusy
    ) {
      await rebuildFromUi();
    }

    return;
  }

  setCatalogState(
    `${themeCount} thème(s) Quizypedia recensé(s).`,
    "ok"
  );
}


async function rebuildFromUi() {

  if (rebuildBusy) return;

  const button =
    document.getElementById(
      "cgweb116Rebuild"
    );

  const progress =
    document.getElementById(
      "cgweb116Progress"
    );

  const bar =
    progress?.firstElementChild;

  if (button) {
    button.disabled = true;
    button.textContent =
      "Reconstruction…";
  }

  if (progress) {
    progress.hidden = false;
  }

  if (bar) {
    bar.style.width =
      "3%";
  }


  setCatalogState(
    "Analyse de l’historique CGWEB…"
  );


  try {
    const {
      catalog,
      remoteSaved
    } =
      await rebuildCatalog({
        onProgress:
          ({
            scanned,
            sourced,
            themes
          }) => {

            setCatalogState(
              `${scanned.toLocaleString("fr-FR")} ` +
              `questions analysées · ` +
              `${sourced.toLocaleString("fr-FR")} ` +
              `questions Quizypedia · ` +
              `${themes.toLocaleString("fr-FR")} thèmes`
            );

            /*
              Progression visuelle non absolue :
              le nombre final de questions
              n'est pas relu séparément pour
              éviter un second comptage.
            */
            if (bar) {
              const pseudo =
                Math.min(
                  92,
                  5 +
                  Math.log10(
                    Math.max(
                      10,
                      scanned
                    )
                  ) * 18
                );

              bar.style.width =
                `${pseudo}%`;
            }
          }
      });


    if (bar) {
      bar.style.width =
        "100%";
    }

    renderCatalog(
      catalog
    );

    const themes =
      catalog.groups.reduce(
        (n,g) =>
          n + g.themes.length,
        0
      );

    setCatalogState(
      remoteSaved
        ? `${themes} thème(s) reconstitué(s). Catalogue synchronisé.`
        : `${themes} thème(s) reconstitué(s). Catalogue conservé localement.`,
      "ok"
    );

  } catch (error) {

    console.error(
      VERSION,
      error
    );

    setCatalogState(
      error?.message ||
      "Erreur pendant la reconstruction.",
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Reconstruire le catalogue";
    }

    setTimeout(
      () => {
        if (progress) {
          progress.hidden = true;
        }

        if (bar) {
          bar.style.width =
            "0%";
        }
      },
      700
    );
  }
}


/* ============================================================
   GARDE ANTI-DOUBLON
   ============================================================ */

function ensureDuplicateWarning() {

  const status =
    document.getElementById(
      "cgimp2Status"
    );

  if (!status) {
    return false;
  }

  if (
    document.getElementById(
      "cgweb116DuplicateWarning"
    )
  ) {
    return true;
  }

  const warning =
    document.createElement(
      "div"
    );

  warning.id =
    "cgweb116DuplicateWarning";

  warning.innerHTML = `
    <div class="cg116-duplicate-main">
      <div class="cg116-duplicate-title">
        Déjà intégré dans CGWEB
      </div>

      <div
        class="cg116-duplicate-detail"
        id="cgweb116DuplicateDetail"
      ></div>
    </div>

    <button
      type="button"
      id="cgweb116ShowDuplicate"
    >
      Voir dans le catalogue
    </button>
  `;

  status.insertAdjacentElement(
    "afterend",
    warning
  );

  document
    .getElementById(
      "cgweb116ShowDuplicate"
    )
    .addEventListener(
      "click",
      openDuplicateInCatalog
    );

  return true;
}


let duplicateResult = null;
let duplicateTimer = null;


async function checkImportUrl() {

  const input =
    document.getElementById(
      "cgimp2Url"
    );

  const warning =
    document.getElementById(
      "cgweb116DuplicateWarning"
    );

  const detail =
    document.getElementById(
      "cgweb116DuplicateDetail"
    );

  if (
    !input ||
    !warning ||
    !detail
  ) {
    return;
  }

  const value =
    input.value.trim();

  if (!value) {
    duplicateResult = null;
    warning.classList.remove(
      "visible"
    );
    return;
  }


  try {
    const found =
      await lookupUrl(value);

    duplicateResult =
      found;

    if (!found) {
      warning.classList.remove(
        "visible"
      );
      return;
    }

    const exactText =
      found.exact_questionnaire
        ? "Ce questionnaire précis est déjà recensé."
        : "Ce thème Quizypedia est déjà présent.";

    detail.textContent =
      `${found.megatheme} › ` +
      `${found.theme} · ` +
      `${found.questions_count} question(s) · ` +
      `${found.questionnaire_count} questionnaire(s). ` +
      exactText;

    warning.classList.add(
      "visible"
    );

  } catch {
    warning.classList.remove(
      "visible"
    );
  }
}


function installDuplicateGuard() {

  ensureDuplicateWarning();

  const input =
    document.getElementById(
      "cgimp2Url"
    );

  if (
    !input ||
    input.dataset.cgweb116Guard ===
      "1"
  ) {
    return Boolean(input);
  }

  input.dataset.cgweb116Guard =
    "1";

  input.addEventListener(
    "input",
    () => {
      clearTimeout(
        duplicateTimer
      );

      duplicateTimer =
        setTimeout(
          checkImportUrl,
          350
        );
    }
  );

  input.addEventListener(
    "change",
    checkImportUrl
  );

  input.addEventListener(
    "blur",
    checkImportUrl
  );

  return true;
}


function openDuplicateInCatalog() {

  if (!duplicateResult) return;

  /*
    Ouvre l'onglet principal Répertoire.
  */
  document
    .querySelector(
      '[data-cg16-page="directory"]'
    )
    ?.click();

  setTimeout(
    async () => {

      ensureDirectoryUi();

      document
        .getElementById(
          "cgweb116TabCatalog"
        )
        ?.click();

      const search =
        document.getElementById(
          "cgweb116Search"
        );

      if (search) {
        search.value =
          duplicateResult.theme;

        renderCatalog(
          catalogCache ||
          emptyCatalog()
        );
      }
    },
    60
  );
}


/* ============================================================
   HOOK DES FUTURS IMPORTS
   ============================================================ */

function installCreateHook() {

  const api =
    window.CGWEB010_API;

  if (
    !api ||
    typeof api.create !==
      "function"
  ) {
    return false;
  }

  if (
    api.create
      .__cgweb116Wrapped
  ) {
    return true;
  }

  const original =
    api.create.bind(api);

  const wrapped =
    async function(payload) {

      const result =
        await original(payload);

      if (
        payload?.url_quizypedia
      ) {
        recordImportedQuestion(
          payload
        ).catch(
          error =>
            console.warn(
              VERSION,
              "catalogue live",
              error
            )
        );
      }

      return result;
    };

  wrapped.__cgweb116Wrapped =
    true;

  api.create =
    wrapped;

  return true;
}


/* ============================================================
   EVENEMENTS
   ============================================================ */

window.addEventListener(
  "cgweb116:catalog-updated",
  () => {
    const panel =
      document.getElementById(
        "cgweb116Catalog"
      );

    if (
      panel?.classList.contains(
        "active"
      ) &&
      catalogCache
    ) {
      renderCatalog(
        catalogCache
      );
    }

    checkImportUrl();
  }
);


/* ============================================================
   INSTALLATION
   ============================================================ */

function install() {
  ensureDirectoryUi();
  installDuplicateGuard();
  installCreateHook();
}


let scheduled = false;

function schedule() {
  if (scheduled) return;

  scheduled = true;

  requestAnimationFrame(
    () => {
      scheduled = false;
      install();
    }
  );
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    install,
    { once:true }
  );
} else {
  install();
}


new MutationObserver(
  schedule
).observe(
  document.documentElement,
  {
    childList:true,
    subtree:true
  }
);


console.info(
  VERSION,
  "QUIZYPEDIA_CATALOG001 prêt"
);

/* ============================================================
   CGWEB116 FIX1
   SQLITE_HISTORY_MERGE001 / LEGACY_CATALOG_PERSIST001
   ============================================================ */
/* CGWEB116_FIX1_SQLITE_HISTORY_MERGE001 */

const CG116_SQLJS_BASE =
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";

let cg116SqlJsPromise = null;
let cg116LegacyCache = null;


/* ------------------------------------------------------------
   A. Chargement SQL.js
   ------------------------------------------------------------ */

function cg116LoadSqlJs() {

  if (cg116SqlJsPromise) {
    return cg116SqlJsPromise;
  }

  cg116SqlJsPromise =
    new Promise((resolve,reject) => {

      const start = async () => {
        try {
          const SQL =
            await window.initSqlJs({
              locateFile:file =>
                CG116_SQLJS_BASE + file
            });

          resolve(SQL);

        } catch (error) {
          reject(error);
        }
      };

      if (
        typeof window.initSqlJs ===
        "function"
      ) {
        start();
        return;
      }

      const script =
        document.createElement("script");

      script.src =
        CG116_SQLJS_BASE +
        "sql-wasm.js";

      script.async = true;

      script.onload = start;

      script.onerror = () =>
        reject(
          new Error(
            "Impossible de charger le lecteur SQLite."
          )
        );

      document.head.appendChild(
        script
      );
    });

  return cg116SqlJsPromise;
}


/* ------------------------------------------------------------
   B. Catalogue SQLite séparé
   ------------------------------------------------------------ */

function cg116LegacyLocalKey(uid) {
  return `CGWEB116_SQLITE_LEGACY_${uid}`;
}


function cg116EmptyLegacy() {
  return {
    schema:1,
    updated_ms:0,
    source_questions:0,
    groups:[]
  };
}


function cg116LoadLegacyLocal() {

  const user =
    userOrThrow();

  try {
    const raw =
      localStorage.getItem(
        cg116LegacyLocalKey(
          user.uid
        )
      );

    if (!raw) {
      return null;
    }

    return normalizeCatalog(
      JSON.parse(raw)
    );

  } catch {
    return null;
  }
}


function cg116SaveLegacyLocal(
  catalog
) {
  const user =
    userOrThrow();

  localStorage.setItem(
    cg116LegacyLocalKey(
      user.uid
    ),
    JSON.stringify(catalog)
  );
}


/* ------------------------------------------------------------
   C. Persistance distante
   ------------------------------------------------------------ */

async function cg116LoadLegacyRemote() {

  const user =
    userOrThrow();

  try {
    const ref =
      collection(
        db,
        "users",
        user.uid,
        "quizypedia_legacy_catalog"
      );

    const snap =
      await getDocs(ref);

    if (snap.empty) {
      return null;
    }

    let meta = {};
    const groups = [];

    snap.forEach(d => {

      const data =
        d.data() || {};

      if (d.id === "_meta") {
        meta = data;
        return;
      }

      groups.push({
        megatheme:
          data.megatheme ||
          "Sans mégathème",

        themes:
          Array.isArray(
            data.themes
          )
            ? data.themes
            : []
      });
    });

    if (!groups.length) {
      return null;
    }

    return normalizeCatalog({
      schema:1,
      updated_ms:
        meta.updated_ms || 0,
      source_questions:
        meta.source_questions || 0,
      groups
    });

  } catch (error) {

    console.warn(
      "CGWEB116 FIX1",
      "lecture legacy distante impossible",
      error
    );

    return null;
  }
}


async function cg116SaveLegacyRemote(
  catalog
) {

  const user =
    userOrThrow();

  try {

    const root =
      collection(
        db,
        "users",
        user.uid,
        "quizypedia_legacy_catalog"
      );

    const previous =
      await getDocs(root);

    let batch =
      writeBatch(db);

    let operations = 0;

    for (
      const oldDoc of
      previous.docs
    ) {
      batch.delete(
        oldDoc.ref
      );

      operations++;

      if (
        operations >= 400
      ) {
        await batch.commit();
        batch = writeBatch(db);
        operations = 0;
      }
    }


    for (
      const group of
      catalog.groups
    ) {

      const id =
        `mega_${hash32(
          group.megatheme
        )}`;

      batch.set(
        doc(
          db,
          "users",
          user.uid,
          "quizypedia_legacy_catalog",
          id
        ),
        {
          schema:1,
          megatheme:
            group.megatheme,
          themes:
            group.themes,
          updated_ms:
            catalog.updated_ms
        }
      );

      operations++;

      if (
        operations >= 400
      ) {
        await batch.commit();
        batch = writeBatch(db);
        operations = 0;
      }
    }


    batch.set(
      doc(
        db,
        "users",
        user.uid,
        "quizypedia_legacy_catalog",
        "_meta"
      ),
      {
        schema:1,
        updated_ms:
          catalog.updated_ms,

        source_questions:
          catalog.source_questions,

        themes_count:
          catalog.groups.reduce(
            (n,g) =>
              n + g.themes.length,
            0
          )
      }
    );

    operations++;

    if (operations) {
      await batch.commit();
    }

    return true;

  } catch (error) {

    console.warn(
      "CGWEB116 FIX1",
      "sauvegarde legacy distante impossible",
      error
    );

    return false;
  }
}


async function cg116LoadLegacy() {

  if (cg116LegacyCache) {
    return cg116LegacyCache;
  }

  const remote =
    await cg116LoadLegacyRemote();

  if (remote) {
    cg116LegacyCache =
      remote;

    cg116SaveLegacyLocal(
      remote
    );

    return remote;
  }

  cg116LegacyCache =
    cg116LoadLegacyLocal() ||
    cg116EmptyLegacy();

  return cg116LegacyCache;
}


/* ------------------------------------------------------------
   D. Fusion sans double comptage
   ------------------------------------------------------------ */

function cg116MergeLegacyInto(
  target,
  legacy
) {

  if (
    !legacy ||
    !Array.isArray(
      legacy.groups
    )
  ) {
    return target;
  }


  for (
    const legacyGroup of
    legacy.groups
  ) {

    let group =
      target.groups.find(
        g =>
          normalize(
            g.megatheme
          ) ===
          normalize(
            legacyGroup.megatheme
          )
      );


    if (!group) {

      group = {
        megatheme:
          legacyGroup.megatheme,
        themes:[]
      };

      target.groups.push(
        group
      );
    }


    for (
      const oldTheme of
      legacyGroup.themes || []
    ) {

      let theme =
        group.themes.find(
          t =>
            String(
              t.quizypedia_theme_url ||
              ""
            ).toLowerCase() ===
            String(
              oldTheme.quizypedia_theme_url ||
              ""
            ).toLowerCase()
        );


      if (!theme) {

        theme = {
          theme:
            oldTheme.theme,

          quizypedia_theme_url:
            oldTheme.quizypedia_theme_url,

          questions_count:0,

          questionnaire_urls:[],

          questionnaire_count:0,

          first_import_ms:0,

          last_import_ms:0,

          legacy_sqlite:true
        };

        group.themes.push(
          theme
        );
      }


      theme.questions_count =
        Math.max(
          Number(
            theme.questions_count || 0
          ),
          Number(
            oldTheme.questions_count || 0
          )
        );


      const urls =
        new Set([
          ...(
            theme.questionnaire_urls ||
            []
          ),
          ...(
            oldTheme.questionnaire_urls ||
            []
          )
        ]);


      theme.questionnaire_urls =
        [...urls];

      theme.questionnaire_count =
        Math.max(
          Number(
            theme.questionnaire_count || 0
          ),
          Number(
            oldTheme.questionnaire_count || 0
          ),
          urls.size
        );


      theme.legacy_sqlite =
        true;
    }
  }


  target.source_questions =
    target.groups.reduce(
      (sum,g) =>
        sum +
        g.themes.reduce(
          (n,t) =>
            n +
            Number(
              t.questions_count ||
              0
            ),
          0
        ),
      0
    );


  const normalized =
    normalizeCatalog(
      target
    );

  Object.assign(
    target,
    normalized
  );

  return target;
}


/* ------------------------------------------------------------
   E. Lecture SQLite
   ------------------------------------------------------------ */

function cg116SqliteColumnSet(
  sqliteDb
) {

  const result =
    sqliteDb.exec(
      'PRAGMA table_info("questions")'
    );

  if (
    !result ||
    !result.length
  ) {
    throw new Error(
      'Table SQLite "questions" introuvable.'
    );
  }

  const nameIndex =
    result[0].columns
      .indexOf("name");

  return new Set(
    result[0].values
      .map(row =>
        String(
          row[nameIndex] || ""
        )
      )
  );
}


function cg116BuildLegacyCatalog(
  sqliteDb
) {

  const columns =
    cg116SqliteColumnSet(
      sqliteDb
    );


  if (
    !columns.has("megatheme") ||
    !columns.has("theme")
  ) {
    throw new Error(
      "Le SQLite ne contient pas les colonnes megatheme/theme attendues."
    );
  }


  if (
    !columns.has(
      "url_quizypedia"
    ) &&
    !columns.has(
      "url_internet"
    )
  ) {
    throw new Error(
      "Aucune colonne URL exploitable dans ce SQLite."
    );
  }


  const qUrl =
    columns.has(
      "url_quizypedia"
    )
      ? 'COALESCE("url_quizypedia",\'\')'
      : "''";


  const iUrl =
    columns.has(
      "url_internet"
    )
      ? 'COALESCE("url_internet",\'\')'
      : "''";


  const sql = `
    SELECT
      COALESCE("megatheme",'') AS megatheme,
      COALESCE("theme",'') AS theme,
      ${qUrl} AS url_quizypedia,
      ${iUrl} AS url_internet
    FROM "questions"
    WHERE
      LOWER(${qUrl}) LIKE '%quizypedia.fr%'
      OR
      LOWER(${iUrl}) LIKE '%quizypedia.fr%'
  `;


  const stmt =
    sqliteDb.prepare(sql);

  const groups =
    new Map();

  let questions = 0;
  let parsedQuestions = 0;


  try {

    while (
      stmt.step()
    ) {

      questions++;

      const row =
        stmt.getAsObject();


      const candidates = [
        row.url_quizypedia,
        row.url_internet
      ]
        .map(v =>
          String(v || "")
            .trim()
        )
        .filter(Boolean);


      let parsed = null;

      for (
        const source of
        candidates
      ) {

        const candidate =
          parseQuizypediaUrl(
            source
          );

        if (candidate) {
          parsed = candidate;
          break;
        }
      }


      if (!parsed) {
        continue;
      }


      parsedQuestions++;


      const megatheme =
        String(
          row.megatheme ||
          "Sans mégathème"
        ).trim() ||
        "Sans mégathème";


      const themeName =
        String(
          row.theme ||
          parsed.themeSlug ||
          "Thème sans nom"
        ).trim();


      const megaKey =
        normalize(
          megatheme
        );


      if (
        !groups.has(
          megaKey
        )
      ) {
        groups.set(
          megaKey,
          {
            megatheme,
            themes:new Map()
          }
        );
      }


      const group =
        groups.get(
          megaKey
        );


      const themeKey =
        parsed
          .themeUrl
          .toLowerCase();


      if (
        !group.themes.has(
          themeKey
        )
      ) {

        group.themes.set(
          themeKey,
          {
            theme:
              themeName,

            quizypedia_theme_url:
              parsed.themeUrl,

            questions_count:0,

            questionnaire_urls:
              new Set(),

            questionnaire_count:0,

            first_import_ms:0,

            last_import_ms:0,

            legacy_sqlite:true
          }
        );
      }


      const item =
        group.themes.get(
          themeKey
        );


      item.questions_count++;


      if (
        parsed.isQuestionnaire
      ) {
        item
          .questionnaire_urls
          .add(
            parsed.questionnaireUrl
          );
      }
    }

  } finally {
    stmt.free();
  }


  const catalog =
    cg116EmptyLegacy();


  catalog.updated_ms =
    Date.now();


  catalog.source_questions =
    parsedQuestions;


  catalog.groups =
    [...groups.values()]
      .map(g => ({

        megatheme:
          g.megatheme,

        themes:
          [...g.themes.values()]
            .map(t => ({

              theme:
                t.theme,

              quizypedia_theme_url:
                t.quizypedia_theme_url,

              questions_count:
                t.questions_count,

              questionnaire_urls:
                [
                  ...t
                    .questionnaire_urls
                ].sort(),

              questionnaire_count:
                t
                  .questionnaire_urls
                  .size,

              first_import_ms:0,

              last_import_ms:0,

              legacy_sqlite:true
            }))
      }));


  return {
    catalog:
      normalizeCatalog(
        catalog
      ),

    scanned:
      questions,

    parsed:
      parsedQuestions,

    themes:
      catalog.groups.reduce(
        (n,g) =>
          n + g.themes.length,
        0
      )
  };
}


/* ------------------------------------------------------------
   F. Import du fichier
   ------------------------------------------------------------ */

async function cg116ImportSqlite(
  file
) {

  if (!file) return;


  const button =
    document.getElementById(
      "cgweb116ImportSqlite"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "Analyse SQLite…";
  }


  setCatalogState(
    `Lecture de ${file.name}…`
  );


  let sqliteDb = null;


  try {

    const SQL =
      await cg116LoadSqlJs();


    const buffer =
      await file.arrayBuffer();


    sqliteDb =
      new SQL.Database(
        new Uint8Array(
          buffer
        )
      );


    const {
      catalog:incoming,
      parsed,
      themes
    } =
      cg116BuildLegacyCatalog(
        sqliteDb
      );


    if (!themes) {
      throw new Error(
        "Aucun thème Quizypedia n'a été trouvé dans ce SQLite."
      );
    }


    const legacy =
      await cg116LoadLegacy();


    cg116MergeLegacyInto(
      legacy,
      incoming
    );


    legacy.updated_ms =
      Date.now();


    legacy.source_questions =
      legacy.groups.reduce(
        (sum,g) =>
          sum +
          g.themes.reduce(
            (n,t) =>
              n +
              Number(
                t.questions_count ||
                0
              ),
            0
          ),
        0
      );


    cg116LegacyCache =
      legacy;


    cg116SaveLegacyLocal(
      legacy
    );


    const remoteLegacy =
      await cg116SaveLegacyRemote(
        legacy
      );


    catalogCache = null;


    const full =
      await loadCatalog({
        force:true
      });


    cg116MergeLegacyInto(
      full,
      legacy
    );


    catalogCache =
      full;


    saveLocal(full);


    const mainSaved =
      await saveRemote(
        full
      );


    renderCatalog(
      full
    );


    setCatalogState(
      `${themes} thème(s) trouvé(s) dans SQLite · ` +
      `${parsed.toLocaleString("fr-FR")} question(s) Quizypedia analysée(s). ` +
      (
        remoteLegacy && mainSaved
          ? "Catalogue fusionné et synchronisé."
          : "Catalogue fusionné ; sauvegarde locale active."
      ),
      "ok"
    );


  } catch (error) {

    console.error(
      "CGWEB116 FIX1",
      error
    );


    setCatalogState(
      error?.message ||
      "Échec de lecture du fichier SQLite.",
      "error"
    );


  } finally {

    try {
      sqliteDb?.close();
    } catch {}


    if (button) {
      button.disabled = false;
      button.textContent =
        "Intégrer SQLite";
    }
  }
}


/* ------------------------------------------------------------
   G. Fusion automatique du patrimoine SQLite
   ------------------------------------------------------------ */

const cg116BaseLoadCatalog =
  loadCatalog;


loadCatalog =
  async function(options={}) {

    const catalog =
      await cg116BaseLoadCatalog(
        options
      );


    const legacy =
      await cg116LoadLegacy();


    cg116MergeLegacyInto(
      catalog,
      legacy
    );


    catalogCache =
      catalog;


    return catalog;
  };


window.CGWEB116_API.loadCatalog =
  loadCatalog;


const cg116BaseSaveLocal =
  saveLocal;


saveLocal =
  function(catalog) {

    if (cg116LegacyCache) {
      cg116MergeLegacyInto(
        catalog,
        cg116LegacyCache
      );
    }

    return cg116BaseSaveLocal(
      catalog
    );
  };


const cg116BaseSaveRemote =
  saveRemote;


saveRemote =
  async function(catalog) {

    if (cg116LegacyCache) {
      cg116MergeLegacyInto(
        catalog,
        cg116LegacyCache
      );
    }

    return cg116BaseSaveRemote(
      catalog
    );
  };


/* ------------------------------------------------------------
   H. Interface
   ------------------------------------------------------------ */

function cg116EnsureSqliteButton() {

  const toolbar =
    document.querySelector(
      "#cgweb116Catalog .cg116-toolbar"
    );


  if (!toolbar) {
    return false;
  }


  if (
    document.getElementById(
      "cgweb116ImportSqlite"
    )
  ) {
    return true;
  }


  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.id =
    "cgweb116ImportSqlite";


  button.textContent =
    "Intégrer SQLite";


  const input =
    document.createElement(
      "input"
    );


  input.type =
    "file";


  input.id =
    "cgweb116SqliteFile";


  input.accept =
    ".db,.sqlite,.sqlite3,application/x-sqlite3";


  input.hidden =
    true;


  toolbar.appendChild(
    button
  );


  toolbar.appendChild(
    input
  );


  const note =
    document.createElement(
      "div"
    );


  note.className =
    "cg116-sqlite-note";


  note.textContent =
    "Intégration de l'ancien SQLite Android ; le fichier est analysé localement dans le navigateur.";


  toolbar.insertAdjacentElement(
    "afterend",
    note
  );


  button.addEventListener(
    "click",
    () => input.click()
  );


  input.addEventListener(
    "change",
    async () => {

      const file =
        input.files?.[0];


      input.value = "";


      if (file) {
        await cg116ImportSqlite(
          file
        );
      }
    }
  );


  return true;
}


window.CGWEB116_API.importSqlite =
  cg116ImportSqlite;


/* ------------------------------------------------------------
   I. Installation dynamique
   ------------------------------------------------------------ */

let cg116Fix1Scheduled =
  false;


function cg116Fix1Install() {
  cg116EnsureSqliteButton();
}


function cg116Fix1Schedule() {

  if (
    cg116Fix1Scheduled
  ) {
    return;
  }


  cg116Fix1Scheduled =
    true;


  requestAnimationFrame(
    () => {

      cg116Fix1Scheduled =
        false;

      cg116Fix1Install();

    }
  );
}


cg116Fix1Install();


new MutationObserver(
  cg116Fix1Schedule
).observe(
  document.documentElement,
  {
    childList:true,
    subtree:true
  }
);


console.info(
  "CGWEB116 FIX1",
  "SQLITE_HISTORY_MERGE001 prêt"
);
