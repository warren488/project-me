<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  toRaw,
  watch,
} from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { api, ApiError } from "@/cv/api";
import { useAuth } from "@/composables/useAuth";
import {
  addBullet,
  addHighlight,
  cleanHtml,
  cleanText,
  copyHighlight,
  findLine,
  forkGeneral,
  insertAfter,
  lineLists,
  setField,
  setLine,
} from "@/cv/drafts";
import { INLINE_EDIT } from "@/cv/inlineEdit";
import type { TextSource } from "@/cv/inlineEdit";
import { sortRefsByDate } from "@/cv/order";
import {
  engagementPick,
  normalizeRef,
  refId,
  withBullets,
  withEngagement,
} from "@/cv/refs";
import CvAtsDocument from "@/components/CvAtsDocument.vue";
import CvDocument from "@/components/CvDocument.vue";
import EntryEditor from "@/components/EntryEditor.vue";
import LibraryList from "@/components/LibraryList.vue";
import VariantSectionEditor from "@/components/VariantSectionEditor.vue";
import type {
  CVPage,
  EntryKind,
  EntryUsage,
  LibraryEntry,
  LineSource,
  PageBreak,
  Profile,
  SectionName,
  SectionOrder,
  Variant,
  VariantRef,
  VariantSection,
  CvLayout,
} from "@/cv/types";
import { isBreak, SIDEBAR_SECTIONS } from "@/cv/types";

interface State {
  library: { profile: Profile; entries: LibraryEntry[] };
  sections: Record<SectionName, EntryKind>;
  timelineKinds: string[];
  variants: { id: string; name: string; layout: CvLayout }[];
  published: Record<CvLayout, string | null>;
  usage: Record<string, EntryUsage>;
}

interface Placement {
  item: number; // index in variant.sections
  section: SectionName;
  index: number; // index in that section's refs
  ref: VariantRef;
}

const BREAK: PageBreak = { break: true };

const SECTION_LABELS: Record<SectionName, string> = {
  education: "Education",
  competencies: "Competencies",
  achievements: "Achievements",
  interests: "Interests",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
};

// Sign-in. The API answers 401/403 for anyone but the allow-listed account,
// which puts the sign-in card back with the reason.
usePageMeta("admin");
const { user, checked: authChecked, email, signIn, signOut } = useAuth();
const denied = ref("");

const state = ref<State | null>(null);
const variant = ref<Variant | null>(null);
const savedSnapshot = ref(""); // "" = variant has never been saved
const busy = ref(false);
const status = ref("");
const error = ref("");

// Which workspace is open: the Library (content) or the CVs (what each
// prints). Remembered per browser.
const WORKSPACE_KEY = "cv-admin-workspace";
const workspace = ref<"library" | "cvs">("library");
watch(workspace, (w) => localStorage.setItem(WORKSPACE_KEY, w));
const showPreview = ref(false); // hidden by default; it still renders offscreen
// "light" is the plain dashboard; "site" borrows the site's colours and type.
const THEME_KEY = "cv-admin-theme";
const theme = ref<"light" | "site">("light"); // read from storage on mount
function toggleTheme() {
  theme.value = theme.value === "site" ? "light" : "site";
  localStorage.setItem(THEME_KEY, theme.value);
}
const zoom = ref(0.6);
const paged = ref(true); // preview as A4 sheets so overflow is visible

// Entries whose text was edited in the preview and not saved yet, by id.
// They stand in for the saved ones everywhere in the dashboard.
const drafts = ref(new Map<string, LibraryEntry>());
const savedEntries = computed(() => state.value?.library.entries ?? []);
const entries = computed(() =>
  savedEntries.value.map((e) => drafts.value.get(e.id) ?? e)
);
const byId = computed(() => new Map(entries.value.map((e) => [e.id, e])));
const variantNames = computed(
  () => new Map((state.value?.variants ?? []).map((v) => [v.id, v.name]))
);
const sectionForKind = computed(() => {
  const map = {} as Record<EntryKind, SectionName>;
  for (const [section, kind] of Object.entries(state.value?.sections ?? {})) {
    map[kind as EntryKind] = section as SectionName;
  }
  return map;
});
const dirty = computed(
  () =>
    !!variant.value &&
    (JSON.stringify(variant.value) !== savedSnapshot.value ||
      drafts.value.size > 0 ||
      !!newLine.value)
);

// Where each selected entry currently sits in the variant.
const placement = computed(() => {
  const map = new Map<string, Placement>();
  variant.value?.sections.forEach((item, i) => {
    if (isBreak(item)) return;
    item.refs.forEach((ref, index) => {
      if (!isBreak(ref)) {
        map.set(refId(ref), { item: i, section: item.section, index, ref });
      }
    });
  });
  return map;
});

// Which printed sheet each section item / ref lands on (1-based), for labels.
const sheetOf = computed(() => {
  const map = new Map<string, number>(); // key: `${item}` or `${item}/${index}`
  let sheet = 1;
  variant.value?.sections.forEach((item, i) => {
    if (isBreak(item)) {
      sheet++;
      return;
    }
    map.set(`${i}`, sheet);
    item.refs.forEach((ref, index) => {
      if (isBreak(ref)) {
        sheet++;
        return;
      }
      map.set(`${i}/${index}`, sheet);
    });
  });
  return map;
});

const sheetCount = computed(
  () => (variant.value ? preview.value.length : 0) || 1
);

// --- Editing the selection ---
const sectionItem = (i: number) =>
  variant.value?.sections[i] as VariantSection | undefined;

function removeRef(id: string) {
  const at = placement.value.get(id);
  const item = at && sectionItem(at.item);
  if (!at || !item || !variant.value) return;
  const [removed] = item.refs.splice(at.index, 1);
  // Drop a section with no entries left (breaks inside it go too), so the
  // CV doesn't render an empty heading.
  if (!item.refs.some((r) => !isBreak(r))) {
    variant.value.sections.splice(at.item, 1);
  }
  return removed as VariantRef;
}

// Appends to the entry's section, creating the section at the end of the
// list if the variant doesn't have it yet.
function addRef(ref: VariantRef) {
  const entry = byId.value.get(refId(ref));
  if (!entry || !variant.value) return;
  const section = sectionForKind.value[entry.kind];
  // Engagements have no section of their own: they render under their job.
  if (!section) return;
  let item = variant.value.sections.find(
    (s): s is VariantSection => !isBreak(s) && s.section === section
  );
  if (!item) {
    item = { section, refs: [] };
    variant.value.sections.push(item);
  }
  item.refs.push(ref);
  if (item.order === "date") sortRefsByDate(item.refs, byId.value);
}

// Date-ordered sections are kept sorted in the stored list too, so the Layout
// tab shows exactly the order that prints and page breaks land where shown.
function setOrder(i: number, order: SectionOrder) {
  const item = sectionItem(i);
  if (!item) return;
  if (order === "manual") delete item.order;
  else {
    item.order = order;
    sortRefsByDate(item.refs, byId.value);
  }
}

