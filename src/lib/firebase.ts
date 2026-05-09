import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCyN1cf1y8o0Eyf1wwGK3xtCRtqprprWWM",
  authDomain: "sysmonitor-3e80c.firebaseapp.com",
  projectId: "sysmonitor-3e80c",
  storageBucket: "sysmonitor-3e80c.firebasestorage.app",
  messagingSenderId: "105437992717",
  appId: "1:105437992717:web:6f67fcacaac2ad24e34244",
  measurementId: "G-XTHYX4PFXY",
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Auth functions
export { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence, User };

// Helper to check if user is authenticated
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

// Helper to get auth state as a promise
export function waitForAuthState(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// React hook to access Firebase
import { useState, useEffect } from "react";

export function useFirebase() {
  const [initialized, setInitialized] = useState(true);
  
  useEffect(() => {
    // Firebase is already initialized at module level
    setInitialized(true);
  }, []);
  
  return { db, auth, initialized };
}
