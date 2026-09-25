import { isBreak, LibraryEntry, PageBreak, VariantRef } from "./types";

// Newest first: current roles (no end) ahead of finished ones that started
// the same month, undated entries last in their existing order. Page breaks
// keep their positions ("a break after the third item" stays after the
// third item). Mirrors sortRefsByDate in cv/publish.js.
export function sortRefsByDate(
  refs: (VariantRef | PageBreak)[],
  byId: Map<string, LibraryEntry>
) {
  const monthIndex = (date: string) => {
    const [y, m] = date.split("-").map(Number);
    return y * 12 + ((m || 1) - 1);
  };
  const key = (ref: VariantRef) => {
    const entry = byId.get(typeof ref === "string" ? ref : ref.id);
    if (!entry?.start) return null;
    return [monthIndex(entry.start), entry.end === null ? 1 : 0];
  };
  const items = refs.filter((r): r is VariantRef => !isBreak(r));
  const sorted = items
    .map((ref, i) => ({ ref, i, k: key(ref) }))
    .sort((a, b) => {
      if (!a.k && !b.k) return a.i - b.i;
      if (!a.k) return 1;
      if (!b.k) return -1;
      return b.k[0] - a.k[0] || b.k[1] - a.k[1] || a.i - b.i;
    })
    .map((x) => x.ref);
  let n = 0;
  for (let i = 0; i < refs.length; i++) {
    if (!isBreak(refs[i])) refs[i] = sorted[n++];
  }
  return refs;
}
