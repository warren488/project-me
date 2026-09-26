<script setup lang="ts">
import { computed, PropType } from "vue";
import { CVPage, SectionName, SIDEBAR_SECTIONS } from "@/cv/types";

// One CV page: sidebar plus main column, rendering sections in the order the
// variant chose. The name and contact block only appears on the first sheet.
const props = defineProps({
  page: { type: Object as PropType<CVPage>, required: true },
  first: { type: Boolean, default: true },
});

const sidebarSections = computed(() =>
  props.page.sections.filter((s) => SIDEBAR_SECTIONS.includes(s))
);
const mainSections = computed(() =>
  props.page.sections.filter((s) => !SIDEBAR_SECTIONS.includes(s))
);
const cont = (s: SectionName) =>
  props.page.continued?.includes(s) ? " (continued)" : "";
</script>

<template>
  <section class="cv-page">
    <aside class="sidebar">
      <div v-if="first" class="sidebar-personal-info">
        <div class="profile-header">
          <h1>{{ page.profile.name }}</h1>
          <h2>{{ page.profile.title }}</h2>
        </div>

        <div class="contact-box">
          <div v-if="page.profile.location" class="contact-item">
            {{ page.profile.location }}
          </div>
          <div v-if="page.profile.phone" class="contact-item">
            {{ page.profile.phone }}
          </div>
          <div class="contact-item">
            <a :href="`mailto:${page.profile.email}`">{{
              page.profile.email
            }}</a>
          </div>
          <div class="contact-item">
            <a :href="`https://${page.profile.website}`" target="_blank">{{
              page.profile.website
            }}</a>
          </div>
        </div>
      </div>

      <template v-for="s in sidebarSections" :key="s">
        <div v-if="s === 'education'" class="sidebar-section">
          <div class="sidebar-title">Education{{ cont(s) }}</div>
          <div v-for="(edu, i) in page.education" :key="i" class="sidebar-item">
            <span class="sidebar-item-title">{{ edu.degree }}</span>
            <span class="sidebar-item-sub">{{ edu.uni }}</span>
            <span v-if="edu.details" class="sidebar-item-date">{{
              edu.details
            }}</span>
            <span class="sidebar-item-date">{{ edu.dates }}</span>
          </div>
        </div>

        <div v-else-if="s === 'competencies'" class="sidebar-section">
          <div class="sidebar-title">Notable Competencies{{ cont(s) }}</div>
          <div class="pill-container">
            <span
              v-for="(comp, i) in page.competencies"
              :key="i"
              class="sidebar-pill"
            >
              {{ comp }}
            </span>
          </div>
        </div>

        <div v-else-if="s === 'achievements'" class="sidebar-section">
          <div class="sidebar-title">Achievements{{ cont(s) }}</div>
          <div
            v-for="(lead, i) in page.achievements"
            :key="i"
            class="sidebar-item"
          >
            <span class="sidebar-item-title">{{ lead.role }}</span>
            <span class="sidebar-item-sub">{{ lead.org }}</span>
            <span v-if="lead.note" class="sidebar-item-date">{{
              lead.note
            }}</span>
          </div>
        </div>

        <div v-else-if="s === 'interests'" class="sidebar-section">
          <div class="sidebar-title">Interests & Passions{{ cont(s) }}</div>
          <div v-for="(int, i) in page.interests" :key="i" class="sidebar-item">
            <span class="sidebar-item-title">{{ int.name }}</span>
            <span class="sidebar-item-date">{{ int.desc }}</span>
          </div>
        </div>
      </template>
    </aside>

    <main class="main-content">
      <p
        v-if="page.profile.summary"
        class="summary"
        v-html="page.profile.summary"
      ></p>

      <template v-for="s in mainSections" :key="s">
        <div v-if="s === 'skills'">
          <h3 class="section-title">Skills{{ cont(s) }}</h3>
          <div class="skills-grid">
            <div
              v-for="(skillsList, category) in page.skills"
              :key="category"
              class="skill-category"
            >
              <span class="cat-name">{{ category }}</span>
              <span
                v-for="skill in skillsList"
                :key="skill"
                class="skill-pill"
                >{{ skill }}</span
              >
            </div>
          </div>
        </div>

        <div v-else-if="s === 'experience'">
          <h3 class="section-title">Professional Experience{{ cont(s) }}</h3>
          <div
            v-for="(job, i) in page.experience"
            :key="i"
            class="experience-item"
          >
            <div class="job-header">
              <div>
                <span class="job-title">{{ job.title }}</span>
                <span class="company"> // {{ job.company }}</span>
              </div>
              <span class="dates">{{ job.dates }}</span>
            </div>
            <div class="job-details">
              <ul>
                <li
                  v-for="(detail, d) in job.details"
                  :key="d"
                  v-html="detail"
                ></li>
              </ul>
            </div>
            <div
              v-for="(eng, e) in job.engagements"
              :key="e"
              class="engagement"
            >
              <div class="engagement-header">
                <span class="engagement-client">{{ eng.client }}</span>
                <span v-if="eng.dates" class="dates">{{ eng.dates }}</span>
              </div>
              <div v-if="eng.details.length" class="job-details">
                <ul>
                  <li
                    v-for="(detail, d) in eng.details"
                    :key="d"
                    v-html="detail"
                  ></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="s === 'projects'">
          <h3 class="section-title">Key Projects{{ cont(s) }}</h3>
          <div class="project-grid">
            <div
              v-for="(proj, i) in page.projects"
              :key="i"
              class="project-card"
            >
              <span class="project-title">{{ proj.title }}</span>
              <p class="project-desc">{{ proj.desc }}</p>
              <span class="project-tech">{{ proj.tech }}</span>
            </div>
          </div>
        </div>
      </template>
    </main>
  </section>
