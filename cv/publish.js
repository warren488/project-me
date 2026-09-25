// Resolves a CV variant against the library and writes cv/published.json,
// which is the only CV data the public site imports.
//
// Usage: npm run cv:publish [variantId]   (defaults to "full")
const fs = require("fs");
const path = require("path");

const CV_DIR = __dirname;

// Which entry kind each page section accepts.
const LAYOUTS = ["styled", "ats"];

const SECTION_KINDS = {
  education: "education",
  competencies: "competency",
  achievements: "achievement",
  skills: "skill",
  experience: "job",
  projects: "project",
  interests: "interest",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2022-10" -> "Oct 2022", "2021" -> "2021"
function formatDate(value) {
  const [year, month] = value.split("-");
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
}

function formatRange(entry) {
  if (!entry.start) return undefined;
  const end = entry.end ? formatDate(entry.end) : "Present";
  return `${formatDate(entry.start)} – ${end}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Sections that live in the sidebar of the styled layout. The sidebar flows
// across sheets like the main column; only the name and contact block is
// limited to the first sheet.
const SIDEBAR_SECTIONS = [
  "education",
  "competencies",
  "achievements",
  "interests",
];

// "2021-09" -> 24261; a bare year counts as January of that year.
const monthIndex = (date) => {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
};

const SECTION_ORDERS = ["manual", "date"];

const isBreak = (item) =>
  !!item && typeof item === "object" && item.break === true;

// Newest first, current roles ahead of finished ones started the same
// month, undated entries last in their existing order. Page breaks keep their
// positions. Mirrors src/cv/order.ts.
function sortRefsByDate(refs, byId) {
  const key = (ref) => {
    const entry = byId.get(typeof ref === "string" ? ref : ref.id);
    if (!entry || !entry.start) return null;
    return [monthIndex(entry.start), entry.end === null ? 1 : 0];
  };
  const sorted = refs
    .filter((r) => !isBreak(r))
    .map((ref, i) => ({ ref, i, k: key(ref) }))
    .sort((a, b) => {
      if (!a.k && !b.k) return a.i - b.i;
      if (!a.k) return 1;
      if (!b.k) return -1;
      return b.k[0] - a.k[0] || b.k[1] - a.k[1] || a.i - b.i;
    })
    .map((x) => x.ref);
  let n = 0;
  return refs.map((r) => (isBreak(r) ? r : sorted[n++]));
}

// Calls fn(ref, sectionName) for every entry reference in a variant.
function eachRef(variant, fn) {
  for (const item of variant.sections || []) {
    if (isBreak(item)) continue;
    for (const ref of item.refs || []) {
      if (!isBreak(ref)) fn(ref, item.section);
    }
  }
}

// A variant is one ordered list of sections, each with ordered refs. Page
// breaks ({ break: true }) can sit between sections or between the refs of a
// section; everything after a break lands on the next sheet, whichever
// column it belongs to, and the sheet after a mid-section break repeats that
// section's heading as "(continued)". The result is one CVPage per sheet.
function resolveVariant(library, variant) {
  const byId = new Map(library.entries.map((e) => [e.id, e]));
  const where = `variant "${variant.id}"`;

  if (variant.layout !== undefined && !LAYOUTS.includes(variant.layout)) {
    throw new Error(`${where}: unknown layout "${variant.layout}"`);
  }
  if (!Array.isArray(variant.sections)) {
    throw new Error(`${where}: "sections" must be a list`);
  }

  const lookup = (ref, section) => {
    const id = typeof ref === "string" ? ref : ref.id;
    const entry = byId.get(id);
    if (!entry)
      throw new Error(`${where}: unknown entry "${id}" in ${section}`);
    if (entry.kind !== SECTION_KINDS[section]) {
      throw new Error(
        `${where}: "${id}" is a ${entry.kind}, not allowed in ${section}`
      );
    }
    return { entry, ref };
  };

  // A ref is either "entry-id" (all bullets) or { id, bullets: [bulletIds] }.
  const pickBullets = (entry, ref) => {
    const bullets = entry.bullets || [];
    if (typeof ref === "string" || !ref.bullets)
      return bullets.map((b) => b.text);
    return ref.bullets.map((bulletId) => {
      const bullet = bullets.find((b) => b.id === bulletId);
      if (!bullet)
        throw new Error(
          `${where}: unknown bullet "${bulletId}" on "${entry.id}"`
        );
      return bullet.text;
    });
  };

  // --- Cut the list into sheets ---
  // sheet = { order: [section...], items: { section: [{entry, ref}] }, continued: Set }
  const newSheet = () => ({ order: [], items: {}, continued: new Set() });
  const sheets = [newSheet()];
  const started = new Set(); // sections that already have items on an earlier sheet
  const seenSection = new Set();

  const add = (sheet, section, resolved) => {
    if (!sheet.order.includes(section)) sheet.order.push(section);
    (sheet.items[section] = sheet.items[section] || []).push(resolved);
  };
  const cut = () => {
    const current = sheets[sheets.length - 1];
    if (current.order.length || sheets.length > 1) sheets.push(newSheet());
    for (const section of current.order) started.add(section);
  };

  for (const item of variant.sections) {
    if (isBreak(item)) {
      cut();
      continue;
    }
    const { section } = item;
    if (!SECTION_KINDS[section])
      throw new Error(`${where}: unknown section "${section}"`);
    if (seenSection.has(section))
      throw new Error(`${where}: section "${section}" is listed twice`);
    seenSection.add(section);
    if (!Array.isArray(item.refs))
      throw new Error(`${where}: section "${section}" has no refs list`);
    if (item.order !== undefined && !SECTION_ORDERS.includes(item.order)) {
      throw new Error(`${where}: unknown order "${item.order}" in ${section}`);
    }
    const refs =
      item.order === "date" ? sortRefsByDate(item.refs, byId) : item.refs;

    for (const ref of refs) {
      if (isBreak(ref)) {
        cut();
        continue;
      }
      const target = sheets[sheets.length - 1];
      add(target, section, lookup(ref, section));
      if (started.has(section)) target.continued.add(section);
    }
  }
  // Drop an empty trailing sheet left by a final break.
  while (sheets.length > 1 && !sheets[sheets.length - 1].order.length) {
    sheets.pop();
  }

  // --- Render each sheet as a CVPage ---
  const { name, email, website, phone, location } = library.profile;

  return sheets.map((sheet, index) => {
    const out = {
      profile: { name, title: variant.title, email, website },
      sections: sheet.order,
    };
    if (variant.contact) {
      if (phone) out.profile.phone = phone;
      if (location) out.profile.location = location;
    }
    if (index === 0 && variant.summary) out.profile.summary = variant.summary;
    if (sheet.continued.size) out.continued = [...sheet.continued];

    const items = (section) => sheet.items[section] || [];
    for (const section of sheet.order) {
      if (section === "education") {
        out.education = items(section).map(({ entry }) => ({
          degree: entry.title,
          uni: entry.org,
          dates: formatRange(entry),
          details: entry.details,
        }));
      } else if (section === "competencies") {
        out.competencies = items(section).map(({ entry }) => entry.title);
      } else if (section === "achievements") {
        out.achievements = items(section).map(({ entry }) => ({
          role: entry.title,
          org: entry.org,
          note: entry.details,
        }));
      } else if (section === "skills") {
        // Grouped by category, in the order categories first appear.
        out.skills = {};
        for (const { entry } of items(section)) {
          if (!out.skills[entry.category]) out.skills[entry.category] = [];
          out.skills[entry.category].push(entry.title);
        }
      } else if (section === "experience") {
        out.experience = items(section).map(({ entry, ref }) => ({
          title: entry.title,
          company: entry.org,
          dates: formatRange(entry),
          details: pickBullets(entry, ref),
        }));
      } else if (section === "interests") {
        out.interests = items(section).map(({ entry }) => ({
          name: entry.title,
          desc: entry.details,
        }));
      } else if (section === "projects") {
        out.projects = items(section).map(({ entry }) => ({
          title: entry.title,
          desc: entry.details,
          tech: entry.tech,
        }));
      }
    }
    return out;
  });
}

// Entry kinds shown on the public timeline unless the entry says otherwise
// with `timeline: true|false`. Anything undated is never shown.
const TIMELINE_DEFAULT_KINDS = ["job", "education"];

const onTimeline = (entry) =>
  !!entry.start &&
  (typeof entry.timeline === "boolean"
    ? entry.timeline
    : TIMELINE_DEFAULT_KINDS.includes(entry.kind));

// The public timeline: dated entries only, most recent first, without any
// contact details.
function resolveTimeline(library) {
  const endOf = (e) => (e.end ? monthIndex(e.end) : Infinity);
  return library.entries
    .filter(onTimeline)
    .sort(
      (a, b) => monthIndex(b.start) - monthIndex(a.start) || endOf(b) - endOf(a)
    )
    .map((entry) => {
      const item = {
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        start: entry.start,
        end: entry.end === undefined ? null : entry.end,
        dates: formatRange(entry),
        tags: entry.tags,
      };
      if (entry.org) item.org = entry.org;
      if (entry.details) item.details = entry.details;
      if (entry.tech) item.tech = entry.tech;
      if (entry.bullets) item.bullets = entry.bullets.map((b) => b.text);
      return item;
    });
}

function publishTimeline() {
  const library = readJson(path.join(CV_DIR, "library.json"));
  const timeline = {
    name: library.profile.name,
    items: resolveTimeline(library),
  };
  fs.writeFileSync(
    path.join(CV_DIR, "timeline.json"),
    JSON.stringify(timeline, null, 2) + "\n"
  );
  return timeline;
}

function publish(variantId = "full") {
  const library = readJson(path.join(CV_DIR, "library.json"));
  const variant = readJson(path.join(CV_DIR, "variants", `${variantId}.json`));
  const published = {
    variant: variant.id,
    layout: variant.layout || "styled",
    pages: resolveVariant(library, variant),
  };
  fs.writeFileSync(
    path.join(CV_DIR, "published.json"),
    JSON.stringify(published, null, 2) + "\n"
  );
  publishTimeline();
  return published;
}

module.exports = {
  resolveVariant,
  eachRef,
  isBreak,
  SIDEBAR_SECTIONS,
  resolveTimeline,
  publish,
  publishTimeline,
  onTimeline,
  formatRange,
  SECTION_KINDS,
  TIMELINE_DEFAULT_KINDS,
  LAYOUTS,
};

if (require.main === module) {
  try {
    const { variant } = publish(process.argv[2]);
    console.log(`Published variant "${variant}" to cv/published.json`);
    console.log("Published cv/timeline.json");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
