<script setup lang="ts">
import { computed } from "vue";
import type { LibraryEntry, PickMode, VariantRef } from "@/cv/types";
import {
  engagementBullets,
  engagementMode,
  engagementPick,
  highlightsFor,
  moveInList,
  ownBulletsFor,
  pickMode,
  plain,
  withBullets,
  withCondensed,
  withEngagement,
} from "@/cv/refs";

// One library entry in the CVs workspace, as a small tree: the entry, its
// bullets, and (for jobs) its client engagements with their bullets. Every
// row is one line. `value` is the entry's ref in the variant, or null when
// the entry isn't on this CV yet (rendered dimmed, so it can be ticked).
// Each entry and engagement prints Full (all bullets), Condensed (its
// highlights written for this CV) or Custom (a ticked list).
const props = defineProps<{
  entry: LibraryEntry;
  value: VariantRef | null;
  engagements: LibraryEntry[];
  expanded: Set<string>; // entry and engagement ids that are open
  manual: boolean; // section is in manual order, so entries can move
  canUp: boolean;
  canDown: boolean;
  sheet?: number;
  absent?: boolean; // the section itself isn't in the variant yet
  variantId: string; // the CV being edited
  variantNames: Map<string, string>; // for the highlight labels
}>();

const emit = defineEmits<{
  (e: "toggle", on: boolean): void;
  (e: "update", ref: VariantRef): void;
  (e: "move", by: number): void;
  (e: "break-after"): void;
  (e: "expand", id: string): void;
}>();

// A tickable line: a full bullet, or a condensed highlight (marked so).
type Row = { id: string; text: string; condensed: boolean; for?: string };
const rowsOf = (entry: LibraryEntry): Row[] => [
  ...(entry.bullets ?? []).map((b) => ({ ...b, condensed: false })),
  ...(entry.highlights ?? []).map((h) => ({ ...h, condensed: true })),
];
const hasRows = (entry: LibraryEntry) =>
  !!(entry.bullets?.length || entry.highlights?.length);
// Whether the entry has condensed highlights that apply to this CV.
const canCondense = (entry: LibraryEntry) =>
  highlightsFor(entry, props.variantId).length > 0;
const condensedTitle = (entry: LibraryEntry) =>
  canCondense(entry)
    ? "Print the condensed highlights written for this CV"
    : "No condensed bullets for this CV yet. Write them in the Library.";
const rowTag = (row: Row) =>
  !row.condensed
    ? ""
    : `condensed · ${
        row.for ? (props.variantNames.get(row.for) ?? row.for) : "general"
      }`;

const selected = computed(() => props.value !== null);
const bullets = computed(() => props.entry.bullets ?? []);
const hasChildren = computed(
  () => hasRows(props.entry) || props.engagements.length > 0
);
const open = computed(
  () => selected.value && props.expanded.has(props.entry.id)
);

const ref = () => props.value as VariantRef;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;

// Selected ids in print order, then the rest in library order. In condensed
// mode only the resolved set is listed.
const rowsFor = (entry: LibraryEntry, ids: string[], mode: PickMode) => {
  const all = rowsOf(entry);
  const byId = new Map(all.map((r) => [r.id, r]));
  const chosen = ids.map((id) => byId.get(id)).filter((r): r is Row => !!r);
  if (mode === "condensed") return chosen;
  const picked = new Set(ids);
  return [...chosen, ...all.filter((r) => !picked.has(r.id))];
};

// --- The entry's own bullets ---
const ownMode = computed((): PickMode =>
  selected.value ? pickMode(ref()) : "full"
);
const ownIds = computed(() =>
  selected.value ? ownBulletsFor(props.entry, ref(), props.variantId) : []
);
const ownRows = computed(() =>
  rowsFor(props.entry, ownIds.value, ownMode.value)
);
function setOwn(ids: string[]) {
  emit("update", withBullets(props.entry, ref(), ids));
}
function toggleOwn(id: string, on: boolean) {
  const ids = ownIds.value.filter((b) => b !== id);
  setOwn(on ? [...ids, id] : ids);
}
function setOwnMode(mode: PickMode) {
  emit("update", withCondensed(props.entry, ref(), mode === "condensed"));
}

