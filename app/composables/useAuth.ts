// Sign-in for the dashboard: Google, through Firebase Auth. Only the admin
// page imports this, so the public site never loads the Firebase SDK. The
// server decides who is allowed (functions/index.js); this just gets a token.
import { computed, ref, shallowRef } from "vue";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { firebaseConfig } from "@/firebaseConfig";

// shallowRef: a Firebase User must not be wrapped in a reactive proxy.
const user = shallowRef<User | null>(null);
const checked = ref(false); // the first auth state has arrived
let auth: Auth | undefined;

function instance() {
  if (!auth) {
    // Sign in against the Auth emulator when NUXT_PUBLIC_AUTH_EMULATOR is
    // set, e.g. http://127.0.0.1:9099. The emulator takes any API key, so
    // the real one needn't be configured. Read here, on the first call from
    // the dashboard page's setup, where the Nuxt context is available.
    const emulator = useRuntimeConfig().public.authEmulator;
    const config = emulator
      ? { ...firebaseConfig, apiKey: firebaseConfig.apiKey || "emulator" }
      : firebaseConfig;
    const app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    if (emulator)
      connectAuthEmulator(auth, emulator, { disableWarnings: true });
    onAuthStateChanged(auth, (next) => {
      user.value = next;
      checked.value = true;
    });
  }
  return auth;
}

export function useAuth() {
  if (typeof window !== "undefined") instance();
  return {
    user,
    checked,
    email: computed(() => user.value?.email ?? ""),
    signIn: () => {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      // Always show the account chooser: a brand account (YouTube channel)
      // carries no email, so the right Google account must be picked.
      provider.setCustomParameters({ prompt: "select_account" });
      return signInWithPopup(instance(), provider);
    },
    signOut: () => firebaseSignOut(instance()),
    // The ID token for the API; refreshed by the SDK as needed.
    idToken: async () => (user.value ? await user.value.getIdToken() : ""),
  };
}
