<script setup lang="ts">
import { computed, PropType } from "vue";
import { CVPage } from "@/cv/types";

// A plain, single-column CV for applicant tracking systems: conventional
// headings, no columns, tables, icons or pills, and contact details in the
// body rather than a header. Pages in the variant only affect ordering.
const props = defineProps({
  pages: { type: Array as PropType<CVPage[]>, required: true },
});

const profile = computed(() => props.pages[0]?.profile);

const merged = computed(() => {
  const all = <K extends keyof CVPage>(key: K) =>
    props.pages.flatMap((p) => (p[key] as unknown[] | undefined) ?? []);
  const skills: Record<string, string[]> = {};
  for (const page of props.pages) {
    for (const [category, list] of Object.entries(page.skills ?? {})) {
      skills[category] = [...(skills[category] ?? []), ...list];
    }
  }
  return {
    experience: all("experience") as CVPage["experience"],
    education: all("education") as CVPage["education"],
    projects: all("projects") as CVPage["projects"],
    achievements: all("achievements") as CVPage["achievements"],
    competencies: all("competencies") as string[],
    interests: all("interests") as CVPage["interests"],
    skills,
  };
});

const contactLine = computed(() =>
  [
    profile.value?.location,
    profile.value?.phone,
    profile.value?.email,
    profile.value?.website,
  ]
    .filter(Boolean)
    .join("  |  ")
);
</script>

<template>
  <div v-if="profile" class="ats">
    <header class="ats__header">
      <h1>{{ profile.name }}</h1>
      <p class="ats__headline">{{ profile.title }}</p>
      <p class="ats__contact">{{ contactLine }}</p>
    </header>

    <section v-if="profile.summary">
      <h2>Summary</h2>
      <p v-html="profile.summary"></p>
    </section>

    <section v-if="merged.experience?.length">
      <h2>Experience</h2>
      <article v-for="(job, i) in merged.experience" :key="i" class="ats__item">
        <h3>{{ job.title }}</h3>
        <p class="ats__meta">{{ job.company }} | {{ job.dates }}</p>
        <ul>
          <li v-for="(detail, d) in job.details" :key="d" v-html="detail"></li>
        </ul>
      </article>
    </section>

    <section v-if="merged.education?.length">
      <h2>Education</h2>
      <article v-for="(edu, i) in merged.education" :key="i" class="ats__item">
        <h3>{{ edu.degree }}</h3>
        <p class="ats__meta">{{ edu.uni }} | {{ edu.dates }}</p>
        <p v-if="edu.details">{{ edu.details }}</p>
      </article>
    </section>

    <section v-if="Object.keys(merged.skills).length">
      <h2>Skills</h2>
      <p v-for="(list, category) in merged.skills" :key="category">
        <strong>{{ category }}:</strong> {{ list.join(", ") }}
      </p>
    </section>

    <section v-if="merged.competencies.length">
      <h2>Core Competencies</h2>
      <p>{{ merged.competencies.join(", ") }}</p>
    </section>

    <section v-if="merged.projects?.length">
      <h2>Projects</h2>
      <article v-for="(proj, i) in merged.projects" :key="i" class="ats__item">
        <h3>{{ proj.title }}</h3>
        <p v-if="proj.tech" class="ats__meta">{{ proj.tech }}</p>
        <p>{{ proj.desc }}</p>
      </article>
    </section>

    <section v-if="merged.achievements?.length">
      <h2>Achievements</h2>
      <article v-for="(a, i) in merged.achievements" :key="i" class="ats__item">
        <h3>{{ a.role }}</h3>
        <p class="ats__meta">{{ a.org }}</p>
        <p v-if="a.note">{{ a.note }}</p>
      </article>
    </section>

    <section v-if="merged.interests?.length">
      <h2>Interests</h2>
      <p>
        <template v-for="(int, i) in merged.interests" :key="i">
          <strong>{{ int.name }}</strong
          ><span v-if="int.desc"> ({{ int.desc }})</span
          ><span v-if="i < merged.interests!.length - 1">, </span>
        </template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.ats {
  box-sizing: border-box;
  width: 100%;
  max-width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 18mm 20mm;
  background: #fff;
  color: #000;
  font-family: Calibri, Carlito, Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.4;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.ats * {
  box-sizing: border-box;
}

.ats__header {
  margin-bottom: 10pt;
}

.ats h1 {
  font-size: 20pt;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.ats__headline {
  font-size: 12pt;
  margin: 2pt 0 4pt;
}

.ats__contact {
  margin: 0;
  white-space: pre-wrap;
}

.ats h2 {
  font-size: 12pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #000;
  padding-bottom: 2pt;
  margin: 12pt 0 6pt;
}

.ats h3 {
  font-size: 11pt;
  font-weight: 700;
  margin: 0;
}

.ats__meta {
  margin: 0 0 3pt;
  font-style: italic;
}

.ats__item {
  margin-bottom: 8pt;
  break-inside: avoid;
  page-break-inside: avoid;
}

.ats p {
  margin: 0 0 3pt;
}

.ats ul {
  margin: 0;
  padding-left: 16pt;
}

.ats li {
  margin-bottom: 2pt;
}

@media print {
  @page {
    size: A4;
    margin: 18mm 20mm;
  }

  :global(nav),
  :global(footer),
  :global(.no-print) {
    display: none !important;
  }

  .ats {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    max-width: none;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
    z-index: 9999;
  }

  .ats h2 {
    break-after: avoid;
    page-break-after: avoid;
  }
}
</style>