// Swap with a neighbour. Moving an entry past a page break moves it to the
// other sheet; moving a section past a break does the same for the section.
function swap<T>(list: T[] | undefined, index: number, by: number) {
  const to = index + by;
  if (!list || to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
}
const moveSection = (i: number, by: number) =>
  swap(variant.value?.sections, i, by);
const moveRef = (i: number, index: number, by: number) =>
  swap(sectionItem(i)?.refs, index, by);

// Page breaks: between sections, or after a ref inside a section.
function breakAfterSection(i: number) {
  variant.value?.sections.splice(i + 1, 0, { ...BREAK });
}
function breakAfterRef(i: number, index: number) {
  sectionItem(i)?.refs.splice(index + 1, 0, { ...BREAK });
}
function removeSectionBreak(i: number) {
  variant.value?.sections.splice(i, 1);
}
function removeRefBreak(i: number, index: number) {
  sectionItem(i)?.refs.splice(index, 1);
}
const isSidebar = (section: SectionName) => SIDEBAR_SECTIONS.includes(section);

// --- Two-column layout view (styled variants) ---
// Groups the list into sheets separated by section-level breaks; each group
// lists the indices of its sidebar and main sections.
interface LayoutGroup {
  breakIndex?: number; // the break that starts this group, if any
  sidebar: number[];
  main: number[];
}
const layoutGroups = computed<LayoutGroup[]>(() => {
  const groups: LayoutGroup[] = [{ sidebar: [], main: [] }];
  variant.value?.sections.forEach((item, i) => {
    if (isBreak(item)) {
      groups.push({ breakIndex: i, sidebar: [], main: [] });
      return;
    }
    const group = groups[groups.length - 1];
    (isSidebar(item.section) ? group.sidebar : group.main).push(i);
  });
  return groups;
});

// In the two-column view a section moves within its own column: it steps
// over the nearest preceding/following section of the same column, or a
// page break (which moves it to the other sheet).
function columnTarget(i: number, by: number) {
  const list = variant.value?.sections;
  const me = list?.[i];
  if (!list || !me || isBreak(me)) return -1;
  for (let j = i + by; j >= 0 && j < list.length; j += by) {
    const it = list[j];
    if (isBreak(it) || isSidebar(it.section) === isSidebar(me.section)) {
      return j;
    }
  }
  return -1;
}
function moveInColumn(i: number, by: number) {
  const list = variant.value?.sections;
  const j = columnTarget(i, by);
  if (!list || j < 0) return;
  const [me] = list.splice(i, 1);
  list.splice(j, 0, me);
}
const twoColumn = computed(
  () => (variant.value?.layout ?? "styled") === "styled"
);

// Collapsed sections in the Layout tab, by section name so the state
// survives reordering and switching variants.
const collapsed = ref(new Set<SectionName>());
function toggleCollapsed(section: SectionName) {
  const next = new Set(collapsed.value);
  if (next.has(section)) next.delete(section);
  else next.add(section);
  collapsed.value = next;
}
function collapseAll(on: boolean) {
  collapsed.value = new Set(
    on
      ? (variant.value?.sections ?? [])
          .filter((s): s is VariantSection => !isBreak(s))
          .map((s) => s.section)
      : []
  );
  if (on) expandedNodes.value = new Set();
}

// Entries and engagements whose bullets are open in the Layout tab.
const expandedNodes = ref(new Set<string>());
function toggleNode(id: string) {
  const next = new Set(expandedNodes.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedNodes.value = next;
}

const checked = (event: Event) => (event.target as HTMLInputElement).checked;

// Client engagements under a job, newest first (as they print).
const engagementsOf = (jobId: string) =>
  entries.value
    .filter((e) => e.kind === "engagement" && e.parent === jobId)
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));

// Library entries of a section's kind that aren't on this CV, newest first.
function availableFor(section: SectionName) {
  const kind = state.value?.sections[section];
  return entries.value
    .filter((e) => e.kind === kind && !placement.value.has(e.id))
    .sort(
      (a, b) =>
        (b.start ?? "").localeCompare(a.start ?? "") ||
        a.title.localeCompare(b.title)
    );
}

// Sections the variant doesn't have yet, shown with only dimmed rows so
// their entries can be ticked in (which creates the section).
const absentSections = computed(() => {
  const have = new Set(
    (variant.value?.sections ?? [])
      .filter((s): s is VariantSection => !isBreak(s))
      .map((s) => s.section)
  );
  return (Object.keys(state.value?.sections ?? {}) as SectionName[]).filter(
    (section) => !have.has(section)
  );
});
const absentItem = (section: SectionName): VariantSection => ({
  section,
  refs: [],
});

function setRef(i: number, index: number, ref: VariantRef) {
  const list = sectionItem(i)?.refs;
  if (list) list[index] = ref;
}

// Props and handlers shared by every VariantSectionEditor. Movement differs
// between the two-column and single-column views, so it stays in the
// template. i = -1 for a section that isn't in the variant yet.
function sectionBind(i: number, absent?: SectionName) {
  const item = absent ? absentItem(absent) : (sectionItem(i) as VariantSection);
  return {
    item,
    label: SECTION_LABELS[item.section],
    sheet:
      !absent && sheetCount.value > 1 ? sheetOf.value.get(`${i}`) : undefined,
    sidebar: isSidebar(item.section),
    collapsed: collapsed.value.has(item.section),
    absent: !!absent,
    available: availableFor(item.section),
    byId: byId.value,
    engagementsOf,
    expanded: expandedNodes.value,
    variantId: variant.value?.id ?? "",
    variantNames: variantNames.value,
    sheetOf: (index: number) =>
      !absent && sheetCount.value > 1
        ? sheetOf.value.get(`${i}/${index}`)
        : undefined,
  };
}
function sectionOn(i: number, absent?: SectionName) {
  const section = absent ?? (sectionItem(i) as VariantSection).section;
  return {
    toggle: () => toggleCollapsed(section),
    order: (order: SectionOrder) => setOrder(i, order),
    breakAfter: () => breakAfterSection(i),
    moveRef: (index: number, by: number) => moveRef(i, index, by),
    breakAfterRef: (index: number) => breakAfterRef(i, index),
    removeRefBreak: (index: number) => removeRefBreak(i, index),
    add: (id: string) => addRef(id),
    remove: (id: string) => removeRef(id),
    updateRef: (index: number, ref: VariantRef) => setRef(i, index, ref),
    expand: toggleNode,
  };
}

// --- Profile (name and contact details, shared by every variant) ---
const profileForm = ref<Profile | null>(null);

const editProfile = () => {
  if (state.value) profileForm.value = { ...state.value.library.profile };
};

const saveProfile = () =>
  run(async () => {
    if (!profileForm.value) return;
    await api("profile", "PUT", profileForm.value);
    await loadState();
    schedulePreview();
    profileForm.value = null;
    flash("Profile saved");
  });

// --- Library entries (add / edit / delete) ---
const editor = ref<{ entry: LibraryEntry | null } | null>(null);
const existingIds = computed(() => entries.value.map((e) => e.id));
// Parents an engagement can sit under.
const jobs = computed(() => entries.value.filter((e) => e.kind === "job"));
const knownTags = computed(() =>
  [
    ...new Set(
      entries.value.flatMap((e) => [
        ...e.tags,
        ...(e.bullets ?? []).flatMap((b) => b.tags),
      ])
    ),
  ].sort()
);
const knownCategories = computed(() =>
  [
    ...new Set(
      entries.value.map((e) => e.category).filter((c): c is string => !!c)
    ),
  ].sort()
);

function openEditor(entry: LibraryEntry | null) {
  // Strip the dev-only displayDates so the editor sees the stored shape.
  const copy = entry ? { ...entry } : null;
  if (copy) delete copy.displayDates;
  editor.value = { entry: copy };
}

// The variant in memory may be unsaved, so bring it in line with the library
// after an entry changes: drop refs to missing entries or bullets, and move
// an entry whose kind changed to the matching section.
function reconcileVariant() {
  if (!variant.value) return;
  for (const item of variant.value.sections) {
    if (!isBreak(item) && item.order === "date") {
      sortRefsByDate(item.refs, byId.value);
    }
  }
  for (const [id, at] of [...placement.value]) {
    const entry = byId.value.get(id);
    if (!entry) {
      removeRef(id);
      continue;
    }
    if (at.section !== sectionForKind.value[entry.kind]) {
      const ref = removeRef(id);
      if (ref) addRef(typeof ref === "string" ? ref : ref.id);
      continue;
    }
    // Drop bullets and engagements that no longer exist.
    const next = normalizeRef(entry, at.ref, engagementsOf(id));
    if (JSON.stringify(next) !== JSON.stringify(at.ref)) {
      setRef(at.item, at.index, next);
    }
  }
}

