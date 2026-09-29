import { CVPage, SectionName } from "./types";

// Joins printed sheets back into one continuous page for the screen: every
// section once, in order, with a section that was cut across sheets stitched
// back together.
export function mergePages(pages: CVPage[]): CVPage | null {
  if (!pages.length) return null;
  const out: CVPage = {
    profile: { ...pages[0].profile },
    sections: [],
  };
  const concat = <T>(a: T[] | undefined, b: T[] | undefined) => [
    ...(a ?? []),
    ...(b ?? []),
  ];
  for (const page of pages) {
    for (const section of page.sections) {
      if (!out.sections.includes(section)) out.sections.push(section);
      if (section === "skills") {
        out.skills = out.skills ?? {};
        for (const [category, list] of Object.entries(page.skills ?? {})) {
          out.skills[category] = concat(out.skills[category], list);
        }
      } else {
        const key = section as Exclude<SectionName, "skills">;
        // Each list type is homogeneous per section, so this cast is safe.
        (out as unknown as Record<string, unknown>)[key] = concat(
          out[key] as unknown[] | undefined,
          page[key] as unknown[] | undefined
        );
      }
    }
  }
  return out;
}
