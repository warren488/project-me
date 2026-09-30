// "Condense": turn an entry's bullets into a few highlight bullets. This
// module is pure so the same prompt and the same result format serve every
// way of running it: a provider on the server (ai.js), a local model called
// from the browser, or a prompt pasted into a chat tool by hand. The
// dashboard's client copy of the parser (app/cv/condense.ts) mirrors it.

const DEFAULT_COUNT = 4;
const MIN_COUNT = 2;
const MAX_COUNT = 6;

const plain = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clampCount = (count) => {
  const n = Number(count);
  if (!Number.isInteger(n)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n));
};

const SYSTEM = `You condense CV bullet points for a software consultant.
You will be given one job or client engagement with its full bullet list, and the CV it is for.
Write the requested number of new bullets that together cover the most engaging talking points for that CV.

Rules:
- Each bullet is one sentence of at most 25 words, leading with the outcome or the responsibility, then how.
- Merge overlapping source bullets into one; drop routine detail.
- Keep the concrete numbers, names of systems and technologies exactly as the sources give them. Never invent facts, numbers or technologies that are not in the sources.
- Use British English and the same voice as the sources (no "I", no first person).
- Plain text only: no HTML, no markdown, no trailing full stops.

Reply with only a JSON array, nothing before or after it. Each item is {"text": "the bullet", "from": ["source bullet ids it draws on"]}.`;

// Builds the prompt for one entry. `job` is the parent job when `entry` is
// an engagement. `audience` is the variant the bullets are for.
function buildPrompt({ entry, job, audience, count }) {
  if (!entry || !Array.isArray(entry.bullets) || !entry.bullets.length)
    throw new Error("That entry has no bullets to condense");
  const n = clampCount(count);
  const ids = entry.bullets.map((b) => b.id);
  const lines = [];

  const range = entry.displayDates || entry.dates;
  if (job) {
    lines.push(
      `Job: ${plain(job.title)}${job.org ? ` at ${plain(job.org)}` : ""}${
        job.displayDates ? ` (${job.displayDates})` : ""
      }`
    );
    lines.push(`Client engagement: ${plain(entry.title)}${range ? ` (${range})` : ""}`);
  } else {
    lines.push(
      `Job: ${plain(entry.title)}${entry.org ? ` at ${plain(entry.org)}` : ""}${
        range ? ` (${range})` : ""
      }`
    );
  }
  if (Array.isArray(entry.tech) && entry.tech.length)
    lines.push(`Tech: ${entry.tech.join(", ")}`);
  if (Array.isArray(entry.tags) && entry.tags.length)
    lines.push(`Tags: ${entry.tags.join(", ")}`);
  lines.push("");
  lines.push("Source bullets (id: text):");
  for (const b of entry.bullets) lines.push(`- ${b.id}: ${plain(b.text)}`);
  if (entry.notes && plain(entry.notes)) {
    lines.push("");
    lines.push(
      "Private notes, for background only (do not quote them, they are not published):"
    );
    lines.push(plain(entry.notes));
  }
  lines.push("");
  const title = audience && plain(audience.title);
  const summary = audience && plain(audience.summary);
  if (title || summary) {
    lines.push(
      `This CV is for: ${title || "a general audience"}${
        summary ? `. Its summary reads: ${summary}` : ""
      }`
    );
  } else {
    lines.push("This CV is for a general software engineering audience.");
  }
  lines.push("");
  lines.push(`Write ${n} bullets. Reply with only the JSON array.`);

  return { system: SYSTEM, user: lines.join("\n"), ids, count: n };
}

// Reads a model's reply into [{ text, from }]. Accepts the JSON array we
// asked for (fenced or not, with text around it), or failing that a list of
// bullet lines. `ids` are the source bullet ids; unknown ones are dropped.
function parseProposals(text, ids = []) {
  const known = new Set(ids);
  const raw = String(text || "");
  let items = null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = null;
    }
  }
  if (!items) {
    // Only lines that look like bullets count; prose around them is ignored.
    const marker = /^\s*(?:[-*•]|\d+[.)])\s+/;
    items = raw
      .split(/\r?\n/)
      .filter((line) => marker.test(line))
      .map((line) => ({ text: line.replace(marker, "").trim() }));
  }
  const out = [];
  for (const item of items) {
    const text =
      typeof item === "string" ? item : item && typeof item.text === "string" ? item.text : "";
    const clean = plain(text).replace(/[.\s]+$/, "");
    if (!clean) continue;
    const from = Array.isArray(item && item.from)
      ? [...new Set(item.from.filter((f) => typeof f === "string" && known.has(f)))]
      : [];
    out.push({ text: clean, from });
  }
  return out;
}

module.exports = {
  buildPrompt,
  parseProposals,
  clampCount,
  DEFAULT_COUNT,
  MIN_COUNT,
  MAX_COUNT,
};
