<script setup lang="ts">
import TimelineGraph from "@/components/TimelineGraph.vue";
import { useContent } from "@/composables/useContent";

usePageMeta("timeline");
// The graph reads its data once, so a newer publish remounts it.
const { timeline, version, ready, error } = useContent();
</script>

<template>
  <TimelineGraph v-if="timeline" :key="version" :timeline="timeline" />
  <p v-else class="timeline-loading container" :aria-busy="!ready">
    {{ error || "Loading the timeline…" }}
  </p>
</template>

<style lang="scss" scoped>
// Holds the page height while the content arrives (first visit only).
.timeline-loading {
  flex-basis: 100%;
  min-height: 60vh;
  padding-top: 2rem;
  color: var(--muted);
}
</style>
