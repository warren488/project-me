<script setup lang="ts">
import SiteHeader from "@/components/SiteHeader.vue";
import SiteFooter from "@/components/SiteFooter.vue";
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <SiteHeader />
  <main id="main" class="app-container" tabindex="-1">
    <router-view />
  </main>
  <SiteFooter />
</template>

<style lang="scss" scoped>
.app-container {
  display: flex;
  flex-wrap: wrap;
  flex: 1 0 auto;
  width: 100%;
  margin-bottom: 3rem;
  outline: none;
}

.skip-link {
  position: absolute;
  top: -100%;
  left: 1rem;
  z-index: 2000;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: var(--primary);
  font-weight: 600;
  border-radius: 0 0 0.5rem 0.5rem;
  &:focus {
    top: 0;
  }
}
</style>
