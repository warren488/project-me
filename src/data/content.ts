// Everything the public site shows that comes from the CV library: the
// published CVs, the timeline and the project cards. The admin publishes
// them as one Firestore document (site/content) holding a JSON string, so
// the site needs no Firestore SDK: one plain fetch of the REST endpoint.
//
// fetchContent() is framework-neutral (it also works in a Node build step);
// loadContent() and useContent() add the caching the SPA wants: one request
// per page load, and the last copy kept in localStorage so repeat visits
// render immediately and only swap when a newer version arrives.
import { computed, ref } from "vue";
import type { PublishedSite, PublishedTimeline, SiteProject } from "@/cv/types";
import { firebaseConfig } from "@/firebaseConfig";

export interface SiteContent {
  published: PublishedSite;
  timeline: PublishedTimeline | null;
  projects: SiteProject[] | null;
}

export interface ContentDoc {
  content: SiteContent;
  version: number; // Date.now() at publish time
}

// Vue CLI only (Nuxt: runtimeConfig): VUE_APP_FIRESTORE_EMULATOR, e.g.
// http://127.0.0.1:8085, reads from the emulator instead.
const FIRESTORE =
  process.env.VUE_APP_FIRESTORE_EMULATOR || "https://firestore.googleapis.com";

export const CONTENT_URL =
  `${FIRESTORE}/v1/projects/${firebaseConfig.projectId}` +
  `/databases/(default)/documents/site/content?key=${firebaseConfig.apiKey}`;

// The same URL and credentials mode as the <link rel="preload"> in
// public/index.html, so the browser hands over the preloaded response.
export async function fetchContent(): Promise<ContentDoc> {
  const res = await fetch(CONTENT_URL, { credentials: "same-origin" });
  if (!res.ok)
    throw new Error(`Couldn't load the site content (${res.status})`);
  const doc = await res.json();
  const json = doc.fields?.json?.stringValue;
  if (!json) throw new Error("Nothing has been published yet");
  return {
    content: JSON.parse(json),
    version: Number(doc.fields.version?.integerValue ?? 0),
  };
}

// --- SPA caching ---
const STORAGE_KEY = "site-content";

const current = ref<ContentDoc | null>(null);
const error = ref("");
let pending: Promise<void> | null = null;
let restored = false;

// localStorage is only touched inside functions (never at module scope) so
// this file stays safe to import during server-side rendering.
function restore() {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) current.value = JSON.parse(raw) as ContentDoc;
  } catch (err) {
    // no storage, or a stale shape: fetch as if for the first time
  }
}

function remember(doc: ContentDoc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (err) {
    // storage full or unavailable: nothing lost but the shortcut
  }
}

// Starts the fetch once per page load. Safe to call as early as main.ts.
export function loadContent(): Promise<void> {
  restore();
  if (!pending) {
    pending = fetchContent()
      .then((doc) => {
        if (doc.version !== current.value?.version) {
          current.value = doc;
          remember(doc);
        }
      })
      .catch((err: Error) => {
        if (!current.value) error.value = err.message;
      });
  }
  return pending;
}

export function useContent() {
  loadContent();
  const content = computed(() => current.value?.content ?? null);
  return {
    content,
    version: computed(() => current.value?.version ?? 0),
    ready: computed(() => !!current.value),
    error,
    published: computed(() => content.value?.published ?? null),
    timeline: computed(() => content.value?.timeline ?? null),
    projects: computed(() => content.value?.projects ?? []),
  };
}
