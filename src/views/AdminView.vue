<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { sortRefsByDate } from "@/cv/order";
import CvAtsDocument from "@/components/CvAtsDocument.vue";
import CvDocument from "@/components/CvDocument.vue";
import EntryEditor from "@/components/EntryEditor.vue";
import {
  CVPage,
  EntryKind,
  EntryUsage,
  isBreak,
  LibraryEntry,
  PageBreak,
  Profile,
  SectionName,
  SectionOrder,
  SIDEBAR_SECTIONS,
  Variant,
  VariantRef,
  VariantSection,
} from "@/cv/types";

interface State {
  library: { profile: Profile; entries: LibraryEntry[] };
  sections: Record<SectionName, EntryKind>;
  timelineKinds: string[];
  variants: { id: string; name: string }[];
  published: string | null;
  usage: Record<string, EntryUsage>;
}

interface Placement {
  item: number; // index in variant.sections
  section: SectionName;
  index: number; // index in that section's refs
  ref: VariantRef;
}

const BREAK: PageBreak = { break: true };

type GroupBy = "kind" | "org" | "year" | "tag";

const KIND_LABELS: Record<EntryKind, string> = {
  job: "Jobs",
  education: "Education",
  project: "Projects",
  achievement: "Achievements",
  interest: "Interests",
  competency: "Competencies",
  skill: "Skills",
};
const KIND_ORDER = Object.keys(KIND_LABELS) as EntryKind[];

const SECTION_LABELS: Record<SectionName, string> = {
  education: "Education",
  competencies: "Competencies",
  achievements: "Achievements",
  interests: "Interests",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
};

async function api<T>(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/__cv/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-CV-Admin": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

const state = ref<State | null>(null);
const variant = ref<Variant | null>(null);
const savedSnapshot = ref(""); // "" = variant has never been saved
const busy = ref(false);
const status = ref("");
const error = ref("");

const tab = ref<"library" | "layout">("library");
const groupBy = ref<GroupBy>("kind");
const search = ref("");
const onlySelected = ref(false);
const zoom = ref(0.6);
const paged = ref(true); // preview as A4 sheets so overflow is visible

const entries = computed(() => state.value?.library.entries ?? []);
const byId = computed(() => new Map(entries.value.map((e) => [e.id, e])));
const sectionForKind = computed(() => {
  const map = {} as Record<EntryKind, SectionName>;
  for (const [section, kind] of Object.entries(state.value?.sections ?? {})) {
    map[kind as EntryKind] = section as SectionName;
  }
  return map;
});
const dirty = computed(
  () => !!variant.value && JSON.stringify(variant.value) !== savedSnapshot.value
);

const refId = (ref: VariantRef) => (typeof ref === "string" ? ref : ref.id);

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
const orderValue = (event: Event) =>
  (event.target as HTMLSelectElement).value as SectionOrder;

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

function selectedBullets(entry: LibraryEntry) {
  const at = placement.value.get(entry.id);
  if (!at) return [];
  if (typeof at.ref === "string" || !at.ref.bullets) {
    return (entry.bullets ?? []).map((b) => b.id);
  }
  return at.ref.bullets;
}

function toggleBullet(entry: LibraryEntry, bulletId: string, on: boolean) {
  const at = placement.value.get(entry.id);
  if (!at || !variant.value) return;
  const chosen = new Set(selectedBullets(entry));
  if (on) chosen.add(bulletId);
  else chosen.delete(bulletId);
  const all = (entry.bullets ?? []).map((b) => b.id);
  const bullets = all.filter((id) => chosen.has(id));
  const list = sectionItem(at.item)?.refs;
  if (!list) return;
  // Plain id means "all bullets", which keeps new library bullets included.
  list[at.index] =
    bullets.length === all.length ? entry.id : { id: entry.id, bullets };
}

const checked = (event: Event) => (event.target as HTMLInputElement).checked;

function onToggleEntry(entry: LibraryEntry, event: Event) {
  if (checked(event)) addRef(entry.id);
  else removeRef(entry.id);
}

function refLabel(ref: VariantRef) {
  const entry = byId.value.get(refId(ref));
  if (!entry) return `Missing: ${refId(ref)}`;
  let label = entry.org ? `${entry.title} · ${entry.org}` : entry.title;
  if (typeof ref !== "string" && ref.bullets && entry.bullets) {
    label += ` (${ref.bullets.length}/${entry.bullets.length} bullets)`;
  }
  return label;
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
  [...new Set(entries.value.map((e) => e.category).filter(Boolean))].sort()
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
    if (typeof at.ref !== "string" && at.ref.bullets) {
      const have = new Set((entry.bullets ?? []).map((b) => b.id));
      const kept = at.ref.bullets.filter((b) => have.has(b));
      if (kept.length !== at.ref.bullets.length) {
        const list = sectionItem(at.item)?.refs;
        if (list) list[at.index] = kept.length ? { id, bullets: kept } : id;
      }
    }
  }
}

