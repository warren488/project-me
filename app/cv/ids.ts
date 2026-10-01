// Ids in the library are slugs of the text they name.
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// An id for a bullet of an entry, or with the mark "-hl" for a condensed
// highlight: the entry's own slug plus the first three words, numbered when
// `taken` says it is already in use.
export function rowId(
  entryId: string,
  text: string,
  mark: string,
  taken: (id: string) => boolean
): string {
  const base = `${entryId.replace(/^[a-z]+-/, "")}${mark}-${slug(
    text.split(/\s+/).slice(0, 3).join(" ")
  )}`.replace(/-+$/, "");
  let candidate = base || "bullet";
  for (let n = 2; taken(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}
