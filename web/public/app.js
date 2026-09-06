import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, getDocs, getFirestore, doc, writeBatch, getCountFromServer, serverTimestamp, query, orderBy, documentId, limit, startAfter, getDoc, where, updateDoc,
  startAt, endAt,
  setDoc, deleteDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Configuration publique du projet Firebase CultureGeneraleSync.
// Une clé API Firebase Web n'est pas un mot de passe : la sécurité réelle
// repose sur Firebase Authentication et les règles Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyBHAVR_Td-VozN7MzMyZqJ046h1T_ggRDc",
  authDomain: "culturegeneralesync.firebaseapp.com",
  projectId: "culturegeneralesync",
  storageBucket: "culturegeneralesync.firebasestorage.app",
  messagingSenderId: "678537092067"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// CGCLOUD002_SHARED_CONTEXT_BRIDGE_START
// Contexte Firebase unique partagé par CGWEB001 / CGCLOUD002 / CGWEB004 / CGWEB005.
window.CGWEB001 = {
  getUser: () => auth.currentUser,

  countQuestions: async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const ref = collection(db, "users", user.uid, "questions");
    const snap = await getCountFromServer(ref);
    return snap.data().count;
  },

  importQuestions: async (questions) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    if (!Array.isArray(questions) || questions.length !== 100) {
      throw new Error("L'import CGCLOUD002 doit contenir exactement 100 questions.");
    }

    const batch = writeBatch(db);
    for (const q of questions) {
      const id = String(q.document_id || q.original_id || `row_${q.row_number}`).replaceAll("/", "_");
      const ref = doc(db, "users", user.uid, "questions", id);
      const data = { ...q };
      delete data.document_id;
      data.cloud_schema = 1;
      data.test_import = true;
      data.updated_at = serverTimestamp();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  },

  // Compatibilité CGWEB003 conservée.
  listQuestionsPage: async ({ afterId = null, pageSize = 20 } = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const size = Math.max(1, Math.min(Number(pageSize) || 20, 100));
    const ref = collection(db, "users", user.uid, "questions");
    const q = afterId
      ? query(ref, orderBy(documentId()), startAfter(String(afterId)), limit(size))
      : query(ref, orderBy(documentId()), limit(size));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      items,
      lastId: snap.docs.length ? snap.docs[snap.docs.length - 1].id : null,
      size: snap.size,
    };
  },

  getQuestion: async (questionId) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    const snap = await getDoc(doc(db, "users", user.uid, "questions", String(questionId)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  queryQuestionsPage: async ({
    cursor = null,
    pageSize = 20,
    filters = {},
    sortField = "id",
    sortDirection = "asc"
  } = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");

    const size = Math.max(1, Math.min(Number(pageSize) || 20, 100));
    const direction = sortDirection === "desc" ? "desc" : "asc";
    const ref = collection(db, "users", user.uid, "questions");
    const whereParts = [];

    if (filters.megatheme) whereParts.push(where("megatheme", "==", String(filters.megatheme)));
    if (filters.theme) whereParts.push(where("theme", "==", String(filters.theme)));
    if (filters.status) {
      const statusValue = filters.status === "__EMPTY__" ? "" : String(filters.status);
      whereParts.push(where("status", "==", statusValue));
    }

    const prefix = String(filters.questionPrefix || "").trim();
    if (prefix) {
      whereParts.push(where("question", ">=", prefix));
      whereParts.push(where("question", "<=", prefix + "\uf8ff"));
    }

    // La recherche par préfixe impose question comme premier orderBy Firestore.
    const effectiveSort = prefix ? "question" : (sortField || "id");
    const fieldMap = {
      id: documentId(),
      question: "question",
      megatheme: "megatheme",
      theme: "theme",
      status: "status"
    };
    const primary = fieldMap[effectiveSort] || documentId();

    const countQ = whereParts.length ? query(ref, ...whereParts) : ref;
    const totalSnap = await getCountFromServer(countQ);
    const total = totalSnap.data().count;

    const listParts = [...whereParts, orderBy(primary, direction)];
    if (effectiveSort !== "id") listParts.push(orderBy(documentId(), direction));

    if (cursor) {
      if (effectiveSort === "id") {
        listParts.push(startAfter(String(cursor.id)));
      } else {
        listParts.push(startAfter(cursor.value ?? "", String(cursor.id)));
      }
    }
    listParts.push(limit(size));

    const snap = await getDocs(query(ref, ...listParts));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let nextCursor = null;
    if (snap.docs.length) {
      const last = snap.docs[snap.docs.length - 1];
      nextCursor = effectiveSort === "id"
        ? { id: last.id }
        : { id: last.id, value: last.data()?.[effectiveSort] ?? "" };
    }

    return {
      items,
      total,
      nextCursor,
      effectiveSort,
      size: snap.size,
    };
  },

  updateQuestion: async (questionId, patch) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur Firebase non connecté.");
    if (!questionId) throw new Error("ID de question manquant.");
    if (!patch || typeof patch !== "object") throw new Error("Modification vide.");

    const allowed = [
      "megatheme", "theme", "question", "detail",
      "proposition_a", "proposition_b", "proposition_c", "proposition_d",
      "correct_index", "url_quizypedia", "url_internet", "image_file",
      "non_trouve", "is_image"
    ];
    const clean = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) clean[key] = patch[key];
    }
    clean.updated_at = serverTimestamp();
    clean.updated_from = "CGWEB005";
    clean.cloud_schema = 1;

    const ref = doc(db, "users", user.uid, "questions", String(questionId));
    // CGSYNC007_LEGACY_UPDATE
    await cgsync007WriteQuestion(questionId, clean, {
      source: "CGWEB005"
    });
    const fresh = await getDoc(ref);
    return fresh.exists() ? { id: fresh.id, ...fresh.data() } : null;
  },
};
// CGCLOUD002_SHARED_CONTEXT_BRIDGE_END