// --- Engagements ---
const pickOf = (eng: LibraryEntry) => engagementPick(ref(), eng.id);
const engMode = (eng: LibraryEntry) => engagementMode(ref(), eng.id);
const engIds = (eng: LibraryEntry) =>
  engagementBullets(eng, ref(), props.variantId);
const engRows = (eng: LibraryEntry) => rowsFor(eng, engIds(eng), engMode(eng));
function setEngagement(eng: LibraryEntry, show: boolean, ids?: string[]) {
  emit(
    "update",
    withEngagement(props.entry, ref(), props.engagements, eng, {
      show,
      bullets: ids,
    })
  );
}
function setEngMode(eng: LibraryEntry, mode: PickMode) {
  emit(
    "update",
    withEngagement(props.entry, ref(), props.engagements, eng, {
      show: pickOf(eng).show,
      condensed: mode === "condensed",
    })
  );
}
function toggleEngagement(eng: LibraryEntry, on: boolean) {
  // Unticking clears its bullets; they become roll-up candidates.
  setEngagement(eng, on, on ? undefined : []);
}
function toggleEngBullet(eng: LibraryEntry, id: string, on: boolean) {
  const ids = engIds(eng).filter((b) => b !== id);
  setEngagement(eng, pickOf(eng).show, on ? [...ids, id] : ids);
}
function moveEngBullet(eng: LibraryEntry, id: string, by: number) {
  setEngagement(eng, pickOf(eng).show, moveInList(engIds(eng), id, by));
}

// --- Labels ---
const title = computed(() =>
  props.entry.org
    ? `${props.entry.title} · ${props.entry.org}`
    : props.entry.title
);
// "condensed", "condensed · none, printing full", or "custom 2/5".
const pickLabel = (entry: LibraryEntry, ids: string[], mode: PickMode) => {
  if (mode === "condensed")
    return ids.length ? "condensed" : "condensed · none, printing full";
  if (mode === "custom") return `custom · ${ids.length} ticked`;
  return "";
};
const isWarning = (label: string) => label.includes("none");
const meta = computed(() => {
  if (!selected.value) return [];
  const out: string[] = [];
  const own = pickLabel(props.entry, ownIds.value, ownMode.value);
  if (own) out.push(own);
  if (props.engagements.length) {
    const shown = props.engagements.filter((e) => pickOf(e).show).length;
    const rolled = props.engagements
      .filter((e) => !pickOf(e).show)
      .reduce((n, e) => n + engIds(e).length, 0);
    out.push(`${shown}/${props.engagements.length} clients`);
    if (rolled) out.push(`${rolled} rolled up`);
  }
  return out;
});
const engMeta = (eng: LibraryEntry) => {
  const pick = pickOf(eng);
  const n = engIds(eng).length;
  if (!pick.show) return n ? `${n} rolled up` : "hidden";
  return pickLabel(eng, engIds(eng), engMode(eng));
};
</script>