const publishTimeline = () =>
  run(async () => {
    const { count } = await api<{ count: number }>("timeline", "POST");
    flash(`Published ${count} checkpoints to /timeline`);
  });

const saveEntry = (entry: LibraryEntry) =>
  run(async () => {
    const isNew = !editor.value?.entry;
    await api(`entries/${entry.id}`, "PUT", entry);
    await loadState();
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
    reconcileVariant();
    schedulePreview();
    editor.value = null;
    flash(`Deleted "${entry.title}"`);
  });

// --- Library grouping ---
const visibleEntries = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter((e) => {
    if (onlySelected.value && !placement.value.has(e.id)) return false;
    if (!q) return true;
    const haystack = [
      e.title,
      e.org,
      e.category,
      e.details,
      e.tech,
      ...e.tags,
      ...(e.bullets ?? []).map((b) => b.text),
    ];
    return haystack.some((text) => text?.toLowerCase().includes(q));
  });
});

const groups = computed(() => {
  const map = new Map<string, LibraryEntry[]>();
  const add = (label: string, entry: LibraryEntry) => {
    const list = map.get(label) ?? [];
    list.push(entry);
    map.set(label, list);
  };
  for (const e of visibleEntries.value) {
    if (groupBy.value === "kind") add(KIND_LABELS[e.kind], e);
    else if (groupBy.value === "org") {
      add(
        e.org ?? (e.category ? `Skills · ${e.category}` : KIND_LABELS[e.kind]),
        e
      );
    } else if (groupBy.value === "year")
      add(e.start?.slice(0, 4) ?? "Undated", e);
    else (e.tags.length ? e.tags : ["untagged"]).forEach((t) => add(t, e));
  }

  const newest = (items: LibraryEntry[]) =>
    items.reduce((max, e) => ((e.start ?? "") > max ? e.start ?? "" : max), "");
  const list = [...map.entries()].map(([label, items]) => ({
    label,
    items: [...items].sort(
      (a, b) =>
        (b.start ?? "").localeCompare(a.start ?? "") ||
        a.title.localeCompare(b.title)
    ),
  }));

  if (groupBy.value === "kind") {
    list.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.items[0].kind) -
        KIND_ORDER.indexOf(b.items[0].kind)
    );
  } else if (groupBy.value === "tag") {
    list.sort(
      (a, b) =>
        Number(a.label === "untagged") - Number(b.label === "untagged") ||
        a.label.localeCompare(b.label)
    );
  } else {
    // Most recent first; undated groups (skills, interests, ...) last.
    list.sort(
      (a, b) =>
        newest(b.items).localeCompare(newest(a.items)) ||
        a.label.localeCompare(b.label)
    );
  }
  return list;
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
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function loadState() {
  state.value = await api<State>("state");
}

async function loadVariant(id: string) {
  const loaded = await api<Variant>(`variants/${id}`);
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

async function saveVariant() {
  if (!variant.value) return;
  await api(`variants/${variant.value.id}`, "PUT", variant.value);
  savedSnapshot.value = JSON.stringify(variant.value);
  await loadState();
}

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
    flash(`Published "${variant.value.name}" to /my-experience`);
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
  state.value.variants.push({ id, name });
  flash("Duplicated. Save to keep it.");
}

// --- Live preview, rendered by the same code as publishing ---
const preview = ref<CVPage[]>([]);
const previewError = ref("");
let previewTimer: number | undefined;
let previewSeq = 0;

