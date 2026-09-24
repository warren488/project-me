// Local-only API used by the /admin dashboard. It is mounted on the dev server
// (see vue.config.js) and never exists in the production build.
const fs = require("fs");
const path = require("path");
const {
  resolveVariant,
  publish,
  publishTimeline,
  formatRange,
  SECTION_KINDS,
  TIMELINE_DEFAULT_KINDS,
} = require("./publish");

const CV_DIR = __dirname;
const LIBRARY_FILE = path.join(CV_DIR, "library.json");
const VARIANTS_DIR = path.join(CV_DIR, "variants");
const ID = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const KINDS = Object.values(SECTION_KINDS);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
// Written through prettier so the files match what lint-staged would produce.
const writeJson = (file, data) =>
  fs.writeFileSync(
    file,
    require("prettier").format(JSON.stringify(data), { parser: "json" })
  );

const checkId = (id, what = "id") => {
  if (typeof id !== "string" || !ID.test(id))
    throw new Error(`Invalid ${what} "${id}" (use a-z, 0-9 and dashes)`);
  return id;
};

const variantPath = (id) => path.join(VARIANTS_DIR, `${checkId(id)}.json`);

const readVariants = () =>
  fs
    .readdirSync(VARIANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(VARIANTS_DIR, f)));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

// Which saved variants use each entry and each of its bullets, so the UI can
// warn before something in use is edited or deleted.
function usage(library, variants) {
  const byId = new Map(library.entries.map((e) => [e.id, e]));
  const map = {};
  for (const variant of variants) {
    for (const page of variant.pages) {
      for (const refs of Object.values(page)) {
        for (const ref of refs) {
          const id = typeof ref === "string" ? ref : ref.id;
          const use = map[id] || (map[id] = { variants: [], bullets: {} });
          use.variants.push(variant.id);
          const entry = byId.get(id);
          const bullets =
            typeof ref !== "string" && ref.bullets
              ? ref.bullets
              : ((entry && entry.bullets) || []).map((b) => b.id);
          for (const b of bullets) {
            (use.bullets[b] || (use.bullets[b] = [])).push(variant.id);
          }
        }
      }
    }
  }
  return map;
}

function state() {
  const library = readJson(LIBRARY_FILE);
  const variants = readVariants();
  const used = usage(library, variants);
  for (const entry of library.entries) {
    entry.displayDates = formatRange(entry);
  }
  let published = null;
  try {
    published = readJson(path.join(CV_DIR, "published.json")).variant;
  } catch (err) {
    // nothing published yet
  }
  return {
    library,
    sections: SECTION_KINDS,
    timelineKinds: TIMELINE_DEFAULT_KINDS,
    variants: variants.map(({ id, name }) => ({ id, name })),
    published,
    usage: used,
  };
}

function validateVariant(variant) {
  if (!variant || typeof variant !== "object") throw new Error("No variant");
  return resolveVariant(readJson(LIBRARY_FILE), variant);
}

// --- Library entries ---
const optionalString = (entry, key) => {
  const value = entry[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`"${key}" must be text`);
  return value.trim() || undefined;
};

const tagList = (tags, where) => {
  if (tags === undefined) return [];
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
    throw new Error(`${where}: tags must be a list of words`);
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
};

// Returns a clean copy of the entry in the stored field order, or throws.
function cleanEntry(input) {
  if (!input || typeof input !== "object") throw new Error("No entry");
  const id = checkId(input.id, "entry id");
  if (!KINDS.includes(input.kind))
    throw new Error(`Unknown kind "${input.kind}"`);
  const title = optionalString(input, "title");
  if (!title) throw new Error("Title is required");

  const entry = { id, kind: input.kind, title };
  const org = optionalString(input, "org");
  if (org) entry.org = org;
  const category = optionalString(input, "category");
  if (input.kind === "skill") {
    if (!category) throw new Error("Skills need a category");
    entry.category = category;
  }
  const start = optionalString(input, "start");
  if (start) {
    if (!DATE.test(start)) throw new Error('Start must be "YYYY" or "YYYY-MM"');
    entry.start = start;
    const end = optionalString(input, "end");
    if (end && !DATE.test(end))
      throw new Error('End must be "YYYY" or "YYYY-MM"');
    if (end && end < start) throw new Error("End is before start");
    entry.end = end || null;
  } else if (optionalString(input, "end")) {
    throw new Error("An end date needs a start date");
  }
  const details = optionalString(input, "details");
  if (details) entry.details = details;
  const tech = optionalString(input, "tech");
  if (tech) entry.tech = tech;
  // Only stored when it differs from the default for the kind.
  if (
    typeof input.timeline === "boolean" &&
    input.timeline !== TIMELINE_DEFAULT_KINDS.includes(input.kind)
  ) {
    entry.timeline = input.timeline;
  }
  entry.tags = tagList(input.tags, `"${id}"`);

  if (input.bullets !== undefined && input.bullets !== null) {
    if (!Array.isArray(input.bullets))
      throw new Error("Bullets must be a list");
    const seen = new Set();
    entry.bullets = input.bullets.map((b) => {
      const bulletId = checkId(b && b.id, "bullet id");
      if (seen.has(bulletId))
        throw new Error(`Duplicate bullet id "${bulletId}"`);
      seen.add(bulletId);
      const text = optionalString(b, "text");
      if (!text) throw new Error(`Bullet "${bulletId}" has no text`);
      return {
        id: bulletId,
        text,
        tags: tagList(b.tags, `bullet "${bulletId}"`),
      };
    });
    if (!entry.bullets.length) delete entry.bullets;
  }
  return entry;
}

