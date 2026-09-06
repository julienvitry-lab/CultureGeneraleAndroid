import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, getDocs, getFirestore, doc, writeBatch, getCountFromServer, serverTimestamp, query, orderBy, documentId, limit, startAfter, getDoc, where, updateDoc,
  startAt, endAt
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
    await updateDoc(doc(db,"users",u.uid,"questions",id),{...(patch||{}),cg_updated_at:serverTimestamp()});return true;
  }
};
// CGWEB006_BRIDGE_END

