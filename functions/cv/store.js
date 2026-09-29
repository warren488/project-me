// Where the CV data lives. The Cloud Function keeps it in Firestore; a file
// store over JSON files exists for scripts and tests. Both expose the same
// async interface, so publish.js and api.js don't care.
//
//   readLibrary()          { profile, entries }
//   writeLibrary(library)
//   listVariants()         [variant]
//   readVariant(id)        variant (throws when missing)
//   writeVariant(variant)
//   deleteVariant(id)
//   readSite()             { published: { styled, ats }, timeline, projects }
//   updateSite(patch)      merge some of those three keys and write
const fs = require("fs");
const path = require("path");

const emptySite = () => ({
  published: { styled: null, ats: null },
  timeline: null,
  projects: null,
});

// Firestore: cv/library, cvVariants/{id}, and site/content, which the public
// site reads without any SDK: the whole bundle is one JSON string field, so
// the plain REST response needs nothing but JSON.parse.
function createFirestoreStore(db) {
  const library = db.doc("cv/library");
  const variants = db.collection("cvVariants");
  const site = db.doc("site/content");
  const parseSite = (snap) => {
    const data = snap.exists ? snap.data() : null;
    return data && data.json ? JSON.parse(data.json) : emptySite();
  };
  return {
    async readLibrary() {
      const snap = await library.get();
      if (!snap.exists)
        throw new Error("There is no library yet. Import a bundle first.");
      return snap.data();
    },
    async writeLibrary(data) {
      await library.set(data);
    },
    async listVariants() {
      const snap = await variants.orderBy("id").get();
      return snap.docs.map((d) => d.data());
    },
    async readVariant(id) {
      const snap = await variants.doc(id).get();
      if (!snap.exists) throw new Error(`No variant "${id}"`);
      return snap.data();
    },
    async writeVariant(variant) {
      await variants.doc(variant.id).set(variant);
    },
    async deleteVariant(id) {
      await variants.doc(id).delete();
    },
    async readSite() {
      return parseSite(await site.get());
    },
    async updateSite(patch) {
      await db.runTransaction(async (tx) => {
        const next = { ...parseSite(await tx.get(site)), ...patch };
        tx.set(site, {
          json: JSON.stringify(next),
          version: Date.now(),
          publishedAt: new Date().toISOString(),
        });
      });
    },
  };
}

// The JSON files: cvDir/library.json, cvDir/variants/*.json,
// cvDir/published.json, cvDir/timeline.json and dataDir/projects.json.
function createFileStore(cvDir, dataDir) {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const readIf = (file, fallback) =>
    fs.existsSync(file) ? read(file) : fallback;
  const write = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  const files = {
    library: path.join(cvDir, "library.json"),
    published: path.join(cvDir, "published.json"),
    timeline: path.join(cvDir, "timeline.json"),
    projects: path.join(dataDir, "projects.json"),
  };
  const variantsDir = path.join(cvDir, "variants");
  const variantFile = (id) => path.join(variantsDir, `${id}.json`);
  return {
    async readLibrary() {
      return read(files.library);
    },
    async writeLibrary(data) {
      write(files.library, data);
    },
    async listVariants() {
      return fs
        .readdirSync(variantsDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => read(path.join(variantsDir, f)));
    },
    async readVariant(id) {
      if (!fs.existsSync(variantFile(id)))
        throw new Error(`No variant "${id}"`);
      return read(variantFile(id));
    },
    async writeVariant(variant) {
      write(variantFile(variant.id), variant);
    },
    async deleteVariant(id) {
      fs.rmSync(variantFile(id), { force: true });
    },
    async readSite() {
      return {
        published: readIf(files.published, emptySite().published),
        timeline: readIf(files.timeline, null),
        projects: readIf(files.projects, null),
      };
    },
    async updateSite(patch) {
      for (const key of Object.keys(files)) {
        if (key !== "library" && patch[key] !== undefined)
          write(files[key], patch[key]);
      }
    },
  };
}

module.exports = { createFirestoreStore, createFileStore, emptySite };
