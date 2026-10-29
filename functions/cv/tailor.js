// "Tailor": a model picks what a CV prints for one job description. Like
// condense.js this module is pure, so the same prompt and the same reply
// format serve every way of running it: a provider on the server (ai.js), a
// local model called from the browser, or a prompt pasted into a chat tool.
// The model never writes bullet points: it chooses entries and bullets by id
// from the library, places page breaks, and writes only the CV's own
// headline, summary and a one-line matcher. Its reply is repaired against
// the library (unknown ids dropped) and resolved before it reaches the
// dashboard, where the sheets are measured and the fit is sent back for
// another pass when something would be cut off.
const {
  resolveVariant,
  formatRange,
  SECTION_KINDS,
  ENGAGEMENT_KIND,
  LAYOUTS,
} = require("./publish");

const MAX_JOB_CHARS = 20000;
const MATCHER_MAX = 160;
// Roughly what one line of bullet text takes in the main column, for turning
// measured millimetres into something the model can act on.
const MM_PER_LINE = 6.5;

const plain = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// The summary may keep bold and italics; everything else is stripped.
const inlineOnly = (html) =>
  String(html || "")
    .replace(/<(?!\/?(strong|em|b|i)\b)[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const SYSTEM = `You tailor a software consultant's CV to one job description.
You are given the whole library of CV content (every entry and every bullet point, each with an id), the CVs already on file, and the job. You decide what the CV prints. You never write new bullet points: bullets are only ever chosen by id.

How a CV is built
- A CV is an ordered list of sections, each with an ordered list of entry ids. Sections: experience (jobs), skills, projects, education, competencies, achievements, interests. Most important first.
- A job ref is either its id (prints every bullet and every client engagement in full) or an object: {"id": "...", "bullets": ["bullet ids in print order"], "engagements": {"<engagement id>": {"show": true|false, "bullets": ["ids"]}}}. A hidden engagement ("show": false) with a bullet list prints those bullets under the job itself ("rolled up"); hidden with no list, nothing of it prints. An engagement not named in the map prints in full.
- A bullet list may name an entry's full bullets or its condensed highlights (a highlight stands in for the bullets it was condensed from; never print both).
- A section may set "order": "date" (newest first) or "manual" (the listed order).
- {"break": true} between sections, or between the refs of a section, starts a new printed sheet; a section cut by a break carries on at the top of the next sheet with its heading repeated.
- The "styled" layout is two columns on A4: a dark sidebar (name and contact, then education, competencies, achievements and interests in the listed order) and a main column (summary, then skills, experience and projects in the listed order). The "ats" layout is one plain column that flows across pages by itself and ignores breaks.

Fitting the styled layout (A4 sheets)
- Nothing flows between sheets on its own: everything up to a break lands on one sheet, and anything past the bottom of a column is cut off in print. Place breaks so each sheet is well filled but not overfull, and prefer two sheets.
- Rough capacity of a main column: about 5,500 characters of bullet text on the first sheet (which also carries the summary and a skills block), about 7,000 on later sheets. Each job or client heading costs about as much as a 120-character bullet; a projects block of three cards about 2,000 characters' worth.
- Sidebar on the first sheet: the name block plus about ten items (say 2 education, 6 competencies, 2 achievements); later sheets about 16 items.
- When a reply has been measured you are told how much each column overflows or has spare, in millimetres and lines. Fix overflow by moving a break, dropping the least relevant bullets, or rolling up or hiding an engagement; fill large gaps with the next most relevant bullets.

Rules
- Only use ids given below. Never invent entries, bullets, numbers or technologies.
- Choose by relevance to the job: lead with the experience and skills it asks for, keep every job that matters for continuity (with fewer bullets), and leave out what adds nothing.
- The headline ("title") and "summary" are the CV's own text: write them for this job, in British English and the same voice as the library (no first person), stating only things the library supports. The summary is two or three sentences; plain text, <strong> allowed.
- "matcher": one line, at most 120 characters, naming the kind of role this CV fits, so a similar job can reuse it later.
- If one of the CVs on file already fits this job well, say so in "suggest" (its id and why); otherwise null. Return a CV either way.

Reply with only a JSON object, nothing before or after it:
{"suggest": {"id": "cv id", "why": "..."} | null, "why": "two or three sentences on the choices made", "cv": {"name": "short name for this CV", "title": "headline", "summary": "...", "matcher": "...", "layout": "styled" | "ats", "sections": [{"section": "experience", "order": "date", "refs": [{"id": "...", "bullets": ["..."], "engagements": {"...": {"show": false, "bullets": ["..."]}}}, {"break": true}, "..."]}, {"break": true}, {"section": "skills", "refs": ["..."]}]}}`;

const dateLine = (entry) => {
  const range = entry.displayDates || formatRange(entry);
  return range ? ` (${range})` : "";
};

// One entry as the model reads it, with its bullets and highlights by id.
function describeEntry(entry, indent = "") {
  const lines = [];
  const head = [`${indent}- ${entry.id}: ${plain(entry.title)}`];
  if (entry.org) head.push(` at ${plain(entry.org)}`);
  if (entry.category) head.push(` [${plain(entry.category)}]`);
  head.push(dateLine(entry));
  lines.push(head.join(""));
  const sub = `${indent}  `;
  if (entry.details) lines.push(`${sub}details: ${plain(entry.details)}`);
  if (!entry.details && entry.tagline)
    lines.push(`${sub}tagline: ${plain(entry.tagline)}`);
  if (Array.isArray(entry.tech) && entry.tech.length)
    lines.push(`${sub}tech: ${entry.tech.join(", ")}`);
  if (Array.isArray(entry.tags) && entry.tags.length)
    lines.push(`${sub}tags: ${entry.tags.join(", ")}`);
  if (Array.isArray(entry.bullets) && entry.bullets.length) {
    lines.push(`${sub}bullets:`);
    for (const b of entry.bullets)
      lines.push(`${sub}  - ${b.id}: ${plain(b.text)}`);
  }
  if (Array.isArray(entry.highlights) && entry.highlights.length) {
    lines.push(`${sub}condensed highlights:`);
    for (const h of entry.highlights) {
      const scope = h.for ? `written for CV "${h.for}"` : "general";
      const from =
        Array.isArray(h.from) && h.from.length
          ? `, stands in for ${h.from.join(", ")}`
          : "";
      lines.push(`${sub}  - ${h.id} (${scope}${from}): ${plain(h.text)}`);
    }
  }
  if (entry.notes && plain(entry.notes))
    lines.push(`${sub}private notes (background only, never printed): ${plain(entry.notes)}`);
  return lines;
}

const SECTION_LABELS = {
  experience: "Jobs (section \"experience\")",
  skills: "Skills (section \"skills\"; grouped by category on the CV)",
  projects: "Projects (section \"projects\")",
  education: "Education (section \"education\", sidebar)",
  competencies: "Competencies (section \"competencies\", sidebar)",
  achievements: "Achievements (section \"achievements\", sidebar)",
  interests: "Interests (section \"interests\", sidebar)",
};

// The whole library, grouped by the section each kind prints in, with client
// engagements nested under their job.
function describeLibrary(library) {
  const lines = [];
  const engagements = library.entries.filter((e) => e.kind === ENGAGEMENT_KIND);
  for (const section of Object.keys(SECTION_KINDS)) {
    const kind = SECTION_KINDS[section];
    const entries = library.entries.filter((e) => e.kind === kind);
    if (!entries.length) continue;
    lines.push("");
    lines.push(`## ${SECTION_LABELS[section] || section}`);
    for (const entry of entries) {
      lines.push(...describeEntry(entry));
      if (kind !== "job") continue;
      const own = engagements.filter((e) => e.parent === entry.id);
      if (!own.length) continue;
      lines.push("  client engagements (print under this job):");
      for (const eng of own) lines.push(...describeEntry(eng, "    "));
    }
  }
  return lines;
}

// mm -> "about 3 lines of bullet text"
const asLines = (mm) => {
  const n = Math.max(1, Math.round(Math.abs(mm) / MM_PER_LINE));
  return `about ${n} line${n === 1 ? "" : "s"} of bullet text`;
};

// The dashboard's measurement of a reply's sheets, as sentences:
// [{ page, sidebar: { free }, main: { free } }], free in mm (negative =
// overflow). Only the styled layout is measured.
function describeFit(fit) {
  const lines = [];
  for (const sheet of fit) {
    if (!sheet || typeof sheet !== "object") continue;
    const parts = [];
    for (const column of ["main", "sidebar"]) {
      const col = sheet[column];
      if (!col || typeof col.free !== "number") continue;
      const mm = Math.round(col.free);
      if (mm < 0)
        parts.push(
          `${column} column overflows by ${-mm}mm (${asLines(mm)} cut off)`
        );
      else parts.push(`${column} column has ${mm}mm spare (${asLines(mm)})`);
    }
    if (parts.length) lines.push(`- Sheet ${sheet.page}: ${parts.join("; ")}`);
  }
  return lines;
}

// Builds the prompt. `variants` are the CVs on file (with their matchers),
// `published` says which fills each layout slot, `base` is a CV to start
// from, and `previous` + `fit` ask for a corrected version of an earlier
// reply.
function buildTailorPrompt({
  library,
  variants = [],
  published = {},
  job,
  notes,
  base,
  previous,
  fit,
}) {
  const text = String(job || "").trim();
  if (!text) throw new Error("Paste a job description first");
  const lines = [];
  lines.push("# The job");
  lines.push(text.slice(0, MAX_JOB_CHARS));
  if (notes && String(notes).trim()) {
    lines.push("");
    lines.push("Notes from the author about this application:");
    lines.push(String(notes).trim());
  }

  lines.push("");
  lines.push("# CVs on file");
  if (!variants.length) lines.push("(none yet)");
  for (const v of variants) {
    const slots = Object.keys(published).filter((l) => published[l] === v.id);
    const bits = [
      `- ${v.id}: "${plain(v.name)}"`,
      `headline "${plain(v.title)}"`,
      `layout ${v.layout || "styled"}`,
    ];
    if (v.matcher) bits.push(`fits: ${plain(v.matcher)}`);
    if (slots.length) bits.push(`published on the site (${slots.join(", ")})`);
    lines.push(bits.join("; "));
  }

  if (base) {
    lines.push("");
    lines.push(
      `# Start from CV "${base.id}"${base.name ? ` ("${plain(base.name)}")` : ""}`
    );
    lines.push(
      "Keep its structure and page breaks where they still fit the job; change what the job calls for."
    );
    lines.push(
      JSON.stringify({
        title: base.title,
        summary: base.summary,
        layout: base.layout || "styled",
        sections: base.sections,
      })
    );
  }

  lines.push("");
  lines.push("# Profile");
  lines.push(`Name: ${plain(library.profile && library.profile.name)}`);
  lines.push("");
  lines.push("# Library (choose entries and bullets by id)");
  lines.push(...describeLibrary(library));

  if (previous) {
    lines.push("");
    lines.push("# Your previous answer");
    lines.push(JSON.stringify(previous));
    const measured = Array.isArray(fit) ? describeFit(fit) : [];
    lines.push("");
    lines.push("# Measured fit of that answer, sheet by sheet");
    if (measured.length) lines.push(...measured);
    else lines.push("(not measured)");
    lines.push("");
    lines.push(
      "Revise it so nothing is cut off and no sheet is left mostly empty, keeping its id-only choices otherwise. Return the whole JSON object again."
    );
  }

  lines.push("");
  lines.push("Reply with only the JSON object.");
  return { system: SYSTEM, user: lines.join("\n") };
}

// Reads a model's reply into { suggest, why, cv }. Accepts the JSON object
// we asked for, fenced or not, with text around it.
function parseTailorReply(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error(`The model's reply had no JSON object in it: ${raw.slice(0, 200)}`);
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    throw new Error(`The model's reply was not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object")
    throw new Error("The model's reply was not a JSON object");
  // A bare CV (no wrapper) is accepted too.
  const cv =
    parsed.cv && typeof parsed.cv === "object"
      ? parsed.cv
      : Array.isArray(parsed.sections)
        ? parsed
        : null;
  if (!cv) throw new Error("The model's reply had no CV in it");
  const suggest =
    parsed.suggest && typeof parsed.suggest === "object" && parsed.suggest.id
      ? {
          id: String(parsed.suggest.id),
          why: plain(parsed.suggest.why || ""),
        }
      : null;
  return { suggest, why: plain(parsed.why || ""), cv };
}

const isBreak = (item) =>
  !!item && typeof item === "object" && item.break === true;

const idsOf = (entry) => [
  ...(entry.bullets || []).map((b) => b.id),
  ...(entry.highlights || []).map((h) => h.id),
];

// Turns a model's CV into a variant the library can resolve: unknown
// entries, bullets and engagements are dropped (and listed in `dropped`),
// empty sections and stray breaks go, and the result is resolved to be sure.
function repairVariant(library, cv, { id, name } = {}) {
  if (!cv || typeof cv !== "object") throw new Error("No CV to repair");
  const byId = new Map(library.entries.map((e) => [e.id, e]));
  const dropped = [];
  const variant = {
    id,
    name: plain(cv.name) || name || "Tailored CV",
    title: plain(cv.title),
    sections: [],
  };
  const summary = inlineOnly(cv.summary);
  if (summary) variant.summary = summary;
  const matcher = plain(cv.matcher).slice(0, MATCHER_MAX);
  if (matcher) variant.matcher = matcher;
  variant.layout = LAYOUTS.includes(cv.layout) ? cv.layout : "styled";

  const rawSections = Array.isArray(cv.sections) ? cv.sections : [];
  const seen = new Set();
  const out = [];
  for (const item of rawSections) {
    if (isBreak(item)) {
      out.push({ break: true });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const section = item.section;
    const kind = SECTION_KINDS[section];
    if (!kind) {
      dropped.push(`unknown section "${section}"`);
      continue;
    }
    if (seen.has(section)) {
      dropped.push(`section "${section}" listed twice`);
      continue;
    }
    seen.add(section);
    const refs = [];
    for (const ref of Array.isArray(item.refs) ? item.refs : []) {
      if (isBreak(ref)) {
        refs.push({ break: true });
        continue;
      }
      const refIdValue =
        typeof ref === "string" ? ref : ref && typeof ref === "object" ? ref.id : "";
      const entry = byId.get(refIdValue);
      if (!entry) {
        dropped.push(`unknown entry "${refIdValue}" in ${section}`);
        continue;
      }
      if (entry.kind !== kind) {
        dropped.push(`"${entry.id}" is a ${entry.kind}, not allowed in ${section}`);
        continue;
      }
      if (refs.some((r) => !isBreak(r) && (typeof r === "string" ? r : r.id) === entry.id)) {
        dropped.push(`"${entry.id}" listed twice in ${section}`);
        continue;
      }
      refs.push(repairRef(library, entry, ref, dropped));
    }
    // Stray breaks: none at the edges, none doubled.
    const cleaned = tidyBreaks(refs);
    if (!cleaned.some((r) => !isBreak(r))) {
      dropped.push(`section "${section}" had nothing printable`);
      continue;
    }
    const clean = { section, refs: cleaned };
    if (item.order === "date") clean.order = "date";
    out.push(clean);
  }
  variant.sections = tidyBreaks(out);
  if (!variant.sections.length) throw new Error("The CV came back with no sections");
  resolveVariant(library, variant);
  return { variant, dropped };
}

// A job ref in its smallest form: the id alone when nothing deviates.
function repairRef(library, entry, ref, dropped) {
  if (typeof ref === "string") return ref;
  const own = new Set(idsOf(entry));
  const out = { id: entry.id };
  if (Array.isArray(ref.bullets)) {
    const bullets = [];
    for (const b of ref.bullets) {
      if (own.has(b) && !bullets.includes(b)) bullets.push(b);
      else dropped.push(`unknown bullet "${b}" on "${entry.id}"`);
    }
    if (bullets.length) out.bullets = bullets;
  }
  if (!out.bullets && ref.condensed === true && (entry.highlights || []).length)
    out.condensed = true;
  if (entry.kind === "job" && ref.engagements !== undefined) {
    if (typeof ref.engagements === "boolean") {
      if (ref.engagements === false) out.engagements = false;
    } else if (ref.engagements && typeof ref.engagements === "object") {
      const engagements = library.entries.filter(
        (e) => e.kind === ENGAGEMENT_KIND && e.parent === entry.id
      );
      const map = {};
      for (const [engId, pick] of Object.entries(ref.engagements)) {
        const eng = engagements.find((e) => e.id === engId);
        if (!eng) {
          dropped.push(`"${engId}" is not an engagement of "${entry.id}"`);
          continue;
        }
        if (!pick || typeof pick !== "object") continue;
        const clean = {};
        if (pick.show === false) clean.show = false;
        if (Array.isArray(pick.bullets)) {
          const known = new Set(idsOf(eng));
          const bullets = [];
          for (const b of pick.bullets) {
            if (known.has(b) && !bullets.includes(b)) bullets.push(b);
            else dropped.push(`unknown bullet "${b}" on "${eng.id}"`);
          }
          // A shown engagement with no known bullets prints in full; a
          // hidden one with none prints nothing (the default for hidden).
          if (bullets.length) clean.bullets = bullets;
        }
        if (!clean.bullets && pick.condensed === true && (eng.highlights || []).length)
          clean.condensed = true;
        if (Object.keys(clean).length) map[engId] = clean;
      }
      if (Object.keys(map).length) out.engagements = map;
    }
  }
  return Object.keys(out).length === 1 ? entry.id : out;
}

// No break first or last, and never two in a row.
function tidyBreaks(list) {
  const out = [];
  for (const item of list) {
    if (isBreak(item)) {
      if (!out.length || isBreak(out[out.length - 1])) continue;
      out.push(item);
    } else out.push(item);
  }
  while (out.length && isBreak(out[out.length - 1])) out.pop();
  return out;
}

// A variant id from the CV's name, unique among the ones on file.
function variantIdFor(name, taken = []) {
  const base =
    plain(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "tailored";
  const used = new Set(taken);
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

module.exports = {
  buildTailorPrompt,
  parseTailorReply,
  repairVariant,
  variantIdFor,
  describeFit,
  MATCHER_MAX,
  MM_PER_LINE,
};
