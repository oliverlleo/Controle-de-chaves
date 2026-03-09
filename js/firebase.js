import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export async function ensureAnonAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => user && resolve(user));
  });
}

export { db, auth };
