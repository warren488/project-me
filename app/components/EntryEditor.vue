<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type {
  Bullet,
  EntryKind,
  EntryUsage,
  Highlight,
  LibraryEntry,
  ProjectHome,
  ProjectStatus,
} from "@/cv/types";
import {
  PROJECT_HOMES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "@/cv/types";
import { rowId, slug } from "@/cv/ids";
import CondenseDialog from "./CondenseDialog.vue";

// Add / edit one library entry. The parent owns saving; this component only
// turns the form into a clean LibraryEntry and emits it.
const props = defineProps<{
  entry: LibraryEntry | null; // null = new entry
  existingIds: string[];
  knownTags: string[];
  knownCategories: string[];
  usage?: EntryUsage;
  timelineKinds: string[]; // kinds shown on the timeline by default
  jobs?: LibraryEntry[]; // parents an engagement can sit under
  variants?: { id: string; name: string }[]; // the CVs, for condensed groups
  busy: boolean;
}>();

const emit = defineEmits<{
  (e: "save", entry: LibraryEntry): void;
  (e: "delete"): void;
  (e: "cancel"): void;
}>();

const KIND_LABELS: Record<EntryKind, string> = {
  job: "Job",
  engagement: "Client engagement",
  education: "Education",
  project: "Project",
  achievement: "Achievement",
  interest: "Interest",
  competency: "Competency",
  skill: "Skill",
};
const KINDS = Object.keys(KIND_LABELS) as EntryKind[];
const ID_PREFIX: Record<EntryKind, string> = {
  job: "job",
  engagement: "eng",
  education: "edu",
  project: "proj",
  achievement: "ach",
  interest: "int",
  competency: "comp",
  skill: "skill",
};

// Which fields each kind uses, and what to call them.
type Field =
  "org" | "parent" | "category" | "dates" | "details" | "site" | "bullets";
const FIELDS: Record<EntryKind, Partial<Record<Field, string>>> = {
  job: { org: "Company", dates: "Dates", bullets: "Bullets" },
  // Title is the client's name; the job it was through is the parent.
  engagement: { parent: "Under job", dates: "Dates", bullets: "Bullets" },
  education: { org: "Institution", dates: "Dates", details: "Details" },
  // Projects carry the home page card (site) as well as the CV blurb.
  project: {
    dates: "Dates (optional)",
    details: "CV blurb",
    site: "Site card",
  },
  achievement: {
    org: "Awarded by",
    dates: "Dates (optional)",
    details: "Note",
  },
  interest: { dates: "Dates (optional)", details: "Description" },
  competency: {},
  skill: { category: "Category" },
};

interface BulletForm {
  id: string;
  text: string;
  tags: string;
  timeline: boolean;
  customId: boolean;
}

// A condensed highlight: no tags or timeline flag, but the CV it was written
// for ("" = general) and the bullets it came from (kept as it was, only the
// text is edited here).
interface HighlightForm {
  id: string;
  text: string;
  for: string;
  from: string[];
  customId: boolean;
}

const HOME_LABELS: Record<ProjectHome, string> = {
  featured: "Featured",
  more: "More projects",
  hidden: "Hidden",
};

const isNew = computed(() => props.entry === null);
const form = reactive({
  id: "",
  kind: "job" as EntryKind,
  title: "",
  org: "",
  parent: "",
  category: "",
  start: "",
  end: "",
  present: false,
  details: "",
  tech: "",
  tagline: "",
  description: "",
  year: "",
  status: "" as ProjectStatus | "",
  live: "",
  source: "",
  home: "hidden" as ProjectHome,
  timeline: false,
  recent: true,
  tags: "",
  notes: "",
  bullets: [] as BulletForm[],
  highlights: [] as HighlightForm[],
});
const customId = ref(false); // user typed their own id, stop auto-generating
const message = ref("");

watch(
  () => props.entry,
  (entry) => {
    Object.assign(form, {
      id: entry?.id ?? "",
      kind: entry?.kind ?? "job",
      title: entry?.title ?? "",
      org: entry?.org ?? "",
      parent: entry?.parent ?? "",
      category: entry?.category ?? "",
      start: entry?.start ?? "",
      end: entry?.end ?? "",
      present: !!entry?.start && !entry?.end,
      details: entry?.details ?? "",
      tech: (entry?.tech ?? []).join(", "),
      tagline: entry?.tagline ?? "",
      description: entry?.description ?? "",
      year: entry?.year ? String(entry.year) : "",
      status: entry?.status ?? "",
      live: entry?.links?.live ?? "",
      source: entry?.links?.source ?? "",
      home: entry?.home ?? "hidden",
      timeline:
        entry?.timeline ??
        props.timelineKinds.includes(entry?.kind ?? form.kind),
      recent: entry?.recent !== false,
      tags: (entry?.tags ?? []).join(", "),
      notes: entry?.notes ?? "",
      bullets: (entry?.bullets ?? []).map((b) => ({
        id: b.id,
        text: b.text,
        tags: b.tags.join(", "),
        timeline: b.timeline !== false,
        customId: true,
      })),
      highlights: (entry?.highlights ?? []).map((h) => ({
        id: h.id,
        text: h.text,
        for: h.for ?? "",
        from: [...(h.from ?? [])],
        customId: true,
      })),
    });
    customId.value = !!entry;
    message.value = "";
  },
  { immediate: true }
);

const fields = computed(() => FIELDS[form.kind]);

// Switching kind resets the timeline toggle to that kind's default.
watch(
  () => form.kind,
  (kind) => {
    form.timeline = props.timelineKinds.includes(kind);
  }
);
const usedIn = computed(() => props.usage?.variants ?? []);

// Ids are derived from the kind and title until the user edits them by hand.
const autoId = () => `${ID_PREFIX[form.kind]}-${slug(form.title)}`;
watch(
  () => [form.kind, form.title],
  () => {
    if (isNew.value && !customId.value) form.id = autoId();
  }
);

// Bullets and highlights share one id space on the entry.
const idTaken = (id: string, except: BulletForm | HighlightForm) =>
  form.bullets.some((b) => b !== except && b.id === id) ||
  form.highlights.some((h) => h !== except && h.id === id);

const autoRowId = (row: BulletForm | HighlightForm, mark: string) =>
  rowId(form.id, row.text, mark, (id) => idTaken(id, row));
const bulletAutoId = (bullet: BulletForm) => autoRowId(bullet, "");
const highlightAutoId = (highlight: HighlightForm) =>
  autoRowId(highlight, "-hl");

watch(
  () => form.bullets.map((b) => b.text),
  () => {
    for (const bullet of form.bullets) {
      if (!bullet.customId) bullet.id = bulletAutoId(bullet);
    }
  }
);
watch(
  () => form.highlights.map((h) => h.text),
  () => {
    for (const highlight of form.highlights) {
      if (!highlight.customId) highlight.id = highlightAutoId(highlight);
    }
  }
);

const bulletUsedIn = (id: string) => props.usage?.bullets[id] ?? [];

// The source bullets a highlight was condensed from, for its tooltip.
const sourceText = (from: string[]) =>
  from
    .map((id) => form.bullets.find((b) => b.id === id)?.text)
    .filter((t): t is string => !!t)
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("\n");

// Highlights grouped by the CV they were written for: every CV first (in
// the dashboard's order), then General, then any CV that no longer exists.
interface HighlightGroup {
  id: string; // variant id, "" for general
  name: string;
  items: HighlightForm[];
}
const highlightGroups = computed((): HighlightGroup[] => {
  const known = props.variants ?? [];
  const groups: HighlightGroup[] = known.map((v) => ({
    id: v.id,
    name: v.name,
    items: [],
  }));
  groups.push({ id: "", name: "General (any CV)", items: [] });
  for (const h of form.highlights) {
    let group = groups.find((g) => g.id === h.for);
    if (!group) {
      group = { id: h.for, name: `${h.for} (no such CV)`, items: [] };
      groups.push(group);
    }
    group.items.push(h);
  }
  return groups;
});

function addHighlight(forId: string) {
  form.highlights.push({
    id: "",
    text: "",
    for: forId,
    from: [],
    customId: false,
  });
}

function removeHighlight(highlight: HighlightForm) {
  const used = bulletUsedIn(highlight.id);
  if (
    used.length &&
    !confirm(
      `This highlight is used by ${used.join(
        ", "
      )}. Removing it here means it must be unticked there before this can be saved. Continue?`
    )
  ) {
    return;
  }
  form.highlights.splice(form.highlights.indexOf(highlight), 1);
}

// Moves a highlight within its CV's group.
function moveHighlight(
  group: HighlightGroup,
  highlight: HighlightForm,
  by: number
) {
  const at = group.items.indexOf(highlight);
  const other = group.items[at + by];
  if (!other) return;
  const list = form.highlights;
  const i = list.indexOf(highlight);
  const j = list.indexOf(other);
  [list[i], list[j]] = [list[j], list[i]];
}

// --- Condense: a model writes a CV's highlights from the saved bullets ---
const condensing = ref<string | null>(null); // the CV id, "" = general
const note = ref("");

const savedHighlights = computed(() =>
  form.highlights.map((h) => {
    const out: Highlight = { id: h.id, text: h.text };
    if (h.for) out.for = h.for;
    return out;
  })
);
const takenIds = computed(() => [
  ...form.bullets.map((b) => b.id),
  ...form.highlights.map((h) => h.id),
]);

function onCondensed(highlights: Highlight[], forId: string, replace: boolean) {
  if (replace) {
    for (const h of [...form.highlights]) {
      if (h.for === forId)
        form.highlights.splice(form.highlights.indexOf(h), 1);
    }
  }
  for (const h of highlights) {
    form.highlights.push({
      id: h.id,
      text: h.text,
      for: forId,
      from: [...(h.from ?? [])],
      customId: true,
    });
  }
  condensing.value = null;
  const name = props.variants?.find((v) => v.id === forId)?.name ?? "any CV";
  note.value = `Added ${highlights.length} for ${name}. Save the entry to keep them${
    forId ? ", then switch that CV to Condensed under CVs" : ""
  }.`;
}

function addBullet() {
  form.bullets.push({
    id: "",
    text: "",
    tags: "",
    timeline: true,
    customId: false,
  });
}

function removeBullet(index: number) {
  const used = bulletUsedIn(form.bullets[index].id);
  if (
    used.length &&
    !confirm(
      `This bullet is used by ${used.join(
        ", "
      )}. Removing it here means it must be unticked there before this can be saved. Continue?`
    )
  ) {
    return;
  }
  form.bullets.splice(index, 1);
}

function moveBullet(index: number, by: number) {
  const to = index + by;
  if (to < 0 || to >= form.bullets.length) return;
  const list = form.bullets;
  [list[index], list[to]] = [list[to], list[index]];
}

const splitTags = (text: string) =>
  text
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

// Tech keeps its case and spaces ("Firebase Functions"); commas separate.
const splitList = (text: string) =>
  text
    .split(/\s*[,•]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);

function toEntry(): LibraryEntry {
  const entry: LibraryEntry = {
    id: form.id.trim(),
    kind: form.kind,
    title: form.title.trim(),
    tags: splitTags(form.tags),
  };
  if (fields.value.org && form.org.trim()) entry.org = form.org.trim();
  if (fields.value.parent && form.parent) entry.parent = form.parent;
  if (fields.value.category) entry.category = form.category.trim();
  if (fields.value.dates && form.start.trim()) {
    entry.start = form.start.trim();
    entry.end = form.present ? null : form.end.trim() || null;
  }
  if (fields.value.details && form.details.trim())
    entry.details = form.details.trim();
  if (fields.value.site) {
    const tech = splitList(form.tech);
    if (tech.length) entry.tech = tech;
    if (form.tagline.trim()) entry.tagline = form.tagline.trim();
    if (form.description.trim()) entry.description = form.description.trim();
    if (form.year.trim()) entry.year = Number(form.year.trim());
    if (form.status) entry.status = form.status;
    const links: NonNullable<LibraryEntry["links"]> = {};
    if (form.live.trim()) links.live = form.live.trim();
    if (form.source.trim()) links.source = form.source.trim();
    if (Object.keys(links).length) entry.links = links;
    entry.home = form.home; // the server drops the default ("hidden")
  }
  if (entry.start) {
    entry.timeline = form.timeline;
    if (!form.recent) entry.recent = false;
  }
  if (form.notes.trim()) entry.notes = form.notes.trim();
  if (fields.value.bullets && form.bullets.length) {
    entry.bullets = form.bullets.map((b): Bullet => {
      const bullet: Bullet = {
        id: b.id.trim(),
        text: b.text.trim(),
        tags: splitTags(b.tags),
      };
      if (!b.timeline) bullet.timeline = false;
      return bullet;
    });
  }
  if (fields.value.bullets && form.highlights.length) {
    entry.highlights = form.highlights.map((h): Highlight => {
      const highlight: Highlight = { id: h.id.trim(), text: h.text.trim() };
      if (h.for) highlight.for = h.for;
      if (h.from.length) highlight.from = [...h.from];
      return highlight;
    });
  }
  return entry;
}

function submit() {
  message.value = "";
  const entry = toEntry();
  if (!entry.title) return (message.value = "Title is required");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id))
    return (message.value = "Id must be lowercase letters, digits and dashes");
  if (isNew.value && props.existingIds.includes(entry.id))
    return (message.value = `An entry with id "${entry.id}" already exists`);
  if (entry.kind === "skill" && !entry.category)
    return (message.value = "Skills need a category");
  const rowIds = [...(entry.bullets ?? []), ...(entry.highlights ?? [])].map(
    (r) => r.id
  );
  const dup = rowIds.find((id, i) => rowIds.indexOf(id) !== i);
  if (dup) return (message.value = `Two bullets share the id "${dup}"`);
  if (entry.kind === "engagement" && !entry.parent)
    return (message.value = "An engagement needs a job to sit under");
  if (entry.kind === "project" && entry.home !== "hidden") {
    for (const field of ["tagline", "description", "year", "status"] as const) {
      if (entry[field] === undefined)
        return (message.value = `A project on the home page needs a ${field}, or set it to hidden`);
    }
  }
  if (
    props.entry &&
    props.entry.kind !== entry.kind &&
    usedIn.value.length &&
    !confirm(
      `Changing the type will fail while ${usedIn.value.join(
        ", "
      )} still list this entry. Try anyway?`
    )
  ) {
    return;
  }
  emit("save", entry);
}

