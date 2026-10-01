import type { InjectionKey, Ref } from "vue";
import type { LineSource } from "./types";

// Editing the CV's text in place, in the dashboard's preview. The CV
// components tag each piece of text with where it comes from; the dashboard
// provides an editor. On the public site nothing is provided and the text
// renders as plain markup.

// The fields of a library entry that print as free text.
export type EntryField = "title" | "org" | "details" | "tagline";

export type TextSource =
  // The CV's own headline and summary.
  | { kind: "variant"; field: "title" | "summary" }
  | { kind: "entry"; entry: string; field: EntryField }
  // A bullet or condensed highlight under `job`. A line with no id is a new
  // one being typed.
  | { kind: "line"; job: string; line: LineSource }
  // Not free text (dates, tech, contact details): a click opens its editor.
  | { kind: "open"; entry: string }
  | { kind: "profile" };

export interface InlineEditor {
  enabled: Readonly<Ref<boolean>>;
  // The text being edited, or null when none is.
  focus(src: TextSource | null): void;
  // The text on screen changed, so the sheets may now overflow.
  typing(): void;
  // Stores the text and returns what is now stored: `raw` cleaned up, or the
  // old text when `raw` can't be used. `exact` skips the cleaning (to put an
  // earlier value back).
  commit(src: TextSource, raw: string, exact?: boolean): string;
  // Starts a new line under this one.
  addAfter(src: TextSource): void;
  open(src: TextSource): void;
}

export const INLINE_EDIT: InjectionKey<InlineEditor> = Symbol("cv-inline-edit");

// Sources for the CV components. An id the page doesn't name (any published
// page) gives no source, and so plain text.
export const CV_TITLE: TextSource = { kind: "variant", field: "title" };
export const CV_SUMMARY: TextSource = { kind: "variant", field: "summary" };
export const PROFILE: TextSource = { kind: "profile" };

export const entryText = (
  entry: string | undefined,
  field: EntryField
): TextSource | undefined =>
  entry ? { kind: "entry", entry, field } : undefined;

export const lineText = (
  job: string | undefined,
  line: LineSource | undefined
): TextSource | undefined =>
  job && line ? { kind: "line", job, line } : undefined;

export const opens = (entry: string | undefined): TextSource | undefined =>
  entry ? { kind: "open", entry } : undefined;
