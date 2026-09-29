// Site-wide copy and metadata. The CV content lives in cv/; this is only what
// the shell, the home page and the <head> need.
export const site = {
  name: "Warren Scantlebury",
  url: "https://warren.scantlebury.io",
  // TODO(warren): confirm the title, pitch and location line.
  title: "Full Stack Software Engineer",
  pitch:
    "I build web apps end to end, from Terraform and Kubernetes up to the pixels, and I keep building things on the side to find out what the web can do.",
  location: "Bridgetown, Barbados",
  email: "warren.scantlebury@gmail.com",
  // Used by the <head>, link previews and the JSON-LD Person block.
  description:
    "Full stack software engineer working in TypeScript, React, Node.js and GCP. Builds PWAs, real-time apps and the occasional homelab tool.",
  socialImage: "/social-card.png",
  github: "https://github.com/warren488",
  linkedin: "https://www.linkedin.com/in/warren-scantlebury-581358190/",
  x: "https://x.com/warrendadev",
} as const;

// The CV dashboard's route. The page file is app/pages/<ADMIN_PATH>.vue and
// nuxt.config.ts makes it client-only. The path is deliberately unguessable
// and not listed anywhere public (robots.txt included); sign-in is the real
// guard, this just cuts noise.
export const ADMIN_PATH = "/desk-shkqfe";

export type PageKey =
  "home" | "experience" | "timeline" | "admin" | "not-found";

export interface PageMeta {
  title: string;
  description: string;
  // Reachable from the site's own links, not from search.
  noindex?: boolean;
  ogType?: "profile" | "website";
}

// Per-page <title>, description and preview text; applied by
// composables/usePageMeta.ts, rendered into each generated page.
export const pageMeta: Record<PageKey, PageMeta> = {
  home: {
    title: `${site.name} · ${site.title}`,
    description: site.description,
    ogType: "profile",
  },
  experience: {
    title: `CV · ${site.name}`,
    description: `The CV of ${
      site.name
    }, ${site.title.toLowerCase()}: experience, education, skills and projects.`,
    noindex: true,
  },
  timeline: {
    title: `Timeline · ${site.name}`,
    description: `${site.name}'s career as a git graph: employers on the main line, client engagements branching off, newest first.`,
  },
  admin: {
    title: `Desk · ${site.name}`,
    description: "",
    noindex: true,
  },
  "not-found": {
    title: `Page not found · ${site.name}`,
    description: site.description,
    noindex: true,
  },
};