</template>

<style scoped>
.cv-page {
  /* --- COLOR PALETTE --- */
  --color-primary: #2c3e50;
  --color-accent: #2563eb;
  --color-accent-bg: #eff6ff;
  --color-text-main: #334155;
  --color-text-light: #64748b;
  --color-bg-sidebar: #1e293b;
  --color-text-sidebar: #ffffff;
  --color-text-sidebar-muted: #94a3b8;

  /* --- LAYOUT CONFIGURATION --- */
  --sidebar-width: 320px;
  --container-max-width: 1050px;
  --border-radius: 8px;

  /* --- SPACING SYSTEM --- */
  --space-xs: 5px;
  --space-sm: 10px;
  --space-md: 20px;
  --space-lg: 40px;

  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--color-text-main);
  line-height: 1.6;
  background: white;
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  overflow: hidden;
}

* {
  box-sizing: border-box;
}

* {
  box-sizing: border-box;
}

/* --- SIDEBAR --- */
.sidebar {
  --column-y-padding: var(--space-lg);
  background-color: var(--color-primary);
  color: var(--color-text-sidebar);
  padding: var(--column-y-padding) var(--space-md);
}

.profile-header h1 {
  font-size: 2rem;
  line-height: 1.1;
  font-weight: 700;
  margin: 0;
}

.profile-header h2 {
  font-size: 1.1rem;
  color: var(--color-text-sidebar-muted);
  font-weight: 500;
  margin: 0 0 var(--space-xs) 0;
}

.contact-box {
  margin-bottom: var(--space-md);
}

.contact-item {
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  color: #cbd5e1;
}

.contact-item a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted #cbd5e1;
}

.sidebar-section {
  margin-bottom: var(--space-md);
}

.sidebar-title {
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  margin-bottom: var(--space-sm);
  color: var(--color-text-sidebar-muted);
}

.sidebar-item {
  margin-bottom: var(--space-md);
}

.sidebar-item-title {
  font-weight: 700;
  display: block;
  color: white;
}

.sidebar-item-sub {
  font-size: 0.9rem;
  color: #cbd5e1;
  display: block;
}

.sidebar-item-date {
  font-size: 0.8rem;
  color: var(--color-text-sidebar-muted);
  font-style: italic;
  display: block;
  margin-top: 2px;
}

.pill-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sidebar-pill {
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  color: #e2e8f0;
}

/* --- MAIN CONTENT --- */
.main-content {
  --column-y-padding: var(--space-lg);

  padding: var(--column-y-padding) var(--space-lg);
  background-color: white;
}

.section-title {
  font-size: 1.4rem;
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-accent);
  /* padding-bottom: var(--space-sm);
  margin-bottom: var(--space-md); */
  margin-top: var(--space-xs);
}

.section-title:first-of-type {
  margin-top: 0;
}

.summary {
  margin-bottom: var(--space-sm);
  font-size: 1.05rem;
}

/* Skills */
.skills-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.skill-category {
  width: 100%;
}

.cat-name {
  font-weight: bold;
  font-size: 0.9rem;
  margin-bottom: var(--space-xs);
  display: block;
  color: var(--color-text-light);
}

.skill-pill {
  background-color: var(--color-accent-bg);
  color: var(--color-primary);
  padding: 2px 5px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  display: inline-block;
  margin-right: 5px;
  margin-bottom: 5px;
  border: 1px solid rgba(37, 99, 235, 0.1);
}

/* Experience */
.experience-item {
  position: relative;
  padding-left: 25px;
  margin-bottom: var(--space-sm);
  /* border-left: 2px solid #e2e8f0; */
}

.experience-item::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 6px;
  width: 10px;
  height: 10px;
  background: var(--color-accent);
  border-radius: 50%;
  z-index: 1;
}
.experience-item::after {
  content: "";
  position: absolute;
  left: -2px;
  height: 100%;
  background: #e2e8f0;
  width: 2px;
  top: 6px;
}

.job-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: var(--space-sm);
}

.job-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary);
}

.company {
  font-weight: 600;
  color: var(--color-accent);
}

.dates {
  font-size: 0.9rem;
  color: var(--color-text-light);
}

.job-details ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.job-details li {
  position: relative;
  padding-left: 20px;
  margin-bottom: 8px;
  font-size: 0.95rem;
  line-height: 1rem;
}

.job-details li::before {
  content: "▹";
  position: absolute;
  left: 0;
  color: var(--color-accent);
}

/* Client engagements under a consultancy role */
.engagement {
  margin: 6px 0 0 4px;
  padding-left: 12px;
  border-left: 2px solid #e2e8f0;
}

.engagement-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.engagement-client {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
}

/* Projects */
.project-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.project-card {
  background: #f8fafc;
  padding: var(--space-md);
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.project-title {
  font-weight: bold;
  color: var(--color-primary);
  display: block;
  margin-bottom: 5px;
}

.project-desc {
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.project-tech {
  font-size: 0.75rem;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar,
  .main-content {
    padding: var(--space-sm) var(--space-md);
  }

  .project-grid {
    grid-template-columns: 1fr;
  }
}

@media print {
  .sidebar {
    background-color: #2c3e50 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sidebar,
  .main-content {
    padding-top: var(--column-y-padding);
    padding-bottom: var(--column-y-padding);
  }

  .skill-pill {
    background-color: #eee !important;
    color: #000 !important;
    border: 1px solid #ccc;
    -webkit-print-color-adjust: exact;
  }
}
</style>
