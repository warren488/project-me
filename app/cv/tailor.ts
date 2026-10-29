import type { SheetFit, Variant } from "./types";
import { MM_PER_LINE } from "./fit";

// The browser side of "Tailor" (functions/cv/tailor.js builds the prompt and
// reads the replies). The dashboard only ever carries text: the prompt out
// to a local model or a chat tool, and the reply back to the server, which
// repairs it against the library.

export interface TailorPrompt {
  system: string;
  user: string;
}

export interface TailorResult {
  variant: Variant;
  suggest: { id: string; why: string } | null;
  why: string;
  dropped: string[]; // ids the model named that the library doesn't have
}

export interface TailorResponse {
  prompt?: TailorPrompt;
  result?: TailorResult;
  provider?: { name: string; model: string };
  error?: string;
}

export interface TailorRequest {
  job?: string;
  notes?: string;
  base?: string;
  previous?: Variant;
  fit?: SheetFit[];
  run?: boolean;
  reply?: string;
}

// How many correction passes the dashboard asks for by itself after the
// first draft, each one measured before the next.
export const MAX_FIT_PASSES = 2;

// A sheet is over when any column would be cut off, and roomy when its main
// column has more than a third of the page free (the last sheet may be).
export const isOver = (fit: SheetFit[]) =>
  fit.some((s) => (s.main?.free ?? 0) < 0 || (s.sidebar?.free ?? 0) < 0);

// One line per sheet, for the panel.
export function describeFit(fit: SheetFit[]): string[] {
  const lines = (mm: number) => {
    const n = Math.max(1, Math.round(Math.abs(mm) / MM_PER_LINE));
    return `≈${n} line${n === 1 ? "" : "s"}`;
  };
  return fit.map((sheet) => {
    const parts: string[] = [];
    for (const column of ["main", "sidebar"] as const) {
      const col = sheet[column];
      if (!col) continue;
      const mm = Math.round(col.free);
      parts.push(
        mm < 0
          ? `${column} cut off by ${-mm}mm (${lines(mm)})`
          : `${column} ${mm}mm free (${lines(mm)})`
      );
    }
    return `Sheet ${sheet.page}: ${parts.join(" · ")}`;
  });
}
