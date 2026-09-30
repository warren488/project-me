<script setup lang="ts">
import type { NuxtError } from "#app";

// Rendered for any error, and generated once as 404.html, which Hosting
// serves for paths that don't exist. The path shown is the browser's, so
// it only appears once the page is running.
defineProps<{ error: NuxtError }>();
const path = ref("");
onMounted(() => (path.value = window.location.pathname));
usePageMeta("not-found");

const go = (to: string) => clearError({ redirect: to });
</script>

<template>
  <section class="not-found container">
    <span class="eyebrow">{{ error.statusCode }}</span>
    <h1 class="not-found__title">
      Nothing at <span v-if="path">{{ path }}</span
      ><span v-else>this address</span>
    </h1>
    <p class="section-lede">
      That page doesn't exist, or it moved. These are the ones that do.
    </p>
    <div class="not-found__actions">
      <a href="/" class="btn btn--solid" @click.prevent="go('/')">Home</a>
      <a href="/cv" class="btn" @click.prevent="go('/cv')">CV</a>
      <a href="/timeline" class="btn" @click.prevent="go('/timeline')">
        Timeline
      </a>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.not-found {
  flex-basis: 100%;
  padding-top: 4rem;
  padding-bottom: 4rem;
  text-align: center;
}

.not-found__title {
  font-weight: 800;
  font-size: calc(1.4rem + 1.2vw);
  margin: 0.25rem 0 0.5rem;
  overflow-wrap: anywhere;
}

.not-found__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}
</style>
