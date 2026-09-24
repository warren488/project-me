<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { PublishedTimeline, TimelineItem } from "@/cv/types";
import published from "../../cv/timeline.json";

const timeline = published as PublishedTimeline;

const KIND_LABELS: Record<string, string> = {
  job: "Work",
  education: "Education",
  project: "Project",
  achievement: "Achievement",
  interest: "Interest",
};

const kinds = computed(() =>
  Object.keys(KIND_LABELS).filter((k) =>
    timeline.items.some((i) => i.kind === k)
  )
);
const filter = ref<string | null>(null);
const items = computed(() =>
  filter.value
    ? timeline.items.filter((i) => i.kind === filter.value)
    : timeline.items
);

const year = (date: string) => date.slice(0, 4);
const showYear = (index: number) =>
  index === 0 ||
  year(items.value[index - 1].start) !== year(items.value[index].start);

// "2022-10" -> months since epoch; a bare year counts from January.
const months = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
};
function duration(item: TimelineItem) {
  const now = new Date();
  const end = item.end
    ? months(item.end)
    : now.getFullYear() * 12 + now.getMonth();
  const total = end - months(item.start) + 1;
  if (
    total < 1 ||
    !item.start.includes("-") ||
    (item.end && !item.end.includes("-"))
  )
    return ""; // year-only dates are too coarse for a duration
  const y = Math.floor(total / 12);
  const m = total % 12;
  const parts = [];
  if (y) parts.push(`${y} yr${y > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} mo${m > 1 ? "s" : ""}`);
  return parts.join(" ");
}

const expanded = ref(new Set<string>());
const toggle = (id: string) => {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
};
const PREVIEW_BULLETS = 2;

// Reveal cards as they scroll into view.
const root = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

function observe() {
  observer?.disconnect();
  if (!root.value || !("IntersectionObserver" in window)) return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          observer?.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
  );
  root.value
    .querySelectorAll(".timeline__item:not(.is-visible)")
    .forEach((el) => observer?.observe(el));
}

onMounted(observe);
onBeforeUnmount(() => observer?.disconnect());

function setFilter(kind: string | null) {
  filter.value = kind;
  // New items mount on the next tick; observe them once they exist.
  requestAnimationFrame(observe);
}
</script>

<template>
  <div class="timeline container" ref="root">
    <header class="timeline__head">
      <h1 class="timeline__title">Timeline</h1>
      <p class="timeline__lede">
        Everything I've been up to, most recent first.
      </p>
      <div class="timeline__filters" role="group" aria-label="Filter by type">
        <button
          class="timeline__chip"
          :class="{ 'is-active': filter === null }"
          @click="setFilter(null)"
        >
          All
        </button>
        <button
          v-for="k in kinds"
          :key="k"
          class="timeline__chip"
          :class="[`is-${k}`, { 'is-active': filter === k }]"
          @click="setFilter(k)"
        >
          {{ KIND_LABELS[k] }}
        </button>
      </div>
    </header>

    <ol class="timeline__list">
      <li class="timeline__cap" aria-hidden="true"><span>Now</span></li>
      <template v-for="(item, index) in items" :key="item.id">
        <li v-if="showYear(index)" class="timeline__year" aria-label="Year">
          <span>{{ year(item.start) }}</span>
        </li>
        <li
          class="timeline__item"
          :class="[`is-${item.kind}`, index % 2 ? 'is-right' : 'is-left']"
        >
          <span
            class="timeline__node"
            :class="{ 'is-current': item.end === null }"
          ></span>
          <article class="timeline__card">
            <div class="timeline__meta">
              <span class="timeline__kind">{{
                KIND_LABELS[item.kind] ?? item.kind
              }}</span>
              <span class="timeline__dates">
                {{ item.dates }}
                <span v-if="duration(item)" class="timeline__duration">{{
                  duration(item)
                }}</span>
              </span>
            </div>
            <h2 class="timeline__item-title">{{ item.title }}</h2>
            <p v-if="item.org" class="timeline__org">{{ item.org }}</p>
            <p
              v-if="item.details"
              class="timeline__details"
              v-html="item.details"
            ></p>
            <ul v-if="item.bullets?.length" class="timeline__bullets">
              <li
                v-for="(text, i) in expanded.has(item.id)
                  ? item.bullets
                  : item.bullets.slice(0, PREVIEW_BULLETS)"
                :key="i"
                v-html="text"
              ></li>
            </ul>
            <button
              v-if="(item.bullets?.length ?? 0) > PREVIEW_BULLETS"
              class="timeline__more"
              @click="toggle(item.id)"
            >
              {{
                expanded.has(item.id)
                  ? "Show less"
                  : `Show ${item.bullets!.length - PREVIEW_BULLETS} more`
              }}
            </button>
            <p v-if="item.tech" class="timeline__tech">{{ item.tech }}</p>
            <div v-if="item.tags.length" class="timeline__tags">
              <span v-for="t in item.tags" :key="t" class="timeline__tag">{{
                t
              }}</span>
            </div>
          </article>
        </li>
      </template>
      <li class="timeline__cap timeline__cap--end" aria-hidden="true">
        <span></span>
      </li>
    </ol>
    <p v-if="!items.length" class="text-center timeline__lede">
      Nothing here yet.
    </p>
  </div>
