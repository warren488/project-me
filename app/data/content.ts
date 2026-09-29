// Everything the public site shows that comes from the CV library: the
// published CVs, the timeline and the project cards. The admin publishes
// them as one Firestore document (site/content) holding a JSON string, so
// the site needs no Firestore SDK: one plain fetch of the REST endpoint.
//
// This file is framework-neutral: it runs in Node while `nuxi generate`
// bakes the content into the pages, and in the browser afterwards to check
// for a newer publish (see composables/useContent.ts).
import type {
  PublishedSite,
  PublishedTimeline,
  SiteProject,
} from "../cv/types";
import { firebaseConfig } from "../firebaseConfig";

export interface SiteContent {
  published: PublishedSite;
  timeline: PublishedTimeline | null;
  projects: SiteProject[] | null;
}

export interface ContentDoc {
  content: SiteContent;
  version: number; // Date.now() at publish time
}

export const FIRESTORE = "https://firestore.googleapis.com";

// `base` is the Firestore REST host: production by default, or the
// emulator (http://127.0.0.1:8085) when NUXT_PUBLIC_FIRESTORE_EMULATOR is set.
export const contentUrl = (base?: string) =>
  `${base || FIRESTORE}/v1/projects/${firebaseConfig.projectId}` +
  `/databases/(default)/documents/site/content?key=${firebaseConfig.apiKey}`;

// The same URL and credentials mode as the <link rel="preload"> in
// nuxt.config.ts, so the browser hands over the preloaded response.
export async function fetchContent(base?: string): Promise<ContentDoc> {
  const res = await fetch(contentUrl(base), { credentials: "same-origin" });
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
