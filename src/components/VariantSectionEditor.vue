<script setup lang="ts">
import { isBreak, SectionOrder, VariantRef, VariantSection } from "@/cv/types";

// One section of a variant in the dashboard's Layout tab: its order setting,
// its entries with reordering, and page breaks after entries.
defineProps<{
  item: VariantSection;
  label: string;
  sheet?: number; // printed sheet this section starts on (when > 1 sheet)
  sidebar: boolean;
  canUp: boolean;
  canDown: boolean;
  refLabel: (ref: VariantRef) => string;
}>();

const emit = defineEmits<{
  (e: "move", by: number): void;
  (e: "order", order: SectionOrder): void;
  (e: "break-after"): void;
  (e: "move-ref", index: number, by: number): void;
  (e: "break-after-ref", index: number): void;
  (e: "remove-ref-break", index: number): void;
  (e: "remove-ref", ref: VariantRef): void;
}>();

const orderValue = (event: Event) =>
  (event.target as HTMLSelectElement).value as SectionOrder;
</script>

<template>
  <div class="vse">
    <div class="vse__head">
      <span class="vse__label flex-grow-1">
        {{ label }}
        <span v-if="sheet" class="vse__tag">p{{ sheet }}</span>
      </span>
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
    </div>
    <template v-for="(ref, r) in item.refs" :key="r">
      <div v-if="isBreak(ref)" class="vse__break">
        <span class="flex-grow-1">— page break ({{ label }} continues) —</span>
        <button
          class="a-btn a-btn--icon"
          title="Remove break"
          @click="emit('remove-ref-break', r)"
        >
          ✕
        </button>
      </div>
      <div v-else class="vse__row">
        <span class="flex-grow-1">{{ refLabel(ref) }}</span>
        <template v-if="item.order !== 'date'">
          <button
            class="a-btn a-btn--icon"
            title="Move up"
            :disabled="r === 0"
            @click="emit('move-ref', r, -1)"
          >
            ↑
          </button>
          <button
            class="a-btn a-btn--icon"
            title="Move down"
            :disabled="r === item.refs.length - 1"
            @click="emit('move-ref', r, 1)"
          >
            ↓
          </button>
        </template>
        <button
          class="a-btn a-btn--icon"
          title="Insert a page break after this entry"
          @click="emit('break-after-ref', r)"
        >
          ⤓
        </button>
        <button
          class="a-btn a-btn--icon"
          title="Remove from this variant"
          @click="emit('remove-ref', ref)"
        >
          ✕
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.vse {
  margin-bottom: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  padding: 0.35rem 0.5rem;
  background: #fff;
}

.vse__head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid #cbd5e1;
  margin-bottom: 0.25rem;
}

.vse__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.vse__tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  margin-left: 0.25rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  text-transform: none;
  letter-spacing: 0;
}

.vse__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0;
  font-size: 0.85rem;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
  }
}

.vse__break {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.25rem 0;
  padding: 0.15rem 0.5rem;
  border: 1px dashed #f59e0b;
  border-radius: 0.375rem;
  color: #b45309;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.a-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  padding: 0.1rem 0.45rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }
}
</style>