const el = (id) => document.getElementById(id);
const loginView = el("loginView");
const dashboardView = el("dashboardView");
const loginForm = el("loginForm");
const loginBtn = el("loginBtn");
const logoutBtn = el("logoutBtn");
const loginMessage = el("loginMessage");
const cloudBadge = el("cloudBadge");

function setBadge(text, type = "warn") {
  cloudBadge.textContent = text;
  cloudBadge.className = `badge badge-${type}`;
}

function setLoginMessage(text = "") {
  loginMessage.textContent = text;
  loginMessage.classList.toggle("hidden", !text);
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "Adresse e-mail ou mot de passe incorrect.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Réessayez un peu plus tard.";
  if (code.includes("network-request-failed")) return "Connexion Internet indisponible.";
  return error?.message || "Connexion impossible.";
}

async function testFirestore(user) {
  el("firestoreState").textContent = "Lecture…";
  el("firestoreDiag").textContent = "Lecture de users/<uid>/statusBuckets";
  el("heroStateText").textContent = "Test Firestore…";

  try {
    const ref = collection(db, "users", user.uid, "statusBuckets");
    const snapshot = await getDocs(ref);
    el("bucketCount").textContent = String(snapshot.size);
    el("firestoreState").textContent = "Connecté";
    el("firestoreDiag").textContent = `OK — ${snapshot.size} document(s) statusBuckets lus`;
    el("heroStateDot").className = "state-dot ok";
    el("heroStateText").textContent = "Infrastructure Firebase opérationnelle";
    setBadge("Firebase connecté", "ok");
  } catch (error) {
    console.error(error);
    el("bucketCount").textContent = "—";
    el("firestoreState").textContent = "Erreur";
    el("firestoreDiag").textContent = error?.message || "Lecture refusée";
    el("heroStateDot").className = "state-dot error";
    el("heroStateText").textContent = "Firestore à vérifier";
    setBadge("Erreur Firestore", "error");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginMessage("");
  loginBtn.disabled = true;
  loginBtn.textContent = "Connexion…";
  try {
    await signInWithEmailAndPassword(
      auth,
      el("emailInput").value.trim(),
      el("passwordInput").value
    );
  } catch (error) {
    setLoginMessage(friendlyAuthError(error));
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Se connecter";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    dashboardView.classList.add("hidden");
    loginView.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    el("passwordInput").value = "";
    setBadge("Cloud en attente", "warn");
    return;
  }

  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  el("userEmail").textContent = user.email || "Compte Firebase";
  el("userUid").textContent = user.uid;
  el("authDiag").textContent = `OK — ${user.email || user.uid}`;
  setBadge("Authentifié", "ok");
  await testFirestore(user);
});