// The timeline and project cards come straight from the library. Saving an
// entry already regenerates them; this is for after an import or a repair.
const publishSiteData = () =>
  run(async () => {
    const { count, projects } = await api<{ count: number; projects: number }>(
      "timeline",
      "POST"
    );
    flash(`Published ${count} timeline items and ${projects} project cards`);
  });

const saveEntry = (entry: LibraryEntry) =>
  run(async () => {
    const isNew = !editor.value?.entry;
    await api(`entries/${entry.id}`, "PUT", entry);
    await loadState();
    drafts.value.delete(entry.id);
    reconcileVariant();
    schedulePreview();
    editor.value = null;
    flash(isNew ? `Added "${entry.title}" to the library` : "Entry saved");
  });

const deleteEntry = () =>
  run(async () => {
    const entry = editor.value?.entry;
    if (!entry) return;
    await api(`entries/${entry.id}`, "DELETE");
    await loadState();
    drafts.value.delete(entry.id);
    reconcileVariant();
    schedulePreview();
    editor.value = null;
    flash(`Deleted "${entry.title}"`);
  });

// --- Loading & saving ---
function flash(message: string) {
  status.value = message;
  setTimeout(() => {
    if (status.value === message) status.value = "";
  }, 3000);
}

async function run(task: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await task();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 401 || status === 403) denied.value = (err as Error).message;
    else error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

// --- Backups ---
// A bundle is the whole library plus every variant (and the site output, for
// reference): what Export downloads and Import replaces everything with.
const exportBundle = () =>
  run(async () => {
    const bundle = await api<{ exportedAt: string }>("export");
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cv-bundle-${bundle.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("Exported");
  });

const importInput = ref<HTMLInputElement | null>(null);
const importBundle = () =>
  run(async () => {
    const file = importInput.value?.files?.[0];
    if (!file) return;
    const bundle = JSON.parse(await file.text());
    if (importInput.value) importInput.value.value = "";
    if (
      !confirm(
        `Replace the whole library and every variant with "${file.name}"? The site is republished from it straight away.`
      )
    )
      return;
    const { entries, variants } = await api<{
      entries: number;
      variants: number;
    }>("import", "POST", bundle);
    await loadState();
    const id = variant.value?.id ?? state.value?.variants[0]?.id;
    if (id) await loadVariant(id);
    reconcileVariant();
    schedulePreview();
    flash(`Imported ${entries} entries and ${variants} variants`);
  });

async function loadState() {
  state.value = await api<State>("state");
}

// Loading a variant starts clean: text edited in the preview and not saved
// goes with the variant's own unsaved changes.
async function loadVariant(id: string) {
  const loaded = await api<Variant>(`variants/${id}`);
  discardDrafts();
  variant.value = loaded;
  savedSnapshot.value = JSON.stringify(loaded);
}

function onSwitchVariant(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (dirty.value && !confirm("Discard unsaved changes?")) {
    select.value = variant.value?.id ?? "";
    return;
  }
  run(() => loadVariant(select.value));
}

// One request saves the variant and the entries edited in its preview, so
// neither is left behind if the other is refused.
async function saveVariant() {
  if (!variant.value) return;
  await api("save", "POST", {
    variant: variant.value,
    entries: [...drafts.value.values()],
  });
  savedSnapshot.value = JSON.stringify(variant.value);
  await loadState();
  drafts.value = new Map();
}

// Says so when Save will also write Library entries.
const saveLabel = computed(() => {
  const n = drafts.value.size;
  if (!n) return "Save";
  return `Save CV + ${n} ${n === 1 ? "entry" : "entries"}`;
});

const save = () =>
  run(async () => {
    await saveVariant();
    flash("Saved");
  });

const saveAndPublish = () =>
  run(async () => {
    if (!variant.value) return;
    await saveVariant();
    await api(`publish/${variant.value.id}`, "POST");
    await loadState();
    flash(`Published "${variant.value.name}" to /cv`);
  });

const revert = () =>
  run(async () => {
    if (variant.value) await loadVariant(variant.value.id);
  });

function duplicate() {
  if (!variant.value || !state.value) return;
  const name = prompt("Name for the new variant", `${variant.value.name} copy`);
  if (!name) return;
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id || state.value.variants.some((v) => v.id === id)) {
    error.value = `A variant with id "${id}" already exists`;
    return;
  }
  variant.value = { ...JSON.parse(JSON.stringify(variant.value)), id, name };
  savedSnapshot.value = "";
  state.value.variants.push({
    id,
    name,
    layout: variant.value?.layout ?? "styled",
  });
  flash("Duplicated. Save to keep it.");
}

// --- Live preview, rendered by the same code as publishing ---
const preview = ref<CVPage[]>([]);
const previewError = ref("");
let previewTimer: number | undefined;
let previewSeq = 0;

// Every change asks for a fresh preview and abandons the ones already on
// their way, so an older answer never replaces newer text.
function schedulePreview() {
  if (!variant.value) return;
  const seq = ++previewSeq;
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(async () => {
    try {
      const { pages } = await api<{ pages: CVPage[] }>("preview", "POST", {
        variant: variant.value,
        entries: [...drafts.value.values()],
      });
      if (seq !== previewSeq) return;
      // These sources are fresh, so nothing needs redirecting any more.
      copied.clear();
      placeNewLine(pages);
      preview.value = pages;
      previewError.value = "";
    } catch (err) {
      if (seq === previewSeq) previewError.value = (err as Error).message;
    }
  }, 250);
}

watch(variant, schedulePreview, { deep: true });
watch(drafts, schedulePreview, { deep: true });

// --- Editing the preview's text in place (see CvText) ---
// Text that belongs to the CV (headline, summary) goes into the variant;
// everything else goes into a draft of its library entry. Both wait for
// Save. Condensed highlights are the exception to "library text is shared":
// editing one on a CV always lands in that CV's own set, copying it first
// when the CV was printing someone else's.
const EDIT_KEY = "cv-admin-edit-text";
const editText = ref(true);
watch(editText, (on) => localStorage.setItem(EDIT_KEY, on ? "on" : "off"));
const focusedText = ref<TextSource | null>(null);

type LineText = Extract<TextSource, { kind: "line" }>;
// A new line being typed in the preview: it sits under `after` and becomes
// a bullet or highlight of that entry once it has text.
const newLine = ref<{ after: LineSource; line: LineSource } | null>(null);
// Highlights copied for this CV since the preview was last resolved, as
// "entry/id" -> the copy's id. Until then the page still names the originals.
const copied = new Map<string, string>();
const currentId = (line: LineSource) =>
  copied.get(`${line.entry}/${line.id}`) ?? line.id;

function setDraft(entry: LibraryEntry) {
  const saved = savedEntries.value.find((e) => e.id === entry.id);
  if (JSON.stringify(entry) === JSON.stringify(saved))
    drafts.value.delete(entry.id);
  else drafts.value.set(entry.id, entry);
}

function discardDrafts() {
  drafts.value = new Map();
  copied.clear();
  dropNewLine();
}

// Puts the line being typed back into freshly resolved pages.
function placeNewLine(pages: CVPage[]) {
  const pending = newLine.value;
  if (!pending) return;
  for (const list of lineLists(pages)) {
    const at = list.lines.findIndex(
      (l) =>
        l.entry === pending.after.entry &&
        (l.id === pending.after.id || l.id === currentId(pending.after))
    );
    if (at === -1) continue;
    list.texts.splice(at + 1, 0, "");
    list.lines.splice(at + 1, 0, toRaw(pending.line));
    return;
  }
  newLine.value = null;
}