<template>
  <div class="ler" :class="{ 'is-off': !selected }">
    <!-- The entry -->
    <div class="ler__row ler__row--entry">
      <button
        v-if="selected && hasChildren"
        type="button"
        class="ler__toggle"
        :title="open ? 'Collapse' : 'Expand'"
        :aria-expanded="open"
        @click="emit('expand', entry.id)"
      >
        {{ open ? "▾" : "▸" }}
      </button>
      <span v-else class="ler__toggle ler__toggle--blank"></span>
      <input
        type="checkbox"
        class="form-check-input ler__check"
        :checked="selected"
        :title="selected ? 'Remove from this CV' : 'Add to this CV'"
        @change="emit('toggle', checked($event))"
      />
      <span class="ler__label" :title="title" @click="emit('expand', entry.id)">
        {{ title }}
      </span>
      <span
        v-for="m in meta"
        :key="m"
        class="ler__tag"
        :class="{ 'is-warning': isWarning(m) }"
        >{{ m }}</span
      >
      <span v-if="sheet" class="ler__tag" title="Printed sheet"
        >p{{ sheet }}</span
      >
      <span
        v-if="selected && !absent && bullets.length"
        class="ler__switch"
        role="group"
        aria-label="Which bullets print"
      >
        <button
          type="button"
          :class="{ 'is-on': ownMode === 'full' }"
          title="Print all of its bullets"
          @click="setOwnMode('full')"
        >
          Full
        </button>
        <button
          type="button"
          :class="{ 'is-on': ownMode === 'condensed' }"
          :disabled="!canCondense(entry)"
          :title="condensedTitle(entry)"
          @click="setOwnMode('condensed')"
        >
          Condensed
        </button>
      </span>
      <template v-if="selected && manual">
        <button
          type="button"
          class="a-btn a-btn--icon"
          title="Move up"
          :disabled="!canUp"
          @click="emit('move', -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="a-btn a-btn--icon"
          title="Move down"
          :disabled="!canDown"
          @click="emit('move', 1)"
        >
          ↓
        </button>
      </template>
      <button
        v-if="selected && !absent"
        type="button"
        class="a-btn a-btn--icon"
        title="Insert a page break after this entry"
        @click="emit('break-after')"
      >
        ⤓
      </button>
    </div>

    <template v-if="open">
      <!-- Own bullets -->
      <div
        v-for="b in ownRows"
        :key="b.id"
        class="ler__row ler__row--bullet"
        :class="{ 'is-off': !ownIds.includes(b.id) }"
      >
        <input
          type="checkbox"
          class="form-check-input ler__check"
          :checked="ownIds.includes(b.id)"
          @change="toggleOwn(b.id, checked($event))"
        />
        <span class="ler__label" :title="plain(b.text)">{{
          plain(b.text)
        }}</span>
        <span
          v-if="b.condensed"
          class="ler__tag is-condensed"
          title="A condensed highlight, and the CV it was written for"
        >
          {{ rowTag(b) }}
        </span>
        <template v-if="ownIds.includes(b.id) && ownMode !== 'condensed'">
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Move up"
            :disabled="ownIds.indexOf(b.id) === 0"
            @click="setOwn(moveInList(ownIds, b.id, -1))"
          >
            ↑
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            title="Move down"
            :disabled="ownIds.indexOf(b.id) === ownIds.length - 1"
            @click="setOwn(moveInList(ownIds, b.id, 1))"
          >
            ↓
          </button>
        </template>
      </div>

      <!-- Client engagements -->
      <template v-for="eng in engagements" :key="eng.id">
        <div
          class="ler__row ler__row--engagement"
          :class="{ 'is-off': !pickOf(eng).show }"
        >
          <button
            v-if="hasRows(eng)"
            type="button"
            class="ler__toggle"
            :title="expanded.has(eng.id) ? 'Collapse' : 'Expand'"
            :aria-expanded="expanded.has(eng.id)"
            @click="emit('expand', eng.id)"
          >
            {{ expanded.has(eng.id) ? "▾" : "▸" }}
          </button>
          <span v-else class="ler__toggle ler__toggle--blank"></span>
          <input
            type="checkbox"
            class="form-check-input ler__check"
            :checked="pickOf(eng).show"
            title="Print this client as its own block under the job"
            @change="toggleEngagement(eng, checked($event))"
          />
          <span
            class="ler__label"
            :title="`${eng.title} · ${eng.displayDates ?? ''}`"
            @click="emit('expand', eng.id)"
          >
            {{ eng.title }}
            <span v-if="eng.displayDates" class="text-muted">
              · {{ eng.displayDates }}</span
            >
          </span>
          <span
            v-if="engMeta(eng)"
            class="ler__tag"
            :class="{ 'is-warning': isWarning(engMeta(eng)) }"
            >{{ engMeta(eng) }}</span
          >
          <span
            v-if="!absent && eng.bullets?.length"
            class="ler__switch"
            role="group"
            aria-label="Which bullets print"
          >
            <button
              type="button"
              :class="{ 'is-on': engMode(eng) === 'full' }"
              title="Print all of its bullets"
              @click="setEngMode(eng, 'full')"
            >
              Full
            </button>
            <button
              type="button"
              :class="{ 'is-on': engMode(eng) === 'condensed' }"
              :disabled="!canCondense(eng)"
              :title="condensedTitle(eng)"
              @click="setEngMode(eng, 'condensed')"
            >
              Condensed
            </button>
          </span>
        </div>
        <template v-if="expanded.has(eng.id)">
          <div
            v-for="b in engRows(eng)"
            :key="b.id"
            class="ler__row ler__row--bullet ler__row--nested"
            :class="{ 'is-off': !engIds(eng).includes(b.id) }"
          >
            <input
              type="checkbox"
              class="form-check-input ler__check"
              :checked="engIds(eng).includes(b.id)"
              :title="
                pickOf(eng).show
                  ? 'Print under this client'
                  : 'Print under the job instead (the client block is hidden)'
              "
              @change="toggleEngBullet(eng, b.id, checked($event))"
            />
            <span class="ler__label" :title="plain(b.text)">{{
              plain(b.text)
            }}</span>
            <span
              v-if="b.condensed"
              class="ler__tag is-condensed"
              title="A condensed highlight, and the CV it was written for"
            >
              {{ rowTag(b) }}
            </span>
            <span
              v-if="!pickOf(eng).show && engIds(eng).includes(b.id)"
              class="ler__tag is-rollup"
              title="Prints under the job's own bullets"
            >
              → job
            </span>
            <template
              v-if="engIds(eng).includes(b.id) && engMode(eng) !== 'condensed'"
            >
              <button
                type="button"
                class="a-btn a-btn--icon"
                title="Move up"
                :disabled="engIds(eng).indexOf(b.id) === 0"
                @click="moveEngBullet(eng, b.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="a-btn a-btn--icon"
                title="Move down"
                :disabled="engIds(eng).indexOf(b.id) === engIds(eng).length - 1"
                @click="moveEngBullet(eng, b.id, 1)"
              >
                ↓
              </button>
            </template>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ler {
  border-bottom: 1px solid var(--ad-tag-bg);

  &:last-child {
    border-bottom: none;
  }
  &.is-off {
    opacity: 0.55;
  }
}

