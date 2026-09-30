import type {
  EngagementPick,
  Highlight,
  LibraryEntry,
  PickMode,
  VariantRef,
} from "./types";

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

// The condensed highlights an entry prints on a CV: the ones written for
// that CV, else the general ones (no `for`). Mirrors publish.js.
export function highlightsFor(
  entry: LibraryEntry,
  variantId: string
): Highlight[] {
  const all = entry.highlights ?? [];
  const own = all.filter((h) => h.for === variantId);
  return own.length ? own : all.filter((h) => !h.for);
}

// How the entry's own bullets are picked by this ref.
export function pickMode(ref: VariantRef): PickMode {
  if (typeof ref === "string") return "full";
  if (ref.bullets) return "custom";
  return ref.condensed ? "condensed" : "full";
}

type Pick = { show: boolean; bullets?: string[]; condensed?: boolean };

// How the ref treats one engagement: shown or not, and which bullets
// (undefined = all of them, or its highlights when condensed).
export function engagementPick(ref: VariantRef, engId: string): Pick {
  const setting = typeof ref === "string" ? undefined : ref.engagements;
  if (setting === undefined || setting === true) return { show: true };
  if (setting === false) return { show: false, bullets: [] };
  const pick = setting[engId];
  if (!pick) return { show: true };
  const show = pick.show !== false;
  const out: Pick = { show, bullets: pick.bullets ?? (show ? undefined : []) };
  if (pick.condensed) out.condensed = true;
  return out;
}

export function engagementMode(ref: VariantRef, engId: string): PickMode {
  const pick = engagementPick(ref, engId);
  if (pick.bullets) return "custom";
  return pick.condensed ? "condensed" : "full";
}

// Selected bullets of an engagement in print order (rolled-up ones when the
// engagement is hidden). A condensed pick lists its resolved highlights.
export function engagementBullets(
  eng: LibraryEntry,
  ref: VariantRef,
  variantId = ""
): string[] {
  const pick = engagementPick(ref, eng.id);
  if (pick.bullets) return pick.bullets;
  if (pick.condensed) return highlightsFor(eng, variantId).map((h) => h.id);
  return bulletIds(eng);
}

// The entry's own selected ids, resolved the same way.
export function ownBulletsFor(
  entry: LibraryEntry,
  ref: VariantRef,
  variantId: string
): string[] {
  if (typeof ref !== "string" && !ref.bullets && ref.condensed)
    return highlightsFor(entry, variantId).map((h) => h.id);
  return ownBullets(entry, ref);
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
  if (!out.bullets && ref.condensed) out.condensed = true;
  if (ref.engagements === false) out.engagements = false;
  else if (ref.engagements && typeof ref.engagements === "object") {
    if (Object.keys(ref.engagements).length) out.engagements = ref.engagements;
  }
  return out.bullets || out.condensed || out.engagements !== undefined
    ? out
    : out.id;
};

const expand = (ref: VariantRef): Exclude<VariantRef, string> =>
  typeof ref === "string" ? { id: ref } : { ...ref };

// The ref with the entry's own bullets set to exactly `ids`, in that order
// (which also leaves condensed mode).
export function withBullets(
  entry: LibraryEntry,
  ref: VariantRef,
  ids: string[]
): VariantRef {
  const next = { ...expand(ref), bullets: ids };
  delete next.condensed;
  return collapse(entry, next);
}

// The ref with the entry's own bullets in condensed mode (or back to full).
export function withCondensed(
  entry: LibraryEntry,
  ref: VariantRef,
  on: boolean
): VariantRef {
  const next = expand(ref);
  delete next.bullets;
  if (on) next.condensed = true;
  else delete next.condensed;
  return collapse(entry, next);
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
  const clean: EngagementPick = {};
  if (!show) clean.show = false;
  if (pick.condensed && !pick.bullets) {
    clean.condensed = true;
  } else {
    const bullets = pick.bullets ?? (show ? all : []);
    if (show ? !sameList(bullets, all) : bullets.length)
      clean.bullets = bullets;
  }
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
