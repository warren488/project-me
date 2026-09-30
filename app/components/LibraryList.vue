<script setup lang="ts">
import { computed, ref } from "vue";
import type { EntryKind, LibraryEntry } from "@/cv/types";

// The Library tab: every entry, grouped and searchable. Clicking a row opens
// it for editing; what goes on a CV is decided in the Layout tab instead.
const props = defineProps<{
  entries: LibraryEntry[];
  timelineKinds: string[]; // kinds on the timeline by default
  busy: boolean;
}>();

const emit = defineEmits<{
  (e: "edit", entry: LibraryEntry): void;
  (e: "create"): void;
}>();

type GroupBy = "kind" | "org" | "year" | "tag";

const KIND_LABELS: Record<EntryKind, string> = {
  job: "Jobs",
  engagement: "Client engagements",
  education: "Education",
  project: "Projects",
  achievement: "Achievements",
  interest: "Interests",
  competency: "Competencies",
  skill: "Skills",
};
const KIND_ORDER = Object.keys(KIND_LABELS) as EntryKind[];
// Short badge per kind, shown on every card.
const KIND_BADGES: Record<EntryKind, string> = {
  job: "Job",
  engagement: "Client",
  education: "Study",
  project: "Project",
  achievement: "Award",
  interest: "Interest",
  competency: "Competency",
  skill: "Skill",
};
// Kinds with enough to say (dates, an org, bullets) to earn a double card.
const WIDE_KINDS: EntryKind[] = [
  "job",
  "engagement",
  "education",
  "project",
  "achievement",
];

const groupBy = ref<GroupBy>("kind");
const search = ref("");

const visibleEntries = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.entries;
  return props.entries.filter((e) => {
    const haystack = [
      e.title,
      e.org,
      e.category,
      e.details,
      e.tagline,
      e.description,
      e.notes,
      ...(e.tech ?? []),
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
    items.reduce(
      (max, e) => ((e.start ?? "") > max ? (e.start ?? "") : max),
      ""
    );
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

// Surface settings that differ from the defaults, worth a glance in the list.
function surfaceChips(e: LibraryEntry) {
  const chips: string[] = [];
  const onTimeline = e.timeline ?? props.timelineKinds.includes(e.kind);
  if (e.start && !onTimeline) chips.push("no timeline");
  if (e.start && onTimeline && e.recent === false) chips.push("not recent");
  if (e.kind === "project" && e.home && e.home !== "hidden")
    chips.push(`home: ${e.home}`);
  return chips;
}
</script>

<template>
  <div class="lib">
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
        placeholder="Search (includes notes)"
      />
      <button
        class="a-btn a-btn--primary"
        :disabled="busy"
        @click="emit('create')"
      >
        + New entry
      </button>
    </div>

    <div v-for="group in groups" :key="group.label" class="mb-3">
      <h6 class="lib__group">
        {{ group.label }}
        <span class="text-muted fw-normal">{{ group.items.length }}</span>
      </h6>
      <div class="lib__grid">
        <button
          v-for="entry in group.items"
          :key="entry.id"
          type="button"
          class="lib__row"
          :class="[
            `is-${entry.kind}`,
            { 'is-wide': WIDE_KINDS.includes(entry.kind) },
          ]"
          :disabled="busy"
          @click="emit('edit', entry)"
        >
          <span class="lib__body">
            <span class="lib__kind">{{ KIND_BADGES[entry.kind] }}</span>
            <strong>{{ entry.title }}</strong>
            <span v-if="entry.org" class="text-muted"> · {{ entry.org }}</span>
            <span v-if="entry.category" class="text-muted">
              · {{ entry.category }}</span
            >
            <span v-if="entry.displayDates" class="d-block small text-muted">
              {{ entry.displayDates }}
            </span>
            <span class="d-block">
              <span v-for="t in entry.tags" :key="t" class="lib__tag">
                {{ t }}
              </span>
              <span
                v-for="c in surfaceChips(entry)"
                :key="c"
                class="lib__tag is-surface"
              >
                {{ c }}
              </span>
              <span
                v-if="entry.notes"
                class="lib__tag is-notes"
                :title="entry.notes"
              >
                notes
              </span>
            </span>
          </span>
          <span class="lib__edit" aria-hidden="true">✎</span>
        </button>
      </div>
    </div>
    <p v-if="!groups.length" class="text-muted small">Nothing matches.</p>
  </div>
</template>

<style scoped lang="scss">
.lib__group {
  font-family: var(--ad-label-font);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.35rem;
}

// Cards in a grid; wide kinds take two cells when there's room.
.lib__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.5rem;
}

// One accent colour per kind: the left edge, a faint tint, and the badge.
$kinds:
  job, engagement, education, project, achievement, interest, competency, skill;

// Whole card is the edit button.
.lib__row {
  --accent: var(--ad-muted);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  text-align: left;
  padding: 0.5rem 0.6rem 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ad-line);
  border-left: 4px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, var(--ad-bg));
  color: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 1px 2px var(--ad-shadow);

  @each $kind in $kinds {
    &.is-#{$kind} {
      --accent: var(--ad-kind-#{$kind});
    }
  }

  &.is-wide {
    grid-column: span 2;
  }
  @media (max-width: 480px) {
    &.is-wide {
      grid-column: auto;
    }
  }

  &:hover,
  &:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--ad-line));
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, var(--ad-bg));
  }
  &:focus-visible {
    outline: 2px solid var(--ad-accent);
    outline-offset: 1px;
  }
  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
}

.lib__body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.lib__kind {
  display: block;
  font-family: var(--ad-label-font);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.1rem;
}

.lib__edit {
  color: var(--ad-faint);
  font-size: 0.9rem;
  padding-top: 0.1rem;
}

.lib__tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  margin: 0.15rem 0.25rem 0 0;
  border-radius: 999px;
  background: var(--ad-tag-bg);
  color: var(--ad-muted-2);

  &.is-surface {
    background: var(--ad-surface-chip-bg);
    color: var(--ad-surface-chip-text);
  }
  &.is-notes {
    background: var(--ad-notes-chip-bg);
    color: var(--ad-notes-chip-text);
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
}
</style>
