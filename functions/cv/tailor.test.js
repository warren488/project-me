const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTailorPrompt,
  parseTailorReply,
  repairVariant,
  variantIdFor,
  describeFit,
} = require("./tailor");
const { createHandler } = require("./api");
const { emptySite } = require("./store");

const library = {
  profile: { name: "W", email: "w@example.com", website: "https://x.y" },
  entries: [
    {
      id: "job-rad",
      kind: "job",
      title: "Engineer",
      org: "RAD",
      start: "2022-10",
      end: null,
      tags: ["consulting"],
      bullets: [
        { id: "rad-one", text: "Built <strong>things</strong>", tags: [] },
        { id: "rad-two", text: "Fixed things", tags: [] },
      ],
      highlights: [{ id: "rad-hl-built", text: "Built and fixed", from: ["rad-one", "rad-two"] }],
      notes: "secret background",
    },
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
    { id: "job-old", kind: "job", title: "Dev", org: "Old", start: "2018", end: "2020", tags: [], bullets: [{ id: "old-a", text: "Old A", tags: [] }] },
    { id: "edu-x", kind: "education", title: "BSc", org: "Uni", tags: [] },
    { id: "skill-vue", kind: "skill", title: "Vue", category: "Frontend", tags: [] },
    { id: "proj-site", kind: "project", title: "Site", details: "A site", tech: ["Nuxt"], tags: [] },
  ],
};

const variants = [
  {
    id: "full",
    name: "Full CV",
    title: "Frontend lead",
    summary: "Hands on",
    matcher: "Senior frontend roles",
    sections: [{ section: "experience", refs: ["job-rad", "job-old"] }],
  },
];

test("buildTailorPrompt lists the job, the CVs on file and every id", () => {
  const { system, user } = buildTailorPrompt({
    library,
    variants,
    published: { styled: "full", ats: null },
    job: "We need a Vue engineer",
    notes: "Remote only",
  });
  assert.match(system, /never write new bullet points/i);
  assert.match(user, /We need a Vue engineer/);
  assert.match(user, /Remote only/);
  assert.match(user, /full: "Full CV"; headline "Frontend lead"; layout styled; fits: Senior frontend roles; published on the site \(styled\)/);
  for (const id of ["job-rad", "rad-one", "rad-two", "rad-hl-built", "eng-ovo", "ovo-a", "job-old", "edu-x", "skill-vue", "proj-site"]) {
    assert.ok(user.includes(id), `prompt names ${id}`);
  }
  // Bullet text is plain, highlights say what they stand in for, notes are
  // marked private, engagements sit under their job.
  assert.match(user, /rad-one: Built things/);
  assert.match(user, /rad-hl-built \(general, stands in for rad-one, rad-two\)/);
  assert.match(user, /private notes \(background only, never printed\): secret background/);
  assert.ok(user.indexOf("job-rad") < user.indexOf("client engagements") && user.indexOf("client engagements") < user.indexOf("eng-ovo"));
  assert.match(user, /Oct 2022 – Present/);
});

test("buildTailorPrompt refuses an empty job and includes a base CV and a measured fit", () => {
  assert.throws(() => buildTailorPrompt({ library, variants, job: "  " }), /job description/);
  const previous = { id: "vue-cv", sections: [{ section: "experience", refs: ["job-rad"] }] };
  const { user } = buildTailorPrompt({
    library,
    variants,
    job: "Vue",
    base: variants[0],
    previous,
    fit: [
      { page: 1, main: { free: -14.2 }, sidebar: { free: 40 } },
      { page: 2, main: { free: 120 } },
    ],
  });
  assert.match(user, /Start from CV "full"/);
  assert.match(user, /"sections":\[\{"section":"experience","refs":\["job-rad","job-old"\]\}\]/);
  assert.match(user, /Your previous answer/);
  assert.match(user, /"id":"vue-cv"/);
  assert.match(user, /Sheet 1: main column overflows by 14mm \(about 2 lines of bullet text cut off\); sidebar column has 40mm spare \(about 6 lines of bullet text\)/);
  assert.match(user, /Sheet 2: main column has 120mm spare/);
});

test("describeFit skips columns that were not measured", () => {
  assert.deepEqual(describeFit([{ page: 1 }, null, { page: 2, main: { free: 0 } }]), [
    "- Sheet 2: main column has 0mm spare (about 1 line of bullet text)",
  ]);
});

