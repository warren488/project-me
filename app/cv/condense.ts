import { rowId } from "./ids";
import type { Highlight, LibraryEntry } from "./types";

// The browser side of "Condense". The prompt is built by the server
// (functions/cv/condense.js), which always returns it; this module runs it
// against a local OpenAI-compatible model or reads a pasted reply, with the
// same tolerant parser as the server's.

export interface CondensePrompt {
  system: string;
  user: string;
}

export interface Proposal {
  text: string;
  from: string[];
}

export interface CondenseResponse {
  prompt: CondensePrompt;
  ids: string[];
  count: number;
  proposals?: Proposal[];
  provider?: { name: string; model: string };
  error?: string;
}

export type CondenseMode = "server" | "local" | "paste";

export interface CondenseSettings {
  mode: CondenseMode;
  count: number;
  localUrl: string;
  localModel: string;
}

export const SETTINGS_KEY = "cv-condense";

export const DEFAULT_SETTINGS: CondenseSettings = {
  mode: "server",
  count: 4,
  localUrl: "http://localhost:11434/v1",
  localModel: "",
};

export function loadSettings(): CondenseSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: CondenseSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode, or storage blocked: the dialog just forgets its settings.
  }
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Mirrors parseProposals in functions/cv/condense.js: the JSON array we
// asked for (fenced or not, with text around it), else bullet lines.
export function parseProposals(text: string, ids: string[]): Proposal[] {
  const known = new Set(ids);
  const raw = String(text || "");
  let items: unknown[] | null = null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = null;
    }
  }
  if (!items) {
    const marker = /^\s*(?:[-*•]|\d+[.)])\s+/;
    items = raw
      .split(/\r?\n/)
      .filter((line) => marker.test(line))
      .map((line) => ({ text: line.replace(marker, "").trim() }));
  }
  const out: Proposal[] = [];
  for (const item of items) {
    const obj = item as { text?: unknown; from?: unknown } | string;
    const text =
      typeof obj === "string"
        ? obj
        : obj && typeof obj.text === "string"
          ? obj.text
          : "";
    const clean = plain(text).replace(/[.\s]+$/, "");
    if (!clean) continue;
    const from =
      typeof obj !== "string" && Array.isArray(obj.from)
        ? [
            ...new Set(
              obj.from.filter(
                (f): f is string => typeof f === "string" && known.has(f)
              )
            ),
          ]
        : [];
    out.push({ text: clean, from });
  }
  return out;
}

// Runs the prompt against an OpenAI-compatible endpoint on this machine
// (Ollama, LM Studio). The server needs to allow this page's origin: Ollama
// via OLLAMA_ORIGINS, LM Studio via its CORS switch.
export async function completeLocally(
  prompt: CondensePrompt,
  baseUrl: string,
  model: string
): Promise<string> {
  const root = baseUrl.trim().replace(/\/+$/, "");
  if (!root) throw new Error("Enter the local model's URL");
  if (!model.trim()) throw new Error("Enter the local model's name");
  let res: Response;
  try {
    res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.trim(),
        temperature: 0.4,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });
  } catch {
    throw new Error(
      `Couldn't reach ${root}. Is the model server running, and does it allow requests from ${location.origin}?`
    );
  }
  const body = await res.text();
  if (!res.ok)
    throw new Error(`${root} answered ${res.status}: ${body.slice(0, 300)}`);
  let data: { choices?: { message?: { content?: unknown } }[] };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`${root} did not return JSON`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error(`${root} returned no message content`);
  return content;
}

// The prompt as one block of text, for pasting into a chat tool.
export const promptText = (prompt: CondensePrompt) =>
  `${prompt.system}\n\n---\n\n${prompt.user}`;

// Ids for accepted proposals: like bullet ids, marked `-hl-`, unique across
// the entry's bullets and highlights and among themselves.
export function highlightIds(entry: LibraryEntry, texts: string[]): string[] {
  const taken = new Set([
    ...(entry.bullets ?? []).map((b) => b.id),
    ...(entry.highlights ?? []).map((h) => h.id),
  ]);
  return texts.map((text) => {
    const id = rowId(entry.id, text, "-hl", (candidate) =>
      taken.has(candidate)
    );
    taken.add(id);
    return id;
  });
}

// `taken` holds ids already in use on the entry (the editor's unsaved form
// may hold more than the saved entry does).
export const toHighlights = (
  entry: LibraryEntry,
  proposals: Proposal[],
  forId: string,
  taken: string[] = []
): Highlight[] => {
  const ids = highlightIds(
    {
      ...entry,
      highlights: [
        ...(entry.highlights ?? []),
        ...taken.map((id) => ({ id, text: "" })),
      ],
    },
    proposals.map((p) => p.text)
  );
  return proposals.map((p, i) => {
    const highlight: Highlight = { id: ids[i], text: p.text };
    if (forId) highlight.for = forId;
    if (p.from.length) highlight.from = p.from;
    return highlight;
  });
};