function schedulePreview() {
  const current = variant.value;
  if (!current) return;
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(async () => {
    const seq = ++previewSeq;
    try {
      const { pages } = await api<{ pages: CVPage[] }>(
        "preview",
        "POST",
        current
      );
      if (seq !== previewSeq) return;
      preview.value = pages;
      previewError.value = "";
    } catch (err) {
      if (seq === previewSeq) previewError.value = (err as Error).message;
    }
  }, 250);
}

watch(variant, schedulePreview, { deep: true });

// In paged mode each sheet clips, so measure how much would be cut off.
const previewEl = ref<HTMLElement | null>(null);
const overflow = ref<{ page: number; mm: number }[]>([]);

async function measureOverflow() {
  await nextTick();
  const sheets = previewEl.value?.querySelectorAll<HTMLElement>(".cv-page");
  if (!paged.value || !sheets?.length) {
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

watch([preview, paged, zoom], measureOverflow);

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
  run(async () => {
    await loadState();
    const first = state.value?.published ?? state.value?.variants[0]?.id;
    if (first) await loadVariant(first);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", warnOnUnload);
  window.clearTimeout(previewTimer);
});

onBeforeRouteLeave(
  () => !dirty.value || confirm("You have unsaved changes. Leave anyway?")
);
</script>

<template>
  <div class="cv-admin">
    <div v-if="error" class="alert alert-danger no-print">{{ error }}</div>

    <div v-if="state && variant" class="cv-admin__grid">
      <section class="cv-admin__panel no-print">
        <!-- Variant settings -->
        <div class="cv-admin__variant">
          <div class="d-flex gap-2 align-items-end">
            <label class="flex-grow-1">
              <span class="cv-admin__label">Variant</span>
              <select
                class="form-select form-select-sm"
                :value="variant.id"
                @change="onSwitchVariant"
              >
                <option v-for="v in state.variants" :key="v.id" :value="v.id">
                  {{ v.name
                  }}{{ v.id === state.published ? " (published)" : "" }}
                </option>
              </select>
            </label>
            <button class="a-btn" :disabled="busy" @click="duplicate">
              Duplicate
            </button>
            <button
              class="a-btn"
              title="Name and contact details, shared by every variant"
              :disabled="busy"
              @click="editProfile"
            >
              Profile
            </button>
            <button
              class="a-btn"
              title="Regenerate cv/timeline.json. Saving an entry already does this; use it after editing library.json by hand."
              :disabled="busy"
              @click="publishTimeline"
            >
              Publish timeline
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
              @click="save"
            >
              Save
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
            <span
              class="small ms-auto"
              :class="dirty ? 'text-warning' : 'text-success'"
            >
              {{ dirty ? "Unsaved changes" : status }}
            </span>
          </div>
        </div>

        <div class="cv-admin__tabs">
          <button
            :class="{ active: tab === 'library' }"
            @click="tab = 'library'"
          >
            Library
          </button>
          <button :class="{ active: tab === 'layout' }" @click="tab = 'layout'">
            Layout ({{ placement.size }} selected)
          </button>
        </div>

        <!-- Library: everything, grouped, with checkboxes -->
        <div v-if="tab === 'library'">
          <div class="d-flex gap-2 mb-2 flex-wrap align-items-center">
            <select v-model="groupBy" class="form-select form-select-sm w-auto">
              <option value="kind">Group by type</option>
              <option value="org">Group by company / org</option>
              <option value="year">Group by start year</option>
              <option value="tag">Group by tag</option>
            </select>
            <input
              v-model="search"
              type="search"
              class="form-control form-control-sm w-auto flex-grow-1"
              placeholder="Search"
            />
            <label class="form-check small mb-0">
              <input
                v-model="onlySelected"
                type="checkbox"
                class="form-check-input"
              />
              Selected only
            </label>
            <button
              class="a-btn a-btn--primary"
              :disabled="busy"
              @click="openEditor(null)"
            >
              + New entry
            </button>
          </div>

          <div v-for="(group, g) in groups" :key="group.label" class="mb-3">
            <h6 class="cv-admin__group">
              {{ group.label }}
              <span class="text-muted fw-normal">
                {{ group.items.filter((e) => placement.has(e.id)).length }}/{{
                  group.items.length
                }}
              </span>
            </h6>
            <div
              v-for="entry in group.items"
              :key="entry.id"
              class="cv-admin__entry"
              :class="{ 'is-selected': placement.has(entry.id) }"
            >
              <div class="d-flex align-items-start gap-2">
                <input
                  :id="`entry-${g}-${entry.id}`"
                  type="checkbox"
                  class="form-check-input mt-1 flex-shrink-0"
                  :checked="placement.has(entry.id)"
                  @change="onToggleEntry(entry, $event)"
                />
                <label :for="`entry-${g}-${entry.id}`" class="flex-grow-1">
                  <strong>{{ entry.title }}</strong>
                  <span v-if="entry.org" class="text-muted">
                    · {{ entry.org }}</span
                  >
                  <span v-if="entry.category" class="text-muted">
                    · {{ entry.category }}</span
                  >
                  <span
                    v-if="entry.displayDates"
                    class="d-block small text-muted"
                  >
                    {{ entry.displayDates }}
                  </span>
                  <span class="d-block">
                    <span
                      v-if="groupBy !== 'kind'"
                      class="cv-admin__tag is-kind"
                    >
                      {{ entry.kind }}
                    </span>
                    <span
                      v-for="t in entry.tags"
                      :key="t"
                      class="cv-admin__tag"
                    >
                      {{ t }}
                    </span>
                  </span>
                </label>
                <button
                  class="a-btn a-btn--icon"
                  title="Edit entry"
                  @click="openEditor(entry)"
                >
                  ✎
                </button>
                <span
                  v-if="placement.has(entry.id) && sheetCount > 1"
                  class="cv-admin__tag"
                  title="Printed sheet"
                >
                  p{{
                    sheetOf.get(
                      `${placement.get(entry.id)?.item}/${
                        placement.get(entry.id)?.index
                      }`
                    )
                  }}
                </span>
              </div>
              <div
                v-if="entry.bullets?.length && placement.has(entry.id)"
                class="cv-admin__bullets"
              >
                <label
                  v-for="bullet in entry.bullets"
                  :key="bullet.id"
                  class="form-check small"
                >
                  <input
                    type="checkbox"
                    class="form-check-input"
                    :checked="selectedBullets(entry).includes(bullet.id)"
                    @change="toggleBullet(entry, bullet.id, checked($event))"
                  />
                  <span v-html="bullet.text"></span>
                </label>
              </div>
            </div>
          </div>
          <p v-if="!groups.length" class="text-muted small">Nothing matches.</p>
        </div>

        <!-- Layout: one ordered list of sections, cut into sheets by breaks -->
        <div v-else>
          <p class="small text-muted">
            Most important first. Page breaks cut the list into printed sheets:
            everything after a break goes to the next sheet, sidebar or main
            column alike, and a section that continues repeats its heading. Name
            and contact details only print on sheet 1.
          </p>
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
            <div v-else class="mb-3">
              <div class="cv-admin__row cv-admin__section">
                <span class="cv-admin__label flex-grow-1 mb-0">
                  {{ SECTION_LABELS[item.section] }}
                  <span v-if="isSidebar(item.section)" class="cv-admin__tag">
                    sidebar
                  </span>
                  <span v-if="sheetCount > 1" class="cv-admin__tag">
                    p{{ sheetOf.get(`${i}`) }}
                  </span>
                </span>
                <select
                  class="form-select form-select-sm w-auto py-0"
                  title="Order of the entries in this section"
                  :value="item.order ?? 'manual'"
                  @change="setOrder(i, orderValue($event))"
                >
                  <option value="manual">Manual order</option>
                  <option value="date">Newest first</option>
                </select>
                <button
                  class="a-btn a-btn--icon"
                  title="Move section up"
                  :disabled="i === 0"
                  @click="moveSection(i, -1)"
                >
                  ↑
                </button>
                <button
                  class="a-btn a-btn--icon"
                  title="Move section down"
                  :disabled="i === variant.sections.length - 1"
                  @click="moveSection(i, 1)"
                >
                  ↓
                </button>
                <button
                  class="a-btn a-btn--icon"
                  title="Insert a page break after this section"
                  @click="breakAfterSection(i)"
                >
                  ⤓
                </button>
              </div>
              <template v-for="(ref, r) in item.refs" :key="r">
                <div v-if="isBreak(ref)" class="cv-admin__break is-inner">
                  <span class="flex-grow-1">
                    — page break ({{ SECTION_LABELS[item.section] }} continues)
                    —
                  </span>
                  <button
                    class="a-btn a-btn--icon"
                    title="Remove break"
                    @click="removeRefBreak(i, r)"
                  >
                    ✕
                  </button>
                </div>
                <div v-else class="cv-admin__row">
                  <span class="flex-grow-1">{{ refLabel(ref) }}</span>
                  <template v-if="item.order !== 'date'">
                    <button
                      class="a-btn a-btn--icon"
                      title="Move up"
                      :disabled="r === 0"
                      @click="moveRef(i, r, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="a-btn a-btn--icon"
                      title="Move down"
                      :disabled="r === item.refs.length - 1"
                      @click="moveRef(i, r, 1)"
                    >
                      ↓
                    </button>
                  </template>
                  <button
                    class="a-btn a-btn--icon"
                    title="Insert a page break after this entry"
                    @click="breakAfterRef(i, r)"
                  >
                    ⤓
                  </button>
                  <button
                    class="a-btn a-btn--icon"
                    title="Remove from this variant"
                    @click="removeRef(refId(ref))"
                  >
                    ✕
                  </button>
                </div>
              </template>
            </div>
          </template>
          <p v-if="!variant.sections.length" class="small text-muted">
            Nothing selected yet. Tick entries in the Library tab.
          </p>
        </div>
      </section>

      <!-- Preview -->
      <section class="cv-admin__preview" :style="{ width: previewWidth }">
        <div class="d-flex gap-2 align-items-center mb-2 no-print">
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
            <input v-model="paged" type="checkbox" class="form-check-input" />
            A4 pages
          </label>
          <span v-if="previewError" class="small text-danger">{{
            previewError
          }}</span>
        </div>
        <div
          v-if="variant.contact && variant.id === state.published"
          class="alert alert-warning py-1 px-2 small no-print"
        >
          This variant is published with phone and location, so they are visible
          on the public site.
        </div>
        <div
          v-for="o in overflow"
          :key="o.page"
          class="alert alert-danger py-1 px-2 small no-print"
        >
          Page {{ o.page }} overflows by about {{ o.mm }}mm. Move something to
          another page or untick some bullets, or it will be cut off in print.
        </div>
        <div ref="previewEl" class="cv-admin__zoom" :style="{ zoom }">
          <template v-if="preview.length">
            <CvAtsDocument v-if="variant.layout === 'ats'" :pages="preview" />
            <CvDocument v-else :pages="preview" :paged="paged" />
          </template>
        </div>
      </section>
    </div>

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
  width: 100%;
  padding: 0 1rem;
  color: #1e293b;
}

.cv-admin__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
}

