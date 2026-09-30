const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, cleanEntry } = require("./api");
const { emptySite } = require("./store");

// An in-memory store with the same interface as store.js.
function memoryStore(library, variants = []) {
  let site = emptySite ? emptySite() : { published: {}, timeline: null, projects: [] };
  const byId = new Map(variants.map((v) => [v.id, v]));
  return {
    readLibrary: async () => JSON.parse(JSON.stringify(library)),
    writeLibrary: async (next) => {
      library = next;
    },
    listVariants: async () => [...byId.values()],
    readVariant: async (id) => {
      if (!byId.has(id)) throw new Error(`No variant "${id}"`);
      return byId.get(id);
    },
    writeVariant: async (v) => byId.set(v.id, v),
    deleteVariant: async (id) => byId.delete(id),
    readSite: async () => site,
    updateSite: async (patch) => {
      site = { ...site, ...patch };
    },
    current: () => library,
  };
}

const library = {
  profile: { name: "W", email: "w@example.com", website: "https://x.y" },
  entries: [
    { id: "job-rad", kind: "job", title: "Engineer", org: "RAD", start: "2022-10", end: null, tags: [], bullets: [{ id: "rad-one", text: "Job bullet", tags: [] }] },
    {
      id: "eng-ovo",
      kind: "engagement",
      parent: "job-rad",
      title: "OVO",
      start: "2023-01",
      end: "2024-06",
      tags: ["energy"],
      bullets: [
        { id: "ovo-a", text: "Did A", tags: [] },
        { id: "ovo-b", text: "Did B", tags: [] },
      ],
    },
    { id: "edu-x", kind: "education", title: "BSc", org: "Uni", tags: [] },
  ],
};

async function call(handler, method, path, body) {
  const chunks = [];
  const req = { method, url: path, headers: {}, body };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(data) {
      chunks.push(data);
      this.done = true;
    },
  };
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(chunks.join("")) };
}

