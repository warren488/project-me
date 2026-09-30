<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api, ApiError } from "@/cv/api";
import type { Highlight, LibraryEntry } from "@/cv/types";
import { plain } from "@/cv/refs";
import {
  completeLocally,
  loadSettings,
  parseProposals,
  promptText,
  saveSettings,
  toHighlights,
  type CondenseMode,
  type CondenseResponse,
  type Proposal,
} from "@/cv/condense";

// Turns an entry's bullets into a few highlights for one CV with a model's
// help, then lets the user edit and accept them. The prompt always comes
// from the server (which reads the CV for the audience); where it runs is
// the user's choice: the server's provider, a local model called from here,
// or a chat tool by hand (copy, paste the reply). Accepting hands the
// highlights back to the entry editor; nothing is saved here.
const props = defineProps<{
  entry: LibraryEntry; // a saved job or engagement with bullets
  variants: { id: string; name: string }[]; // the CVs to write for
  initialFor: string; // variant id, or "" for general
  existing: Highlight[]; // the entry's current highlights (unsaved form)
  takenIds: string[]; // every id in use on the entry, for new ids
}>();

const emit = defineEmits<{
  (e: "accept", highlights: Highlight[], forId: string, replace: boolean): void;
  (e: "cancel"): void;
}>();

const MODES: { value: CondenseMode; label: string; hint: string }[] = [
  {
    value: "server",
    label: "Server",
    hint: "The provider configured on the server (AI_PROVIDER).",
  },
  {
    value: "local",
    label: "Local model",
    hint: "An OpenAI-compatible server on this machine (Ollama, LM Studio).",
  },
  {
    value: "paste",
    label: "Copy prompt",
    hint: "Paste the prompt into any chat tool, then paste its reply here.",
  },
];

const settings = reactive(loadSettings());
watch(settings, (s) => saveSettings({ ...s }));
const forId = ref(props.initialFor);

const loading = ref(false);
const error = ref("");
const response = ref<CondenseResponse | null>(null);
const ran = ref<{ name: string; model: string } | null>(null);
const reply = ref(""); // pasted reply (paste mode)
const copied = ref(false);
const showPrompt = ref(false);
const replace = ref(true);

interface Draft extends Proposal {
  on: boolean;
}
const drafts = ref<Draft[]>([]);

const title = computed(() =>
  props.entry.org
    ? `${props.entry.title} · ${props.entry.org}`
    : props.entry.title
);
const forName = computed(
  () => props.variants.find((v) => v.id === forId.value)?.name ?? "General"
);
const existingFor = computed(() =>
  props.existing.filter((h) => (h.for ?? "") === forId.value)
);
const sourceText = (from: string[]) =>
  from
    .map((id) => props.entry.bullets?.find((b) => b.id === id))
    .filter((b) => !!b)
    .map((b) => plain(b.text))
    .join("\n");
const accepted = computed(() =>
  drafts.value.filter((d) => d.on && d.text.trim())
);

function setProposals(list: Proposal[]) {
  drafts.value = list.map((p) => ({ ...p, on: true }));
}

const body = (run: boolean) => ({
  for: forId.value,
  count: settings.count,
  run,
});

// Fetches the prompt and, unless the user copies it by hand, runs it.
async function load() {
  loading.value = true;
  error.value = "";
  ran.value = null;
  try {
    const run = settings.mode === "server";
    response.value = await api<CondenseResponse>(
      `condense/${props.entry.id}`,
      "POST",
      body(run)
    );
    if (run) {
      setProposals(response.value.proposals ?? []);
      ran.value = response.value.provider ?? null;
    } else if (settings.mode === "local") {
      await runLocally();
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 501 || err.status === 502)) {
      // The prompt still came back; only the server run failed.
      error.value = err.message;
      if (err.status === 501) settings.mode = "paste";
      await fetchPromptOnly();
    } else {
      error.value = (err as Error).message;
    }
  } finally {
    loading.value = false;
  }
}