.cv-admin__panel,
.cv-admin__preview {
  border-radius: 0.5rem;
  padding: 1rem;
  max-height: calc(100vh - 140px);
  overflow: auto;
}

.cv-admin__panel {
  background: #fff;
}

.cv-admin__preview {
  background: #e2e8f0;
  max-width: 100%;
}

.cv-admin__variant {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
}

.cv-admin__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.cv-admin__tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;

  button {
    border: none;
    background: none;
    padding: 0.4rem 0.75rem;
    color: #64748b;
    border-bottom: 2px solid transparent;

    &.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }
  }
}

.cv-admin__group {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.35rem;
}

.cv-admin__entry {
  padding: 0.4rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;

  &.is-selected {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  label {
    cursor: pointer;
  }
}

.cv-admin__bullets {
  margin: 0.35rem 0 0 1.6rem;
}

.cv-admin__tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  margin: 0.15rem 0.25rem 0 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;

  &.is-kind {
    background: #1e293b;
    color: #fff;
  }
}

.cv-admin__break {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0 1rem;
  padding: 0.2rem 0.5rem;
  border: 1px dashed #f59e0b;
  border-radius: 0.375rem;
  color: #b45309;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &.is-inner {
    margin: 0.25rem 0;
  }
}

.cv-admin__section {
  border-bottom: 1px solid #cbd5e1;
}

.cv-admin__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0;
  font-size: 0.9rem;
  border-bottom: 1px solid #f1f5f9;
}

.cv-admin__modal {
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem 1rem;
  overflow: auto;
}

.cv-admin__dialog {
  background: #fff;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  width: min(640px, 100%);
}

.a-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  padding: 0.2rem 0.65rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }

  &--primary {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  &--success {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
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

  .cv-admin__preview {
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
