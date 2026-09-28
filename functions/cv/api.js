// The API behind the CV dashboard. createHandler() returns a plain
// (req, res) function: the Cloud Function in ../index.js mounts it with a
// Firestore store and Firebase Auth; a script can mount it with a file store
// and no auth. Everything the site can show is written by publish.js; this
// module only decides what is stored.
const {
  resolveVariant,
  eachRef,
  publish,
  publishSiteData,
  readPublished,
  checkEngagements,
  refId,
  engagementPick,
  formatRange,
  SECTION_KINDS,
  SIDEBAR_SECTIONS,
  SITE_DEFAULTS,
  TIMELINE_DEFAULT_KINDS,
  KINDS,
  ENGAGEMENT_KIND,
  PROJECT_STATUSES,
  PROJECT_HOMES,
} = require("./publish");

const ID = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const HTTP_URL = /^https?:\/\/\S+$/;

const engagementsOf = (library, jobId) =>
  library.entries.filter(
    (e) => e.kind === ENGAGEMENT_KIND && e.parent === jobId
  );

const checkId = (id, what = "id") => {
  if (typeof id !== "string" || !ID.test(id))
    throw new Error(`Invalid ${what} "${id}" (use a-z, 0-9 and dashes)`);
  return id;
};

// Express (in the Cloud Function) has already parsed a JSON body; a bare
// Node server hasn't.
function readBody(req) {
  if (req.body !== undefined && typeof req.body === "object") {
    return Promise.resolve(req.body || {});
  }
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2e6) reject(new Error("Request body too large"));
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
  const record = (variantId, entry, bulletIds) => {
    const use =
      map[entry.id] || (map[entry.id] = { variants: [], bullets: {} });
    if (!use.variants.includes(variantId)) use.variants.push(variantId);
    const ids = bulletIds || (entry.bullets || []).map((b) => b.id);
    for (const b of ids) {
      (use.bullets[b] || (use.bullets[b] = [])).push(variantId);
    }
  };
  for (const variant of variants) {
    eachRef(variant, (ref) => {
      const id = refId(ref);
      const entry = byId.get(id) || { id };
      record(variant.id, entry, typeof ref !== "string" ? ref.bullets : null);
      // Engagements ride along with their job: shown, rolled up, or at least
      // configured in the ref.
      if (entry.kind !== "job") return;
      const picks =
        typeof ref !== "string" && ref.engagements
          ? typeof ref.engagements === "object"
            ? ref.engagements
            : {}
          : {};
      for (const eng of engagementsOf(library, id)) {
        const pick = engagementPick(ref, eng.id);
        if (pick.show || (pick.bullets && pick.bullets.length) || picks[eng.id])
          record(variant.id, eng, pick.bullets);
      }
    });
  }
  return map;
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
  if (input.kind === ENGAGEMENT_KIND) {
    const parent = optionalString(input, "parent");
    if (!parent) throw new Error("An engagement needs a parent job");
    entry.parent = checkId(parent, "parent");
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
  if (input.kind === "project") cleanProject(input, entry);
  // Surfaces. Only stored when they differ from the default for the kind.
  if (
    typeof input.timeline === "boolean" &&
    input.timeline !== TIMELINE_DEFAULT_KINDS.includes(input.kind)
  ) {
    entry.timeline = input.timeline;
  }
  if (entry.start && input.recent === false) entry.recent = false;
  entry.tags = tagList(input.tags, `"${id}"`);
  // Private scratch notes: kept in the library, never published.
  const notes = optionalString(input, "notes");
  if (notes) entry.notes = notes;

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
      const bullet = {
        id: bulletId,
        text,
        tags: tagList(b.tags, `bullet "${bulletId}"`),
      };
      if (b.timeline === false) bullet.timeline = false;
      return bullet;
    });
    if (!entry.bullets.length) delete entry.bullets;
  }
  return entry;
}

// The site's project card fields. `tech` is a list (a legacy string is split
// on bullets or commas). Anything shown on the home page needs the full card.
function cleanProject(input, entry) {
  let tech = input.tech;
  if (typeof tech === "string") tech = tech.split(/\s*[•|,]\s*/);
  if (tech !== undefined && tech !== null) {
    if (!Array.isArray(tech) || tech.some((t) => typeof t !== "string"))
      throw new Error("Tech must be a list");
    tech = [...new Set(tech.map((t) => t.trim()).filter(Boolean))];
    if (tech.length) entry.tech = tech;
  }
  const tagline = optionalString(input, "tagline");
  if (tagline) entry.tagline = tagline;
  const description = optionalString(input, "description");
  if (description) entry.description = description;
  if (input.year !== undefined && input.year !== null && input.year !== "") {
    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100)
      throw new Error("Year must be a four-digit year");
    entry.year = year;
  }
  const status = optionalString(input, "status");
  if (status) {
    if (!PROJECT_STATUSES.includes(status))
      throw new Error(`Unknown status "${status}"`);
    entry.status = status;
  }
  if (input.links && typeof input.links === "object") {
    const links = {};
    for (const key of ["live", "source"]) {
      const url = optionalString(input.links, key);
      if (!url) continue;
      if (!HTTP_URL.test(url)) throw new Error(`The ${key} link must be a URL`);
      links[key] = url;
    }
    if (Object.keys(links).length) entry.links = links;
  }
  const home = optionalString(input, "home") || "hidden";
  if (!PROJECT_HOMES.includes(home))
    throw new Error(`Unknown home placement "${home}"`);
  if (home !== "hidden") {
    for (const field of ["tagline", "description", "year", "status"]) {
      if (entry[field] === undefined)
        throw new Error(
          `A project shown on the home page needs a ${field} (or set it to hidden)`
        );
    }
    entry.home = home;
  }
}

