// One-off (idempotent): folds the hand-edited src/data/projects.json into
// cv/library.json so the library is the single source for projects, then
// regenerates src/data/projects.json from it.
//
// Usage: node scripts/migrate-projects.js
const fs = require("fs");
const path = require("path");
const { publishProjects } = require("../cv/publish");

const ROOT = path.join(__dirname, "..");
const LIBRARY = path.join(ROOT, "cv", "library.json");
const SITE = path.join(ROOT, "src", "data", "projects.json");

// Site project id -> existing library entry id (titles differ).
const ID_MAP = {
  "web-chat": "proj-chat-pwa",
  noez: "proj-dominoes",
  fitnese: "proj-fitnese",
};

const library = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
const site = JSON.parse(fs.readFileSync(SITE, "utf8"));
if (!Array.isArray(site)) throw new Error("projects.json is not a list");

const merged = [];
const created = [];
for (const p of site) {
  const id = ID_MAP[p.id] || `proj-${p.id}`;
  let entry = library.entries.find((e) => e.id === id);
  if (entry && entry.kind !== "project")
    throw new Error(`"${id}" exists but is a ${entry.kind}`);
  if (!entry) {
    entry = { id, kind: "project", title: p.title, tags: [] };
    // Keep projects together: after the last project entry.
    let at = -1;
    library.entries.forEach((e, i) => {
      if (e.kind === "project") at = i;
    });
    library.entries.splice(at + 1, 0, entry);
    created.push(id);
  } else {
    merged.push(id);
  }
  entry.title = p.title;
  entry.tagline = p.tagline;
  entry.description = p.description;
  entry.tech = [...new Set((p.tech || []).map((t) => String(t).trim()))];
  entry.year = p.year;
  entry.status = p.status;
  const links = {};
  if (p.links && p.links.live) links.live = p.links.live;
  if (p.links && p.links.source) links.source = p.links.source;
  if (Object.keys(links).length) entry.links = links;
  else delete entry.links;
  entry.tags = [...new Set([...(entry.tags || []), ...(p.tags || [])])];
  const home = p.home || (p.featured ? "featured" : "more");
  if (home === "hidden") delete entry.home;
  else entry.home = home;
}

// Stored field order, like cv/devApi.js cleanEntry.
const ORDER = [
  "id",
  "kind",
  "title",
  "org",
  "category",
  "parent",
  "start",
  "end",
  "details",
  "tech",
  "tagline",
  "description",
  "year",
  "status",
  "links",
  "home",
  "timeline",
  "recent",
  "tags",
  "notes",
  "bullets",
];
library.entries = library.entries.map((e) => {
  const out = {};
  for (const k of ORDER) if (e[k] !== undefined) out[k] = e[k];
  for (const k of Object.keys(e)) if (!(k in out)) out[k] = e[k];
  return out;
});

fs.writeFileSync(
  LIBRARY,
  require("prettier").format(JSON.stringify(library), { parser: "json" })
);
const projects = publishProjects();
console.log(`merged: ${merged.join(", ")}`);
console.log(`created: ${created.join(", ")}`);
console.log(`wrote ${projects.length} projects to src/data/projects.json`);
