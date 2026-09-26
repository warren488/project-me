<script setup lang="ts">
import { computed } from "vue";
import ProjectCard from "@/components/ProjectCard.vue";
import { site } from "@/data/site";
import { featuredProjects, otherProjects } from "@/data/projects";
import type { PublishedTimeline, TimelineItem } from "@/cv/types";
import timelineData from "../../cv/timeline.json";

const timeline = timelineData as PublishedTimeline;

// "Currently": the most recent role. The timeline is newest first.
const current = computed<TimelineItem | undefined>(() => {
  const jobs = timeline.items.filter((i) => i.kind === "job");
  return jobs.find((j) => j.end === null) ?? jobs[0];
});

const recent = computed(() => timeline.items.slice(0, 3));

const byId = new Map(timeline.items.map((i) => [i.id, i]));
// Engagements show the employer they were through.
const orgOf = (item: TimelineItem) => {
  if (!item.parent) return item.org;
  const parent = byId.get(item.parent);
  return parent ? `via ${parent.org ?? parent.title}` : undefined;
};

const KIND_LABELS: Record<string, string> = {
  job: "Role",
  engagement: "Client",
  education: "Study",
  project: "Project",
  achievement: "Achievement",
};
</script>

<template>
  <div class="home">
    <section class="hero container">
      <div class="hero__text">
        <span class="eyebrow">Hi, I'm</span>
        <h1 class="hero__name">{{ site.name }}</h1>
        <p class="hero__title">{{ site.title }}</p>
        <p class="hero__pitch">{{ site.pitch }}</p>
        <p v-if="current" class="hero__now">
          <span class="hero__now-label">Now</span>
          {{ current.title
          }}<template v-if="current.org"> at {{ current.org }}</template>
          <span class="hero__dot" aria-hidden="true">·</span>
          {{ site.location }}
        </p>
        <div class="hero__actions">
          <router-link to="/timeline" class="btn btn-lg btn--solid hero__cta">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              fill="currentColor"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
              />
            </svg>
            See my experience
          </router-link>
          <a :href="`mailto:${site.email}`" class="btn btn-lg">Email me</a>
        </div>
      </div>
      <img
        class="hero__portrait"
        src="/images/portrait.jpeg"
        alt="Warren Scantlebury"
        width="250"
        height="250"
        fetchpriority="high"
      />
    </section>

    <section class="recent container" aria-labelledby="recent-title">
      <div class="recent__head">
        <h2 id="recent-title" class="section-title">Recently</h2>
        <router-link to="/timeline" class="recent__more">
          Full timeline
        </router-link>
      </div>
      <ol class="recent__list">
        <li v-for="item in recent" :key="item.id" class="recent__item">
          <span class="recent__kind">{{
            KIND_LABELS[item.kind] ?? item.kind
          }}</span>
          <span class="recent__dates">{{ item.dates }}</span>
          <span class="recent__title">{{ item.title }}</span>
          <span v-if="orgOf(item)" class="recent__org">{{ orgOf(item) }}</span>
        </li>
      </ol>
    </section>

    <section class="work container" aria-labelledby="work-title">
      <h2 id="work-title" class="section-title">Things I've built</h2>
      <p class="section-lede">
        Side projects, tools for the house, and the odd experiment to see what
        the web can do.
      </p>
      <div class="work__grid">
        <ProjectCard
          v-for="project in featuredProjects"
          :key="project.id"
          :project="project"
        />
      </div>

      <details v-if="otherProjects.length" class="work__more">
        <summary>More projects</summary>
        <div class="work__grid work__grid--compact">
          <ProjectCard
            v-for="project in otherProjects"
            :key="project.id"
            :project="project"
          />
        </div>
      </details>
    </section>

    <section class="about-site container">
      <p>
        <strong>About this site.</strong> The CV here is generated from a
        library of entries and named variants, published to JSON, and cut into
        A4 sheets for print. The same data drives the timeline.
        <a
          href="https://github.com/warren488/project-me"
          target="_blank"
          rel="noopener"
          >Read the source</a
        >.
      </p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.home {
  flex-basis: 100%;
}

.container {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

// --- Hero ---
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  padding-top: 3rem;
  padding-bottom: 3rem;
  border-bottom: solid thin var(--line);
}

.hero__text {
  animation: rise 0.5s ease-out both;
  max-width: 40rem;
}

.hero__name {
  margin: 0.25rem 0 0.25rem;
  font-size: calc(1.6rem + 3vw);
  font-weight: 800;
  line-height: 1.1;
}

.hero__title {
  margin: 0 0 1rem;
  font-size: calc(1rem + 0.6vw);
  font-weight: 600;
  color: var(--muted);
}

.hero__pitch {
  font-size: 1.1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.hero__now {
  font-size: 0.95rem;
  color: var(--muted);
  margin-bottom: 1.5rem;
}

.hero__now-label {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  vertical-align: middle;
}

.hero__dot {
  margin: 0 0.5rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.hero__cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.hero__portrait {
  flex-shrink: 0;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  outline: solid 2px var(--accent);
  outline-offset: 6px;
  object-fit: cover;
  object-position: top;
  animation: rise 0.5s ease-out 0.1s both;
}

@media (max-width: 768px) {
  .hero {
    flex-direction: column-reverse;
    text-align: center;
    padding-top: 2rem;
  }
  .hero__portrait {
    width: 175px;
    height: 175px;
  }
  .hero__actions {
    justify-content: center;
  }
}

// --- Recently ---
.recent__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.recent__more {
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
}

.recent__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.recent__item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 1rem 1.25rem;
  border-left: 3px solid var(--accent);
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 0 0.5rem 0.5rem 0;
}

.recent__kind,
.recent__dates {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.recent__kind {
  color: var(--accent);
  font-weight: 700;
}

.recent__title {
  font-weight: 700;
  margin-top: 0.25rem;
}

.recent__org {
  color: var(--muted);
}

// --- Work ---
.work__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1.25rem;
}

.work__more {
  margin-top: 1.5rem;
  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 1rem;
    list-style: none;
    &::-webkit-details-marker {
      display: none;
    }
    &::before {
      content: "+ ";
    }
  }
  &[open] summary::before {
    content: "− ";
  }
}

// --- About this site ---
.about-site {
  border-top: solid thin var(--line);
  color: var(--muted);
  p {
    max-width: 48rem;
    margin: 0;
  }
  strong {
    color: var(--secondary);
  }
}
</style>
