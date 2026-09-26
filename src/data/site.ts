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

// Per-route <title> and description, applied by the router after each
// navigation (see src/router/index.ts).
export const pageMeta: Record<string, { title: string; description: string }> =
  {
    home: {
      title: `${site.name} · ${site.title}`,
      description: site.description,
    },
    experience: {
      title: `CV · ${site.name}`,
      description: `The CV of ${
        site.name
      }, ${site.title.toLowerCase()}: experience, education, skills and projects.`,
    },
    "not-found": {
      title: `Page not found · ${site.name}`,
      description: site.description,
    },
    timeline: {
      title: `Timeline · ${site.name}`,
      description: `${site.name}'s career as a git graph: employers on the main line, client engagements branching off, newest first.`,
    },
  };