// CGSYNC005_API_START
window.CGSYNC005_API = {
  health: async () => {
    const u = auth.currentUser;
    if (!u) return { authenticated: false };

    const questionsRef = collection(db, "users", u.uid, "questions");
    const tombstonesRef = collection(db, "users", u.uid, "question_tombstones");
    const deltaRef = collection(db, "users", u.uid, "question_search_delta");

    const [
      questionsCount,
      tombstonesCount,
      deltaCount,
      latestQuestion,
      latestTombstone,
      latestDelta
    ] = await Promise.all([
      getCountFromServer(questionsRef),
      getCountFromServer(tombstonesRef),
      getCountFromServer(deltaRef),
      getDocs(query(questionsRef, orderBy("cg_updated_at", "desc"), limit(1))).catch(() => ({ docs: [] })),
      getDocs(query(tombstonesRef, orderBy("deleted_at", "desc"), limit(1))).catch(() => ({ docs: [] })),
      getDocs(query(deltaRef, orderBy("cgindex_updated_at", "desc"), limit(1))).catch(() => ({ docs: [] }))
    ]);

    const first = snap => snap?.docs?.[0]?.data?.() || {};

    return {
      authenticated: true,
      uid: u.uid,
      questions_count: questionsCount.data().count,
      tombstones_count: tombstonesCount.data().count,
      delta_count: deltaCount.data().count,
      latest_question_update: first(latestQuestion).cg_updated_at || null,
      latest_tombstone: first(latestTombstone).deleted_at || null,
      latest_delta_update: first(latestDelta).cgindex_updated_at || null
    };
  }
};
// CGSYNC005_API_END

// CGINDEX001_HELPERS_START
function cgindex001Normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CGINDEX001_STOP = new Set([
  "de","du","des","la","le","les","un","une","et","ou","a","au","aux","en",
  "dans","sur","sous","par","pour","avec","sans","ce","cet","cette","ces",
  "qui","que","quoi","quel","quelle","quels","quelles","est","sont","etre",
  "son","sa","ses","leur","leurs","il","elle","ils","elles","on","se","ne",
  "pas","plus","the","of","and","to","in","is","are","an"
]);

function cgindex001Tokens(data) {
  const text = [
    data?.megatheme,
    data?.theme,
    data?.question,
    data?.detail,
    data?.proposition_a,
    data?.proposition_b,
    data?.proposition_c,
    data?.proposition_d
  ].filter(Boolean).join(" ");

  return [...new Set(
    cgindex001Normalize(text)
      .split(/\s+/)
      .filter(token => token.length >= 2 && !CGINDEX001_STOP.has(token))
  )];
}

async function cgindex001SyncQuestion(questionId) {
  const u = auth.currentUser;
  if (!u) return;

  const id = String(questionId || "").trim();
  if (!id) return;

  const questionRef = doc(db, "users", u.uid, "questions", id);
  const questionSnap = await getDoc(questionRef);

  if (!questionSnap.exists()) {
    await setDoc(
      doc(db, "users", u.uid, "question_search_delta", id),
      {
        question_id: id,
        deleted: true,
        tokens: [],
        cgindex_updated_at: serverTimestamp()
      },
      { merge: true }
    );
    return;
  }

  const data = questionSnap.data() || {};

  await setDoc(
    doc(db, "users", u.uid, "question_search_delta", id),
    {
      question_id: id,
      deleted: false,
      tokens: cgindex001Tokens(data),
      cgindex_updated_at: serverTimestamp()
    },
    { merge: true }
  );
}