</template>

<style scoped lang="scss">
$line: 2px;
$node: 18px;
$gap: 3rem; // space between the line and a card on desktop
$item-pad: 0.75rem; // vertical padding of each list item
$node-top: 2rem; // node top edge, measured from the list item

.timeline {
  --job: var(--tertiary);
  --education: #60a5fa;
  --project: #f59e0b;
  --achievement: #f472b6;
  --interest: #a78bfa;
  --kind: var(--secondary);
  --line: rgba(201, 201, 201, 0.25);
  --card: rgba(255, 255, 255, 0.04);
  --card-border: rgba(201, 201, 201, 0.18);
  --muted: rgba(201, 201, 201, 0.7);

  flex-basis: 100%;
  max-width: 1000px;
  padding-bottom: 4rem;
}

.timeline__head {
  text-align: center;
  margin: 0 auto 2.5rem;
  max-width: 640px;
}

.timeline__title {
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 300;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
}

.timeline__lede {
  color: var(--muted);
  margin: 0.5rem 0 1.5rem;
}

.timeline__filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.timeline__chip {
  --kind: var(--secondary);
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--card-border);
  border-radius: 999px;
  padding: 0.3rem 0.9rem;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;

  &:hover,
  &.is-active {
    color: var(--kind);
    border-color: var(--kind);
  }

  &.is-active {
    box-shadow: 0 0 12px -4px var(--kind);
  }
}

// --- The line and everything on it ---
.timeline__list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: $line;
    margin-left: -$line * 0.5;
    background: linear-gradient(
      to bottom,
      var(--tertiary) 0,
      var(--line) 120px,
      var(--line) calc(100% - 120px),
      transparent 100%
    );
  }
}

.timeline__cap,
.timeline__year {
  position: relative;
  display: flex;
  justify-content: center;
  z-index: 1;
}

.timeline__cap span {
  display: inline-block;
  padding: 0.2rem 0.75rem;
  border-radius: 999px;
  background: var(--tertiary);
  color: var(--primary);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: 0 0 16px -2px var(--tertiary);
}

.timeline__cap--end {
  margin-top: 1.5rem;

  span {
    width: 8px;
    height: 8px;
    padding: 0;
    background: var(--line);
    box-shadow: none;
  }
}

.timeline__year {
  margin: 2rem 0 1rem;

  span {
    padding: 0.25rem 1rem;
    border-radius: 999px;
    background: var(--primary);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.8rem;
    letter-spacing: 0.2em;
    font-variant-numeric: tabular-nums;
  }
}