function dropNewLine() {
  if (!newLine.value) return;
  newLine.value = null;
  for (const list of lineLists(preview.value)) {
    const at = list.lines.findIndex((l) => !l.id);
    if (at === -1) continue;
    list.texts.splice(at, 1);
    list.lines.splice(at, 1);
  }
  measureSoon();
}

function addLineAfter(src: TextSource) {
  if (src.kind !== "line" || !src.line.id || !variant.value) return;
  dropNewLine();
  const { entry, id, highlight } = src.line;
  const line: LineSource = { entry, id: "" };
  if (highlight) Object.assign(line, { highlight, for: variant.value.id });
  newLine.value = { after: { entry, id }, line };
  placeNewLine(preview.value);
  measureSoon();
}

// How the variant picks the lines of the entry a line belongs to: the job
// itself, or one of its engagements (shown, or rolled up under the job).
// `list` is the explicit list of ids when it has one (a custom pick).
function linePick(src: LineText) {
  const at = placement.value.get(src.job);
  const entry = byId.value.get(src.line.entry);
  if (!at || !entry) return null;
  const own = entry.id === src.job;
  const ref = at.ref;
  const list = own
    ? typeof ref === "string"
      ? undefined
      : ref.bullets
    : engagementPick(ref, entry.id).bullets;
  // Call after the entry's draft is stored: the ref is kept in its smallest
  // form, which depends on the entry's current bullets.
  const setList = (ids: string[]) => {
    const job = byId.value.get(src.job);
    const eng = byId.value.get(entry.id);
    if (!job || !eng) return;
    setRef(
      at.item,
      at.index,
      own
        ? withBullets(job, ref, ids)
        : withEngagement(job, ref, engagementsOf(job.id), eng, {
            show: engagementPick(ref, eng.id).show,
            bullets: ids,
          })
    );
  };
  return { entry, list, setList };
}

// A highlight this CV prints but doesn't own, made its own: the one copy
// when the pick lists ids, the whole general set when it is condensed.
// Returns the entry with the copies and the id standing in for `id`.
function ownHighlight(entry: LibraryEntry, id: string, custom: boolean) {
  const forId = variant.value?.id ?? "";
  if (custom) {
    const copy = copyHighlight(entry, id, forId);
    copied.set(`${entry.id}/${id}`, copy.id);
    return copy;
  }
  const fork = forkGeneral(entry, forId);
  for (const [from, to] of fork.ids) copied.set(`${entry.id}/${from}`, to);
  return { entry: fork.entry, id: fork.ids.get(id) ?? id };
}

function commitLine(src: LineText, text: string): string {
  const pick = linePick(src);
  const forId = variant.value?.id;
  if (!pick || !forId) return "";
  const { list, setList } = pick;
  const { line } = src;

  // A new line: a bullet under a bullet, a highlight under a highlight.
  if (!line.id) {
    const pending = newLine.value;
    if (!pending) return "";
    if (!text) {
      dropNewLine();
      return "";
    }
    const afterId = currentId(pending.after);
    const after = findLine(pick.entry, afterId);
    let entry = pick.entry;
    let anchor = afterId;
    let id: string;
    if (after?.highlight) {
      if (!list && after.for !== forId)
        ({ entry, id: anchor } = ownHighlight(entry, afterId, false));
      ({ entry, id } = addHighlight(entry, anchor, text, forId));
    } else {
      ({ entry, id } = addBullet(entry, anchor, text));
    }
    setDraft(entry);
    if (list) setList(insertAfter(list, id, (other) => other === afterId));
    // The typed line stands in for the real one until the preview resolves.
    for (const lines of lineLists(preview.value)) {
      const at = lines.lines.findIndex((l) => !l.id);
      if (at !== -1) lines.texts[at] = text;
    }
    pending.line.id = id;
    newLine.value = null;
    return text;
  }

  const id = currentId(line);
  const found = findLine(pick.entry, id);
  if (!found) return "";
  if (!text || text === found.text) return found.text;
  let entry = pick.entry;
  let target = id;
  if (found.highlight && found.for !== forId) {
    ({ entry, id: target } = ownHighlight(entry, id, !!list));
    Object.assign(line, { id: target, for: forId });
  }
  setDraft(setLine(entry, target, text));
  if (list && target !== id)
    setList(list.map((other) => (other === id ? target : other)));
  return text;
}

function commitText(src: TextSource, raw: string, exact = false): string {
  if (src.kind === "variant") {
    const current = variant.value;
    if (!current) return "";
    const text = exact
      ? raw
      : src.field === "summary"
        ? cleanHtml(raw)
        : cleanText(raw);
    if (text) current[src.field] = text;
    return current[src.field] ?? "";
  }
  if (src.kind === "entry") {
    const entry = byId.value.get(src.entry);
    if (!entry) return "";
    const text = exact ? raw : cleanText(raw);
    const stored = entry[src.field] ?? "";
    if (!text || text === stored) return stored;
    setDraft(setField(entry, src.field, text));
    return text;
  }
  if (src.kind === "line") return commitLine(src, exact ? raw : cleanHtml(raw));
  return "";
}

provide(INLINE_EDIT, {
  // Only the preview that is on screen: hidden, it is just for measuring.
  enabled: computed(() => editText.value && showPreview.value),
  focus: (src) => (focusedText.value = src),
  typing: () => measureSoon(),
  commit: commitText,
  addAfter: addLineAfter,
  open(src) {
    if (src.kind === "profile") editProfile();
    else if (src.kind === "open") {
      const entry = byId.value.get(src.entry);
      if (entry) openEditor(entry);
    }
  },
});

// What an edit to the focused text touches: this CV alone, or the library
// and with it everything else that prints the same text.
const others = (ids: string[] = []) =>
  ids
    .filter((id) => id !== variant.value?.id)
    .map((id) => variantNames.value.get(id) ?? id);
const onTimeline = (entry: LibraryEntry) =>
  !!entry.start &&
  (entry.timeline ?? state.value?.timelineKinds.includes(entry.kind) ?? false);
const shared = (places: string[]) => ({
  own: false,
  text: places.length
    ? `Library · also on ${places.join(", ")}`
    : "Library · only this CV prints it",
});
const textScope = computed(() => {
  const src = focusedText.value;
  const current = variant.value;
  if (!src || !current) return null;
  if (src.kind === "variant") return { own: true, text: "This CV only" };
  const use = (id: string) => state.value?.usage[id];
  if (src.kind === "entry") {
    const entry = byId.value.get(src.entry);
    if (!entry) return null;
    const places = others(use(entry.id)?.variants);
    if (src.field !== "tagline" && onTimeline(entry))
      places.push("the timeline");
    if (entry.home && (src.field === "title" || src.field === "tagline"))
      places.push("the home page");
    return shared(places);
  }
  if (src.kind !== "line") return null;
  const entry = byId.value.get(src.line.entry);
  if (!entry) return null;
  const line = src.line.id ? findLine(entry, currentId(src.line)) : src.line;
  if (!line) return null;
  if (line.highlight) {
    if (line.for === current.id)
      return {
        own: true,
        text: line.id
          ? "Condensed for this CV · this CV only"
          : "New condensed line · this CV only",
      };
    const owner = line.for
      ? `Written for ${variantNames.value.get(line.for) ?? line.for}`
      : "General condensed set";
    return {
      own: false,
      text: `${owner} · editing makes a copy for this CV`,
    };
  }
  if (!line.id)
    return {
      own: false,
      text: `New Library bullet · joins any CV printing this in full${
        onTimeline(entry) ? ", and the timeline" : ""
      }`,
    };
  const places = others(use(entry.id)?.bullets[line.id]);
  const bullet = entry.bullets?.find((b) => b.id === line.id);
  if (onTimeline(entry) && bullet?.timeline !== false)
    places.push("the timeline");
  return shared(places);
});

