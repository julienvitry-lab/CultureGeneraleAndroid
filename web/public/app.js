import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, getDocs, getFirestore, doc, writeBatch, getCountFromServer, serverTimestamp
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
// CGCLOUD002 utilise volontairement l'instance Firebase déjà authentifiée
// de CGWEB001. Une seule instance Auth/Firestore pour toute la page.
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
      const id = String(
        q.document_id || q.original_id || `row_${q.row_number}`
      ).replaceAll("/", "_");
      const ref = doc(db, "users", user.uid, "questions", id);
      const data = { ...q };
      delete data.document_id;
      data.cloud_schema = 1;
      data.test_import = true;
      data.updated_at = serverTimestamp();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }
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
