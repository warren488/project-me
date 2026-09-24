// Resolves a CV variant against the library and writes cv/published.json,
// which is the only CV data the public site imports.
//
// Usage: npm run cv:publish [variantId]   (defaults to "full")
const fs = require("fs");
const path = require("path");

const CV_DIR = __dirname;

// Which entry kind each page section accepts.
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

function resolveVariant(library, variant) {
  const byId = new Map(library.entries.map((e) => [e.id, e]));
  const where = `variant "${variant.id}"`;

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

  const { name, email, website } = library.profile;

  return variant.pages.map((page, index) => {
    for (const section of Object.keys(page)) {
      if (!SECTION_KINDS[section])
        throw new Error(`${where}: unknown section "${section}"`);
    }
    const items = (section) =>
      (page[section] || []).map((ref) => lookup(ref, section));
    const out = {
      profile: { name, title: variant.title, email, website },
    };
    if (index === 0 && variant.summary) out.profile.summary = variant.summary;

    if (page.education) {
      out.education = items("education").map(({ entry }) => ({
        degree: entry.title,
        uni: entry.org,
        dates: formatRange(entry),
        details: entry.details,
      }));
    }
    if (page.competencies) {
      out.competencies = items("competencies").map(({ entry }) => entry.title);
    }
    if (page.achievements) {
      out.achievements = items("achievements").map(({ entry }) => ({
        role: entry.title,
        org: entry.org,
        note: entry.details,
      }));
    }
    if (page.skills) {
      // Grouped by category, in the order categories first appear.
      out.skills = {};
      for (const { entry } of items("skills")) {
        if (!out.skills[entry.category]) out.skills[entry.category] = [];
        out.skills[entry.category].push(entry.title);
      }
    }
    if (page.experience) {
      out.experience = items("experience").map(({ entry, ref }) => ({
        title: entry.title,
        company: entry.org,
        dates: formatRange(entry),
        details: pickBullets(entry, ref),
      }));
    }
    if (page.interests) {
      out.interests = items("interests").map(({ entry }) => ({
        name: entry.title,
        desc: entry.details,
      }));
    }
    if (page.projects) {
      out.projects = items("projects").map(({ entry }) => ({
        title: entry.title,
        desc: entry.details,
        tech: entry.tech,
      }));
    }
    return out;
  });
}

function publish(variantId = "full") {
  const library = readJson(path.join(CV_DIR, "library.json"));
  const variant = readJson(path.join(CV_DIR, "variants", `${variantId}.json`));
  const published = {
    variant: variant.id,
    pages: resolveVariant(library, variant),
  };
  fs.writeFileSync(
    path.join(CV_DIR, "published.json"),
    JSON.stringify(published, null, 2) + "\n"
  );
  return published;
}

module.exports = { resolveVariant, publish, formatRange };

if (require.main === module) {
  try {
    const { variant } = publish(process.argv[2]);
    console.log(`Published variant "${variant}" to cv/published.json`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