function remove() {
  if (usedIn.value.length) {
    message.value = `Used by ${usedIn.value.join(
      ", "
    )}. Remove it from those variants first.`;
    return;
  }
  if (confirm(`Delete "${form.title || form.id}" from the library?`))
    emit("delete");
}
</script>

<template>
  <form class="entry-editor" @submit.prevent="submit">
    <div class="d-flex align-items-center gap-2 mb-2">
      <h5 class="mb-0 flex-grow-1">
        {{
          isNew ? "New entry" : `Edit ${KIND_LABELS[form.kind].toLowerCase()}`
        }}
      </h5>
      <span v-if="usedIn.length" class="small text-muted">
        Used in {{ usedIn.join(", ") }}
      </span>
    </div>

    <div class="row g-2">
      <label class="col-4">
        <span class="entry-editor__label">Type</span>
        <select v-model="form.kind" class="form-select form-select-sm">
          <option v-for="k in KINDS" :key="k" :value="k">
            {{ KIND_LABELS[k] }}
          </option>
        </select>
      </label>
      <label class="col-8">
        <span class="entry-editor__label">Id</span>
        <input
          v-model="form.id"
          class="form-control form-control-sm font-monospace"
          :readonly="!isNew"
          :title="
            isNew ? '' : 'Ids can\'t change once saved; variants refer to them'
          "
          @input="customId = true"
        />
      </label>
      <label class="col-12">
        <span class="entry-editor__label">Title</span>
        <input
          v-model="form.title"
          class="form-control form-control-sm"
          required
        />
      </label>
      <label v-if="fields.org" class="col-12">
        <span class="entry-editor__label">{{ fields.org }}</span>
        <input v-model="form.org" class="form-control form-control-sm" />
      </label>
      <label v-if="fields.parent" class="col-12">
        <span class="entry-editor__label">{{ fields.parent }}</span>
        <select v-model="form.parent" class="form-select form-select-sm">
          <option value="" disabled>Choose a job…</option>
          <option v-for="j in props.jobs ?? []" :key="j.id" :value="j.id">
            {{ j.title }}<template v-if="j.org"> · {{ j.org }}</template>
          </option>
        </select>
      </label>
      <label v-if="fields.category" class="col-12">
        <span class="entry-editor__label">{{ fields.category }}</span>
        <input
          v-model="form.category"
          class="form-control form-control-sm"
          list="entry-editor-categories"
          required
        />
        <datalist id="entry-editor-categories">
          <option v-for="c in knownCategories" :key="c" :value="c" />
        </datalist>
      </label>
      <template v-if="fields.dates">
        <label class="col-4">
          <span class="entry-editor__label">Start</span>
          <input
            v-model="form.start"
            class="form-control form-control-sm"
            placeholder="YYYY-MM"
            pattern="\d{4}(-\d{2})?"
          />
        </label>
        <label class="col-4">
          <span class="entry-editor__label">End</span>
          <input
            v-model="form.end"
            class="form-control form-control-sm"
            placeholder="YYYY-MM"
            pattern="\d{4}(-\d{2})?"
            :disabled="form.present"
          />
        </label>
        <label class="col-4 form-check d-flex align-items-end gap-1 ps-4 mb-0">
          <input
            v-model="form.present"
            type="checkbox"
            class="form-check-input"
          />
          <span class="small">Present</span>
        </label>
      </template>
      <!-- Which public surfaces this entry appears on. The CV is chosen per
           variant in the Layout tab instead. -->
      <div v-if="fields.dates || fields.site" class="col-12">
        <span class="entry-editor__label">Shown on</span>
        <div class="entry-editor__chips">
          <template v-if="fields.dates">
            <button
              type="button"
              class="chip"
              :class="{ 'is-on': form.timeline && form.start.trim() }"
              :aria-pressed="form.timeline"
              :disabled="!form.start.trim()"
              title="The public timeline"
              @click="form.timeline = !form.timeline"
            >
              Timeline
            </button>
            <button
              type="button"
              class="chip"
              :class="{
                'is-on': form.recent && form.timeline && form.start.trim(),
              }"
              :aria-pressed="form.recent"
              :disabled="!form.start.trim() || !form.timeline"
              title="Eligible for the home page's Recently strip (the three newest timeline items)"
              @click="form.recent = !form.recent"
            >
              Home · Recently
            </button>
            <span v-if="!form.start.trim()" class="small text-muted">
              needs a start date
            </span>
          </template>
          <span
            v-if="fields.dates && fields.site"
            class="entry-editor__sep"
          ></span>
          <template v-if="fields.site">
            <span class="small text-muted me-1">Home page:</span>
            <button
              v-for="h in PROJECT_HOMES"
              :key="h"
              type="button"
              class="chip"
              :class="{ 'is-on': form.home === h }"
              :aria-pressed="form.home === h"
              @click="form.home = h"
            >
              {{ HOME_LABELS[h] }}
            </button>
          </template>
        </div>
      </div>
      <label v-if="fields.details" class="col-12">
        <span class="entry-editor__label"
          >{{ fields.details }} (HTML allowed)</span
        >
        <textarea
          v-model="form.details"
          rows="2"
          class="form-control form-control-sm"
        ></textarea>
      </label>
      <template v-if="fields.site">
        <div class="col-12 entry-editor__group">
          {{ fields.site }}
          <span class="text-muted fw-normal text-lowercase">
            · what the home page card shows
          </span>
        </div>
        <label class="col-12">
          <span class="entry-editor__label">Tagline</span>
          <input
            v-model="form.tagline"
            class="form-control form-control-sm"
            placeholder="One line under the title"
          />
        </label>
        <label class="col-12">
          <span class="entry-editor__label">Description</span>
          <textarea
            v-model="form.description"
            rows="2"
            class="form-control form-control-sm"
          ></textarea>
        </label>
        <label class="col-12">
          <span class="entry-editor__label">Tech (comma separated)</span>
          <input
            v-model="form.tech"
            class="form-control form-control-sm"
            placeholder="React, TypeScript, Firebase"
          />
        </label>
        <label class="col-4">
          <span class="entry-editor__label">Year</span>
          <input
            v-model="form.year"
            class="form-control form-control-sm"
            placeholder="YYYY"
            pattern="\d{4}"
          />
        </label>
        <label class="col-8">
          <span class="entry-editor__label">Status</span>
          <select v-model="form.status" class="form-select form-select-sm">
            <option value="">—</option>
            <option v-for="st in PROJECT_STATUSES" :key="st" :value="st">
              {{ PROJECT_STATUS_LABELS[st] }}
            </option>
          </select>
        </label>
        <label class="col-6">
          <span class="entry-editor__label">Live link</span>
          <input
            v-model="form.live"
            class="form-control form-control-sm"
            type="url"
            placeholder="https://"
          />
        </label>
        <label class="col-6">
          <span class="entry-editor__label">Source link</span>
          <input
            v-model="form.source"
            class="form-control form-control-sm"
            type="url"
            placeholder="https://github.com/…"
          />
        </label>
      </template>
      <label class="col-12">
        <span class="entry-editor__label">Tags (comma separated)</span>
        <input
          v-model="form.tags"
          class="form-control form-control-sm"
          list="entry-editor-tags"
        />
        <datalist id="entry-editor-tags">
          <option v-for="t in knownTags" :key="t" :value="t" />
        </datalist>
      </label>
      <label class="col-12">
        <span class="entry-editor__label">
          Notes
          <span class="text-muted fw-normal text-lowercase">
            · private, never published
          </span>
        </span>
        <textarea
          v-model="form.notes"
          rows="1"
          class="form-control form-control-sm entry-editor__notes"
          placeholder="Things to word properly later"
        ></textarea>
      </label>
    </div>

    <div v-if="fields.bullets" class="mt-3">
      <div class="d-flex align-items-center mb-1">
        <span class="entry-editor__label mb-0 flex-grow-1"
          >{{ fields.bullets }} (HTML allowed)</span
        >
        <button type="button" class="a-btn a-btn--icon" @click="addBullet">
          + Add bullet
        </button>
      </div>
      <div
        v-for="(bullet, i) in form.bullets"
        :key="i"
        class="entry-editor__bullet"
      >
        <textarea
          v-model="bullet.text"
          rows="2"
          class="form-control form-control-sm"
          placeholder="What you did"
          required
        ></textarea>
        <div class="d-flex gap-1 mt-1 align-items-center">
          <input
            v-model="bullet.id"
            class="form-control form-control-sm font-monospace w-auto flex-grow-1"
            title="Bullet id"
            :readonly="bulletUsedIn(bullet.id).length > 0"
            @input="bullet.customId = true"
          />
          <input
            v-model="bullet.tags"
            class="form-control form-control-sm w-auto flex-grow-1"
            placeholder="tags"
            list="entry-editor-tags"
          />
          <button
            type="button"
            class="chip chip--sm"
            :class="{ 'is-on': bullet.timeline }"
            :aria-pressed="bullet.timeline"
            title="Show this bullet on the public timeline"
            @click="bullet.timeline = !bullet.timeline"
          >
            timeline
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Move up"
            :disabled="i === 0"
            @click="moveBullet(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Move down"
            :disabled="i === form.bullets.length - 1"
            @click="moveBullet(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Remove bullet"
            @click="removeBullet(i)"
          >
            ✕
          </button>
        </div>
        <span v-if="bulletUsedIn(bullet.id).length" class="small text-muted">
          Used in {{ bulletUsedIn(bullet.id).join(", ") }}
        </span>
      </div>
      <p v-if="!form.bullets.length" class="small text-muted mb-0">
        No bullets yet.
      </p>
    </div>

    <div v-if="fields.bullets" class="mt-3">
      <span class="entry-editor__label">
        Condensed
        <span class="text-muted fw-normal text-lowercase">
          · a few bullets per CV standing in for the full list; each CV switches
          between Full and Condensed under CVs
        </span>
      </span>
      <div v-if="note" class="alert alert-success py-1 px-2 small mt-1 mb-1">
        {{ note }}
      </div>
      <div
        v-for="group in highlightGroups"
        :key="group.id"
        class="entry-editor__hl-group"
      >
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="entry-editor__hl-name flex-grow-1">
            {{ group.name }}
            <span class="text-muted fw-normal">{{ group.items.length }}</span>
          </span>
          <button
            type="button"
            class="a-btn a-btn--icon"
            :disabled="isNew || !form.bullets.length"
            :title="
              isNew
                ? 'Save the entry first'
                : `Write these with a model's help, from the saved bullets`
            "
            @click="condensing = group.id"
          >
            ✦ Condense…
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Add one by hand"
            @click="addHighlight(group.id)"
          >
            + Add
          </button>
        </div>
        <div
          v-for="highlight in group.items"
          :key="highlight.id || highlight.text"
          class="entry-editor__bullet"
        >
          <textarea
            v-model="highlight.text"
            rows="2"
            class="form-control form-control-sm"
            placeholder="One sentence that stands in for several bullets"
            required
          ></textarea>
          <div class="d-flex gap-1 mt-1 align-items-center">
            <input
              v-model="highlight.id"
              class="form-control form-control-sm font-monospace w-auto flex-grow-1"
              title="Highlight id"
              :readonly="bulletUsedIn(highlight.id).length > 0"
              @input="highlight.customId = true"
            />
            <span
              v-if="highlight.from.length"
              class="chip chip--sm"
              :title="sourceText(highlight.from)"
            >
              from {{ highlight.from.length }}
            </span>
            <button
              type="button"
              class="a-btn a-btn--icon"
              title="Move up"
              :disabled="group.items.indexOf(highlight) === 0"
              @click="moveHighlight(group, highlight, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="a-btn a-btn--icon"
              title="Move down"
              :disabled="
                group.items.indexOf(highlight) === group.items.length - 1
              "
              @click="moveHighlight(group, highlight, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="a-btn a-btn--icon"
              title="Remove highlight"
              @click="removeHighlight(highlight)"
            >
              ✕
            </button>
          </div>
          <span
            v-if="bulletUsedIn(highlight.id).length"
            class="small text-muted"
          >
            Used in {{ bulletUsedIn(highlight.id).join(", ") }}
          </span>
        </div>
        <p v-if="!group.items.length" class="small text-muted mb-0">
          None yet.
        </p>
      </div>
    </div>

    <!-- Condense: over the editor, since the result lands in this form -->
    <div
      v-if="condensing !== null && props.entry"
      class="entry-editor__modal"
      @click.self="condensing = null"
    >
      <div class="entry-editor__dialog">
        <CondenseDialog
          :entry="props.entry"
          :variants="props.variants ?? []"
          :initial-for="condensing"
          :existing="savedHighlights"
          :taken-ids="takenIds"
          @accept="onCondensed"
          @cancel="condensing = null"
        />
      </div>
    </div>

    <div v-if="message" class="alert alert-danger py-1 px-2 small mt-3 mb-0">
      {{ message }}
    </div>

    <div class="d-flex gap-2 mt-3">
      <button type="submit" class="a-btn a-btn--primary" :disabled="busy">
        {{ isNew ? "Add to library" : "Save entry" }}
      </button>
      <button
        type="button"
        class="a-btn"
        :disabled="busy"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="a-btn a-btn--danger ms-auto"
        :disabled="busy"
        @click="remove"
      >
        Delete
      </button>
    </div>
  </form>