// Every row is one line: the label ellipsises, the controls never wrap.
.ler__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0;
  font-size: 0.85rem;
  white-space: nowrap;

  &--bullet {
    padding-left: 1.6rem;
    font-size: 0.8rem;
    color: var(--ad-text-2);
  }
  &--engagement {
    padding-left: 0.9rem;
  }
  &--nested {
    padding-left: 2.5rem;
  }
  &.is-off .ler__label {
    color: var(--ad-faint);
  }
}

.ler__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}

.ler__check {
  flex-shrink: 0;
  margin: 0;
}

.ler__toggle {
  flex-shrink: 0;
  width: 1rem;
  border: none;
  background: none;
  padding: 0;
  color: var(--ad-muted);
  font-size: 0.8rem;
  line-height: 1;

  &--blank {
    display: inline-block;
  }
}

.ler__tag {
  flex-shrink: 0;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--ad-tag-bg);
  color: var(--ad-muted-2);

  &.is-rollup {
    background: var(--ad-rollup-bg);
    color: var(--ad-rollup-text);
  }
  &.is-condensed {
    background: var(--ad-on-bg);
    color: var(--ad-on-text);
  }
  &.is-warning {
    background: var(--ad-rollup-bg);
    color: var(--ad-rollup-text);
  }
}

// Full | Condensed: a two-button switch, the active side filled.
.ler__switch {
  flex-shrink: 0;
  display: inline-flex;
  border: 1px solid var(--ad-line-strong);
  border-radius: 999px;
  overflow: hidden;

  button {
    border: none;
    background: var(--ad-bg);
    color: var(--ad-muted-2);
    padding: 0 0.5rem;
    font-size: 0.7rem;
    line-height: 1.5;

    &.is-on {
      background: var(--ad-on-bg);
      color: var(--ad-on-text);
    }
    &:disabled {
      opacity: 0.45;
    }
  }
}

.a-btn {
  flex-shrink: 0;
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-text);
  padding: 0.05rem 0.4rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  line-height: 1.3;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }
}
</style>
