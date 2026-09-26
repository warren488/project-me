<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { PublishedTimeline, TimelineItem } from "@/cv/types";
import published from "../../cv/timeline.json";

// The timeline as a git graph. The main line is employment and study,
// newest first. Where a job placed me with clients, those engagements branch
// off beside the main line and merge back where the job ends.

const timeline = published as PublishedTimeline;

// "2022-10" -> months since epoch; a bare year counts from January.
const months = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
};
const thisMonth = () => {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
};
const endMonth = (item: TimelineItem) =>
  item.end ? months(item.end) : thisMonth();

function duration(item: TimelineItem) {
  const total = endMonth(item) - months(item.start) + 1;
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

// Big year range for the date column: "2022 — Now", "2021 — 2022", "2014".
function years(item: TimelineItem) {
  const from = item.start.slice(0, 4);
  const to = item.end === null ? "Now" : item.end?.slice(0, 4) ?? from;
  return from === to ? from : `${from} — ${to}`;
}

// --- Graph ---------------------------------------------------------------
// One chronological log, newest first. A job that placed me with clients is
// a branch: it leaves the main line just above the job's own row, runs up a
// lane beside it carrying the engagements at their own dates, and merges
// back where the job ended (or reaches HEAD while it is still running).
// Branches that overlap in time take different lanes, so the lattice itself
// shows concurrent work.

const BRANCH_COLORS = ["#4fd1c5", "#ffb454", "#a78bfa", "#f472b6"];

interface Branch {
  item: TimelineItem;
  children: TimelineItem[]; // engagements, newest first
  branch: string; // colour
  open: boolean; // still running: reaches HEAD instead of merging
  lane: number; // 1 = nearest the main line
  forkIdx: number; // row of the job itself
  mergeIdx: number; // row where it rejoins main (0 = HEAD)
}

type Row =
  | { type: "head"; key: string; at: number }
  | { type: "item"; key: string; at: number; item: TimelineItem }
  | { type: "merge"; key: string; at: number; branchId: string }
  | { type: "root"; key: string; at: number };

const jobs = timeline.items.filter((i) => i.kind === "job");
// Concurrent means sharing more than a handover month.
const overlaps = (a: TimelineItem, b: TimelineItem) =>
  months(a.start) < endMonth(b) && months(b.start) < endMonth(a);
const alongside = (item: TimelineItem) =>
  item.kind === "job"
    ? jobs.filter((j) => j.id !== item.id && overlaps(j, item))
    : [];
const isOpen = (job: TimelineItem) =>
  job.end === null || months(job.end) >= thisMonth();

const graph = computed(() => {
  // Branches, coloured in order of appearance.
  const branches: Branch[] = [];
  for (const item of timeline.items) {
    if (item.kind !== "job") continue;
    const children = timeline.items.filter((c) => c.parent === item.id);
    if (!children.length) continue;
    branches.push({
      item,
      children,
      branch: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
      open: isOpen(item),
      lane: 0,
      forkIdx: -1,
      mergeIdx: 0,
    });
  }

  // Rows: the items in log order, with a merge row for each finished branch
  // slotted in above the newest row it still covers.
  const merges = branches
    .filter((b) => !b.open)
    .map((b) => ({
      type: "merge" as const,
      key: `merge-${b.item.id}`,
      at: months(b.item.end as string),
      branchId: b.item.id,
    }))
    .sort((a, b) => b.at - a.at);
  const rows: Row[] = [{ type: "head", key: "head", at: thisMonth() }];
  for (const item of timeline.items) {
    const at = months(item.start);
    while (merges.length && merges[0].at >= at) {
      rows.push(merges.shift() as Row);
    }
    rows.push({ type: "item", key: item.id, at, item });
  }
  rows.push(...merges);
  rows.push({ type: "root", key: "root", at: -Infinity });

  for (const b of branches) {
    b.forkIdx = rows.findIndex(
      (r) => r.type === "item" && r.item.id === b.item.id
    );
    b.mergeIdx = b.open
      ? 0
      : rows.findIndex((r) => r.type === "merge" && r.branchId === b.item.id);
  }

  // Lanes: oldest fork first, into the lowest lane free of any branch that
  // is still running when this one starts.
  const placed: Branch[] = [];
  for (const b of [...branches].sort((x, y) => y.forkIdx - x.forkIdx)) {
    const clash = (o: Branch) =>
      o.mergeIdx < b.forkIdx && b.mergeIdx < o.forkIdx;
    let lane = 1;
    while (placed.some((o) => o.lane === lane && clash(o))) lane++;
    b.lane = lane;
    placed.push(b);
  }

  return {
    rows,
    branches,
    lanes: Math.max(0, ...branches.map((b) => b.lane)),
  };
});

const rows = computed(() => graph.value.rows);
const branches = computed(() => graph.value.branches);
const laneCount = computed(() => graph.value.lanes);
const openBranches = computed(() => branches.value.filter((b) => b.open));
const branchOf = (id: string | null | undefined) =>
  branches.value.find((b) => b.item.id === id);
const branchOfItem = (item: TimelineItem) => branchOf(item.parent ?? item.id);
const colourOf = (id: string | undefined) =>
  branchOf(id)?.branch ?? "var(--muted)";
const nameOf = (item: TimelineItem) => item.org ?? item.title;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const endOf = (item: TimelineItem) => item.dates.split("–").pop()?.trim();

// Which piece of each branch's line a row draws. The fork curve lives in
// the row above the job, so the line leaves the main line just above the
// job's node. (A branch with no rows between its fork and its merge would
// need both curves in one row; the data never produces that.)
type SegmentKind = "through" | "fork" | "head" | "merge";
interface Segment {
  branch: Branch;
  kind: SegmentKind;
}
function segments(rowIdx: number): Segment[] {
  const out: Segment[] = [];
  for (const branch of branches.value) {
    if (rowIdx === branch.mergeIdx) {
      out.push({ branch, kind: branch.open ? "head" : "merge" });
    } else if (rowIdx === branch.forkIdx - 1) {
      out.push({ branch, kind: "fork" });
    } else if (branch.mergeIdx < rowIdx && rowIdx < branch.forkIdx - 1) {
      out.push({ branch, kind: "through" });
    }
  }
  return out;
}

// Per-row CSS variables: the branch colour and lane an item belongs to.
const itemStyle = (item: TimelineItem) => {
  const b = branchOfItem(item);
  return b ? { "--branch": b.branch, "--lane": b.lane } : undefined;
};

// --- Trace a branch ------------------------------------------------------
// Picking an employer lights its line and dims everything else.
// "?branch=job-rad" opens the page with that branch traced.
const route = useRoute();
const focus = ref<string | null>(
  typeof route.query.branch === "string" ? route.query.branch : null
);
const trace = (id: string) => (focus.value = focus.value === id ? null : id);
const onBranch = (item: TimelineItem) =>
  item.id === focus.value || item.parent === focus.value;
const glow = (item: TimelineItem) =>
  focus.value ? (onBranch(item) ? "is-lit" : "is-dim") : "";
const glowBranch = (id: string) =>
  focus.value ? (focus.value === id ? "is-lit" : "is-dim") : "";
const focusText = computed(() => {
  const s = branchOf(focus.value);
  if (!s) return "pick a branch to trace it";
  return `${nameOf(s.item)} · ${plural(
    s.children.length,
    "client engagement"
  )}`;
});

// --- Overview bars -------------------------------------------------------
// Jobs and engagements on one time axis, so concurrent work is visible even
// though the graph below reads one branch at a time.
interface Bar {
  item: TimelineItem;
  lane: number;
  left: number; // percent
  width: number; // percent
  colour: string;
}

const LANE_H = 32;

const axis = computed(() => {
  const dated = timeline.items.filter((i) =>
    ["job", "engagement"].includes(i.kind)
  );
  const from = Math.min(...dated.map((i) => months(i.start)));
  const to = thisMonth();
  return {
    from,
    to,
    span: Math.max(1, to - from),
    year: Math.floor(from / 12),
  };
});

const pct = (m: number) => ((m - axis.value.from) / axis.value.span) * 100;

// Oldest first into the lowest free lane, so overlapping spans stack.
function lanes(items: TimelineItem[]) {
  const placed: { item: TimelineItem; lane: number }[] = [];
  const sorted = [...items].sort((a, b) => months(a.start) - months(b.start));
  for (const item of sorted) {
    const clash = (p: { item: TimelineItem; lane: number }, lane: number) =>
      p.lane === lane &&
      months(p.item.start) <= endMonth(item) &&
      months(item.start) <= endMonth(p.item);
    let lane = 0;
    while (placed.some((p) => clash(p, lane))) lane++;
    placed.push({ item, lane });
  }
  return placed;
}

// Bars stop at Now even when a role's end date is still ahead.
const toBar = (p: { item: TimelineItem; lane: number }): Bar => {
  const left = pct(months(p.item.start));
  const right = pct(Math.min(endMonth(p.item) + 1, axis.value.to));
  return {
    item: p.item,
    lane: p.lane,
    left,
    width: Math.max(1.5, right - left),
    colour: colourOf(p.item.parent ?? p.item.id),
  };
};
// Too narrow even for an ellipsis: the tooltip still names it.
const MIN_LABEL_WIDTH = 3;
// Tooltips near the right edge hang left so they stay inside the panel.
const tipSide = (b: Bar) => (b.left + b.width / 2 > 72 ? "bar--tip-left" : "");

const jobBars = computed(() =>
  lanes(timeline.items.filter((i) => i.kind === "job")).map(toBar)
);
const clientBars = computed(() =>
  lanes(timeline.items.filter((i) => i.kind === "engagement")).map(toBar)
);
const laneHeight = (bars: Bar[]) =>
  `${(Math.max(-1, ...bars.map((b) => b.lane)) + 1) * LANE_H}px`;

const ticks = computed(() => {
  const first = Math.ceil(axis.value.from / 12);
  const last = Math.floor(axis.value.to / 12);
  const step = last - first > 8 ? 2 : 1;
  const out = [];
  for (let y = first; y <= last; y += step) {
    out.push({ year: y, left: pct(y * 12) });
  }
  return out;
});

// --- Bullets -------------------------------------------------------------
const expanded = ref(new Set<string>());
const toggle = (id: string) => {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
};
const PREVIEW_BULLETS = 2;
const shown = (item: TimelineItem) =>
  expanded.value.has(item.id)
    ? item.bullets ?? []
    : (item.bullets ?? []).slice(0, PREVIEW_BULLETS);
const hidden = (item: TimelineItem) =>
  Math.max(0, (item.bullets?.length ?? 0) - PREVIEW_BULLETS);
const moreLabel = (item: TimelineItem) =>
  expanded.value.has(item.id) ? "show less" : `show ${hidden(item)} more`;

// --- Reveal ---------------------------------------------------------------
// Cards fade up as they scroll into view. Revealed rows are tracked in Vue
// state and bound with the other classes: adding the class straight to the
// DOM would be wiped the next time Vue re-rendered the row's class list
// (for instance when a branch is traced).
const root = ref<HTMLElement | null>(null);
const revealed = reactive(new Set<string>());
let observer: IntersectionObserver | undefined;

onMounted(() => {
  const targets = root.value?.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!targets) return;
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => revealed.add(el.dataset.reveal as string));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        revealed.add((e.target as HTMLElement).dataset.reveal as string);
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
  );
  targets.forEach((el) => observer?.observe(el));
});
onBeforeUnmount(() => observer?.disconnect());

