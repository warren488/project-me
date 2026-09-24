<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Bullet, EntryKind, EntryUsage, LibraryEntry } from "@/cv/types";

// Add / edit one library entry. The parent owns saving; this component only
// turns the form into a clean LibraryEntry and emits it.
const props = defineProps<{
  entry: LibraryEntry | null; // null = new entry
  existingIds: string[];
  knownTags: string[];
  knownCategories: string[];
  usage?: EntryUsage;
  timelineKinds: string[]; // kinds shown on the timeline by default
  busy: boolean;
}>();

const emit = defineEmits<{
  (e: "save", entry: LibraryEntry): void;
  (e: "delete"): void;
  (e: "cancel"): void;
}>();

const KIND_LABELS: Record<EntryKind, string> = {
  job: "Job",
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
  education: "edu",
  project: "proj",
  achievement: "ach",
  interest: "int",
  competency: "comp",
  skill: "skill",
};

// Which fields each kind uses, and what to call them.
type Field = "org" | "category" | "dates" | "details" | "tech" | "bullets";
const FIELDS: Record<EntryKind, Partial<Record<Field, string>>> = {
  job: { org: "Company", dates: "Dates", bullets: "Bullets" },
  education: { org: "Institution", dates: "Dates", details: "Details" },
  project: {
    dates: "Dates (optional)",
    details: "Description",
    tech: "Tech (e.g. Vue • Node)",
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

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

interface BulletForm {
  id: string;
  text: string;
  tags: string;
  customId: boolean;
}

const isNew = computed(() => props.entry === null);
const form = reactive({
  id: "",
  kind: "job" as EntryKind,
  title: "",
  org: "",
  category: "",
  start: "",
  end: "",
  present: false,
  details: "",
  tech: "",
  timeline: false,
  tags: "",
  bullets: [] as BulletForm[],
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
      category: entry?.category ?? "",
      start: entry?.start ?? "",
      end: entry?.end ?? "",
      present: !!entry?.start && !entry?.end,
      details: entry?.details ?? "",
      tech: entry?.tech ?? "",
      timeline:
        entry?.timeline ??
        props.timelineKinds.includes(entry?.kind ?? form.kind),
      tags: (entry?.tags ?? []).join(", "),
      bullets: (entry?.bullets ?? []).map((b) => ({
        id: b.id,
        text: b.text,
        tags: b.tags.join(", "),
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

const bulletAutoId = (bullet: BulletForm) => {
  const base = `${form.id.replace(/^[a-z]+-/, "")}-${slug(
    bullet.text.split(/\s+/).slice(0, 3).join(" ")
  )}`.replace(/-+$/, "");
  let candidate = base || "bullet";
  for (
    let n = 2;
    form.bullets.some((b) => b !== bullet && b.id === candidate);
    n++
  ) {
    candidate = `${base}-${n}`;
  }
  return candidate;
};

watch(
  () => form.bullets.map((b) => b.text),
  () => {
    for (const bullet of form.bullets) {
      if (!bullet.customId) bullet.id = bulletAutoId(bullet);
    }
  }
);

const bulletUsedIn = (id: string) => props.usage?.bullets[id] ?? [];

function addBullet() {
  form.bullets.push({ id: "", text: "", tags: "", customId: false });
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

function toEntry(): LibraryEntry {
  const entry: LibraryEntry = {
    id: form.id.trim(),
    kind: form.kind,
    title: form.title.trim(),
    tags: splitTags(form.tags),
  };
  if (fields.value.org && form.org.trim()) entry.org = form.org.trim();
  if (fields.value.category) entry.category = form.category.trim();
  if (fields.value.dates && form.start.trim()) {
    entry.start = form.start.trim();
    entry.end = form.present ? null : form.end.trim() || null;
  }
  if (fields.value.details && form.details.trim())
    entry.details = form.details.trim();
  if (fields.value.tech && form.tech.trim()) entry.tech = form.tech.trim();
  if (entry.start) entry.timeline = form.timeline;
  if (fields.value.bullets && form.bullets.length) {
    entry.bullets = form.bullets.map(
      (b): Bullet => ({
        id: b.id.trim(),
        text: b.text.trim(),
        tags: splitTags(b.tags),
      })
    );
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
        <label
          class="col-12 form-check d-flex align-items-center gap-1 ps-4 mb-0"
        >
          <input
            v-model="form.timeline"
            type="checkbox"
            class="form-check-input"
            :disabled="!form.start.trim()"
          />
          <span class="small">
            Show on the public timeline
            <span v-if="!form.start.trim()" class="text-muted"
              >(needs a start date)</span
            >
          </span>
        </label>
      </template>
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
      <label v-if="fields.tech" class="col-12">
        <span class="entry-editor__label">{{ fields.tech }}</span>
        <input v-model="form.tech" class="form-control form-control-sm" />
      </label>
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
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.entry-editor__bullet {
  padding: 0.4rem 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  margin-bottom: 0.35rem;
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

  &--danger {
    border-color: #dc2626;
    color: #dc2626;
  }

  &--icon {
    padding: 0.1rem 0.45rem;
  }
}
</style>
