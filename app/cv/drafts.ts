import { rowId } from "./ids";
import type { EntryField } from "./inlineEdit";
import type {
  Bullet,
  CVPage,
  Highlight,
  LibraryEntry,
  LineSource,
} from "./types";

// Pure helpers behind editing the CV preview in place. Each returns a new
// entry, which the dashboard keeps as an unsaved draft until Save.

// Text as typed into an editable element: one line, no stray spaces.
export const cleanText = (raw: string) =>
  raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// The inline markup a bullet or the summary may keep. Everything else a
// browser adds while editing (divs, spans, styles) is unwrapped to its text.
const INLINE_TAGS = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "A",
  "CODE",
  "SUB",
  "SUP",
  "SMALL",
]);

const escapeText = (text: string) =>
  text
    .replace(/&(?=#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// The HTML of an editable element, reduced to text and that inline markup.
export function cleanHtml(raw: string): string {
  const box = document.createElement("template");
  box.innerHTML = raw;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return escapeText(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (el.tagName === "BR") return " ";
    const inner = [...el.childNodes].map(walk).join("");
    // A block (a pasted paragraph, a merged line) becomes a space.
    if (!INLINE_TAGS.has(el.tagName)) return ` ${inner} `;
    if (!inner.trim()) return inner;
    const tag = el.tagName.toLowerCase();
    if (tag !== "a") return `<${tag}>${inner}</${tag}>`;
    const href = el.getAttribute("href") ?? "";
    if (!/^(https?:|mailto:)/i.test(href)) return inner;
    const safe = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<a href="${safe}">${inner}</a>`;
  };
  return cleanText([...box.content.childNodes].map(walk).join(""));
}

export const setField = (
  entry: LibraryEntry,
  field: EntryField,
  text: string
): LibraryEntry => ({ ...entry, [field]: text });

const takenIn = (entry: LibraryEntry) => {
  const ids = new Set(
    [...(entry.bullets ?? []), ...(entry.highlights ?? [])].map((r) => r.id)
  );
  return (id: string) => ids.has(id);
};

// A bullet or highlight of the entry, as the line it prints.
export function findLine(
  entry: LibraryEntry,
  id: string
): (LineSource & { text: string }) | undefined {
  const bullet = entry.bullets?.find((b) => b.id === id);
  if (bullet) return { entry: entry.id, id, text: bullet.text };
  const highlight = entry.highlights?.find((h) => h.id === id);
  if (!highlight) return undefined;
  const line = { entry: entry.id, id, text: highlight.text, highlight: true };
  return highlight.for ? { ...line, for: highlight.for } : line;
}

export function setLine(
  entry: LibraryEntry,
  id: string,
  text: string
): LibraryEntry {
  const swap = <T extends { id: string; text: string }>(rows: T[]) =>
    rows.map((row) => (row.id === id ? { ...row, text } : row));
  const next = { ...entry };
  if (entry.bullets) next.bullets = swap(entry.bullets);
  if (entry.highlights) next.highlights = swap(entry.highlights);
  return next;
}

// `ids` with `id` placed after `after` (at the end when that isn't listed).
export function insertAfter<T>(
  list: T[],
  item: T,
  isAfter: (other: T) => boolean
): T[] {
  const at = list.findIndex(isAfter);
  const out = [...list];
  out.splice(at === -1 ? out.length : at + 1, 0, item);
  return out;
}

// A new bullet under the one with id `after`.
export function addBullet(entry: LibraryEntry, after: string, text: string) {
  const bullet: Bullet = {
    id: rowId(entry.id, text, "", takenIn(entry)),
    text,
    tags: [],
  };
  const bullets = insertAfter(
    entry.bullets ?? [],
    bullet,
    (b) => b.id === after
  );
  return { entry: { ...entry, bullets }, id: bullet.id };
}

// A new condensed highlight for one CV, under the one with id `after`.
export function addHighlight(
  entry: LibraryEntry,
  after: string,
  text: string,
  forId: string,
  from?: string[]
) {
  const highlight: Highlight = {
    id: rowId(entry.id, text, "-hl", takenIn(entry)),
    text,
    for: forId,
  };
  if (from?.length) highlight.from = [...from];
  const highlights = insertAfter(
    entry.highlights ?? [],
    highlight,
    (h) => h.id === after
  );
  return { entry: { ...entry, highlights }, id: highlight.id };
}

// A copy of one highlight for a CV, placed after the original.
export function copyHighlight(entry: LibraryEntry, id: string, forId: string) {
  const original = entry.highlights?.find((h) => h.id === id);
  if (!original) return { entry, id };
  return addHighlight(entry, id, original.text, forId, original.from);
}

// Gives a CV its own copy of the general highlights, which it was printing
// for want of a set of its own. `ids` maps each general id to its copy.
export function forkGeneral(entry: LibraryEntry, forId: string) {
  const ids = new Map<string, string>();
  let next = entry;
  for (const general of (entry.highlights ?? []).filter((h) => !h.for)) {
    const copy = addHighlight(next, "", general.text, forId, general.from);
    next = copy.entry;
    ids.set(general.id, copy.id);
  }
  return { entry: next, ids };
}

// Every printed list of lines in a preview: the texts and, beside them,
// their sources. The arrays are the pages' own, so they can be edited.
export function lineLists(pages: CVPage[]) {
  const lists: { texts: string[]; lines: LineSource[] }[] = [];
  for (const page of pages) {
    (page.experience ?? []).forEach((job, i) => {
      const src = page.src?.experience?.[i];
      if (!src) return;
      lists.push({ texts: job.details, lines: src.details });
      (job.engagements ?? []).forEach((eng, e) => {
        const engSrc = src.engagements?.[e];
        if (engSrc) lists.push({ texts: eng.details, lines: engSrc.details });
      });
    });
  }
  return lists;
}