</template>

<style scoped lang="scss">
.entry-editor {
  font-size: 0.9rem;
}

.entry-editor__label {
  display: block;
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
}

.entry-editor__bullet {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--ad-line);
  border-radius: 0.375rem;
  margin-bottom: 0.35rem;
}

.entry-editor__hl-group {
  margin-top: 0.5rem;
  padding: 0.4rem 0.5rem;
  border: 1px dashed var(--ad-line);
  border-radius: 0.375rem;
}

.entry-editor__hl-name {
  font-size: 0.8rem;
  font-weight: 600;
}

// The Condense dialog sits over the editor's own modal.
.entry-editor__modal {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: var(--ad-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem 1rem;
  overflow: auto;
}

.entry-editor__dialog {
  background: var(--ad-bg);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  width: min(640px, 100%);
}

.entry-editor__group {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ad-line);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
}

.entry-editor__notes {
  background: var(--ad-notes-bg);
  // Grows with the text up to three lines, then scrolls.
  field-sizing: content;
  min-height: calc(1.5em + 0.5rem);
  max-height: calc(1.5em * 3 + 0.5rem + 2px);
  overflow-y: auto;
  resize: none;
}

.entry-editor__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0;
}

// Forces the home-page group onto its own line.
.entry-editor__sep {
  flex-basis: 100%;
  height: 0;
}

// Toggle chips: pressed = on.
.chip {
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-muted-2);
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  line-height: 1.4;
  white-space: nowrap;

  &.is-on {
    background: var(--ad-on-bg);
    border-color: var(--ad-on-line);
    color: var(--ad-on-text);
  }
  &:disabled {
    opacity: 0.45;
  }
  &--sm {
    font-size: 0.7rem;
    padding: 0 0.45rem;
  }
}

.a-btn {
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

  &--danger {
    border-color: var(--ad-danger);
    color: var(--ad-danger);
  }

  &--icon {
    padding: 0.1rem 0.45rem;
  }
}
</style>