// In paged mode each sheet clips, so measure how much would be cut off.
const previewEl = ref<HTMLElement | null>(null);
const overflow = ref<{ page: number; mm: number }[]>([]);

async function measureOverflow() {
  await nextTick();
  // Only the printed sheets: the continuous on-screen copy is a .cv-page too.
  const sheets = previewEl.value?.querySelectorAll<HTMLElement>(
    ".cv-sheets .cv-page"
  );
  if (!(paged.value || !showPreview.value) || !sheets?.length) {
    overflow.value = [];
    return;
  }
  const A4_MM = 297;
  overflow.value = [...sheets]
    .map((el, i) => ({
      page: i + 1,
      mm: Math.round(
        ((el.scrollHeight - el.clientHeight) / el.clientHeight) * A4_MM
      ),
    }))
    .filter((o) => o.mm > 0);
}

watch([preview, paged, zoom, showPreview], measureOverflow);

// Typing in the preview changes the sheets without a new preview arriving.
let measureFrame = 0;
function measureSoon() {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measureOverflow);
}

// The preview column is exactly as wide as the CV at the current zoom, so
// the form gets everything else. A4 sheets and the ATS layout are 210mm wide;
// the continuous styled view is capped at 1050px plus its own 20px gutters.
const previewWidth = computed(() => {
  const ats = variant.value?.layout === "ats";
  const base = paged.value || ats ? "210mm" : "1090px";
  return `calc(${base} * ${zoom.value} + 2rem)`;
});

const printCv = () => window.print();

const warnOnUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
};

onMounted(() => {
  window.addEventListener("beforeunload", warnOnUnload);
  theme.value = localStorage.getItem(THEME_KEY) === "site" ? "site" : "light";
  editText.value = localStorage.getItem(EDIT_KEY) !== "off";
  if (localStorage.getItem(WORKSPACE_KEY) === "cvs") workspace.value = "cvs";
});