async function cgindex001MarkDeleted(questionId) {
  const u = auth.currentUser;
  if (!u) return;

  const id = String(questionId || "").trim();
  if (!id) return;

  await setDoc(
    doc(db, "users", u.uid, "question_search_delta", id),
    {
      question_id: id,
      deleted: true,
      tokens: [],
      cgindex_updated_at: serverTimestamp()
    },
    { merge: true }
  );
}

window.CGINDEX001_API = {
  searchDelta: async tokens => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");

    const clean = [...new Set((tokens || []).map(String).filter(Boolean))];
    if (!clean.length) return [];

    const probe = clean.slice(0, 10);
    const ref = collection(db, "users", u.uid, "question_search_delta");

    const snap = await getDocs(
      query(
        ref,
        where("tokens", "array-contains-any", probe),
        limit(1000)
      )
    );

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(row =>
        !row.deleted
        && clean.every(token => Array.isArray(row.tokens) && row.tokens.includes(token)))
      .map(row => String(row.question_id || row.id));
  },

  syncQuestion: cgindex001SyncQuestion
};
// CGINDEX001_HELPERS_END

// CGSYNC007_CONFLICT_ENGINE_START
const CGSYNC007_EDITABLE_FIELDS = new Set([
  "megatheme", "theme", "question", "detail",
  "proposition_a", "proposition_b", "proposition_c", "proposition_d",
  "correct_index", "url_quizypedia", "url_internet", "image_file",
  "non_trouve", "is_image", "status",
  "updated_at", "updated_from", "cloud_schema"
]);

