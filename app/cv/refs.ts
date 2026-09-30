import type { EngagementPick, LibraryEntry, VariantRef } from "./types";

// Pure helpers for editing variant refs in the admin. Every function returns
// a new ref in its smallest form: a plain string when nothing deviates from
// the defaults, so saved variants stay readable. Mirrors cv/publish.js.

export const refId = (ref: VariantRef) =>
  typeof ref === "string" ? ref : ref.id;

// One-line label text for HTML bullet text.
export const plain = (html: string) => html.replace(/<[^>]+>/g, "");

// The default selection: the full bullets, never the condensed highlights.
const bulletIds = (entry: LibraryEntry) =>
  (entry.bullets ?? []).map((b) => b.id);

// Every id a ref may list: bullets and highlights.
export const allBulletIds = (entry: LibraryEntry) => [
  ...bulletIds(entry),
  ...(entry.highlights ?? []).map((h) => h.id),
];

// The entry's own selected bullet ids, in print order.
export function ownBullets(entry: LibraryEntry, ref: VariantRef): string[] {
  if (typeof ref === "string" || !ref.bullets) return bulletIds(entry);
  return ref.bullets;
}

type Pick = { show: boolean; bullets?: string[] };

// How the ref treats one engagement: shown or not, and which bullets
// (undefined = all of them).
export function engagementPick(ref: VariantRef, engId: string): Pick {
  const setting = typeof ref === "string" ? undefined : ref.engagements;
  if (setting === undefined || setting === true) return { show: true };
  if (setting === false) return { show: false, bullets: [] };
  const pick = setting[engId];
  if (!pick) return { show: true };
  const show = pick.show !== false;
  return { show, bullets: pick.bullets ?? (show ? undefined : []) };
}

// Selected bullets of an engagement in print order (rolled-up ones when the
// engagement is hidden).
export function engagementBullets(
  eng: LibraryEntry,
  ref: VariantRef
): string[] {
  const pick = engagementPick(ref, eng.id);
  return pick.bullets ?? bulletIds(eng);
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const collapse = (
  entry: LibraryEntry,
  ref: Exclude<VariantRef, string>
): VariantRef => {
  const out: Exclude<VariantRef, string> = { id: ref.id };
  if (ref.bullets && !sameList(ref.bullets, bulletIds(entry))) {
    out.bullets = ref.bullets;
  }
  if (ref.engagements === false) out.engagements = false;
  else if (ref.engagements && typeof ref.engagements === "object") {
    if (Object.keys(ref.engagements).length) out.engagements = ref.engagements;
  }
  return out.bullets || out.engagements !== undefined ? out : out.id;
};

const expand = (ref: VariantRef): Exclude<VariantRef, string> =>
  typeof ref === "string" ? { id: ref } : { ...ref };

// The ref with the entry's own bullets set to exactly `ids`, in that order.
export function withBullets(
  entry: LibraryEntry,
  ref: VariantRef,
  ids: string[]
): VariantRef {
  return collapse(entry, { ...expand(ref), bullets: ids });
}

// The ref with one engagement's pick replaced. A pick equal to the default
// (shown, all bullets) is dropped from the map. `engagements` is every
// engagement of the entry, needed to turn `engagements: false` into
// explicit picks.
export function withEngagement(
  entry: LibraryEntry,
  ref: VariantRef,
  engagements: LibraryEntry[],
  eng: LibraryEntry,
  pick: EngagementPick
): VariantRef {
  const next = expand(ref);
  let map: Record<string, EngagementPick> = {};
  if (next.engagements === false) {
    for (const e of engagements) map[e.id] = { show: false };
  } else if (next.engagements && typeof next.engagements === "object") {
    map = { ...next.engagements };
  }
  const all = bulletIds(eng);
  const show = pick.show !== false;
  const bullets = pick.bullets ?? (show ? all : []);
  const clean: EngagementPick = {};
  if (!show) clean.show = false;
  if (show ? !sameList(bullets, all) : bullets.length) clean.bullets = bullets;
  if (Object.keys(clean).length) map[eng.id] = clean;
  else delete map[eng.id];
  next.engagements = map;
  return collapse(entry, next);
}

// Drops bullet ids and engagement keys that no longer exist.
export function normalizeRef(
  entry: LibraryEntry,
  ref: VariantRef,
  engagements: LibraryEntry[]
): VariantRef {
  if (typeof ref === "string") return ref;
  const next = expand(ref);
  const have = new Set(allBulletIds(entry));
  if (next.bullets) next.bullets = next.bullets.filter((b) => have.has(b));
  if (next.engagements && typeof next.engagements === "object") {
    const map: Record<string, EngagementPick> = {};
    for (const eng of engagements) {
      const pick = next.engagements[eng.id];
      if (!pick) continue;
      const ids = new Set(allBulletIds(eng));
      const clean: EngagementPick = { ...pick };
      if (clean.bullets)
        clean.bullets = clean.bullets.filter((b) => ids.has(b));
      map[eng.id] = clean;
    }
    next.engagements = map;
  }
  return collapse(entry, next);
}

// `ids` with `id` moved up (by < 0) or down (by > 0).
export function moveInList(ids: string[], id: string, by: number): string[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const out = [...ids];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}