// Load once signed in; forget everything on sign-out.
watch(
  user,
  (signedIn) => {
    if (!signedIn) {
      state.value = null;
      variant.value = null;
      discardDrafts();
      return;
    }
    denied.value = "";
    run(async () => {
      await loadState();
      const first =
        state.value?.published.styled ??
        state.value?.published.ats ??
        state.value?.variants[0]?.id;
      if (first) await loadVariant(first);
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", warnOnUnload);
  window.clearTimeout(previewTimer);
  cancelAnimationFrame(measureFrame);
});

onBeforeRouteLeave(
  () => !dirty.value || confirm("You have unsaved changes. Leave anyway?")
);
</script>

<template>
  <div class="cv-admin" :class="{ 'is-site': theme === 'site' }">
    <div v-if="!authChecked" class="cv-admin__gate">Checking your sign-in…</div>
    <div v-else-if="!user || denied" class="cv-admin__gate">
      <h1 class="cv-admin__gate-title">CV dashboard</h1>
      <p v-if="denied" class="text-danger">{{ denied }}</p>
      <p v-else>Sign in with the Google account that owns this site.</p>
      <div class="d-flex gap-2 justify-content-center">
        <button class="a-btn a-btn--success" @click="signIn">
          Sign in with Google
        </button>
        <button v-if="user" class="a-btn" @click="signOut">Sign out</button>
      </div>
    </div>
    <div v-else-if="!state && !error" class="cv-admin__gate">Loading…</div>
    <input
      id="cv-import"
      ref="importInput"
      type="file"
      accept="application/json,.json"
      class="d-none"
      :disabled="busy"
      @change="importBundle"
    />
    <div v-if="error" class="alert alert-danger no-print">{{ error }}</div>

    <template v-if="state">
      <!-- Two workspaces: the Library holds the content; CVs decide what each
           one prints. Nothing under Library is specific to a CV. -->
      <div class="cv-admin__tabs cv-admin__switch no-print">
        <button
          :class="{ active: workspace === 'library' }"
          @click="workspace = 'library'"
        >
          Library
          <span class="cv-admin__count">{{ entries.length }}</span>
        </button>
        <button
          :class="{ active: workspace === 'cvs' }"
          @click="workspace = 'cvs'"
        >
          CVs
          <span class="cv-admin__count">{{ state.variants.length }}</span>
          <span v-if="dirty" class="cv-admin__badge">unsaved</span>
        </button>
        <span
          class="small ms-auto text-truncate"
          :class="dirty ? 'text-warning' : 'text-success'"
        >
          {{ dirty ? "Unsaved CV changes" : status }}
        </span>
        <button
          class="a-btn"
          title="Switch between the plain dashboard and the site's own look"
          @click="toggleTheme"
        >
          {{ theme === "site" ? "Light theme" : "Site theme" }}
        </button>
        <span class="small text-muted text-nowrap">
          {{ email }}
          <button class="a-btn ms-1" @click="signOut">Sign out</button>
        </span>
      </div>

      <!-- Library workspace -->
      <section
        v-if="workspace === 'library'"
        class="cv-admin__panel cv-admin__panel--library no-print"
      >
        <div class="d-flex gap-2 align-items-center flex-wrap mb-3">
          <p class="small text-muted mb-0 flex-grow-1">
            Everything the site and the CVs draw from. Click an entry to edit
            it, including its condensed bullets per CV. What each CV prints is
            chosen under CVs.
          </p>
          <button
            class="a-btn"
            title="Name and contact details, shared by every CV"
            :disabled="busy"
            @click="editProfile"
          >
            Profile
          </button>
          <button
            class="a-btn"
            title="Regenerate the timeline and project cards on the site. Saving an entry already does this."
            :disabled="busy"
            @click="publishSiteData"
          >
            Publish site data
          </button>
          <button
            class="a-btn"
            title="Download a backup of the library and every CV"
            :disabled="busy"
            @click="exportBundle"
          >
            Export
          </button>
          <label
            for="cv-import"
            class="a-btn"
            :class="{ 'is-disabled': busy }"
            title="Restore a backup, replacing everything"
          >
            Import
          </label>
        </div>
        <LibraryList
          :entries="entries"
          :timeline-kinds="state.timelineKinds"
          :busy="busy"
          @edit="openEditor"
          @create="openEditor(null)"
        />
      </section>

      <!-- CVs workspace: kept mounted (v-show) so the preview keeps measuring
           overflow and printing works. -->
      <div v-show="workspace === 'cvs'" class="cv-admin__grid">
        <section class="cv-admin__panel no-print">
          <div v-if="!variant" class="cv-admin__gate">
            <h1 class="cv-admin__gate-title">No CVs yet</h1>
            <p>Import a bundle to add CV variants.</p>
            <label for="cv-import" class="a-btn a-btn--success">Import</label>
          </div>
          <template v-else>
            <!-- Variant settings -->
            <div class="cv-admin__variant">
              <div class="d-flex gap-2 align-items-end flex-wrap">
                <label class="flex-grow-1">
                  <span class="cv-admin__label">CV</span>
                  <select
                    class="form-select form-select-sm"
                    :value="variant.id"
                    @change="onSwitchVariant"
                  >
                    <option
                      v-for="v in state.variants"
                      :key="v.id"
                      :value="v.id"
                    >
                      {{ v.name
                      }}{{
                        v.id === state.published[v.layout] ? " (published)" : ""
                      }}
                    </option>
                  </select>
                </label>
                <button class="a-btn" :disabled="busy" @click="duplicate">
                  Duplicate
                </button>
              </div>
              <div class="row g-2 mt-1">
                <label class="col-6">
                  <span class="cv-admin__label">Variant name</span>
                  <input
                    v-model="variant.name"
                    class="form-control form-control-sm"
                  />
                </label>
                <label class="col-6">
                  <span class="cv-admin__label">CV headline</span>
                  <input
                    v-model="variant.title"
                    class="form-control form-control-sm"
                  />
                </label>
                <label class="col-12">
                  <span class="cv-admin__label">Summary (HTML allowed)</span>
                  <textarea
                    v-model="variant.summary"
                    rows="3"
                    class="form-control form-control-sm"
                  ></textarea>
                </label>
                <label class="col-6">
                  <span class="cv-admin__label">Layout</span>
                  <select
                    class="form-select form-select-sm"
                    :value="variant.layout ?? 'styled'"
                    @change="
                      variant.layout = ($event.target as HTMLSelectElement)
                        .value as Variant['layout']
                    "
                  >
                    <option value="styled">Styled (two columns)</option>
                    <option value="ats">ATS (plain single column)</option>
                  </select>
                </label>
                <label
                  class="col-6 form-check d-flex align-items-end gap-1 ps-4 mb-0"
                  title="Adds phone and location to this variant. Fine for a PDF, but they'd be public if this variant is published to the site."
                >
                  <input
                    type="checkbox"
                    class="form-check-input"
                    :checked="!!variant.contact"
                    @change="variant.contact = checked($event) || undefined"
                  />
                  <span class="small">Include phone &amp; location</span>
                </label>
              </div>
              <div class="d-flex gap-2 mt-2 align-items-center flex-wrap">
                <button
                  class="a-btn a-btn--primary"
                  :disabled="busy || !dirty"
                  :title="
                    drafts.size
                      ? 'Saves this CV and the Library text edited in its preview'
                      : ''
                  "
                  @click="save"
                >
                  {{ saveLabel }}
                </button>
                <button
                  class="a-btn a-btn--success"
                  :disabled="busy"
                  @click="saveAndPublish"
                >
                  Save &amp; publish
                </button>
                <button
                  class="a-btn"
                  :disabled="busy || !dirty || !savedSnapshot"
                  @click="revert"
                >
                  Revert
                </button>
                <button
                  class="a-btn ms-auto"
                  @click="showPreview = !showPreview"
                >
                  {{ showPreview ? "Hide preview" : "Show preview" }}
                </button>
              </div>
            </div>

            <div
              v-if="
                variant.contact &&
                variant.id === state.published[variant.layout ?? 'styled']
              "
              class="alert alert-warning py-1 px-2 small"
            >
              This variant is published with phone and location, so they are
              visible on the public site.
            </div>
            <div
              v-for="o in overflow"
              :key="o.page"
              class="alert alert-danger py-1 px-2 small"
            >
              Page {{ o.page }} overflows by about {{ o.mm }}mm. Move something
              to another page or untick some bullets, or it will be cut off in
              print.
            </div>
            <span v-if="previewError" class="small text-danger d-block mb-2">
              {{ previewError }}
            </span>

            <!-- Layout: one ordered list of sections, cut into sheets by breaks -->
            <div>
              <p class="small text-muted">
                <strong
                  >Layout · {{ placement.size }} entries on this CV.</strong
                >
                Tick what it prints: entries, their bullets, and a job's client
                engagements (untick a client and tick its bullets to print them
                under the job instead). Full / Condensed on a row switches
                between all of its bullets and the condensed ones written for
                this CV in the Library. Dimmed rows aren't on this CV yet. Most
                important first; page breaks cut the list into printed sheets,
                and a section that continues repeats its heading.
              </p>
              <div class="d-flex gap-2 mb-2 small">
                <button class="cv-admin__link" @click="collapseAll(true)">
                  Collapse all
                </button>
                <button class="cv-admin__link" @click="collapseAll(false)">
                  Expand all
                </button>
              </div>

              <!-- Styled layout: sidebar and main side by side, as on the CV -->
              <template v-if="twoColumn">
                <template v-for="(group, g) in layoutGroups" :key="g">
                  <div
                    v-if="group.breakIndex !== undefined"
                    class="cv-admin__break"
                  >
                    <span class="flex-grow-1">— page break —</span>
                    <button
                      class="a-btn a-btn--icon"
                      title="Remove break"
                      @click="removeSectionBreak(group.breakIndex)"
                    >
                      ✕
                    </button>
                  </div>
                  <div class="cv-admin__columns">
                    <div class="cv-admin__column is-sidebar">
                      <div class="cv-admin__column-title">Sidebar</div>
                      <VariantSectionEditor
                        v-for="i in group.sidebar"
                        :key="i"
                        v-bind="sectionBind(i)"
                        :can-up="columnTarget(i, -1) >= 0"
                        :can-down="columnTarget(i, 1) >= 0"
                        v-on="sectionOn(i)"
                        @move="moveInColumn(i, $event)"
                      />
                      <template v-if="g === layoutGroups.length - 1">
                        <VariantSectionEditor
                          v-for="section in absentSections.filter(isSidebar)"
                          :key="section"
                          v-bind="sectionBind(-1, section)"
                          :can-up="false"
                          :can-down="false"
                          v-on="sectionOn(-1, section)"
                        />
                      </template>
                      <p
                        v-if="
                          !group.sidebar.length && g < layoutGroups.length - 1
                        "
                        class="small text-muted"
                      >
                        Nothing here
                      </p>
                    </div>
                    <div class="cv-admin__column">
                      <div class="cv-admin__column-title">Main</div>
                      <VariantSectionEditor
                        v-for="i in group.main"
                        :key="i"
                        v-bind="sectionBind(i)"
                        :can-up="columnTarget(i, -1) >= 0"
                        :can-down="columnTarget(i, 1) >= 0"
                        v-on="sectionOn(i)"
                        @move="moveInColumn(i, $event)"
                      />
                      <template v-if="g === layoutGroups.length - 1">
                        <VariantSectionEditor
                          v-for="section in absentSections.filter(
                            (s) => !isSidebar(s)
                          )"
                          :key="section"
                          v-bind="sectionBind(-1, section)"
                          :can-up="false"
                          :can-down="false"
                          v-on="sectionOn(-1, section)"
                        />
                      </template>
                      <p
                        v-if="!group.main.length && g < layoutGroups.length - 1"
                        class="small text-muted"
                      >
                        Nothing here
                      </p>
                    </div>
                  </div>
                </template>
              </template>

              <!-- ATS layout: one column, in reading order -->
              <template v-else>
                <template v-for="(item, i) in variant.sections" :key="i">
                  <div v-if="isBreak(item)" class="cv-admin__break">
                    <span class="flex-grow-1">— page break —</span>
                    <button
                      class="a-btn a-btn--icon"
                      title="Move up"
                      :disabled="i === 0"
                      @click="moveSection(i, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="a-btn a-btn--icon"
                      title="Move down"
                      :disabled="i === variant.sections.length - 1"
                      @click="moveSection(i, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="a-btn a-btn--icon"
                      title="Remove break"
                      @click="removeSectionBreak(i)"
                    >
                      ✕
                    </button>
                  </div>
                  <VariantSectionEditor
                    v-else
                    v-bind="sectionBind(i)"
                    :can-up="i > 0"
                    :can-down="i < variant.sections.length - 1"
                    v-on="sectionOn(i)"
                    @move="moveSection(i, $event)"
                  />
                </template>
                <VariantSectionEditor
                  v-for="section in absentSections"
                  :key="section"
                  v-bind="sectionBind(-1, section)"
                  :can-up="false"
                  :can-down="false"
                  v-on="sectionOn(-1, section)"
                />
              </template>
            </div>
          </template>
        </section>

        <!-- Preview: rendered even while hidden, so overflow is still measured
           and printing works. -->
        <section
          v-if="variant"
          class="cv-admin__preview"
          :class="{ 'is-hidden': !showPreview }"
          :style="{ width: previewWidth }"
        >
          <div class="cv-admin__preview-bar no-print">
            <div class="d-flex gap-2 align-items-center flex-wrap">
              <strong class="small text-dark">Preview</strong>
              <select
                v-model.number="zoom"
                class="form-select form-select-sm w-auto"
              >
                <option :value="0.5">50%</option>
                <option :value="0.6">60%</option>
                <option :value="0.75">75%</option>
                <option :value="1">100%</option>
              </select>
              <button class="a-btn" @click="printCv">Print / save PDF</button>
              <label
                v-if="(variant.layout ?? 'styled') === 'styled'"
                class="form-check small mb-0 ms-1"
              >
                <input
                  v-model="paged"
                  type="checkbox"
                  class="form-check-input"
                />
                A4 pages
              </label>
              <label
                class="form-check small mb-0 ms-1"
                title="Click any text in the preview to change it. Enter in a bullet starts a new one; Escape puts the text back."
              >
                <input
                  v-model="editText"
                  type="checkbox"
                  class="form-check-input"
                />
                Edit text
              </label>
            </div>
            <!-- What the text being edited belongs to -->
            <div
              v-if="editText"
              class="cv-admin__scope"
              :class="{
                'is-own': textScope?.own,
                'is-shared': textScope && !textScope.own,
              }"
            >
              {{
                textScope?.text ??
                "Click any text to edit it. Changes wait for Save."
              }}
            </div>
          </div>
          <div ref="previewEl" class="cv-admin__zoom" :style="{ zoom }">
            <template v-if="preview.length">
              <CvAtsDocument v-if="variant.layout === 'ats'" :pages="preview" />
              <CvDocument
                v-else
                :pages="preview"
                :paged="paged || !showPreview"
              />
            </template>
          </div>
        </section>
      </div>
    </template>

    <!-- Profile editor -->
    <div
      v-if="profileForm"
      class="cv-admin__modal no-print"
      @click.self="profileForm = null"
    >
      <form class="cv-admin__dialog" @submit.prevent="saveProfile">
        <h5>Profile</h5>
        <p class="small text-muted">
          Only name, email and website are published; location and phone stay in
          the library.
        </p>
        <div class="row g-2">
          <label class="col-12">
            <span class="cv-admin__label">Name</span>
            <input
              v-model="profileForm.name"
              class="form-control form-control-sm"
              required
            />
          </label>
          <label class="col-6">
            <span class="cv-admin__label">Email</span>
            <input
              v-model="profileForm.email"
              type="email"
              class="form-control form-control-sm"
              required
            />
          </label>
          <label class="col-6">
            <span class="cv-admin__label">Website</span>
            <input
              v-model="profileForm.website"
              class="form-control form-control-sm"
              required
            />
          </label>
          <label class="col-6">
            <span class="cv-admin__label">Location</span>
            <input
              v-model="profileForm.location"
              class="form-control form-control-sm"
            />
          </label>
          <label class="col-6">
            <span class="cv-admin__label">Phone</span>
            <input
              v-model="profileForm.phone"
              class="form-control form-control-sm"
            />
          </label>
        </div>
        <div class="d-flex gap-2 mt-3">
          <button type="submit" class="a-btn a-btn--primary" :disabled="busy">
            Save profile
          </button>
          <button type="button" class="a-btn" @click="profileForm = null">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Entry editor -->
    <div
      v-if="editor && state"
      class="cv-admin__modal no-print"
      @click.self="editor = null"
    >
      <div class="cv-admin__dialog">
        <EntryEditor
          :entry="editor.entry"
          :existing-ids="existingIds"
          :known-tags="knownTags"
          :known-categories="knownCategories"
          :usage="editor.entry ? state.usage[editor.entry.id] : undefined"
          :timeline-kinds="state.timelineKinds"
          :jobs="jobs"
          :variants="state.variants"
          :busy="busy"
          @save="saveEntry"
          @delete="deleteEntry"
          @cancel="editor = null"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cv-admin {
  // Admin palette. The default is the plain light dashboard; `is-site` maps
  // the same tokens onto the site's own colours and type.
  --ad-bg: #fff;
  --ad-bg-2: #f8fafc;
  --ad-bg-3: #e8edf3;
  --ad-line: #e2e8f0;
  --ad-line-strong: #cbd5e1;
  --ad-text: #1e293b;
  --ad-text-2: #334155;
  --ad-muted: #64748b;
  --ad-muted-2: #475569;
  --ad-faint: #94a3b8;
  --ad-tag-bg: #f1f5f9;
  --ad-accent: #2563eb;
  --ad-accent-contrast: #fff;
  --ad-on-bg: #dbeafe;
  --ad-on-line: #60a5fa;
  --ad-on-text: #1e3a8a;
  --ad-success: #16a34a;
  --ad-danger: #dc2626;
  --ad-danger-text: #b91c1c;
  --ad-warn: #f59e0b;
  --ad-warn-text: #b45309;
  --ad-rollup-bg: #fef3c7;
  --ad-rollup-text: #92400e;
  --ad-notes-bg: #fefce8;
  --ad-notes-chip-bg: #fef9c3;
  --ad-notes-chip-text: #854d0e;
  --ad-surface-chip-bg: #fff7ed;
  --ad-surface-chip-text: #9a3412;
  --ad-modal: rgba(15, 23, 42, 0.5);
  --ad-shadow: rgba(15, 23, 42, 0.04);
  --ad-preview-bg: #e2e8f0;
  --ad-label-font: inherit;
  --ad-kind-job: #2563eb;
  --ad-kind-engagement: #d97706;
  --ad-kind-education: #7c3aed;
  --ad-kind-project: #0d9488;
  --ad-kind-achievement: #e11d48;
  --ad-kind-interest: #db2777;
  --ad-kind-competency: #475569;
  --ad-kind-skill: #16a34a;

  width: 100%;
  padding: 0 1rem;
  color: var(--ad-text);

  &.is-site {
    --ad-bg: var(--primary-soft);
    --ad-bg-2: color-mix(in srgb, var(--secondary) 5%, var(--primary-soft));
    --ad-bg-3: color-mix(in srgb, var(--secondary) 9%, var(--primary-soft));
    --ad-line: var(--line);
    --ad-line-strong: rgba(215, 219, 228, 0.32);
    --ad-text: var(--secondary);
    --ad-text-2: color-mix(in srgb, var(--secondary) 82%, var(--primary-soft));
    --ad-muted: var(--muted);
    --ad-muted-2: var(--muted);
    --ad-faint: color-mix(in srgb, var(--muted) 55%, var(--primary-soft));
    --ad-tag-bg: rgba(215, 219, 228, 0.1);
    --ad-accent: var(--accent);
    --ad-accent-contrast: var(--accent-contrast);
    --ad-on-bg: rgba(255, 180, 84, 0.16);
    --ad-on-line: var(--accent);
    --ad-on-text: var(--accent);
    --ad-success: #4fd1c5;
    --ad-danger: #fb7185;
    --ad-danger-text: #fda4af;
    --ad-warn: var(--accent);
    --ad-warn-text: var(--accent);
    --ad-rollup-bg: rgba(255, 180, 84, 0.16);
    --ad-rollup-text: var(--accent);
    --ad-notes-bg: rgba(255, 250, 194, 0.07);
    --ad-notes-chip-bg: rgba(255, 250, 194, 0.14);
    --ad-notes-chip-text: var(--warn-light);
    --ad-surface-chip-bg: rgba(79, 209, 197, 0.14);
    --ad-surface-chip-text: #4fd1c5;
    --ad-modal: rgba(8, 10, 20, 0.7);
    --ad-shadow: rgba(0, 0, 0, 0.25);
    --ad-preview-bg: var(--primary);
    --ad-label-font: "JetBrains Mono", ui-monospace, monospace;
    --ad-kind-job: var(--ad-on-line);
    --ad-kind-engagement: #ffb454;
    --ad-kind-education: #a78bfa;
    --ad-kind-project: #4fd1c5;
    --ad-kind-achievement: #fb7185;
    --ad-kind-interest: #f472b6;
    --ad-kind-competency: #9aa3b8;
    --ad-kind-skill: #4ade80;
  }
}

