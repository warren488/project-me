// Project cards for the home page. src/data/projects.json is generated from
// cv/library.json by cv/publish.js (npm run cv:publish, or any save in the
// admin); edit projects there, not here.
import raw from "./projects.json";
import type { SiteProject } from "@/cv/types";

export type { ProjectStatus } from "@/cv/types";
export type Project = SiteProject;

export const projects = raw as Project[];

const byYear = (a: Project, b: Project) => b.year - a.year;

// The main grid, newest first.
export const featuredProjects = projects
  .filter((p) => p.home === "featured")
  .sort(byYear);

// The collapsed "More projects" list.
export const otherProjects = projects
  .filter((p) => p.home === "more")
  .sort(byYear);