// Refuse changes that would break a saved variant, naming the variant so the
// user can fix it there first.
function checkEntryStillFits(entry, variants) {
  const have = new Set((entry.bullets || []).map((b) => b.id));
  const checkBullets = (variant, ids) => {
    const missing = (ids || []).filter((b) => !have.has(b));
    if (missing.length) {
      throw new Error(
        `Variant "${variant.id}" uses bullet "${missing[0]}" of "${entry.id}". Untick it there before removing it.`
      );
    }
  };
  for (const variant of variants) {
    eachRef(variant, (ref, section) => {
      const id = refId(ref);
      // An engagement configured under a job in a variant must stay there.
      const picks =
        typeof ref !== "string" && typeof ref.engagements === "object"
          ? ref.engagements
          : null;
      if (picks && picks[entry.id]) {
        if (entry.kind !== ENGAGEMENT_KIND || entry.parent !== id) {
          throw new Error(
            `Variant "${variant.id}" configures "${entry.id}" under "${id}". Untick it there first.`
          );
        }
        checkBullets(variant, picks[entry.id].bullets);
      }
      if (id !== entry.id) return;
      if (SECTION_KINDS[section] !== entry.kind) {
        throw new Error(
          `Variant "${variant.id}" lists "${entry.id}" under ${section}, so it must stay a ${SECTION_KINDS[section]}. Remove it from that variant first.`
        );
      }
      if (typeof ref !== "string") checkBullets(variant, ref.bullets);
    });
  }
}

const PROFILE_FIELDS = ["name", "location", "phone", "email", "website"];

function cleanProfile(input) {
  if (!input || typeof input !== "object") throw new Error("No profile");
  const profile = {};
  for (const key of PROFILE_FIELDS) {
    const value = optionalString(input, key);
    if (value) profile[key] = value;
  }
  for (const key of ["name", "email", "website"]) {
    if (!profile[key]) throw new Error(`Profile ${key} is required`);
  }
  return profile;
}

