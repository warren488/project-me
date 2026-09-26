import raw from "./projects.json";

export type ProjectStatus = "live" | "open-source" | "in-progress" | "client";

export interface Project {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tech: string[];
  year: number;
  status: ProjectStatus;
  links: { live: string | null; source: string | null };
  tags: string[];
  featured: boolean;
}

export const projects = raw as Project[];

// Featured first, then newest.
export const featuredProjects = projects
  .filter((p) => p.featured)
  .sort((a, b) => b.year - a.year);

export const otherProjects = projects
  .filter((p) => !p.featured)
  .sort((a, b) => b.year - a.year);
