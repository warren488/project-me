<script setup lang="ts">
import type {
  LibraryEntry,
  SectionOrder,
  VariantRef,
  VariantSection,
} from "@/cv/types";
import { isBreak } from "@/cv/types";
import { refId } from "@/cv/refs";
import LayoutEntryRow from "./LayoutEntryRow.vue";

// One section of a variant in the dashboard's Layout tab: its order setting,
// the entries on this CV (with their bullets and engagements, reorderable,
// with page breaks between them), then the library's other entries of this
// kind, dimmed, so they can be ticked in.
defineProps<{
  item: VariantSection;
  label: string;
  sheet?: number; // printed sheet this section starts on (when > 1 sheet)
  sidebar: boolean;
  canUp: boolean;
  canDown: boolean;
  collapsed: boolean;
  absent?: boolean; // not in the variant yet: nothing to order or break
  available: LibraryEntry[]; // entries of this kind not on the CV
  byId: Map<string, LibraryEntry>;
  engagementsOf: (jobId: string) => LibraryEntry[];
  expanded: Set<string>;
  sheetOf?: (index: number) => number | undefined;
}>();

const emit = defineEmits<{
  (e: "move", by: number): void;
  (e: "toggle"): void;
  (e: "order", order: SectionOrder): void;
  (e: "break-after"): void;
  (e: "move-ref", index: number, by: number): void;
  (e: "break-after-ref", index: number): void;
  (e: "remove-ref-break", index: number): void;
  (e: "add", id: string): void;
  (e: "remove", id: string): void;
  (e: "update-ref", index: number, ref: VariantRef): void;
  (e: "expand", id: string): void;
}>();

const orderValue = (event: Event) =>
  (event.target as HTMLSelectElement).value as SectionOrder;
const count = (item: VariantSection) =>
  item.refs.filter((r) => !isBreak(r)).length;
const toggleEntry = (id: string, on: boolean) =>
  on ? emit("add", id) : emit("remove", id);
</script>

<template>
  <div class="vse" :class="{ 'is-absent': absent }">
    <div class="vse__head" :class="{ 'is-collapsed': collapsed }">
      <button
        class="vse__toggle"
        :title="collapsed ? 'Expand' : 'Collapse'"
        :aria-expanded="!collapsed"
        @click="emit('toggle')"
      >
        {{ collapsed ? "▸" : "▾" }}
      </button>
      <span class="vse__label flex-grow-1" @click="emit('toggle')">
        {{ label }}
        <span class="vse__tag"
          >{{ count(item) }}/{{ count(item) + available.length }}</span
        >
        <span v-if="sheet" class="vse__tag">p{{ sheet }}</span>
        <span v-if="absent" class="vse__tag is-muted">not on this CV</span>
      </span>
      <template v-if="!absent">
        <select
          class="form-select form-select-sm w-auto py-0"
          title="Order of the entries in this section"
          :value="item.order ?? 'manual'"
          @change="emit('order', orderValue($event))"
        >
          <option value="manual">Manual</option>
          <option value="date">Newest first</option>
        </select>
        <button
          class="a-btn a-btn--icon"
          title="Move section up"
          :disabled="!canUp"
          @click="emit('move', -1)"
        >
          ↑
        </button>
        <button
          class="a-btn a-btn--icon"
          title="Move section down"
          :disabled="!canDown"
          @click="emit('move', 1)"
        >
          ↓
        </button>
        <button
          class="a-btn a-btn--icon"
          title="Insert a page break after this section"
          @click="emit('break-after')"
        >
          ⤓
        </button>
      </template>
    </div>
    <template v-if="!collapsed">
      <template
        v-for="(ref, r) in item.refs"
        :key="isBreak(ref) ? `break-${r}` : refId(ref)"
      >
        <div v-if="isBreak(ref)" class="vse__break">
          <span class="flex-grow-1"
            >— page break ({{ label }} continues) —</span
          >
          <button
            class="a-btn a-btn--icon"
            title="Remove break"
            @click="emit('remove-ref-break', r)"
          >
            ✕
          </button>
        </div>
        <LayoutEntryRow
          v-else-if="byId.get(refId(ref))"
          :entry="byId.get(refId(ref)) as LibraryEntry"
          :value="ref"
          :engagements="engagementsOf(refId(ref))"
          :expanded="expanded"
          :manual="item.order !== 'date'"
          :can-up="r > 0"
          :can-down="r < item.refs.length - 1"
          :sheet="sheetOf?.(r)"
          @toggle="toggleEntry(refId(ref), $event)"
          @update="emit('update-ref', r, $event)"
          @move="emit('move-ref', r, $event)"
          @break-after="emit('break-after-ref', r)"
          @expand="emit('expand', $event)"
        />
        <div v-else class="vse__missing">
          <span class="flex-grow-1">Missing entry: {{ refId(ref) }}</span>
          <button
            class="a-btn a-btn--icon"
            title="Remove from this variant"
            @click="emit('remove', refId(ref))"
          >
            ✕
          </button>
        </div>
      </template>
      <LayoutEntryRow
        v-for="entry in available"
        :key="entry.id"
        :entry="entry"
        :value="null"
        :engagements="engagementsOf(entry.id)"
        :expanded="expanded"
        :manual="false"
        :can-up="false"
        :can-down="false"
        :absent="absent"
        @toggle="toggleEntry(entry.id, $event)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.vse {
  min-width: 0;
  margin-bottom: 0.75rem;
  border: 1px solid var(--ad-line);
  border-radius: 0.375rem;
  padding: 0.35rem 0.5rem;
  background: var(--ad-bg);

  &.is-absent {
    border-style: dashed;
  }
}

.vse__head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--ad-line-strong);
  margin-bottom: 0.25rem;

  &.is-collapsed {
    border-bottom: none;
    padding-bottom: 0;
    margin-bottom: 0;
  }
}

.vse__toggle {
  border: none;
  background: none;
  padding: 0 0.15rem;
  color: var(--ad-muted);
  font-size: 0.8rem;
  line-height: 1;
}

.vse__label {
  cursor: pointer;
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vse__tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  margin-left: 0.25rem;
  border-radius: 999px;
  background: var(--ad-tag-bg);
  color: var(--ad-muted-2);
  text-transform: none;
  letter-spacing: 0;

  &.is-muted {
    background: transparent;
    color: var(--ad-faint);
  }
}

.vse__break,
.vse__missing {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.25rem 0;
  padding: 0.15rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.vse__break {
  border: 1px dashed var(--ad-warn);
  color: var(--ad-warn-text);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.vse__missing {
  border: 1px dashed var(--ad-danger);
  color: var(--ad-danger-text);
}

.a-btn {
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-text);
  padding: 0.1rem 0.45rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }
}
</style>
