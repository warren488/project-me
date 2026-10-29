import type { SheetFit } from "./types";

// Measures how the styled CV's A4 sheets are filled, in the dashboard's
// preview. Each sheet is a grid of a sidebar and a main column, both as tall
// as the sheet; their content may run past the bottom, where the sheet clips
// it (and print cuts it off). Everything is read from bounding rectangles,
// which the preview's CSS zoom scales alike, and turned into millimetres
// against the sheet's own height.

const A4_MM = 297;
// The columns' bottom padding (--space-lg, 40px on a 1122px-tall sheet).
const COLUMN_PADDING_MM = 10.6;
// Roughly one line of bullet text in the main column.
export const MM_PER_LINE = 6.5;

function columnFree(column: Element | null, sheet: DOMRect, mmPerPx: number) {
  if (!column) return undefined;
  const rect = column.getBoundingClientRect();
  let bottom = rect.top;
  for (const child of column.children) {
    const r = child.getBoundingClientRect();
    if (r.bottom > bottom) bottom = r.bottom;
  }
  const free = (sheet.bottom - bottom) * mmPerPx - COLUMN_PADDING_MM;
  return { free: Math.round(free * 10) / 10 };
}

// `sheets` are the printed sheets (.cv-sheets .cv-page) in order.
export function measureSheets(sheets: Iterable<HTMLElement>): SheetFit[] {
  const out: SheetFit[] = [];
  let page = 0;
  for (const el of sheets) {
    page++;
    const sheet = el.getBoundingClientRect();
    if (!sheet.height) continue;
    const mmPerPx = A4_MM / sheet.height;
    const fit: SheetFit = { page };
    const sidebar = columnFree(el.querySelector(".sidebar"), sheet, mmPerPx);
    const main = columnFree(el.querySelector(".main-content"), sheet, mmPerPx);
    if (sidebar) fit.sidebar = sidebar;
    if (main) fit.main = main;
    out.push(fit);
  }
  return out;
}

// The old per-sheet overflow figure, for the warnings above the layout.
export const overflowOf = (fit: SheetFit[]) =>
  fit
    .map((s) => ({
      page: s.page,
      mm: Math.round(-Math.min(s.main?.free ?? 0, s.sidebar?.free ?? 0)),
    }))
    .filter((o) => o.mm > 0);
