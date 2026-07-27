import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
const apiKey = import.meta.env["VITE_FIREBASE_API_KEY"];
const authDomain = import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"];
const projectId = import.meta.env["VITE_FIREBASE_PROJECT_ID"];
const storageBucket = import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"];
const messagingSenderId = import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"];
const appId = import.meta.env["VITE_FIREBASE_APP_ID"];
const measurementId = import.meta.env["VITE_FIREBASE_MEASUREMENT_ID"];
export const firebaseConfigured = !!(apiKey && projectId && appId);
let _app = null;
let _auth = null;
export function getFirebaseAuth() {
    if (!_auth) {
        if (!apiKey || !projectId || !appId) {
            throw new Error("Firebase is not configured. Add VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.");
        }
        _app = getApps().length
            ? getApps()[0]
            : initializeApp({
                apiKey,
                authDomain: authDomain ?? `${projectId}.firebaseapp.com`,
                projectId,
                storageBucket: storageBucket ?? `${projectId}.firebasestorage.app`,
                messagingSenderId: messagingSenderId ?? "",
                appId,
                measurementId,
            });
        _auth = getAuth(_app);
    }
    return _auth;
}
