<script setup lang="ts">
import { computed, PropType } from "vue";
import type { Project } from "@/data/projects";

const props = defineProps({
  project: { type: Object as PropType<Project>, required: true },
});

const STATUS_LABELS: Record<Project["status"], string> = {
  live: "Live",
  "open-source": "Open source",
  "in-progress": "In progress",
  client: "Client work",
};

const status = computed(() => STATUS_LABELS[props.project.status]);
</script>

<template>
  <article class="project" :class="`is-${project.status}`">
    <div class="project__meta">
      <span class="project__status">{{ status }}</span>
      <span class="project__year">{{ project.year }}</span>
    </div>
    <h3 class="project__title">{{ project.title }}</h3>
    <p class="project__tagline">{{ project.tagline }}</p>
    <p class="project__desc">{{ project.description }}</p>
    <ul class="project__tech" aria-label="Built with">
      <li v-for="t in project.tech" :key="t">{{ t }}</li>
    </ul>
    <div class="project__links">
      <a
        v-if="project.links.live"
        class="btn btn-sm"
        :href="project.links.live"
        target="_blank"
        rel="noopener"
      >
        Visit site
      </a>
      <a
        v-if="project.links.source"
        class="btn btn-sm"
        :href="project.links.source"
        target="_blank"
        rel="noopener"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
        Source
      </a>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.project {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  padding: 1.25rem 1.25rem 1rem;
  border: solid thin var(--line);
  border-radius: 0.75rem;
  background-color: rgba(255, 255, 255, 0.04);
  transition: transform 0.2s ease, border-color 0.2s ease,
    background-color 0.2s ease;

  &:hover,
  &:focus-within {
    transform: translateY(-3px);
    border-color: var(--accent-soft);
    background-color: rgba(255, 255, 255, 0.06);
  }
}

.project__meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.project__status {
  font-weight: 600;
  .is-live & {
    color: #7ee0a3;
  }
  .is-open-source & {
    color: var(--accent);
  }
}

.project__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
}

.project__tagline {
  margin: 0;
  font-weight: 600;
  color: var(--accent);
}

.project__desc {
  margin: 0;
  font-size: 0.95rem;
  color: var(--secondary);
  opacity: 0.9;
}

.project__tech {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  list-style: none;
  padding: 0;
  margin: 0.25rem 0 0;
  li {
    padding: 0.15rem 0.55rem;
    font-size: 0.75rem;
    border: solid thin var(--line);
    border-radius: 999px;
    color: var(--muted);
  }
}

.project__links {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.75rem;
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
}
</style>