// The prompt alone, without a model run. Cheap, so it tracks the count and
// the CV as they change: what is shown or copied is always current.
let promptTimer: number | undefined;
let promptSeq = 0;
async function fetchPromptOnly() {
  const seq = ++promptSeq;
  try {
    const next = await api<CondenseResponse>(
      `condense/${props.entry.id}`,
      "POST",
      body(false)
    );
    if (seq === promptSeq) response.value = next;
  } catch (err) {
    if (seq === promptSeq) error.value = (err as Error).message;
  }
}
watch([forId, () => settings.count], () => {
  window.clearTimeout(promptTimer);
  promptTimer = window.setTimeout(fetchPromptOnly, 300);
});

async function runLocally() {
  if (!response.value) return;
  loading.value = true;
  error.value = "";
  try {
    const text = await completeLocally(
      response.value.prompt,
      settings.localUrl,
      settings.localModel
    );
    const list = parseProposals(text, response.value.ids);
    if (!list.length)
      throw new Error(
        `The model's reply had no bullets in it: ${text.slice(0, 200)}`
      );
    setProposals(list);
    ran.value = { name: "local", model: settings.localModel };
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function copyPrompt() {
  if (!response.value) return;
  const text = promptText(response.value.prompt);
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    showPrompt.value = true; // select and copy by hand
  }
}

function parseReply() {
  if (!response.value) return;
  error.value = "";
  const list = parseProposals(reply.value, response.value.ids);
  if (!list.length) {
    error.value =
      "No bullets found in that reply. Paste the model's answer, ideally the JSON array.";
    return;
  }
  setProposals(list);
  ran.value = { name: "pasted", model: "" };
}

function accept() {
  const doReplace = replace.value && existingFor.value.length > 0;
  // Ids being replaced are free again.
  const dropping = new Set(doReplace ? existingFor.value.map((h) => h.id) : []);
  const highlights = toHighlights(
    props.entry,
    accepted.value.map((d) => ({ text: d.text.trim(), from: d.from })),
    forId.value,
    props.takenIds.filter((id) => !dropping.has(id))
  );
  emit("accept", highlights, forId.value, doReplace);
}

onMounted(load);
</script>

<template>
  <div class="condense">
    <h5 class="mb-1">Condense {{ title }}</h5>
    <p class="small text-muted mb-2">
      {{ entry.bullets?.length ?? 0 }} bullets in, a few highlights out, written
      for one CV. They go into the entry's Condensed section; save the entry to
      keep them.
    </p>

    <div class="row g-2 align-items-end">
      <label class="col-4">
        <span class="condense__label">For</span>
        <select v-model="forId" class="form-select form-select-sm">
          <option v-for="v in variants" :key="v.id" :value="v.id">
            {{ v.name }}
          </option>
          <option value="">General (any CV)</option>
        </select>
      </label>
      <label class="col-2">
        <span class="condense__label">Bullets</span>
        <input
          v-model.number="settings.count"
          type="number"
          min="2"
          max="6"
          class="form-control form-control-sm"
        />
      </label>
      <label class="col-3">
        <span class="condense__label">Run it with</span>
        <select v-model="settings.mode" class="form-select form-select-sm">
          <option v-for="m in MODES" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </select>
      </label>
      <div class="col-3">
        <button
          type="button"
          class="a-btn w-100"
          :disabled="loading"
          @click="load"
        >
          {{ drafts.length ? "Run again" : "Run" }}
        </button>
      </div>
      <p class="col-12 small text-muted mb-0 mt-1">
        {{ MODES.find((m) => m.value === settings.mode)?.hint }}
      </p>
      <template v-if="settings.mode === 'local'">
        <label class="col-7">
          <span class="condense__label">Model server URL</span>
          <input
            v-model="settings.localUrl"
            class="form-control form-control-sm font-monospace"
            placeholder="http://localhost:11434/v1"
          />
        </label>
        <label class="col-5">
          <span class="condense__label">Model</span>
          <input
            v-model="settings.localModel"
            class="form-control form-control-sm font-monospace"
            placeholder="llama3.1"
          />
        </label>
      </template>
      <template v-if="settings.mode === 'paste'">
        <div class="col-12 d-flex gap-2 align-items-center">
          <button
            type="button"
            class="a-btn"
            :disabled="!response"
            @click="copyPrompt"
          >
            {{ copied ? "Copied" : "Copy prompt" }}
          </button>
          <button
            type="button"
            class="a-btn a-btn--icon"
            :disabled="!response"
            @click="showPrompt = !showPrompt"
          >
            {{ showPrompt ? "Hide prompt" : "Show prompt" }}
          </button>
        </div>
        <textarea
          v-if="showPrompt && response"
          class="col-12 form-control form-control-sm font-monospace condense__prompt"
          readonly
          rows="8"
          :value="promptText(response.prompt)"
          @focus="($event.target as HTMLTextAreaElement).select()"
        ></textarea>
        <label class="col-12">
          <span class="condense__label">Paste the reply</span>
          <textarea
            v-model="reply"
            rows="4"
            class="form-control form-control-sm font-monospace"
            placeholder='[{"text": "…", "from": ["…"]}]'
          ></textarea>
        </label>
        <div class="col-12">
          <button
            type="button"
            class="a-btn"
            :disabled="!reply.trim() || !response"
            @click="parseReply"
          >
            Read reply
          </button>
        </div>
      </template>
    </div>

    <div v-if="loading" class="small text-muted mt-3">Thinking…</div>
    <div v-if="error" class="alert alert-danger py-1 px-2 small mt-3 mb-0">
      {{ error }}
    </div>

    <div v-if="drafts.length" class="mt-3">
      <div class="d-flex align-items-center mb-1">
        <span class="condense__label mb-0 flex-grow-1">
          Proposals for {{ forName }}
          <span v-if="ran" class="text-muted fw-normal text-lowercase">
            · {{ ran.name }}{{ ran.model ? ` ${ran.model}` : "" }}
          </span>
        </span>
      </div>
      <div v-for="(d, i) in drafts" :key="i" class="condense__row">
        <input
          v-model="d.on"
          type="checkbox"
          class="form-check-input condense__check"
        />
        <div class="flex-grow-1">
          <textarea
            v-model="d.text"
            rows="2"
            class="form-control form-control-sm"
          ></textarea>
          <span
            v-if="d.from.length"
            class="chip chip--sm mt-1"
            :title="sourceText(d.from)"
          >
            from {{ d.from.length }} bullet{{ d.from.length === 1 ? "" : "s" }}
          </span>
        </div>
      </div>
      <label
        v-if="existingFor.length"
        class="form-check d-flex align-items-center gap-2 mt-2"
      >
        <input v-model="replace" type="checkbox" class="form-check-input m-0" />
        <span class="small">
          Replace the {{ existingFor.length }} existing for {{ forName }}
        </span>
      </label>
    </div>

    <div class="d-flex gap-2 mt-3">
      <button
        type="button"
        class="a-btn a-btn--primary"
        :disabled="!accepted.length || loading"
        @click="accept"
      >
        Add {{ accepted.length || "" }} for {{ forName }}
      </button>
      <button type="button" class="a-btn" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.condense {
  font-size: 0.9rem;
}

.condense__label {
  display: block;
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
}

.condense__prompt {
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.condense__row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--ad-line);
  border-radius: 0.375rem;
  margin-bottom: 0.35rem;
}

.condense__check {
  flex-shrink: 0;
  margin-top: 0.5rem;
}

.chip {
  display: inline-block;
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-muted-2);
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  line-height: 1.4;
  white-space: nowrap;

  &--sm {
    font-size: 0.7rem;
    padding: 0 0.45rem;
  }
}

.a-btn {
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-text);
  padding: 0.2rem 0.65rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
  }

  &--primary {
    background: var(--ad-accent);
    border-color: var(--ad-accent);
    color: var(--ad-bg);
  }

  &--icon {
    padding: 0.1rem 0.45rem;
  }
}
</style>
