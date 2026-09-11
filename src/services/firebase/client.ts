import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Lazy Firebase initialisation.
 *
 * The SDK is only touched when a feature actually uses it, so the app runs
 * (with honest "not configured" errors on auth/data actions) even when the
 * .env values are absent — e.g. in CI or a fresh clone.
 *
 * Values come from Vite env vars (see .env.example). These Firebase web
 * config values are public identifiers, not secrets; actual data protection
 * is enforced by Firestore Security Rules, never by client-side secrecy.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const config: FirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.VITE_FIREBASE_APP_ID ?? "",
  };
  const complete = Object.values(config).every((value) => value.length > 0);
  return complete ? config : null;
}

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

/** Throws a clear error when Firebase env config is missing. */
export function requireFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  const config = readFirebaseConfig();
  if (config === null) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in your Firebase project values.",
    );
  }
  app = getApps()[0] ?? initializeApp(config);
  firestore = firestore ?? getFirestore(app);
  auth = auth ?? getAuth(app);
  return { app, db: firestore, auth };
}

export function getDb(): Firestore {
  return requireFirebase().db;
}

export function getAuthInstance(): Auth {
  return requireFirebase().auth;
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null;
}