// Refuse changes that would break a saved variant, naming the variant so the
// user can fix it there first.
function checkEntryStillFits(entry, variants) {
  for (const variant of variants) {
    for (const page of variant.pages) {
      for (const [section, refs] of Object.entries(page)) {
        for (const ref of refs) {
          const id = typeof ref === "string" ? ref : ref.id;
          if (id !== entry.id) continue;
          if (SECTION_KINDS[section] !== entry.kind) {
            throw new Error(
              `Variant "${variant.id}" lists "${entry.id}" under ${section}, so it must stay a ${SECTION_KINDS[section]}. Remove it from that variant first.`
            );
          }
          if (typeof ref !== "string" && ref.bullets) {
            const have = new Set((entry.bullets || []).map((b) => b.id));
            const missing = ref.bullets.filter((b) => !have.has(b));
            if (missing.length) {
              throw new Error(
                `Variant "${variant.id}" uses bullet "${missing[0]}" of "${entry.id}". Untick it there before removing it.`
              );
            }
          }
        }
      }
    }
  }
}

const PROFILE_FIELDS = ["name", "location", "phone", "email", "website"];

function saveProfile(input) {
  if (!input || typeof input !== "object") throw new Error("No profile");
  const profile = {};
  for (const key of PROFILE_FIELDS) {
    const value = optionalString(input, key);
    if (value) profile[key] = value;
  }
  for (const key of ["name", "email", "website"]) {
    if (!profile[key]) throw new Error(`Profile ${key} is required`);
  }
  const library = readJson(LIBRARY_FILE);
  library.profile = profile;
  writeJson(LIBRARY_FILE, library);
  return profile;
}

function saveEntry(id, input) {
  const entry = cleanEntry(input);
  if (entry.id !== id) throw new Error("Entry id does not match URL");
  const library = readJson(LIBRARY_FILE);
  checkEntryStillFits(entry, readVariants());
  const index = library.entries.findIndex((e) => e.id === id);
  if (index === -1) library.entries.push(entry);
  else library.entries[index] = entry;
  writeJson(LIBRARY_FILE, library);
  return entry;
}

function deleteEntry(id) {
  checkId(id, "entry id");
  const library = readJson(LIBRARY_FILE);
  const index = library.entries.findIndex((e) => e.id === id);
  if (index === -1) throw new Error(`No entry "${id}"`);
  const users = readVariants()
    .filter((v) =>
      v.pages.some((page) =>
        Object.values(page).some((refs) =>
          refs.some((ref) => (typeof ref === "string" ? ref : ref.id) === id)
        )
      )
    )
    .map((v) => v.id);
  if (users.length) {
    throw new Error(
      `"${id}" is used by variant${users.length > 1 ? "s" : ""} ${users
        .map((v) => `"${v}"`)
        .join(", ")}. Remove it there first.`
    );
  }
  library.entries.splice(index, 1);
  writeJson(LIBRARY_FILE, library);
}

module.exports = function mountCvApi(app) {
  app.use("/__cv", async (req, res) => {
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    // A custom header can't be sent cross-site without a CORS preflight,
    // which we never answer, so other websites can't call this API.
    if (req.headers["x-cv-admin"] !== "1") {
      return send(403, { error: "Missing X-CV-Admin header" });
    }
    try {
      const [, resource, id] = req.url.split("?")[0].split("/");
      const route = `${req.method} ${resource}${id ? "/:id" : ""}`;
      switch (route) {
        case "GET state":
          return send(200, state());
        case "GET variants/:id":
          return send(200, readJson(variantPath(id)));
        case "PUT variants/:id": {
          const variant = await readBody(req);
          if (variant.id !== id)
            throw new Error("Variant id does not match URL");
          validateVariant(variant);
          writeJson(variantPath(id), variant);
          return send(200, { ok: true });
        }
        case "POST preview":
          return send(200, { pages: validateVariant(await readBody(req)) });
        case "POST publish/:id":
          variantPath(id); // validates the id
          return send(200, publish(id));
        case "POST timeline":
          return send(200, { count: publishTimeline().items.length });
        case "PUT profile":
          return send(200, { profile: saveProfile(await readBody(req)) });
        case "PUT entries/:id":
          return send(200, { entry: saveEntry(id, await readBody(req)) });
        case "DELETE entries/:id":
          deleteEntry(id);
          return send(200, { ok: true });
        default:
          send(404, { error: "Not found" });
      }
    } catch (err) {
      send(400, { error: err.message });
    }
  });
};