function cgsync007Revision(data) {
  const n = Number(data?.cg_revision ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function cgsync007WriterId() {
  const key = "CGSYNC007_WRITER_ID";
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = (globalThis.crypto?.randomUUID?.()
        || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(key, value);
    }
    return value;
  } catch (_) {
    return `web-${Date.now()}`;
  }
}

function cgsync007WriterMeta(source = "WEB") {
  const id = cgsync007WriterId();
  return {
    cg_updated_by: "web",
    cg_writer_id: id,
    cg_writer_label: `Web · ${id.slice(0, 8)}`,
    cg_update_source: String(source || "WEB")
  };
}

function cgsync007CleanPatch(patch) {
  const clean = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (CGSYNC007_EDITABLE_FIELDS.has(key) && value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

function cgsync007ExpectedRevision(options, cloudRevision) {
  const raw = options?.expectedRevision;
  if (raw === null || raw === undefined || raw === "") return cloudRevision;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : cloudRevision;
}

async function cgsync007WriteQuestion(questionId, patch, options = {}) {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");

  const id = String(questionId || "").trim();
  if (!id) throw new Error("ID manquant.");

  const clean = cgsync007CleanPatch(patch);
  if (!Object.keys(clean).length) throw new Error("Modification vide.");

  const questionRef = doc(db, "users", u.uid, "questions", id);
  const conflictRef = doc(collection(db, "users", u.uid, "question_conflicts"));
  const writer = cgsync007WriterMeta(options.source || "CGSYNC007");

  const result = await runTransaction(db, async transaction => {
    const snap = await transaction.get(questionRef);
    if (!snap.exists()) throw new Error(`Question ${id} introuvable.`);

    const cloud = snap.data() || {};
    const cloudRevision = cgsync007Revision(cloud);
    const expectedRevision = cgsync007ExpectedRevision(options, cloudRevision);

    if (!options.force && expectedRevision !== cloudRevision) {
      const conflict = {
        question_id: id,
        operation: "update",
        status: "open",
        expected_revision: expectedRevision,
        cloud_revision: cloudRevision,
        attempted_patch: clean,
        cloud_snapshot: cloud,
        cloud_updated_at: cloud.cg_updated_at || null,
        writer_id: writer.cg_writer_id,
        writer_label: writer.cg_writer_label,
        writer_type: "web",
        source: writer.cg_update_source,
        created_at: serverTimestamp()
      };

      transaction.set(conflictRef, conflict);

      return {
        ok: false,
        conflict: true,
        conflictId: conflictRef.id,
        questionId: id,
        expectedRevision,
        cloudRevision,
        cloud
      };
    }

    const nextRevision = cloudRevision + 1;
    transaction.update(questionRef, {
      ...clean,
      ...writer,
      cg_revision: nextRevision,
      cg_base_revision: cloudRevision,
      cg_updated_at: serverTimestamp()
    });

    if (options.conflictId) {
      const resolvedRef = doc(
        db,
        "users",
        u.uid,
        "question_conflicts",
        String(options.conflictId)
      );
      transaction.update(resolvedRef, {
        status: "resolved",
        resolution: options.resolution || "local_applied",
        resolved_revision: nextRevision,
        resolved_at: serverTimestamp(),
        resolved_by: writer.cg_writer_id
      });
    }

    return {
      ok: true,
      conflict: false,
      questionId: id,
      revision: nextRevision,
      previousRevision: cloudRevision
    };
  });

  if (result?.ok) {
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 update", cgindexError);
    }
  }

  return result;
}

async function cgsync007DeleteQuestion(questionId, options = {}) {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");

  const id = String(questionId || "").trim();
  if (!id) throw new Error("ID manquant.");

  const questionRef = doc(db, "users", u.uid, "questions", id);
  const tombstoneRef = doc(db, "users", u.uid, "question_tombstones", id);
  const conflictRef = doc(collection(db, "users", u.uid, "question_conflicts"));
  const writer = cgsync007WriterMeta(options.source || "CGSYNC007_DELETE");

  const result = await runTransaction(db, async transaction => {
    const snap = await transaction.get(questionRef);
    if (!snap.exists()) {
      return { ok: true, alreadyDeleted: true, questionId: id };
    }

    const cloud = snap.data() || {};
    const cloudRevision = cgsync007Revision(cloud);
    const expectedRevision = cgsync007ExpectedRevision(options, cloudRevision);

    if (!options.force && expectedRevision !== cloudRevision) {
      transaction.set(conflictRef, {
        question_id: id,
        operation: "delete",
        status: "open",
        expected_revision: expectedRevision,
        cloud_revision: cloudRevision,
        cloud_snapshot: cloud,
        cloud_updated_at: cloud.cg_updated_at || null,
        writer_id: writer.cg_writer_id,
        writer_label: writer.cg_writer_label,
        writer_type: "web",
        source: writer.cg_update_source,
        created_at: serverTimestamp()
      });

      return {
        ok: false,
        conflict: true,
        conflictId: conflictRef.id,
        questionId: id,
        expectedRevision,
        cloudRevision,
        cloud,
        operation: "delete"
      };
    }

    transaction.set(tombstoneRef, {
      question_id: id,
      deleted_at: serverTimestamp(),
      source: "CGSYNC007",
      deleted_revision: cloudRevision,
      ...writer
    });
    transaction.delete(questionRef);

    return {
      ok: true,
      conflict: false,
      questionId: id,
      deletedRevision: cloudRevision
    };
  });

  if (result?.ok) {
    try {
      await cgindex001MarkDeleted(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 delete", cgindexError);
    }
  }

  return result;
}

async function cgsync007ResolveConflict(conflictId, resolution = "acknowledged") {
  const u = auth.currentUser;
  if (!u) throw new Error("Utilisateur Firebase non connecté.");
  const id = String(conflictId || "").trim();
  if (!id) return false;

  await updateDoc(
    doc(db, "users", u.uid, "question_conflicts", id),
    {
      status: "resolved",
      resolution: String(resolution || "acknowledged"),
      resolved_at: serverTimestamp(),
      resolved_by: cgsync007WriterId()
    }
  );
  return true;
}

async function cgsync007ListOpenConflicts(maxResults = 50) {
  const u = auth.currentUser;
  if (!u) return [];

  const ref = collection(db, "users", u.uid, "question_conflicts");
  const snap = await getDocs(
    query(
      ref,
      where("status", "==", "open"),
      limit(Math.min(Math.max(Number(maxResults) || 50, 1), 100))
    )
  );

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

window.CGSYNC007_API = {
  writerId: cgsync007WriterId,
  update: cgsync007WriteQuestion,
  remove: cgsync007DeleteQuestion,
  resolveConflict: cgsync007ResolveConflict,
  listOpen: cgsync007ListOpenConflicts
};
// CGSYNC007_CONFLICT_ENGINE_END

// CGWEB006_BRIDGE_START
window.CGWEB006_API = {
  currentUser: () => {
    const u = auth.currentUser;
    return u ? { uid:u.uid, email:u.email || "" } : null;
  },
  count: async ({megatheme="",theme=""}={}) => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const ref=collection(db,"users",u.uid,"questions"), c=[];
    if(theme)c.push(where("theme","==",theme)); else if(megatheme)c.push(where("megatheme","==",megatheme));
    const snap=await getCountFromServer(c.length?query(ref,...c):ref); return snap.data().count||0;
  },
  page: async ({megatheme="",theme="",pageSize=50,afterId=null}={}) => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const ref=collection(db,"users",u.uid,"questions"), c=[];
    if(theme)c.push(where("theme","==",theme)); else if(megatheme)c.push(where("megatheme","==",megatheme));
    c.push(orderBy(documentId())); if(afterId)c.push(startAfter(afterId)); c.push(limit(Math.min(Math.max(Number(pageSize)||50,1),100)));
    const snap=await getDocs(query(ref,...c)); return {rows:snap.docs.map(d=>({id:d.id,...d.data()})),lastId:snap.docs.length?snap.docs[snap.docs.length-1].id:null};
  },
  byId: async value => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const id=String(value||"").trim(); if(!id)return null;
    const snap=await getDoc(doc(db,"users",u.uid,"questions",id)); return snap.exists()?{id:snap.id,...snap.data()}:null;
  },
  questionPrefix: async (prefix,maxResults=100) => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const text=String(prefix||"").trim(); if(!text)return [];
    const ref=collection(db,"users",u.uid,"questions");
    const snap=await getDocs(query(ref,orderBy("question"),startAt(text),endAt(text+"\uf8ff"),limit(Math.min(Math.max(Number(maxResults)||100,1),100))));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  },
  update: async (questionId, patch, options = {}) => {
    // CGSYNC007_CGWEB006_UPDATE
    return cgsync007WriteQuestion(questionId, patch, {
      ...(options || {}),
      source: options?.source || "CGWEB006"
    });
  }
};
// CGWEB006_BRIDGE_END