test("parseTailorReply reads a fenced object, a bare CV, and rejects junk", () => {
  const fenced = 'Here you go:\n```json\n{"suggest": {"id": "full", "why": "close"}, "why": "picked", "cv": {"name": "Vue CV", "sections": []}}\n```';
  const r = parseTailorReply(fenced);
  assert.deepEqual(r.suggest, { id: "full", why: "close" });
  assert.equal(r.why, "picked");
  assert.equal(r.cv.name, "Vue CV");
  const bare = parseTailorReply('{"name": "X", "sections": [{"section": "skills", "refs": ["skill-vue"]}]}');
  assert.equal(bare.suggest, null);
  assert.equal(bare.cv.name, "X");
  assert.throws(() => parseTailorReply("no json here"), /no JSON object/);
  assert.throws(() => parseTailorReply("{not json}"), /not valid JSON/);
  assert.throws(() => parseTailorReply('{"why": "x"}'), /no CV/);
});

test("repairVariant keeps known ids, drops the rest and resolves", () => {
  const cv = {
    name: "Vue CV",
    title: "Vue engineer",
    summary: "Builds <strong>Vue</strong> apps <script>x</script> well",
    matcher: "Vue roles",
    layout: "styled",
    sections: [
      { break: true },
      {
        section: "experience",
        order: "date",
        refs: [
          {
            id: "job-rad",
            bullets: ["rad-hl-built", "nope", "rad-hl-built"],
            engagements: {
              "eng-ovo": { show: false, bullets: ["ovo-a", "zzz"] },
              "eng-none": { show: true },
            },
          },
          { break: true },
          { break: true },
          "job-old",
          "job-old",
          "edu-x",
          { break: true },
        ],
      },
      { section: "experience", refs: ["job-rad"] },
      { section: "bogus", refs: ["job-rad"] },
      { section: "skills", refs: ["skill-nope"] },
      { break: true },
      { section: "education", refs: [{ id: "edu-x", bullets: ["x"] }] },
      { break: true },
    ],
  };
  const { variant, dropped } = repairVariant(library, cv, { id: "vue-cv" });
  assert.deepEqual(variant, {
    id: "vue-cv",
    name: "Vue CV",
    title: "Vue engineer",
    summary: "Builds <strong>Vue</strong> apps x well",
    matcher: "Vue roles",
    layout: "styled",
    sections: [
      {
        section: "experience",
        order: "date",
        refs: [
          {
            id: "job-rad",
            bullets: ["rad-hl-built"],
            engagements: { "eng-ovo": { show: false, bullets: ["ovo-a"] } },
          },
          { break: true },
          "job-old",
        ],
      },
      { break: true },
      { section: "education", refs: ["edu-x"] },
    ],
  });
  assert.deepEqual(dropped, [
    'unknown bullet "nope" on "job-rad"',
    'unknown bullet "rad-hl-built" on "job-rad"',
    'unknown bullet "zzz" on "eng-ovo"',
    '"eng-none" is not an engagement of "job-rad"',
    '"job-old" listed twice in experience',
    '"edu-x" is a education, not allowed in experience',
    'section "experience" listed twice',
    'unknown section "bogus"',
    'unknown entry "skill-nope" in skills',
    'section "skills" had nothing printable',
    'unknown bullet "x" on "edu-x"',
  ]);
});

test("repairVariant defaults the layout, falls back on the name and refuses an empty CV", () => {
  const { variant } = repairVariant(
    library,
    { layout: "fancy", sections: [{ section: "skills", refs: ["skill-vue"] }] },
    { id: "a", name: "Fallback" }
  );
  assert.equal(variant.layout, "styled");
  assert.equal(variant.name, "Fallback");
  assert.equal(variant.summary, undefined);
  assert.throws(() => repairVariant(library, { sections: [] }, { id: "a" }), /no sections/);
  assert.throws(() => repairVariant(library, null, { id: "a" }), /No CV/);
});

test("variantIdFor slugs the name and avoids taken ids", () => {
  assert.equal(variantIdFor("Vue CV · Acme!", []), "vue-cv-acme");
  assert.equal(variantIdFor("Full CV", ["full-cv"]), "full-cv-2");
  assert.equal(variantIdFor("", []), "tailored");
});

// --- The route ---
function memoryStore(lib, vars = []) {
  let site = emptySite();
  const byId = new Map(vars.map((v) => [v.id, v]));
  return {
    readLibrary: async () => JSON.parse(JSON.stringify(lib)),
    writeLibrary: async (next) => {
      lib = next;
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
  };
}

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
    },
  };
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(chunks.join("")) };
}