// Bootstrap's form controls and alerts are light by design; the site theme
// paints them to match.
.cv-admin.is-site {
  :deep(.form-control),
  :deep(.form-select) {
    background-color: color-mix(in srgb, var(--secondary) 6%, var(--primary));
    border-color: var(--ad-line-strong);
    color: var(--ad-text);

    &:focus {
      border-color: var(--ad-accent);
      box-shadow: 0 0 0 0.2rem var(--accent-soft);
    }
    &::placeholder {
      color: var(--ad-faint);
    }
    &[readonly] {
      background-color: var(--ad-bg-2);
    }
  }
  :deep(.form-select) {
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23d7dbe4' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e");
  }
  :deep(.form-check-input) {
    background-color: color-mix(in srgb, var(--secondary) 8%, var(--primary));
    border-color: var(--ad-line-strong);

    &:checked {
      background-color: var(--ad-accent);
      border-color: var(--ad-accent);
      // Bootstrap's tick is white; the accent is light, so use a dark tick.
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3e%3cpath fill='none' stroke='%23151a2d' stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='m6 10 3 3 6-6'/%3e%3c/svg%3e");
    }
  }
  :deep(.text-muted) {
    color: var(--ad-muted) !important;
  }
  :deep(.text-dark) {
    color: var(--ad-text) !important;
  }
  :deep(.alert-danger) {
    background: rgba(251, 113, 133, 0.12);
    border-color: rgba(251, 113, 133, 0.4);
    color: #fda4af;
  }
  :deep(.alert-warning) {
    background: rgba(255, 180, 84, 0.12);
    border-color: rgba(255, 180, 84, 0.4);
    color: var(--accent);
  }
  :deep(h5),
  :deep(h6) {
    color: var(--ad-text);
  }
}