// CGWEB009_010_BRIDGE_START
window.CGWEB009_API = {
  prefixField: async (field, prefix, maxResults = 100) => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    const allowed = new Set(["question","detail","proposition_a","proposition_b","proposition_c","proposition_d"]);
    if (!allowed.has(field)) throw new Error("Champ de recherche non autorisé.");
    const text = String(prefix || "").trim();
    if (!text) return [];
    const ref = collection(db,"users",u.uid,"questions");
    const q = query(ref,orderBy(field),startAt(text),endAt(text+"\uf8ff"),limit(Math.min(Math.max(Number(maxResults)||100,1),100)));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({id:d.id,...d.data()}));
  }
};

window.CGWEB010_API = {
  create: async payload => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    let id = String(payload?.requested_id || "").trim();
    if (!id) id = String(Date.now());
    const ref = doc(db,"users",u.uid,"questions",id);
    const existing = await getDoc(ref);
    if (existing.exists()) throw new Error("Cet ID existe déjà.");
    const clean = {...(payload||{})};
    delete clean.requested_id;
    // CGSYNC007_CREATE_REVISION
    const writer = cgsync007WriterMeta("CGWEB010_CREATE");
    await setDoc(ref,{
      ...clean,
      original_id:id,
      row_number:Number.isFinite(Number(id))?Number(id):id,
      cg_created_at:serverTimestamp(),
      cg_updated_at:serverTimestamp(),
      cg_revision:1,
      cg_base_revision:0,
      ...writer
    });
    // CGINDEX001_AFTER_CREATE
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 create", cgindexError);
    }
    return id;
  },
  remove: async (questionId, options = {}) => {
    // CGSYNC007_DELETE_GUARD
    return cgsync007DeleteQuestion(questionId, {
      ...(options || {}),
      source: options?.source || "CGWEB010"
    });
  }
};
// CGWEB009_010_BRIDGE_END
