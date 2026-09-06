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
  setDoc, deleteDoc
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
    await updateDoc(ref, { ...(clean), cg_updated_at: serverTimestamp() /* CGSYNC003_WEB_STAMP */ });
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
  update: async (questionId,patch) => {
    const u=auth.currentUser;if(!u)throw new Error("Utilisateur Firebase non connecté.");
    const id=String(questionId||"").trim();if(!id)throw new Error("ID manquant.");
    await updateDoc(doc(db,"users",u.uid,"questions",id),{...(patch||{}),cg_updated_at:serverTimestamp()});
    // CGINDEX001_AFTER_UPDATE
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 update", cgindexError);
    }return true;
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
    await setDoc(ref,{...clean,original_id:id,row_number:Number.isFinite(Number(id))?Number(id):id,cg_created_at:serverTimestamp(),cg_updated_at:serverTimestamp()});
    // CGINDEX001_AFTER_CREATE
    try {
      await cgindex001SyncQuestion(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 create", cgindexError);
    }
    return id;
  },
  remove: async questionId => {
    const u = auth.currentUser;
    if (!u) throw new Error("Utilisateur Firebase non connecté.");
    const id = String(questionId||"").trim();
    if (!id) throw new Error("ID manquant.");
    await setDoc(doc(db,"users",u.uid,"question_tombstones",id),{question_id:id,deleted_at:serverTimestamp(),source:"CGWEB010"});
    await deleteDoc(doc(db,"users",u.uid,"questions",id));
    // CGINDEX001_AFTER_DELETE
    try {
      await cgindex001MarkDeleted(id);
    } catch (cgindexError) {
      console.warn("CGINDEX001 delete", cgindexError);
    }
    return true;
  }
};
// CGWEB009_010_BRIDGE_END
