<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <section class="not-found container">
    <span class="eyebrow">404</span>
    <h1 class="not-found__title">Nothing at {{ route.path }}</h1>
    <p class="section-lede">
      That page doesn't exist, or it moved. These are the ones that do.
    </p>
    <div class="not-found__actions">
      <router-link to="/" class="btn btn--solid">Home</router-link>
      <router-link to="/cv" class="btn">CV</router-link>
      <router-link to="/timeline" class="btn">Timeline</router-link>
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
