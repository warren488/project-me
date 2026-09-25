<script setup lang="ts">
import { defineProps, PropType } from "vue";
import { CVPage } from "@/cv/types";

defineProps({
  pages: { type: Array as PropType<CVPage[]>, required: true },
  // Render each page as an A4 sheet on screen, exactly as it prints.
  paged: { type: Boolean, default: false },
});
</script>

<template>
  <div class="cv-wrapper" :class="{ 'is-paged': paged }">
    <div class="cv-container">
      <section
        v-for="(page, index) in pages"
        :key="index"
        class="cv-page"
        :class="{
          'cv-page--first': index === 0,
          'cv-page--last': index === pages.length - 1,
        }"
      >
        <aside class="sidebar">
          <div class="sidebar-personal-info">
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

          <div class="sidebar-section" v-if="page.education">
            <div class="sidebar-title">Education</div>
            <div
              v-for="(edu, i) in page.education"
              :key="i"
              class="sidebar-item"
            >
              <span class="sidebar-item-title">{{ edu.degree }}</span>
              <span class="sidebar-item-sub">{{ edu.uni }}</span>
              <span v-if="edu.details" class="sidebar-item-date">{{
                edu.details
              }}</span>
              <span class="sidebar-item-date">{{ edu.dates }}</span>
            </div>
          </div>

          <div class="sidebar-section" v-if="page.competencies">
            <div class="sidebar-title">Notable Competencies</div>
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

          <div class="sidebar-section" v-if="page.achievements">
            <div class="sidebar-title">Achievements</div>
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
          <div class="sidebar-section" v-if="page.interests">
            <div class="sidebar-title">Interests & Passions</div>
            <div
              v-for="(int, i) in page.interests"
              :key="i"
              class="sidebar-item"
            >
              <span class="sidebar-item-title">{{ int.name }}</span>
              <span class="sidebar-item-date">{{ int.desc }}</span>
            </div>
          </div>
        </aside>

        <main class="main-content">
          <p
            class="summary"
            v-if="page.profile.summary"
            v-html="page.profile.summary"
          ></p>
          <div v-if="page.skills">
            <h3 class="section-title">Skills</h3>

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
          <div v-if="page.experience">
            <h3 class="section-title">Professional Experience</h3>

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
            </div>
          </div>
          <div v-if="page.projects">
            <h3 class="section-title">Key Projects</h3>
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
        </main>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* WRAPPER to isolate variables */
.cv-wrapper {
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
  display: flex;
  justify-content: center;
  padding: var(--space-lg) var(--space-md);
  width: 100%;
  /* background-color: #f1f5f9; */
  /* BG of the wrapper/page */
}

* {
  box-sizing: border-box;
}

/* --- GRID LAYOUT --- */
.cv-container {
  width: 100%;
  max-width: var(--container-max-width);
}

/* Each page is its own sidebar + main grid, so a page can never spill into
   the next one. On screen the pages stack into one continuous document. */
.cv-page {
  background: white;
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  overflow: hidden;
}

.cv-page--first {
  border-radius: var(--border-radius) var(--border-radius) 0 0;
}

.cv-page--last {
  border-radius: 0 0 var(--border-radius) var(--border-radius);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

/* Continuous on screen: no padding where two pages meet. */
.cv-wrapper:not(.is-paged) .cv-page:not(.cv-page--first) .sidebar,
.cv-wrapper:not(.is-paged) .cv-page:not(.cv-page--first) .main-content {
  padding-top: 0;
}

.cv-wrapper:not(.is-paged) .cv-page:not(.cv-page--last) .sidebar,
.cv-wrapper:not(.is-paged) .cv-page:not(.cv-page--last) .main-content {
  padding-bottom: 0;
}

/* --- PAGED (print, and the dashboard preview) --- */
.cv-wrapper.is-paged {
  padding: 0;
}

.cv-wrapper.is-paged .cv-container {
  max-width: none;
  width: auto;
}

.cv-wrapper.is-paged .cv-page {
  width: 210mm;
  height: 297mm;
  border-radius: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  margin: 0 auto 8mm;
  grid-template-columns: 280px 1fr;
}

/* --- SIDEBAR --- */
.sidebar {
  --column-y-padding: var(--space-lg);
  background-color: var(--color-primary);
  color: var(--color-text-sidebar);
  padding: var(--column-y-padding) var(--space-md);
}

/* Name and contact details only appear on the first page. */
.cv-page:not(.cv-page--first) .sidebar-personal-info {
  display: none;
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
  .cv-wrapper:not(.is-paged) .cv-page {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .main-content {
    padding: var(--space-sm) var(--space-md);
  }

  .project-grid {
    grid-template-columns: 1fr;
  }
}

/* Print Overrides */
@media print {
  @page {
    size: A4;
    margin: 0;
  }

  .cv-container {
    max-width: none;
    width: auto;
  }

  /* One sheet per page, clipped, with a hard break after each. */
  .cv-page,
  .cv-wrapper.is-paged .cv-page {
    width: 210mm;
    height: 297mm;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
    grid-template-columns: 280px 1fr;
    break-after: page;
    page-break-after: always;
  }
  .cv-page--last {
    break-after: auto;
    page-break-after: auto;
  }
  .cv-page .sidebar,
  .cv-page .main-content {
    padding-top: var(--column-y-padding);
    padding-bottom: var(--column-y-padding);
  }

  .sidebar {
    background-color: #2c3e50 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .skill-pill {
    background-color: #eee !important;
    color: #000 !important;
    border: 1px solid #ccc;
    -webkit-print-color-adjust: exact;
  }

  /* Hide external things if this is inside a larger layout */
  :global(nav),
  :global(footer),
  :global(.no-print) {
    display: none !important;
  }

  /* 3. POSITION THE CV WRAPPER */
  .cv-wrapper {
    /* "absolute" lets it flow across pages. "fixed" would repeat it on every page. */
    position: absolute;
    top: 0;
    left: 0;
    width: 100%; /* 100% is safer than 100vw to avoid margin/scrollbar math issues */
    margin: 0;
    padding: 0;

    /* Ensure it sits on top of anything that wasn't hidden */
    z-index: 9999;
    background-color: white;

    /* Force exact colors (Chrome/Safari) */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