test("POST condense/:id returns the prompt without a provider, and 501 when asked to run", async () => {
  const handler = createHandler({ store: memoryStore(library), prefix: "/api/cv" });
  const r = await call(handler, "POST", "/api/cv/condense/eng-ovo", {
    audience: { title: "Frontend lead", summary: "<b>Hands on</b>" },
    count: 3,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ids, ["ovo-a", "ovo-b"]);
  assert.equal(r.body.count, 3);
  assert.match(r.body.prompt.user, /Job: Engineer at RAD \(Oct 2022 – Present\)/);
  assert.match(r.body.prompt.user, /Client engagement: OVO \(Jan 2023 – Jun 2024\)/);
  assert.match(r.body.prompt.user, /Frontend lead\. Its summary reads: Hands on/);
  assert.equal(r.body.proposals, undefined);

  const run = await call(handler, "POST", "/api/cv/condense/eng-ovo", { run: true });
  assert.equal(run.status, 501);
  assert.match(run.body.error, /No AI provider/);
  assert.ok(run.body.prompt.user, "the prompt still comes back");
});

test("POST condense/:id runs the provider and reports its failures as 502", async () => {
  let calls = 0;
  const provider = () => ({
    name: "fake",
    model: "m",
    complete: async ({ user }) => {
      calls++;
      if (calls === 2) throw new Error("boom");
      assert.match(user, /- ovo-a: Did A/);
      return 'Sure:\n```json\n[{"text": "Merged A and B.", "from": ["ovo-a", "ovo-b", "nope"]}]\n```';
    },
  });
  const handler = createHandler({ store: memoryStore(library), prefix: "/api/cv", provider });
  const ok = await call(handler, "POST", "/api/cv/condense/eng-ovo", { run: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.proposals, [{ text: "Merged A and B", from: ["ovo-a", "ovo-b"] }]);
  assert.deepEqual(ok.body.provider, { name: "fake", model: "m" });
  const bad = await call(handler, "POST", "/api/cv/condense/eng-ovo", { run: true });
  assert.equal(bad.status, 502);
  assert.equal(bad.body.error, "boom");
});

test("POST condense/:id rejects entries that can't be condensed", async () => {
  const handler = createHandler({ store: memoryStore(library), prefix: "/api/cv" });
  const edu = await call(handler, "POST", "/api/cv/condense/edu-x", {});
  assert.equal(edu.status, 400);
  assert.match(edu.body.error, /Only jobs and client engagements/);
  const missing = await call(handler, "POST", "/api/cv/condense/nope", {});
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /No entry/);
});

test("cleanEntry keeps highlights, filters `from`, and refuses id clashes", () => {
  const entry = cleanEntry({
    id: "eng-ovo",
    kind: "engagement",
    parent: "job-rad",
    title: "OVO",
    bullets: [{ id: "ovo-a", text: "A" }],
    highlights: [
      { id: "ovo-hl-one", text: " One ", from: ["ovo-a", "other"] },
      { id: "ovo-hl-two", text: "Two" },
    ],
  });
  assert.deepEqual(entry.highlights, [
    { id: "ovo-hl-one", text: "One", from: ["ovo-a"] },
    { id: "ovo-hl-two", text: "Two" },
  ]);
  assert.throws(
    () =>
      cleanEntry({
        id: "eng-ovo",
        kind: "engagement",
        parent: "job-rad",
        title: "OVO",
        bullets: [{ id: "same", text: "A" }],
        highlights: [{ id: "same", text: "B" }],
      }),
    /Duplicate bullet id "same"/
  );
  const none = cleanEntry({ id: "job-x", kind: "job", title: "X", highlights: [] });
  assert.equal(none.highlights, undefined);
});

test("a variant may pick highlights by id; saving the entry keeps them; removing a used one is refused", async () => {
  const variant = {
    id: "full",
    name: "Full",
    title: "Engineer",
    sections: [
      {
        section: "experience",
        refs: [{ id: "job-rad", engagements: { "eng-ovo": { bullets: ["ovo-hl-one"] } } }],
      },
    ],
  };
  const store = memoryStore(JSON.parse(JSON.stringify(library)), [variant]);
  const handler = createHandler({ store, prefix: "/api/cv" });
  const ovo = library.entries[1];
  const withHighlight = {
    ...ovo,
    highlights: [{ id: "ovo-hl-one", text: "One line for OVO", from: ["ovo-a", "ovo-b"] }],
  };
  // The pick names a highlight that doesn't exist yet: the variant is invalid until it does.
  const early = await call(handler, "PUT", "/api/cv/variants/full", variant);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /unknown bullet "ovo-hl-one"/);

  const saved = await call(handler, "PUT", "/api/cv/entries/eng-ovo", withHighlight);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const put = await call(handler, "PUT", "/api/cv/variants/full", variant);
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const preview = await call(handler, "POST", "/api/cv/preview", variant);
  assert.equal(preview.status, 200);
  const job = preview.body.pages[0].experience[0];
  assert.deepEqual(job.details, ["Job bullet"]);
  assert.deepEqual(job.engagements[0].details, ["One line for OVO"]);

  // The timeline never shows highlights.
  const published = await call(handler, "POST", "/api/cv/timeline");
  assert.equal(published.status, 200);
  const site = await store.readSite();
  const item = site.timeline.items.find((i) => i.id === "eng-ovo");
  assert.deepEqual(item.bullets, ["Did A", "Did B"]);

  // Usage reports the highlight under the engagement.
  const state = await call(handler, "GET", "/api/cv/state");
  assert.deepEqual(state.body.usage["eng-ovo"].bullets, { "ovo-hl-one": ["full"] });

  // Re-saving unchanged keeps it; dropping it while used is refused.
  const again = await call(handler, "PUT", "/api/cv/entries/eng-ovo", withHighlight);
  assert.equal(again.status, 200);
  const dropped = await call(handler, "PUT", "/api/cv/entries/eng-ovo", ovo);
  assert.equal(dropped.status, 400);
  assert.match(dropped.body.error, /Variant "full" uses bullet "ovo-hl-one"/);

  // Export carries highlights; import accepts them back.
  const exported = await call(handler, "GET", "/api/cv/export");
  assert.ok(exported.body.library.entries[1].highlights);
  const imported = await call(handler, "POST", "/api/cv/import", exported.body);
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
});
