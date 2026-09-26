// Shape of one rendered CV page, as written to cv/published.json by cv/publish.js.
export interface Education {
  degree: string;
  uni: string;
  dates: string;
  details?: string;
}

export interface Achievement {
  role: string;
  org: string;
  note?: string;
}

// A client engagement under a job (consultancy work), rendered as a sub-block.
export interface Engagement {
  client: string;
  dates?: string;
  details: string[];
}

export interface Experience {
  title: string;
  company: string;
  dates: string;
  details: string[]; // specific items can contain HTML strings like <strong>
  engagements?: Engagement[];
}

export interface Project {
  title: string;
  desc: string;
  tech: string;
}

export interface Interest {
  name: string;
  desc: string;
}

export interface CVPage {
  // Section order on this page, as chosen in the variant.
  sections: SectionName[];
  // Sections that started on an earlier sheet, so their heading is repeated.
  continued?: SectionName[];
  profile: {
    name: string;
    title: string;
    email: string;
    website: string;
    phone?: string; // only when the variant asks for contact details
    location?: string;
    summary?: string;
  };
  education?: Education[];
  competencies?: string[];
  interests?: Interest[];
  achievements?: Achievement[];
  skills?: Record<string, string[]>;
  experience?: Experience[];
  projects?: Project[];
}

// "styled" is the two-column design; "ats" is a plain single column that
// applicant tracking systems can parse.
export type CvLayout = "styled" | "ats";

export interface PublishedCV {
  variant: string;
  layout: CvLayout;
  pages: CVPage[];
}

// cv/published.json: one variant per layout. The site shows the styled one
// and offers either when printing.
export interface PublishedSite {
  styled: PublishedCV | null;
  ats: PublishedCV | null;
}

// One checkpoint on the public timeline (cv/timeline.json).
export interface TimelineItem {
  id: string;
  kind: string;
  title: string;
  org?: string;
  start: string; // "YYYY" or "YYYY-MM"
  end: string | null; // null = present
  dates: string;
  details?: string;
  tech?: string;
  tags: string[];
  bullets?: string[];
  parent?: string; // engagements: the id of the job they sit under
}

export interface PublishedTimeline {
  name: string;
  items: TimelineItem[];
}

// --- Library & variants (cv/library.json, cv/variants/*.json) ---
export interface Profile {
  name: string;
  location?: string;
  phone?: string;
  email: string;
  website: string;
}

export type EntryKind =
  | "job"
  | "engagement" // a client worked with under a job; needs `parent`
  | "education"
  | "project"
  | "achievement"
  | "interest"
  | "competency"
  | "skill";

export interface Bullet {
  id: string;
  text: string;
  tags: string[];
}

export interface LibraryEntry {
  id: string;
  kind: EntryKind;
  title: string;
  org?: string;
  category?: string; // skills only
  parent?: string; // engagements only: the job id
  start?: string; // "YYYY" or "YYYY-MM"
  end?: string | null; // null = present
  details?: string;
  tech?: string;
  timeline?: boolean; // override the per-kind default for the public timeline
  tags: string[];
  bullets?: Bullet[];
  displayDates?: string; // added by the dev API, not stored
}

export type SectionName =
  | "education"
  | "competencies"
  | "achievements"
  | "interests"
  | "skills"
  | "experience"
  | "projects";

// Sections that render in the sidebar of the styled layout.
export const SIDEBAR_SECTIONS: SectionName[] = [
  "education",
  "competencies",
  "achievements",
  "interests",
];

// "entry-id" = include every bullet; object form picks specific bullets.
// `engagements: false` leaves a job's client engagements out.
export type VariantRef =
  | string
  | { id: string; bullets?: string[]; engagements?: boolean };

// A page break: between sections, or between refs of a main-column section.
export interface PageBreak {
  break: true;
}

export const isBreak = (item: unknown): item is PageBreak =>
  typeof item === "object" &&
  item !== null &&
  (item as PageBreak).break === true;

export type SectionOrder = "manual" | "date";

export interface VariantSection {
  section: SectionName;
  order?: SectionOrder; // "date" = newest first (default manual)
  refs: (VariantRef | PageBreak)[];
}

export type VariantItem = VariantSection | PageBreak;

// One ordered list of sections, most important first. Page breaks cut it
// into printed sheets; on screen it is one continuous document.
export interface Variant {
  id: string;
  name: string;
  title: string;
  summary?: string;
  layout?: CvLayout; // default "styled"
  contact?: boolean; // include phone and location (for PDFs, not the site)
  sections: VariantItem[];
}

// Which saved variants reference an entry, and each of its bullets. Built by
// the dev API for the /admin dashboard.
export interface EntryUsage {
  variants: string[];
  bullets: Record<string, string[]>;
}
