<script setup lang="ts">
import { site } from "@/data/site";

const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner container">
      <div>
        <span class="site-footer__name">{{ site.name }}</span>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <span>{{ site.location }}</span>
      </div>
      <ul class="site-footer__links">
        <li>
          <router-link to="/cv">CV</router-link>
        </li>
        <li>
          <a :href="`mailto:${site.email}`">Email</a>
        </li>
        <li>
          <a :href="site.github" target="_blank" rel="noopener">GitHub</a>
        </li>
        <li>
          <a :href="site.linkedin" target="_blank" rel="noopener">LinkedIn</a>
        </li>
        <li>
          <a :href="site.x" target="_blank" rel="noopener">X</a>
        </li>
      </ul>
      <p class="site-footer__meta">
        © {{ year }}. Built with Vue 3 and a CV that publishes itself.
        <a
          href="https://github.com/warren488/project-me"
          target="_blank"
          rel="noopener"
          >Source on GitHub</a
        >.
      </p>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.site-footer {
  width: 100%;
  margin-top: auto;
  border-top: solid thin var(--line);
  font-size: 0.9rem;
  color: var(--muted);
}

.site-footer__inner {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  align-items: center;
  justify-content: space-between;
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
}

.site-footer__name {
  color: var(--secondary);
  font-weight: 600;
}

.site-footer__sep {
  margin: 0 0.5rem;
}

.site-footer__links {
  display: flex;
  gap: 1.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.site-footer__meta {
  flex-basis: 100%;
  margin: 0;
}

a {
  color: var(--muted);
  text-decoration: none;
  &:hover,
  &:focus-visible {
    color: var(--accent);
  }
}
</style>