// Education reads as a tag on the main line: "tag: msc".
const tagOf = (item: TimelineItem) =>
  item.title
    .split(" ")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
</script>

<template>
  <div
    id="top"
    ref="root"
    class="log container"
    :style="{ '--lanes': laneCount }"
  >
    <header class="log__head">
      <h1 class="log__title">Timeline</h1>
      <p class="log__lede">
        Newest first. The main line is where I was employed or studying. Where a
        job placed me with clients, that work branches off beside it and merges
        back when the role ends.
      </p>

      <div class="log__legend">
        <button
          v-for="s in branches"
          :key="s.item.id"
          type="button"
          class="log__branch-chip"
          :class="{ 'is-active': focus === s.item.id }"
          :style="{ '--branch': s.branch }"
          :aria-pressed="focus === s.item.id"
          @click="trace(s.item.id)"
        >
          <span class="log__dot" aria-hidden="true"></span>
          {{ nameOf(s.item) }}
          <span class="log__chip-sub mono">
            · {{ plural(s.children.length, "client") }}
          </span>
        </button>
        <span class="log__focus mono">{{ focusText }}</span>
        <button
          v-if="focus"
          type="button"
          class="log__branch-chip log__branch-chip--clear mono"
          @click="focus = null"
        >
          checkout main
        </button>
      </div>

      <section class="overview" aria-label="Overview of employers and clients">
        <div class="overview__head mono">
          <span>OVERVIEW · NOW — {{ axis.year }}</span>
          <span class="overview__hint">click a bar to jump</span>
        </div>
        <div class="overview__body">
          <div class="overview__labels mono">
            <span :style="{ height: laneHeight(jobBars) }">Employed</span>
            <span
              v-if="clientBars.length"
              :style="{ height: laneHeight(clientBars) }"
            >
              Client work
            </span>
          </div>
          <div class="overview__chart">
            <div class="overview__grid" aria-hidden="true">
              <span
                v-for="t in ticks"
                :key="t.year"
                class="overview__tick"
                :style="{ left: `${t.left}%` }"
              ></span>
            </div>
            <div
              class="overview__lanes"
              :style="{ height: laneHeight(jobBars) }"
            >
              <a
                v-for="b in jobBars"
                :key="b.item.id"
                :href="`#${b.item.id}`"
                class="bar bar--outline mono"
                :class="[glow(b.item), tipSide(b)]"
                :style="{
                  left: `${b.left}%`,
                  width: `${b.width}%`,
                  top: `${b.lane * LANE_H}px`,
                  '--branch': b.colour,
                }"
                :aria-label="`${nameOf(b.item)} · ${b.item.dates}`"
              >
                <span v-if="b.width >= MIN_LABEL_WIDTH" class="bar__label">
                  {{ nameOf(b.item) }}
                </span>
                <span class="bar__tip" aria-hidden="true">
                  {{ nameOf(b.item) }} · {{ b.item.dates }}
                </span>
              </a>
            </div>
            <div
              v-if="clientBars.length"
              class="overview__lanes"
              :style="{ height: laneHeight(clientBars) }"
            >
              <a
                v-for="b in clientBars"
                :key="b.item.id"
                :href="`#${b.item.id}`"
                class="bar bar--fill mono"
                :class="[glow(b.item), tipSide(b)]"
                :style="{
                  left: `${b.left}%`,
                  width: `${b.width}%`,
                  top: `${b.lane * LANE_H}px`,
                  '--branch': b.colour,
                }"
                :aria-label="`${b.item.title} · ${b.item.dates}`"
              >
                <span v-if="b.width >= MIN_LABEL_WIDTH" class="bar__label">
                  {{ b.item.title }}
                </span>
                <span class="bar__tip" aria-hidden="true">
                  {{ b.item.title }} · {{ b.item.dates }}
                </span>
              </a>
            </div>
            <div class="overview__axis mono" aria-hidden="true">
              <span
                v-for="t in ticks"
                :key="t.year"
                class="overview__year"
                :style="{ left: `${t.left}%` }"
              >
                {{ t.year }}
              </span>
              <span class="overview__year overview__year--now">Now</span>
            </div>
          </div>
        </div>
      </section>
    </header>

    <p class="log__cmd mono">$ git log --graph --all --decorate</p>

    <main class="graph">
      <div class="graph__main-line" aria-hidden="true"></div>
      <div class="graph__progress" aria-hidden="true"></div>

      <component
        :is="row.type === 'item' ? 'article' : 'div'"
        v-for="(row, i) in rows"
        :id="row.type === 'item' ? row.item.id : undefined"
        :key="row.key"
        :data-reveal="row.type === 'item' ? row.key : undefined"
        class="entry"
        :class="[
          `entry--${row.type}`,
          row.type === 'item' ? `entry--${row.item.kind}` : '',
          row.type === 'item' ? glow(row.item) : '',
          row.type === 'merge' ? glowBranch(row.branchId) : '',
          {
            reveal: row.type === 'item',
            'is-visible': revealed.has(row.key),
          },
        ]"
        :style="
          row.type === 'item'
            ? itemStyle(row.item)
            : row.type === 'merge'
            ? { '--branch': colourOf(row.branchId) }
            : undefined
        "
      >
        <!-- Date column -->
        <div v-if="row.type === 'head'" class="entry__when log__big">Now</div>
        <div
          v-else-if="row.type === 'root'"
          class="entry__when mono entry__cap-text"
        >
          initial commit
        </div>
        <div
          v-else-if="row.type === 'merge'"
          class="entry__when mono entry__dates"
        >
          {{ endOf(branchOf(row.branchId)!.item) }}
        </div>
        <div
          v-else-if="row.item.kind === 'engagement'"
          class="entry__when mono entry__dates"
        >
          {{ row.item.dates }}
        </div>
        <div v-else class="entry__when">
          <div
            class="log__big"
            :class="{ 'log__big--small': row.item.kind !== 'job' }"
          >
            {{ years(row.item) }}
          </div>
          <div
            class="mono entry__dates"
            :class="{ 'entry__dates--tinted': branchOf(row.item.id) }"
          >
            {{ row.item.dates }}
            <span v-if="duration(row.item)" class="entry__duration">
              {{ duration(row.item) }}
            </span>
          </div>
        </div>

        <!-- Rail: lane segments, connector, node -->
        <div class="entry__rail">
          <template v-for="seg in segments(i)" :key="seg.branch.item.id">
            <span
              v-if="seg.kind === 'through'"
              class="lane lane--through"
              :class="glowBranch(seg.branch.item.id)"
              :style="{
                '--branch': seg.branch.branch,
                '--lane': seg.branch.lane,
              }"
              aria-hidden="true"
            ></span>
            <template v-else-if="seg.kind === 'fork'">
              <span
                class="lane lane--through lane--to-fork"
                :class="glowBranch(seg.branch.item.id)"
                :style="{
                  '--branch': seg.branch.branch,
                  '--lane': seg.branch.lane,
                }"
                aria-hidden="true"
              ></span>
              <svg
                class="lane lane--curve lane--fork"
                :class="glowBranch(seg.branch.item.id)"
                :style="{
                  '--branch': seg.branch.branch,
                  '--lane': seg.branch.lane,
                }"
                viewBox="0 0 48 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M48 0 C48 70 0 30 0 100"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
            </template>
            <svg
              v-else
              class="lane lane--curve"
              :class="[`lane--${seg.kind}`, glowBranch(seg.branch.item.id)]"
              :style="{
                '--branch': seg.branch.branch,
                '--lane': seg.branch.lane,
              }"
              viewBox="0 0 48 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M48 100 C48 30 0 70 0 0"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </template>

          <span
            v-if="row.type === 'item'"
            class="entry__connector"
            aria-hidden="true"
          ></span>
          <span
            v-if="row.type === 'head'"
            class="node node--head"
            aria-hidden="true"
          ></span>
          <span
            v-else-if="row.type === 'root'"
            class="node node--root"
            aria-hidden="true"
          ></span>
          <span
            v-else-if="row.type === 'item'"
            class="node"
            :class="[
              row.item.kind === 'job'
                ? 'node--job'
                : row.item.kind === 'engagement'
                ? 'node--client'
                : 'node--tag',
              { 'is-current': row.item.end === null },
            ]"
            aria-hidden="true"
          ></span>
        </div>

        <!-- Card column -->
        <div v-if="row.type === 'head'" class="mono entry__cap-text">
          HEAD → main
          <span v-if="openBranches.length" class="entry__open">
            · open:
            <template v-for="(b, n) in openBranches" :key="b.item.id">
              <span :style="{ color: b.branch }">{{ nameOf(b.item) }}</span
              ><template v-if="n < openBranches.length - 1">, </template>
            </template>
          </span>
        </div>
        <div v-else-if="row.type === 'root'" class="mono entry__cap-text">
          <a href="#top">↑ back to HEAD</a>
        </div>
        <div
          v-else-if="row.type === 'merge'"
          class="mono entry__cap-text entry__merge-text"
        >
          merged {{ nameOf(branchOf(row.branchId)!.item) }}
        </div>

        <!-- A job -->
        <div v-else-if="row.item.kind === 'job'" class="commit commit--job">
          <div class="commit__eyebrow mono">
            Employer<template v-if="branchOf(row.item.id)"> · branch</template>
          </div>
          <h2 class="commit__title">{{ nameOf(row.item) }}</h2>
          <p class="commit__role mono">
            {{ row.item.title }}
            <span class="entry__dates--inline">· {{ row.item.dates }}</span>
          </p>
          <p v-if="alongside(row.item).length" class="commit__alongside mono">
            ⇄ alongside {{ alongside(row.item).map(nameOf).join(", ") }}
          </p>
          <ul v-if="row.item.bullets?.length" class="commit__bullets">
            <li v-for="(b, n) in shown(row.item)" :key="n" v-html="b"></li>
          </ul>
          <button
            v-if="hidden(row.item)"
            type="button"
            class="commit__more mono"
            @click="toggle(row.item.id)"
          >
            {{ moreLabel(row.item) }}
          </button>
          <div v-if="branchOf(row.item.id)" class="commit__foot">
            <span class="mono commit__count">
              {{
                plural(
                  branchOf(row.item.id)!.children.length,
                  "client engagement"
                )
              }}
              ↑
            </span>
            <button type="button" class="chip mono" @click="trace(row.item.id)">
              {{ focus === row.item.id ? "checkout main" : "trace branch" }}
            </button>
          </div>
          <div v-else-if="row.item.tags.length" class="commit__tags">
            <span v-for="t in row.item.tags" :key="t" class="tag mono">
              {{ t }}
            </span>
          </div>
        </div>

        <!-- A client engagement, on its employer's lane -->
        <div
          v-else-if="row.item.kind === 'engagement'"
          class="commit commit--client"
        >
          <h3 class="commit__title commit__title--client">
            {{ row.item.title }}
          </h3>
          <p class="mono entry__dates entry__dates--inline">
            {{ row.item.dates }}
          </p>
          <p
            v-if="row.item.details"
            class="commit__text"
            v-html="row.item.details"
          ></p>
          <ul v-if="row.item.bullets?.length" class="commit__bullets">
            <li v-for="(b, n) in shown(row.item)" :key="n" v-html="b"></li>
          </ul>
          <button
            v-if="hidden(row.item)"
            type="button"
            class="commit__more mono"
            @click="toggle(row.item.id)"
          >
            {{ moreLabel(row.item) }}
          </button>
          <div class="commit__foot">
            <div class="commit__tags">
              <span v-for="t in row.item.tags" :key="t" class="tag mono">
                {{ t }}
              </span>
            </div>
            <button
              v-if="branchOfItem(row.item)"
              type="button"
              class="chip mono"
              :aria-label="`Trace the ${nameOf(
                branchOfItem(row.item)!.item
              )} branch`"
              @click="trace(branchOfItem(row.item)!.item.id)"
            >
              via {{ nameOf(branchOfItem(row.item)!.item) }} ↰
            </button>
          </div>
        </div>

        <!-- Everything else: a tag on the main line -->
        <div v-else class="commit commit--tag">
          <div class="commit__eyebrow mono">
            <template v-if="row.item.kind === 'education'">
              tag: {{ tagOf(row.item) }}
            </template>
            <template v-else>{{ row.item.kind }}</template>
          </div>
          <h2 class="commit__title">{{ row.item.title }}</h2>
          <p class="commit__role mono">
            {{ row.item.org }}
            <span class="entry__dates--inline">· {{ row.item.dates }}</span>
          </p>
          <p
            v-if="row.item.details"
            class="commit__text"
            v-html="row.item.details"
          ></p>
          <p v-if="row.item.tech" class="commit__tech mono">
            {{ row.item.tech }}
          </p>
          <div v-if="row.item.tags.length" class="commit__tags">
            <span v-for="t in row.item.tags" :key="t" class="tag mono">
              {{ t }}
            </span>
          </div>
        </div>
      </component>
    </main>

    <aside class="log__cv">
      <span class="log__cv-text">
        Prefer a document? The CV covers the same ground.
      </span>
      <router-link to="/cv" class="btn">View and print my CV</router-link>
    </aside>
  </div>
</template>

<style scoped lang="scss">
// Geometry. The rail column holds the main line and the branch line; the
// nodes, connectors and curves all derive from these two x positions.
.log {
  --when-w: 230px;
  --main-x: 40px; // the main line, from the rail's left edge
  --lane-step: 40px; // distance between neighbouring branch lanes
  --rail-tail: 36px; // room between the outermost lane and the cards
  --rail-w: calc(
    var(--main-x) + var(--lanes, 0) * var(--lane-step) + var(--rail-tail)
  );
  --node-y: 34px; // node centre, from the top of a row
  --row-gap: 1.75rem; // space between cards, kept inside the row
  --card-indent: 28px;
  --line: rgba(215, 219, 228, 0.16);
  --card: rgba(255, 255, 255, 0.035);
  --card-border: rgba(215, 219, 228, 0.14);
  --ink: #fff;

  flex-basis: 100%;
  max-width: 1080px;
  padding-top: 2.5rem;
  padding-bottom: 5rem;
}

.mono {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
}

// --- Header ---
.log__head {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  margin-bottom: 3.5rem;
}

.log__cmd {
  margin: 0 0 1.5rem;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.log__title {
  margin: 0;
  font-size: clamp(2.4rem, 6vw, 4rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
}

.log__lede {
  max-width: 44rem;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.log__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 0.5rem;
}

.log__branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 40px;
  padding: 0 0.9rem;
  border-radius: 999px;
  background: var(--card);
  border: 1px solid var(--card-border);
  color: var(--secondary);
  font-size: 0.85rem;
  font-weight: 600;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: var(--branch, var(--secondary));
  }
  &.is-active {
    border-color: var(--branch, var(--secondary));
    box-shadow: 0 0 0 1px var(--branch, transparent);
  }
  &--clear {
    color: var(--muted);
    font-weight: 500;
  }
}

.log__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--branch);
  box-shadow: 0 0 10px var(--branch);
}

.log__chip-sub {
  color: var(--muted);
  font-weight: 400;
}

.log__focus {
  color: var(--muted);
  margin-left: 0.25rem;
}

// --- Overview ---
.overview {
  margin-top: 1rem;
  padding: 1.1rem 1.4rem 1rem;
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: 16px;
}

.overview__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.overview__hint {
  letter-spacing: 0;
  opacity: 0.7;
}

.overview__body {
  display: flex;
  gap: 1rem;
}

.overview__labels {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  width: 88px;
  color: var(--muted);
  span {
    display: flex;
    align-items: center;
  }
}

.overview__chart {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.overview__grid {
  position: absolute;
  inset: 0 0 22px 0;
  pointer-events: none;
}

.overview__tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}

.overview__lanes {
  position: relative;
}

.bar {
  position: absolute;
  height: 26px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 6px;
  white-space: nowrap;
  text-decoration: none;
  transition: transform 0.2s, opacity 0.3s, filter 0.3s;
  &:hover,
  &:focus-visible {
    transform: translateY(-2px);
    text-decoration: none;
    z-index: 3;
  }
  &:hover .bar__tip,
  &:focus-visible .bar__tip {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  &.bar--tip-left:hover .bar__tip,
  &.bar--tip-left:focus-visible .bar__tip {
    transform: none;
  }
  &--outline {
    color: var(--branch);
    border: 1px solid var(--branch);
    background: color-mix(in srgb, var(--branch) 10%, transparent);
  }
  &--fill {
    background: var(--branch);
    color: var(--primary);
    font-weight: 500;
  }
}

// Cut-off names get an ellipsis; the full name and dates pop up on hover.
.bar__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar__tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: var(--primary);
  border: 1px solid var(--card-border);
  color: var(--secondary);
  font-weight: 400;
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.6);
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 0.15s, transform 0.15s;
  pointer-events: none;
  z-index: 4;

  .bar--tip-left & {
    left: auto;
    right: 0;
    transform: translate(0, 4px);
  }
}

.overview__axis {
  position: relative;
  height: 12px;
  color: var(--muted);
}

.overview__year {
  position: absolute;
  transform: translateX(-50%);
  &--now {
    right: 0;
    transform: none;
    color: var(--secondary);
  }
}

// --- Graph ---
// Rows sit flush against each other: every lane is drawn per row and the
// pieces must meet, so spacing lives inside the rows (card margins).
.graph {
  position: relative;
  display: flex;
  flex-direction: column;
}

.graph__main-line,
.graph__progress {
  position: absolute;
  left: calc(var(--when-w) + var(--main-x) - 1px);
  top: 20px;
  bottom: 20px;
  width: 2px;
  background: var(--line);
}

.graph__progress {
  background: var(--secondary);
  box-shadow: 0 0 8px rgba(215, 219, 228, 0.6);
  transform-origin: top;
  transform: scaleY(0);
}

// One entry: date | rail | card. (Not .row/.card: Bootstrap owns those.)
.entry {
  position: relative;
  display: grid;
  grid-template-columns: var(--when-w) var(--rail-w) minmax(0, 1fr);
  align-items: start;
  // Hidden until scrolled into view; nothing is set once visible. The lane
  // lines are left out so the graph itself is always there.
  &.reveal:not(.is-visible) {
    .commit,
    .entry__when,
    .node,
    .entry__connector {
      opacity: 0;
      transform: translateY(28px);
    }
  }
  .commit,
  .entry__when,
  .node,
  .entry__connector {
    transition: opacity 0.6s ease, transform 0.6s ease, filter 0.35s;
  }

  // Explicit placement, so hiding the date column on phones can't shift
  // the commit into the rail column.
  > .entry__when {
    grid-column: 1;
  }
  > .entry__rail {
    grid-column: 2;
  }
  > :last-child {
    grid-column: 3;
  }
}

.entry__when {
  padding-right: 2rem;
  padding-top: 10px;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.log__big {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  color: var(--ink);
  &--small {
    font-size: 1.4rem;
    color: var(--secondary);
  }
}

.entry__duration {
  display: block;
  opacity: 0.75;
}

.entry__dates {
  color: var(--muted);
  &--tinted {
    color: var(--branch);
  }
  &--inline {
    display: none;
  }
}

.entry__rail {
  position: relative;
  align-self: stretch;
  min-height: 60px;
}

.entry__connector {
  position: absolute;
  top: var(--node-y);
  left: var(--main-x);
  right: 0;
  height: 1px;
  background: var(--line);
  z-index: 0;

  // Engagements sit on their employer's lane; their cards are indented, so
  // the connector reaches across the indent to meet them.
  .entry--engagement & {
    left: calc(var(--main-x) + var(--lane, 1) * var(--lane-step));
    right: calc(-1 * var(--card-indent));
    background: color-mix(in srgb, var(--branch) 45%, transparent);
  }
}

.node {
  position: absolute;
  top: var(--node-y);
  left: var(--main-x);
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--secondary);
  box-shadow: 0 0 0 6px var(--primary);
  z-index: 1;
  transition: opacity 0.35s, filter 0.35s;

  &--job {
    background: var(--branch, var(--secondary));
    box-shadow: 0 0 0 6px var(--primary),
      0 0 0 7px
        color-mix(in srgb, var(--branch, var(--secondary)) 40%, transparent),
      0 0 26px 6px
        color-mix(in srgb, var(--branch, var(--secondary)) 45%, transparent);
  }
  &--client {
    left: calc(var(--main-x) + var(--lane, 1) * var(--lane-step));
    width: 12px;
    height: 12px;
    background: var(--branch);
    box-shadow: 0 0 0 4px var(--primary),
      0 0 16px 4px color-mix(in srgb, var(--branch) 55%, transparent);
  }
  &--tag {
    width: 14px;
    height: 14px;
    background: var(--primary);
    border: 2px solid var(--secondary);
    box-sizing: border-box;
  }
  &--head {
    background: var(--ink);
    animation: pulse 2.4s ease-out infinite;
  }
  &--root {
    width: 12px;
    height: 12px;
    background: var(--primary);
    border: 2px solid var(--secondary);
    box-sizing: border-box;
  }
  &.is-current::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid var(--branch, var(--secondary));
    animation: ring 2.2s ease-out infinite;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 6px var(--primary), 0 0 0 8px rgba(215, 219, 228, 0.5),
      0 0 30px 6px rgba(215, 219, 228, 0.45);
  }
  70%,
  100% {
    box-shadow: 0 0 0 6px var(--primary), 0 0 0 26px rgba(215, 219, 228, 0),
      0 0 30px 6px rgba(215, 219, 228, 0.45);
  }
}
@keyframes ring {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(2.1);
    opacity: 0;
  }
}

.entry--head,
.entry--root {
  --node-y: 20px;
  align-items: start;
  .entry__when {
    padding-top: 0;
    line-height: 40px;
  }
}
.entry--head .entry__rail {
  min-height: 72px; // room for open branches to curve into HEAD
}
.entry--root .entry__rail {
  min-height: 40px;
}

.entry__open {
  color: var(--muted);
}

// A finished branch rejoining the main line.
.entry--merge {
  transition: opacity 0.35s, filter 0.35s;
  .entry__rail {
    min-height: 64px;
  }
  .entry__when {
    padding-top: 0;
    line-height: 64px;
  }
}
.entry__merge-text {
  line-height: 64px;
  color: var(--branch);
  opacity: 0.8;
}

.entry__cap-text {
  color: var(--muted);
  line-height: 40px;
  a {
    color: var(--muted);
    &:hover {
      color: var(--accent);
    }
  }
}

// --- Lanes ---
// One piece per row per branch. Straight pieces are divs; curves are SVGs
// stretched to the lane's offset, with strokes that don't scale.
.lane {
  --lane-x: calc(var(--main-x) + var(--lane, 1) * var(--lane-step));
  position: absolute;
  pointer-events: none;
  transition: opacity 0.35s, filter 0.35s;

  &--through {
    top: 0;
    bottom: 0;
    left: calc(var(--lane-x) - 1.25px);
    width: 2.5px;
    background: var(--branch);
    box-shadow: 0 0 8px color-mix(in srgb, var(--branch) 60%, transparent);
  }
  // The row above a fork: straight down to where the curve takes over.
  &--to-fork {
    bottom: 60px;
  }

  &--curve {
    left: var(--main-x);
    width: calc(var(--lane-x) - var(--main-x));
    overflow: visible;
    filter: drop-shadow(
      0 0 6px color-mix(in srgb, var(--branch) 60%, transparent)
    );
    path {
      fill: none;
      stroke: var(--branch);
      stroke-width: 2.5px;
      stroke-linecap: round;
    }
  }
  // Leaves the main line and reaches the lane at the bottom of the row.
  &--fork {
    bottom: 0;
    height: 60px;
  }
  // Comes up the lane and lands on the HEAD node. Explicit heights: an
  // absolutely positioned SVG ignores `bottom` and uses its intrinsic
  // height otherwise, which overshoots into the next row.
  &--head {
    top: var(--node-y);
    height: calc(100% - var(--node-y));
  }
  // Comes up the lane and rejoins the main line at the top of the row.
  &--merge {
    top: 0;
    height: 100%;
  }
}

.entry--engagement .commit {
  margin-left: var(--card-indent);
}

// --- Cards ---
.commit {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: var(--row-gap);
  padding: 1.3rem 1.5rem;
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  backdrop-filter: blur(6px);
  transition: border-color 0.3s, box-shadow 0.3s, opacity 0.35s, filter 0.35s;

  &:hover {
    border-color: color-mix(
      in srgb,
      var(--branch, var(--secondary)) 60%,
      transparent
    );
  }

  &--client {
    padding: 1.1rem 1.3rem;
    gap: 0.5rem;
    // A faint wash of the employer's colour ties the card to its lane.
    background: color-mix(in srgb, var(--branch) 6%, var(--card));
    border-color: color-mix(in srgb, var(--branch) 22%, var(--card-border));
  }
  &--tag {
    gap: 0.4rem;
  }
}

.commit__eyebrow {
  color: var(--branch, var(--muted));
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.commit__title {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 800;
  line-height: 1.05;
  color: var(--ink);
  &--client {
    font-size: 1.15rem;
    font-weight: 700;
  }
}

.commit__role {
  margin: 0;
  color: var(--secondary);
}

.commit__alongside {
  margin: 0;
  color: var(--muted);
}

.commit__text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
}

.commit__bullets {
  margin: 0.2rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.92rem;
  line-height: 1.55;
  li {
    margin-bottom: 0.3rem;
    &::marker {
      color: var(--branch, var(--accent));
    }
  }
}

.commit__more {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  color: var(--branch, var(--accent));
  &:hover {
    text-decoration: underline;
  }
}

.commit__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.25rem;
}

.commit__count {
  color: var(--muted);
}

.commit__tech {
  margin: 0;
  color: var(--muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.commit__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  color: var(--muted);
  font-size: 0.72rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 36px;
  padding: 0 0.85rem;
  border-radius: 999px;
  background: transparent;
  color: var(--branch, var(--accent));
  border: 1px solid
    color-mix(in srgb, var(--branch, var(--accent)) 45%, transparent);
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.2s;
  &:hover {
    background: color-mix(
      in srgb,
      var(--branch, var(--accent)) 12%,
      transparent
    );
  }
}

// --- Tracing a branch ---
// Dimmed, not gone: the rest of the log stays readable behind the trace.
// Rows dim their own parts rather than themselves, so a lane passing through
// a dimmed row keeps its own branch's state.
.entry.is-dim {
  .commit,
  .entry__when,
  .node,
  .entry__connector,
  .entry__merge-text {
    opacity: 0.42;
    filter: saturate(0.25);
  }
}
.lane.is-dim {
  opacity: 0.42;
  filter: saturate(0.25);
}

// The traced branch's whole line lights up: every straight piece, the fork,
// and the curve into HEAD or the merge, plus the nodes sitting on it.
.lane.is-lit {
  &.lane--through {
    width: 3.5px;
    left: calc(var(--lane-x) - 1.75px);
    box-shadow: 0 0 2px var(--branch), 0 0 16px var(--branch),
      0 0 32px color-mix(in srgb, var(--branch) 45%, transparent);
  }
  &.lane--curve {
    filter: drop-shadow(0 0 2px var(--branch))
      drop-shadow(0 0 10px var(--branch));
    path {
      stroke-width: 3.5px;
    }
  }
}
.entry.is-lit .node--client {
  box-shadow: 0 0 0 4px var(--primary), 0 0 6px 2px var(--branch),
    0 0 22px 6px color-mix(in srgb, var(--branch) 70%, transparent);
}
.entry.is-lit .node--job {
  box-shadow: 0 0 0 6px var(--primary), 0 0 0 7px var(--branch),
    0 0 36px 10px color-mix(in srgb, var(--branch) 60%, transparent);
}
.is-lit .commit,
.commit.is-lit {
  border-color: var(--branch, var(--secondary));
  box-shadow: 0 0 0 1px var(--branch, var(--secondary)),
    0 0 48px -10px color-mix(in srgb, var(--branch, var(--secondary)) 50%, transparent);
}

// --- CV, offered after the log ---
.log__cv {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: solid thin var(--line);
}

.log__cv-text {
  color: var(--muted);
}

// --- Motion: a progress line along main, where the browser supports it ---
@supports (animation-timeline: scroll()) {
  .graph__progress {
    animation: grow linear both;
    animation-timeline: scroll(root);
  }
}
@keyframes grow {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

// --- Phones: no date column, tighter rail, dates inside the commit ---
@media (max-width: 767.98px) {
  .log {
    --when-w: 0px;
    --main-x: 14px;
    --lane-step: 22px;
    --rail-tail: 24px;
    --card-indent: 0px;
  }
  .entry {
    grid-template-columns: var(--rail-w) minmax(0, 1fr);
    > .entry__when {
      display: none;
    }
    > .entry__rail {
      grid-column: 1;
    }
    > :last-child {
      grid-column: 2;
    }
  }
  .entry__dates--inline {
    display: inline;
    color: var(--muted);
  }
  .commit--client .entry__dates--inline {
    display: block;
    margin: 0;
  }
  .commit__title {
    font-size: 1.35rem;
  }
  .log__big {
    font-size: 1.5rem;
  }
  .overview__labels {
    width: 64px;
  }
  .overview__hint {
    display: none;
  }
  .chip {
    white-space: normal;
    text-align: left;
    line-height: 1.3;
    padding-top: 0.35rem;
    padding-bottom: 0.35rem;
  }
  .overview__year:nth-child(even) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .graph__progress,
  .node--head,
  .node.is-current::after {
    animation: none;
  }
  .graph__progress {
    transform: none;
  }
  .entry.reveal:not(.is-visible) {
    .commit,
    .entry__when,
    .node,
    .entry__connector {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
}

@media print {
  .entry.reveal:not(.is-visible) {
    .commit,
    .entry__when,
    .node,
    .entry__connector {
      opacity: 1;
      transform: none;
    }
  }
}
</style>