const reply = JSON.stringify({
  suggest: { id: "full", why: "already close" },
  why: "Led with RAD",
  cv: {
    name: "Vue CV",
    title: "Vue engineer",
    sections: [{ section: "experience", refs: [{ id: "job-rad", bullets: ["rad-one", "ghost"] }] }],
  },
});

test("POST tailor returns the prompt without a provider and 501 when asked to run", async () => {
  const handler = createHandler({ store: memoryStore(library, variants), prefix: "/api/cv" });
  const prompt = await call(handler, "POST", "/api/cv/tailor", { job: "Vue job" });
  assert.equal(prompt.status, 200);
  assert.match(prompt.body.prompt.user, /Vue job/);
  assert.equal(prompt.body.result, undefined);
  const run = await call(handler, "POST", "/api/cv/tailor", { job: "Vue job", run: true });
  assert.equal(run.status, 501);
  assert.match(run.body.error, /No AI provider/);
  assert.ok(run.body.prompt.user);
  const empty = await call(handler, "POST", "/api/cv/tailor", {});
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /job description/);
  const bad = await call(handler, "POST", "/api/cv/tailor", { job: "x", base: "nope" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /No variant "nope"/);
});

test("POST tailor runs the provider and repairs the reply; the state lists matchers", async () => {
  const calls = [];
  const handler = createHandler({
    store: memoryStore(library, variants),
    prefix: "/api/cv",
    provider: () => ({
      name: "fake",
      model: "m",
      complete: async (prompt) => {
        calls.push(prompt);
        return reply;
      },
    }),
  });
  const run = await call(handler, "POST", "/api/cv/tailor", { job: "Vue job", run: true });
  assert.equal(run.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxTokens, 8192);
  assert.equal(calls[0].effort, "medium");
  assert.deepEqual(run.body.result.variant, {
    id: "vue-cv",
    name: "Vue CV",
    title: "Vue engineer",
    layout: "styled",
    sections: [{ section: "experience", refs: [{ id: "job-rad", bullets: ["rad-one"] }] }],
  });
  assert.deepEqual(run.body.result.suggest, { id: "full", why: "already close" });
  assert.deepEqual(run.body.result.dropped, ['unknown bullet "ghost" on "job-rad"']);
  assert.deepEqual(run.body.provider, { name: "fake", model: "m" });

  // A second pass keeps the id and runs at low effort.
  const again = await call(handler, "POST", "/api/cv/tailor", {
    job: "Vue job",
    run: true,
    previous: { ...run.body.result.variant, id: "vue-cv" },
    fit: [{ page: 1, main: { free: -10 } }],
  });
  assert.equal(again.status, 200);
  assert.equal(calls[1].effort, "low");
  assert.match(calls[1].user, /overflows by 10mm/);
  assert.equal(again.body.result.variant.id, "vue-cv");

  const state = await call(handler, "GET", "/api/cv/state");
  assert.deepEqual(state.body.variants, [
    { id: "full", name: "Full CV", layout: "styled", matcher: "Senior frontend roles" },
  ]);
});

test("POST tailor reads a pasted reply and drops a suggestion of an unknown CV", async () => {
  const handler = createHandler({ store: memoryStore(library, variants), prefix: "/api/cv" });
  const pasted = reply.replace('"id":"full"', '"id":"gone"');
  const read = await call(handler, "POST", "/api/cv/tailor", { reply: pasted });
  assert.equal(read.status, 200);
  assert.equal(read.body.result.suggest, null);
  assert.equal(read.body.result.variant.id, "vue-cv");
  // The id is unique among the CVs on file.
  const clash = await call(
    createHandler({ store: memoryStore(library, [{ ...variants[0], id: "vue-cv" }]), prefix: "/api/cv" }),
    "POST",
    "/api/cv/tailor",
    { reply }
  );
  assert.equal(clash.body.result.variant.id, "vue-cv-2");
  const junk = await call(handler, "POST", "/api/cv/tailor", { reply: "nothing" });
  assert.equal(junk.status, 400);
  assert.match(junk.body.error, /no JSON object/);
  // A 502 carries the prompt so the dashboard can fall back.
  const failing = createHandler({
    store: memoryStore(library, variants),
    prefix: "/api/cv",
    provider: () => ({ name: "f", model: "m", complete: async () => "garbage" }),
  });
  const failed = await call(failing, "POST", "/api/cv/tailor", { job: "x", run: true });
  assert.equal(failed.status, 502);
  assert.ok(failed.body.prompt.user);
});
