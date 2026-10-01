<script setup lang="ts">
import type { PropType } from "vue";
import { computed } from "vue";
import CvText from "@/components/CvText.vue";
import type { CVPage } from "@/cv/types";
import {
  CV_SUMMARY,
  CV_TITLE,
  entryText,
  lineText,
  opens,
  PROFILE,
} from "@/cv/inlineEdit";
import { mergePages } from "@/cv/merge";
import { usePrintPage } from "@/cv/usePrintPage";

// A plain, single-column CV for applicant tracking systems: conventional
// headings, no columns, tables, icons or pills, and contact details in the
// body rather than a header. It follows the variant's section order and
// ignores page breaks, since a single column flows across pages by itself.
const props = defineProps({
  pages: { type: Array as PropType<CVPage[]>, required: true },
});

usePrintPage("size: A4; margin: 18mm 20mm;");

const page = computed(() => mergePages(props.pages));
const profile = computed(() => page.value?.profile);
// Where each text comes from, in the dashboard's preview (see CvText).
const src = computed(() => page.value?.src);

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
  <div v-if="page && profile" class="ats">
    <header class="ats__header">
      <CvText tag="h1" :value="profile.name" :src="PROFILE" />
      <CvText
        tag="p"
        class="ats__headline"
        :value="profile.title"
        :src="CV_TITLE"
      />
      <CvText
        tag="p"
        class="ats__contact"
        :value="contactLine"
        :src="PROFILE"
      />
    </header>

    <section v-if="profile.summary">
      <h2>Summary</h2>
      <CvText tag="p" html :value="profile.summary" :src="CV_SUMMARY" />
    </section>

    <template v-for="s in page.sections" :key="s">
      <section v-if="s === 'experience' && page.experience?.length">
        <h2>Experience</h2>
        <article v-for="(job, i) in page.experience" :key="i" class="ats__item">
          <CvText
            tag="h3"
            :value="job.title"
            :src="entryText(src?.experience?.[i]?.id, 'title')"
          />
          <p class="ats__meta">
            <CvText
              :value="job.company"
              :src="entryText(src?.experience?.[i]?.id, 'org')"
            />
            |
            <CvText :value="job.dates" :src="opens(src?.experience?.[i]?.id)" />
          </p>
          <ul>
            <CvText
              v-for="(detail, d) in job.details"
              :key="d"
              tag="li"
              html
              :value="detail"
              :src="
                lineText(
                  src?.experience?.[i]?.id,
                  src?.experience?.[i]?.details[d]
                )
              "
            />
          </ul>
          <div
            v-for="(eng, e) in job.engagements"
            :key="e"
            class="ats__engagement"
          >
            <p class="ats__meta">
              <CvText
                tag="strong"
                :value="eng.client"
                :src="
                  entryText(src?.experience?.[i]?.engagements?.[e]?.id, 'title')
                "
              />
              <template v-if="eng.dates">
                |
                <CvText
                  :value="eng.dates"
                  :src="opens(src?.experience?.[i]?.engagements?.[e]?.id)"
                />
              </template>
            </p>
            <ul v-if="eng.details.length">
              <CvText
                v-for="(detail, d) in eng.details"
                :key="d"
                tag="li"
                html
                :value="detail"
                :src="
                  lineText(
                    src?.experience?.[i]?.id,
                    src?.experience?.[i]?.engagements?.[e]?.details[d]
                  )
                "
              />
            </ul>
          </div>
        </article>
      </section>

      <section v-else-if="s === 'education' && page.education?.length">
        <h2>Education</h2>
        <article v-for="(edu, i) in page.education" :key="i" class="ats__item">
          <CvText
            tag="h3"
            :value="edu.degree"
            :src="entryText(src?.education?.[i], 'title')"
          />
          <p class="ats__meta">
            <CvText
              :value="edu.uni"
              :src="entryText(src?.education?.[i], 'org')"
            />
            |
            <CvText :value="edu.dates" :src="opens(src?.education?.[i])" />
          </p>
          <CvText
            v-if="edu.details"
            tag="p"
            :value="edu.details"
            :src="entryText(src?.education?.[i], 'details')"
          />
        </article>
      </section>

      <section v-else-if="s === 'skills' && page.skills">
        <h2>Skills</h2>
        <p v-for="(list, category) in page.skills" :key="category">
          <strong>{{ category }}:</strong>
          <template v-for="(skill, k) in list" :key="k">
            <span>{{ k ? ", " : " " }}</span>
            <CvText
              :value="skill"
              :src="entryText(src?.skills?.[category]?.[k], 'title')"
            />
          </template>
        </p>
      </section>

      <section v-else-if="s === 'competencies' && page.competencies?.length">
        <h2>Core Competencies</h2>
        <p>
          <template v-for="(comp, i) in page.competencies" :key="i">
            <CvText
              :value="comp"
              :src="entryText(src?.competencies?.[i], 'title')"
            /><span v-if="i < page.competencies.length - 1">, </span>
          </template>
        </p>
      </section>

      <section v-else-if="s === 'projects' && page.projects?.length">
        <h2>Projects</h2>
        <article v-for="(proj, i) in page.projects" :key="i" class="ats__item">
          <CvText
            tag="h3"
            :value="proj.title"
            :src="entryText(src?.projects?.[i]?.id, 'title')"
          />
          <CvText
            v-if="proj.tech"
            tag="p"
            class="ats__meta"
            :value="proj.tech"
            :src="opens(src?.projects?.[i]?.id)"
          />
          <CvText
            tag="p"
            :value="proj.desc"
            :src="
              entryText(
                src?.projects?.[i]?.id,
                src?.projects?.[i]?.desc ?? 'details'
              )
            "
          />
        </article>
      </section>

      <section v-else-if="s === 'achievements' && page.achievements?.length">
        <h2>Achievements</h2>
        <article v-for="(a, i) in page.achievements" :key="i" class="ats__item">
          <CvText
            tag="h3"
            :value="a.role"
            :src="entryText(src?.achievements?.[i], 'title')"
          />
          <CvText
            tag="p"
            class="ats__meta"
            :value="a.org"
            :src="entryText(src?.achievements?.[i], 'org')"
          />
          <CvText
            v-if="a.note"
            tag="p"
            :value="a.note"
            :src="entryText(src?.achievements?.[i], 'details')"
          />
        </article>
      </section>

      <section v-else-if="s === 'interests' && page.interests?.length">
        <h2>Interests</h2>
        <p>
          <template v-for="(int, i) in page.interests" :key="i">
            <CvText
              tag="strong"
              :value="int.name"
              :src="entryText(src?.interests?.[i], 'title')"
            /><template v-if="int.desc">
              (<CvText
                :value="int.desc"
                :src="entryText(src?.interests?.[i], 'details')"
              />)</template
            ><span v-if="i < page.interests.length - 1">, </span>
          </template>
        </p>
      </section>
    </template>
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

.ats__engagement {
  margin: 4pt 0 0 12pt;
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
  :global(nav),
  :global(header),
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
