const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, parseProposals, clampCount } = require("./condense");

const job = {
  id: "job-rad",
  kind: "job",
  title: "Senior Engineer",
  org: "RAD",
  displayDates: "Oct 2022 – Present",
};
const eng = {
  id: "eng-ovo",
  kind: "engagement",
  parent: "job-rad",
  title: "OVO Energy",
  displayDates: "Jan 2023 – Jun 2024",
  tech: ["React", "Kotlin"],
  tags: ["energy"],
  notes: "Ask Sam about the <b>numbers</b>",
  bullets: [
    { id: "ovo-led-the", text: "Led the <strong>migration</strong> of 40 services", tags: [] },
    { id: "ovo-cut-build", text: "Cut build times by 60%", tags: [] },
  ],
};

test("buildPrompt names the job, the client, every bullet id and the audience", () => {
  const { system, user, ids, count } = buildPrompt({
    entry: eng,
    job,
    audience: { title: "Frontend lead", summary: "<p>Hands-on <em>lead</em></p>" },
    count: 3,
  });
  assert.match(system, /JSON array/);
  assert.match(user, /Job: Senior Engineer at RAD \(Oct 2022 – Present\)/);
  assert.match(user, /Client engagement: OVO Energy \(Jan 2023 – Jun 2024\)/);
  assert.match(user, /Tech: React, Kotlin/);
  assert.match(user, /- ovo-led-the: Led the migration of 40 services/);
  assert.match(user, /- ovo-cut-build: Cut build times by 60%/);
  assert.match(user, /Ask Sam about the numbers/);
  assert.match(user, /This CV is for: Frontend lead\. Its summary reads: Hands-on lead/);
  assert.match(user, /Write 3 bullets/);
  assert.deepEqual(ids, ["ovo-led-the", "ovo-cut-build"]);
  assert.equal(count, 3);
});

test("buildPrompt treats a job as its own context and clamps the count", () => {
  const { user, count } = buildPrompt({ entry: { ...job, bullets: eng.bullets }, count: 99 });
  assert.match(user, /^Job: Senior Engineer at RAD \(Oct 2022 – Present\)/);
  assert.doesNotMatch(user, /Client engagement/);
  assert.match(user, /general software engineering audience/);
  assert.equal(count, 6);
  assert.equal(clampCount("abc"), 4);
  assert.equal(clampCount(1), 2);
});

test("buildPrompt refuses an entry without bullets", () => {
  assert.throws(() => buildPrompt({ entry: { ...eng, bullets: [] } }), /no bullets/);
});

const ids = ["ovo-led-the", "ovo-cut-build"];

test("parseProposals reads fenced JSON and keeps only known source ids", () => {
  const reply = `Here you go:\n\`\`\`json\n[\n {"text": "Led a 40-service migration, cutting build times by 60%.", "from": ["ovo-led-the", "ovo-cut-build", "made-up"]},\n {"text": "<b>Second</b> point ", "from": []}\n]\n\`\`\``;
  assert.deepEqual(parseProposals(reply, ids), [
    {
      text: "Led a 40-service migration, cutting build times by 60%",
      from: ["ovo-led-the", "ovo-cut-build"],
    },
    { text: "Second point", from: [] },
  ]);
});

test("parseProposals reads bare JSON, including an array of strings", () => {
  assert.deepEqual(parseProposals('["One", "Two"]', ids), [
    { text: "One", from: [] },
    { text: "Two", from: [] },
  ]);
});

test("parseProposals falls back to bullet lines and ignores prose", () => {
  const reply = "Sure, here are three:\n\n- First point.\n* Second point\n3. Third point\nThanks!";
  assert.deepEqual(
    parseProposals(reply, ids).map((p) => p.text),
    ["First point", "Second point", "Third point"]
  );
});

test("parseProposals returns nothing for junk", () => {
  assert.deepEqual(parseProposals("I can't help with that.", ids), []);
  assert.deepEqual(parseProposals("", ids), []);
  assert.deepEqual(parseProposals("[not json", ids), []);
});
