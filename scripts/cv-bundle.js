// Builds cv-bundle.json from the JSON files the repo used to keep the CV in
// (cv/library.json, cv/variants/*.json, cv/published.json, ...), in the
// format the dashboard's Import button takes. One-off, for seeding
// Firestore; after that, Export in the dashboard is the backup.
//
// Usage: npm run cv:bundle
const fs = require("fs");
const path = require("path");
const { createFileStore } = require("../functions/cv/store");

const root = path.join(__dirname, "..");

(async () => {
  const store = createFileStore(
    path.join(root, "cv"),
    path.join(root, "src", "data")
  );
  const [library, variants, site] = await Promise.all([
    store.readLibrary(),
    store.listVariants(),
    store.readSite(),
  ]);
  const bundle = {
    exportedAt: new Date().toISOString(),
    library,
    variants,
    site,
  };
  const out = path.join(root, "cv-bundle.json");
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
  console.log(
    `Wrote ${path.relative(process.cwd(), out)}: ${
      library.entries.length
    } entries, ${variants.length} variants`
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