// --- Items ---
.timeline__item {
  position: relative;
  width: 50%;
  padding: $item-pad 0;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.6s ease, transform 0.6s ease;

  &.is-visible {
    opacity: 1;
    transform: none;
  }

  &.is-job {
    --kind: var(--job);
  }
  &.is-education {
    --kind: var(--education);
  }
  &.is-project {
    --kind: var(--project);
  }
  &.is-achievement {
    --kind: var(--achievement);
  }
  &.is-interest {
    --kind: var(--interest);
  }

  &.is-left {
    padding-right: $gap;
  }
  &.is-right {
    margin-left: 50%;
    padding-left: $gap;
  }
}

.timeline__node {
  position: absolute;
  top: $node-top;
  width: $node;
  height: $node;
  border-radius: 50%;
  background: var(--primary);
  border: 3px solid var(--kind);
  box-shadow: 0 0 0 4px var(--primary);
  z-index: 2;

  .is-left & {
    right: -$node * 0.5;
  }
  .is-right & {
    left: -$node * 0.5;
  }

  &.is-current::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--kind);
    animation: pulse 2.2s ease-out infinite;
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

.timeline__card {
  position: relative;
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 1.25rem 1.4rem;
  backdrop-filter: blur(6px);
  transition: border-color 0.25s, box-shadow 0.25s;

  // Short connector from the card edge to the node.
  &::before {
    content: "";
    position: absolute;
    // Centre on the node: the card starts $item-pad below the item's top.
    top: calc(#{$node-top - $item-pad} + #{$node * 0.5 - 1px});
    width: calc(#{$gap} - #{$node * 0.5});
    height: 2px;
    background: linear-gradient(to right, var(--kind), transparent);
  }
  .is-left &::before {
    right: calc(-1 * (#{$gap} - #{$node * 0.5}));
    transform: scaleX(-1);
  }
  .is-right &::before {
    left: calc(-1 * (#{$gap} - #{$node * 0.5}));
  }

  // No transform on hover: it would carry the connector off the node.
  &:hover {
    border-color: var(--kind);
    box-shadow: 0 12px 30px -18px var(--kind);
  }
}

.timeline__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}

.timeline__kind {
  color: var(--kind);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.timeline__dates {
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.timeline__duration {
  margin-left: 0.4rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  font-size: 0.7rem;
}

.timeline__item-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: 1.3;
}

.timeline__org {
  color: var(--kind);
  margin: 0.1rem 0 0.6rem;
  font-size: 0.95rem;
}

.timeline__details {
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
  line-height: 1.55;
}

.timeline__bullets {
  margin: 0.6rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
  line-height: 1.5;

  li {
    margin-bottom: 0.3rem;

    &::marker {
      color: var(--kind);
    }
  }
}

.timeline__more {
  background: none;
  border: none;
  padding: 0;
  margin-top: 0.35rem;
  color: var(--kind);
  font-size: 0.8rem;
  letter-spacing: 0.04em;

  &:hover {
    text-decoration: underline;
  }
}

.timeline__tech {
  margin: 0.6rem 0 0;
  color: var(--muted);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.75rem;
}

.timeline__tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: rgba(201, 201, 201, 0.08);
  color: var(--muted);
}

// --- Phones: single column, line on the left ---
@media (max-width: 767.98px) {
  $left: 14px;

  .timeline__list::before {
    left: $left;
    margin-left: 0;
  }

  .timeline__cap,
  .timeline__year {
    justify-content: flex-start;
    padding-left: calc(#{$left} + 1.75rem);
  }

  .timeline__item,
  .timeline__item.is-right {
    width: 100%;
    margin-left: 0;
    padding-left: calc(#{$left} + 1.75rem);
    padding-right: 0;
  }

  .timeline__node,
  .is-left .timeline__node,
  .is-right .timeline__node {
    left: $left - $node * 0.5 + $line * 0.5;
    right: auto;
  }

  .timeline__card::before,
  .is-left .timeline__card::before,
  .is-right .timeline__card::before {
    left: calc(-1 * (1.75rem - #{$node * 0.5}));
    right: auto;
    width: calc(1.75rem - #{$node * 0.5});
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .timeline__item {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .timeline__node.is-current::after {
    animation: none;
  }
  .timeline__card {
    transition: none;
  }
}
</style>
