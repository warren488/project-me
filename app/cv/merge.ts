import type { CVPage, SectionName } from "./types";

const concat = <T>(a: T[] | undefined, b: T[] | undefined) => [
  ...(a ?? []),
  ...(b ?? []),
];

// Appends one section of `from` to `to`. A page and its `src` have the same
// shape, so this serves both. Each list is homogeneous per section, which
// makes the loose typing safe.
function append(to: object, from: object, section: SectionName) {
  const out = to as Record<string, unknown>;
  const page = from as Record<string, unknown>;
  if (section === "skills") {
    const skills = (out.skills ?? {}) as Record<string, unknown[]>;
    for (const [category, list] of Object.entries(
      (page.skills ?? {}) as Record<string, unknown[]>
    )) {
      skills[category] = concat(skills[category], list);
    }
    out.skills = skills;
  } else {
    out[section] = concat(
      out[section] as unknown[] | undefined,
      page[section] as unknown[] | undefined
    );
  }
}

// Joins printed sheets back into one continuous page for the screen: every
// section once, in order, with a section that was cut across sheets stitched
// back together.
export function mergePages(pages: CVPage[]): CVPage | null {
  if (!pages.length) return null;
  const out: CVPage = {
    profile: { ...pages[0].profile },
    sections: [],
  };
  for (const page of pages) {
    for (const section of page.sections) {
      if (!out.sections.includes(section)) out.sections.push(section);
      append(out, page, section);
      if (page.src) append((out.src ??= {}), page.src, section);
    }
  }
  return out;
}
