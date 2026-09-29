// Project cards for the home page. They are published from the CV library
// by the admin (see src/data/content.ts); edit projects there, not here.
import type { SiteProject } from "@/cv/types";

export type { ProjectStatus } from "@/cv/types";
export type Project = SiteProject;

const byYear = (a: Project, b: Project) => b.year - a.year;

// The main grid, newest first.
export const featured = (projects: Project[]) =>
  projects.filter((p) => p.home === "featured").sort(byYear);

// The collapsed "More projects" list.
export const other = (projects: Project[]) =>
  projects.filter((p) => p.home === "more").sort(byYear);