// --- Everything that touches a store ---
function createHandler({ store, authorize, prefix = "" }) {
  async function state() {
    const [library, variants, site] = await Promise.all([
      store.readLibrary(),
      store.listVariants(),
      readPublished(store),
    ]);
    const used = usage(library, variants);
    for (const entry of library.entries) {
      entry.displayDates = formatRange(entry);
    }
    return {
      library,
      sections: SECTION_KINDS,
      sidebarSections: SIDEBAR_SECTIONS,
      timelineKinds: TIMELINE_DEFAULT_KINDS,
      variants: variants.map(({ id, name, layout }) => ({
        id,
        name,
        layout: layout || "styled",
      })),
      // Which variant fills each layout slot on the site.
      published: {
        styled: site.styled ? site.styled.variant : null,
        ats: site.ats ? site.ats.variant : null,
      },
      usage: used,
    };
  }

  async function validateVariant(variant) {
    if (!variant || typeof variant !== "object") throw new Error("No variant");
    return resolveVariant(await store.readLibrary(), variant);
  }

  async function saveProfile(input) {
    const profile = cleanProfile(input);
    const library = await store.readLibrary();
    library.profile = profile;
    await store.writeLibrary(library);
    await publishSiteData(store);
    return profile;
  }

  async function saveEntry(id, input) {
    const entry = cleanEntry(input);
    if (entry.id !== id) throw new Error("Entry id does not match URL");
    const [library, variants] = await Promise.all([
      store.readLibrary(),
      store.listVariants(),
    ]);
    checkEntryStillFits(entry, variants);
    if (entry.kind === ENGAGEMENT_KIND) {
      const parent = library.entries.find((e) => e.id === entry.parent);
      if (!parent || parent.kind !== "job")
        throw new Error(
          `"${entry.parent}" is not a job, so it can't be the parent`
        );
      if (parent.id === entry.id)
        throw new Error("An engagement can't be its own parent");
    }
    const index = library.entries.findIndex((e) => e.id === id);
    if (index === -1) library.entries.push(entry);
    else library.entries[index] = entry;
    await store.writeLibrary(library);
    // The timeline and project cards need no selection step, so keep them in
    // sync automatically.
    await publishSiteData(store);
    return entry;
  }

  async function deleteEntry(id) {
    checkId(id, "entry id");
    const [library, variants] = await Promise.all([
      store.readLibrary(),
      store.listVariants(),
    ]);
    const index = library.entries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error(`No entry "${id}"`);
    const clients = engagementsOf(library, id);
    if (clients.length)
      throw new Error(
        `"${id}" still has engagements under it (${clients
          .map((e) => e.id)
          .join(", ")}). Move or delete those first.`
      );
    const users = (usage(library, variants)[id] || {}).variants || [];
    if (users.length) {
      throw new Error(
        `"${id}" is used by variant${users.length > 1 ? "s" : ""} ${users
          .map((v) => `"${v}"`)
          .join(", ")}. Remove it there first.`
      );
    }
    library.entries.splice(index, 1);
    await store.writeLibrary(library);
    await publishSiteData(store);
  }

  // A bundle is a backup of everything editable: the library, the variants,
  // and (informationally) the site output. Import replaces the lot, then
  // regenerates the site output from the imported data.
  async function exportBundle() {
    const [library, variants, site] = await Promise.all([
      store.readLibrary(),
      store.listVariants(),
      store.readSite(),
    ]);
    return { exportedAt: new Date().toISOString(), library, variants, site };
  }

  async function importBundle(bundle) {
    if (!bundle || typeof bundle !== "object") throw new Error("No bundle");
    const { library, variants, site } = bundle;
    if (!library || !Array.isArray(library.entries))
      throw new Error("The bundle needs a library with an entries list");
    if (!Array.isArray(variants))
      throw new Error("The bundle needs a variants list");
    // Validate everything before writing anything.
    const clean = {
      profile: cleanProfile(library.profile),
      entries: library.entries.map(cleanEntry),
    };
    const ids = new Set();
    for (const entry of clean.entries) {
      if (ids.has(entry.id))
        throw new Error(`Duplicate entry id "${entry.id}"`);
      ids.add(entry.id);
    }
    checkEngagements(clean);
    for (const variant of variants) {
      if (!variant || typeof variant !== "object")
        throw new Error("Bad variant");
      checkId(variant.id, "variant id");
      resolveVariant(clean, variant);
    }
    await store.writeLibrary(clean);
    for (const existing of await store.listVariants()) {
      if (!variants.some((v) => v.id === existing.id))
        await store.deleteVariant(existing.id);
    }
    for (const variant of variants) await store.writeVariant(variant);
    // Republish the same variants the old site showed, else the defaults.
    const wanted = ["styled", "ats"]
      .map((l) => site && site.published && site.published[l])
      .filter(Boolean)
      .map((cv) => cv.variant);
    const publishIds = (wanted.length ? wanted : SITE_DEFAULTS).filter((id) =>
      variants.some((v) => v.id === id)
    );
    if (publishIds.length) await publish(store, publishIds);
    else await publishSiteData(store);
    return { entries: clean.entries.length, variants: variants.length };
  }

  return async function handle(req, res) {
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(data));
    };
    try {
      if (authorize) {
        const denied = await authorize(req);
        if (denied) return send(denied.status, { error: denied.error });
      }
      let pathname = new URL(req.url, "http://localhost").pathname;
      if (prefix && pathname.startsWith(prefix))
        pathname = pathname.slice(prefix.length);
      const [resource, id] = pathname.split("/").filter(Boolean);
      const route = `${req.method} ${resource}${id ? "/:id" : ""}`;
      switch (route) {
        case "GET state":
          return send(200, await state());
        case "GET variants/:id":
          return send(200, await store.readVariant(checkId(id)));
        case "PUT variants/:id": {
          const variant = await readBody(req);
          if (variant.id !== checkId(id))
            throw new Error("Variant id does not match URL");
          await validateVariant(variant);
          await store.writeVariant(variant);
          return send(200, { ok: true });
        }
        case "POST preview":
          return send(200, {
            pages: await validateVariant(await readBody(req)),
          });
        case "POST publish/:id":
          return send(200, await publish(store, checkId(id)));
        case "POST timeline":
          return send(200, await publishSiteData(store));
        case "PUT profile":
          return send(200, { profile: await saveProfile(await readBody(req)) });
        case "PUT entries/:id":
          return send(200, { entry: await saveEntry(id, await readBody(req)) });
        case "DELETE entries/:id":
          await deleteEntry(id);
          return send(200, { ok: true });
        case "GET export":
          return send(200, await exportBundle());
        case "POST import":
          return send(200, await importBundle(await readBody(req)));
        default:
          return send(404, { error: "Not found" });
      }
    } catch (err) {
      send(400, { error: err.message });
    }
  };
}

module.exports = { createHandler, cleanEntry, cleanProfile, usage };