.cv-admin__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
}

// Hidden preview: kept in the layout flow of nothing, offscreen but laid out
// at full size so overflow can still be measured.
.cv-admin__preview.is-hidden {
  position: fixed;
  top: 0;
  left: 0;
  transform: translateX(-200vw);
  visibility: hidden;
  pointer-events: none;
}

.cv-admin__panel,
.cv-admin__preview {
  border-radius: 0.5rem;
  padding: 1rem;
  max-height: calc(100vh - 140px);
  overflow: auto;
}

.cv-admin__panel {
  background: var(--ad-bg);
  container-type: inline-size;
}

.cv-admin__preview {
  background: var(--ad-preview-bg);
  max-width: 100%;
}

// Stays in view while the sheets scroll under it, since it says what the
// text being edited belongs to.
.cv-admin__preview-bar {
  position: sticky;
  top: -1rem;
  z-index: 2;
  margin: -1rem -1rem 0.5rem;
  padding: 1rem 1rem 0.5rem;
  background: var(--ad-preview-bg);
}

.cv-admin__scope {
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: var(--ad-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.is-own,
  &.is-shared {
    font-weight: 600;
  }
  &.is-own {
    color: var(--ad-success);
  }
  &.is-shared {
    color: var(--ad-warn-text);
  }
}

// The sign-in card (and the loading line) before the dashboard appears.
.cv-admin__gate {
  max-width: 28rem;
  margin: 4rem auto;
  padding: 1.5rem;
  border: 1px solid var(--ad-line);
  border-radius: 0.75rem;
  background: var(--ad-bg);
  text-align: center;
  box-shadow: 0 1px 2px var(--ad-shadow);
}

.cv-admin__gate-title {
  font-family: var(--ad-label-font);
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.cv-admin__variant {
  border-bottom: 1px solid var(--ad-line);
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
}

.cv-admin__label {
  display: block;
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
}

.cv-admin__tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--ad-line);

  > button {
    border: none;
    background: none;
    padding: 0.4rem 0.75rem;
    color: var(--ad-muted);
    border-bottom: 2px solid transparent;

    &.active {
      color: var(--ad-accent);
      border-bottom-color: var(--ad-accent);
    }
  }
}

// The workspace switcher: the two big tabs, then the status line and the
// account controls on the right.
.cv-admin__switch {
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  margin-bottom: 1rem;

  > button {
    font-family: var(--ad-label-font);
    font-size: 1rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    margin-bottom: -1px;
  }
}

.cv-admin__count {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--ad-tag-bg);
  color: var(--ad-muted-2);
  vertical-align: middle;
}

.cv-admin__badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--ad-rollup-bg);
  color: var(--ad-rollup-text);
  vertical-align: middle;
}

.cv-admin__panel--library {
  max-height: none;
}

.cv-admin__break {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0 1rem;
  padding: 0.2rem 0.5rem;
  border: 1px dashed var(--ad-warn);
  border-radius: 0.375rem;
  color: var(--ad-warn-text);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &.is-inner {
    margin: 0.25rem 0;
  }
}

.cv-admin__link {
  border: none;
  background: none;
  padding: 0;
  color: var(--ad-accent);

  &:hover {
    text-decoration: underline;
  }
}

.cv-admin__columns {
  display: grid;
  grid-template-columns: minmax(200px, 2fr) 3fr;
  gap: 0.75rem;
  align-items: start;
  margin-bottom: 0.75rem;
}

// With the preview open the panel is too narrow for two columns of
// one-line rows, so they stack.
@container (max-width: 960px) {
  .cv-admin__columns {
    grid-template-columns: 1fr;
  }
}

.cv-admin__column {
  min-width: 0;
  border-radius: 0.5rem;
  padding: 0.5rem;
  background: var(--ad-bg-2);

  &.is-sidebar {
    background: var(--ad-bg-3);
  }
}

.cv-admin__column-title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ad-muted);
  margin-bottom: 0.4rem;
}

.cv-admin__modal {
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: var(--ad-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem 1rem;
  overflow: auto;
}

.cv-admin__dialog {
  background: var(--ad-bg);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  width: min(640px, 100%);
}

.a-btn {
  &.is-disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-text);
  padding: 0.2rem 0.65rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }

  &--primary {
    background: var(--ad-accent);
    border-color: var(--ad-accent);
    color: var(--ad-bg);
  }

  &--success {
    background: var(--ad-success);
    border-color: var(--ad-success);
    color: var(--ad-bg);
  }

  &--icon {
    padding: 0.1rem 0.45rem;
  }
}

@media (max-width: 992px) {
  .cv-admin__grid {
    grid-template-columns: 1fr;
  }

  .cv-admin__panel,
  .cv-admin__preview {
    max-height: none;
  }

  .cv-admin__preview {
    width: auto !important;
  }
}

@media print {
  .cv-admin__grid {
    display: block;
  }

  .cv-admin__preview,
  .cv-admin__preview.is-hidden {
    position: static;
    transform: none;
    visibility: visible;
    max-height: none;
    overflow: visible;
    padding: 0;
    background: none;
  }

  .cv-admin__zoom {
    zoom: 1 !important;
  }
}
</style>
