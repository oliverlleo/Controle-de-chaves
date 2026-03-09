import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiGS53kParCv5nteabPHv26dYk25kDhbI",
  authDomain: "chaveprojeto-bddf0.firebaseapp.com",
  projectId: "chaveprojeto-bddf0",
  storageBucket: "chaveprojeto-bddf0.firebasestorage.app",
  messagingSenderId: "1010959432985",
  appId: "1:1010959432985:web:a6fabb0a4a84c7c42e9988",
  measurementId: "G-1W1DN1S074"
};

const app = initializeApp(firebaseConfig);

(async () => {
  try {
    if (await analyticsSupported()) getAnalytics(app);
  } catch (_) {
    // Ignora analytics em ambientes onde não é suportado.
  }
})();

const auth = getAuth(app);
const db = getFirestore(app);

function getFirebaseErrorCode(err) {
  return err?.code || err?.customData?._tokenResponse?.error?.message || "unknown";
}

async function ensureAnonymousAuth() {
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    const user = await new Promise((resolve) => {
      const off = onAuthStateChanged(auth, (currentUser) => {
        if (!currentUser) return;
        off();
        resolve(currentUser);
      });
    });
    return { user, ok: true, code: null };
  } catch (error) {
    return { user: null, ok: false, code: getFirebaseErrorCode(error), error };
  }
}

export {
  db,
  auth,
  ensureAnonymousAuth,
  getFirebaseErrorCode,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
};
