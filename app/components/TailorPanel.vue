<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { api, ApiError } from "@/cv/api";
import {
  completeLocally,
  loadSettings,
  promptText,
  saveSettings,
  type CondenseMode,
} from "@/cv/condense";
import {
  describeFit,
  isOver,
  MAX_FIT_PASSES,
  type TailorPrompt,
  type TailorRequest,
  type TailorResponse,
  type TailorResult,
} from "@/cv/tailor";
import type { CvLayout, SheetFit, Variant } from "@/cv/types";

// The Tailor workspace: paste a job description, and a model picks what a
// CV prints for it from the Library (never writing bullets of its own),
// or points at a CV already on file that fits. The reply is opened as an
// unsaved CV under CVs and its sheets are measured there; when something
// would be cut off, the measurements go back to the model for another
// pass. Where the model runs is the user's choice, as for Condense: the
// server's provider, a local model, or a chat tool by hand.
const props = defineProps<{
  variants: { id: string; name: string; layout: CvLayout; matcher: string }[];
  busy: boolean;
  // Opens a CV in the preview (unsaved) and measures its sheets. Returns
  // nothing to measure for the ATS layout.
  tryOut: (variant: Variant) => Promise<SheetFit[]>;
  // Whether the CV open under CVs may be replaced (it may have unsaved work).
  confirmReplace: () => boolean;
}>();

const emit = defineEmits<{
  (e: "open", id: string): void; // show a CV under CVs
}>();

const MODES: { value: CondenseMode; label: string; hint: string }[] = [
  {
    value: "server",
    label: "Server",
    hint: "The provider configured on the server (AI_PROVIDER). Up to three passes: a draft, then corrections for anything that would be cut off.",
  },
  {
    value: "local",
    label: "Local model",
    hint: "An OpenAI-compatible server on this machine (Ollama, LM Studio). The reply is still read and checked by the server.",
  },
  {
    value: "paste",
    label: "Copy prompt",
    hint: "Copy the prompt into any chat tool, then paste its reply here. A fix-up prompt is offered if the sheets don't fit.",
  },
];

const JOB_KEY = "cv-tailor-job";
const settings = reactive(loadSettings());
watch(settings, (s) => saveSettings({ ...s }));

const job = ref("");
const notes = ref("");
const base = ref("");
// The job text is remembered per browser so a reload doesn't lose it.
try {
  job.value = localStorage.getItem(JOB_KEY) ?? "";
} catch {
  // storage blocked
}
watch(job, (text) => {
  try {
    localStorage.setItem(JOB_KEY, text);
  } catch {
    // storage blocked
  }
});

const loading = ref(false);
const error = ref("");
const steps = ref<string[]>([]); // what happened, line by line
const result = ref<TailorResult | null>(null);
const fit = ref<SheetFit[]>([]);
const passes = ref(0);
const ran = ref<{ name: string; model: string } | null>(null);
const prompt = ref<TailorPrompt | null>(null); // for local and paste modes
const reply = ref("");
const copied = ref(false);
const showPrompt = ref(false);

const modeHint = computed(
  () => MODES.find((m) => m.value === settings.mode)?.hint ?? ""
);
const suggested = computed(() =>
  result.value?.suggest
    ? props.variants.find((v) => v.id === result.value?.suggest?.id)
    : undefined
);
const over = computed(() => isOver(fit.value));
const fitLines = computed(() => describeFit(fit.value));
const canRun = computed(() => !!job.value.trim() && !loading.value);

const log = (line: string) => steps.value.push(line);

const body = (extra: Partial<TailorRequest> = {}): TailorRequest => ({
  job: job.value,
  notes: notes.value || undefined,
  base: base.value || undefined,
  ...extra,
});

// Asks the server for the prompt alone (the local and paste modes, and the
// fallback when a server run fails).
async function fetchPrompt(extra: Partial<TailorRequest> = {}) {
  const res = await api<TailorResponse>("tailor", "POST", body(extra));
  prompt.value = res.prompt ?? null;
  return prompt.value;
}

// Hands a reply from elsewhere to the server to be read and repaired.
async function settleReply(text: string, previous?: Variant) {
  const res = await api<TailorResponse>("tailor", "POST", {
    reply: text,
    previous,
  });
  if (!res.result) throw new Error("The server returned no CV");
  return res.result;
}

// One request to the model, whichever way it runs. `previous` and `fit`
// make it a correction pass. Returns null in paste mode, where the user
// carries the reply back by hand.
async function ask(previous?: Variant): Promise<TailorResult | null> {
  const extra: Partial<TailorRequest> = previous
    ? { previous, fit: fit.value }
    : {};
  if (settings.mode === "server") {
    try {
      const res = await api<TailorResponse>(
        "tailor",
        "POST",
        body({ ...extra, run: true })
      );
      ran.value = res.provider ?? null;
      if (!res.result) throw new Error("The server returned no CV");
      return res.result;
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 501 || err.status === 502)
      ) {
        // The prompt is still available; offer to run it elsewhere.
        if (err.status === 501) settings.mode = "paste";
        await fetchPrompt(extra);
        throw err;
      }
      throw err;
    }
  }
  const p = await fetchPrompt(extra);
  if (!p) throw new Error("The server returned no prompt");
  if (settings.mode === "local") {
    const text = await completeLocally(
      p,
      settings.localUrl,
      settings.localModel
    );
    ran.value = { name: "local", model: settings.localModel };
    return settleReply(text, previous);
  }
  return null; // paste: wait for the reply
}

// Opens the CV in the preview, measures it, and (server and local modes)
// asks for corrections while something would be cut off.
async function settle(first: TailorResult) {
  let current = first;
  for (let pass = 0; ; pass++) {
    result.value = current;
    passes.value = pass + 1;
    if (current.dropped.length)
      log(
        `Dropped ${current.dropped.length} unknown id${current.dropped.length === 1 ? "" : "s"} from the reply`
      );
    log(
      `Pass ${pass + 1}: opened "${current.variant.name}" under CVs, measuring…`
    );
    fit.value = await props.tryOut(current.variant);
    if (!fit.value.length) {
      log("ATS layout: one column that flows across pages, nothing to cut off");
      return;
    }
    for (const line of describeFit(fit.value)) log(line);
    if (!isOver(fit.value)) {
      log("Everything fits");
      return;
    }
    if (pass >= MAX_FIT_PASSES || settings.mode === "paste") {
      log(
        settings.mode === "paste"
          ? "Something would be cut off: copy the fix-up prompt, or adjust the CV by hand under CVs"
          : "Still over after the correction passes: adjust the CV by hand under CVs, or run another pass"
      );
      return;
    }
    log("Something would be cut off: asking for a correction…");
    const next = await ask(current.variant);
    if (!next) return;
    current = next;
  }
}

async function run(task: () => Promise<void>) {
  loading.value = true;
  error.value = "";
  try {
    await task();
  } catch (err) {
    error.value = (err as Error).message;
    log(`Stopped: ${(err as Error).message}`);
  } finally {
    loading.value = false;
  }
}

const generate = () =>
  run(async () => {
    if (!props.confirmReplace()) return;
    steps.value = [];
    result.value = null;
    fit.value = [];
    passes.value = 0;
    ran.value = null;
    reply.value = "";
    prompt.value = null;
    log("Building the prompt from the Library…");
    const first = await ask();
    if (!first) {
      log("Prompt ready: copy it into a chat tool and paste the reply below");
      return;
    }
    await settle(first);
  });

// Another correction pass, by hand (server and local modes).
const fixAgain = () =>
  run(async () => {
    const current = result.value;
    if (!current) return;
    log("Asking for another correction…");
    const next = await ask(current.variant);
    if (next) await settle(next);
    else log("Fix-up prompt ready: copy it and paste the reply below");
  });

// Paste mode: read the pasted reply (a first draft, or a correction).
const readReply = () =>
  run(async () => {
    if (!reply.value.trim()) return;
    const previous = result.value?.variant;
    if (!previous && !props.confirmReplace()) return;
    log(previous ? "Reading the corrected reply…" : "Reading the reply…");
    const next = await settleReply(reply.value, previous);
    reply.value = "";
    await settle(next);
  });

async function copyPrompt() {
  if (!prompt.value) return;
  try {
    await navigator.clipboard.writeText(promptText(prompt.value));
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    showPrompt.value = true; // select and copy by hand
  }
}
</script>

<template>
  <div class="tailor">
    <div class="tailor__grid">
      <!-- The job -->
      <div class="tailor__form">
        <label class="d-block">
          <span class="tailor__label">Job description</span>
          <textarea
            v-model="job"
            rows="12"
            class="form-control form-control-sm"
            placeholder="Paste the whole advert or job spec here"
            title="The job advert or spec. The model reads it to pick the most relevant entries and bullets from the Library."
          ></textarea>
        </label>
        <label class="d-block mt-2">
          <span class="tailor__label">Notes (optional)</span>
          <textarea
            v-model="notes"
            rows="2"
            class="form-control form-control-sm"
            placeholder="Anything to stress or play down, e.g. “lead with the OVO work”"
            title="A word to the model about this application: what to stress, what to leave out."
          ></textarea>
        </label>
        <div class="row g-2 mt-1 align-items-end">
          <label class="col-6">
            <span class="tailor__label">Start from</span>
            <select
              v-model="base"
              class="form-select form-select-sm"
              title="A CV whose structure and page breaks the model keeps where they still fit. Blank starts from scratch."
            >
              <option value="">Scratch</option>
              <option v-for="v in variants" :key="v.id" :value="v.id">
                {{ v.name }}
              </option>
            </select>
          </label>
          <label class="col-6">
            <span class="tailor__label">Run it with</span>
            <select
              v-model="settings.mode"
              class="form-select form-select-sm"
              title="Where the model runs: the server's provider, a model on this machine, or a chat tool by hand"
            >
              <option v-for="m in MODES" :key="m.value" :value="m.value">
                {{ m.label }}
              </option>
            </select>
          </label>
          <p class="col-12 small text-muted mb-0">{{ modeHint }}</p>
          <template v-if="settings.mode === 'local'">
            <label class="col-7">
              <span class="tailor__label">Model server URL</span>
              <input
                v-model="settings.localUrl"
                class="form-control form-control-sm font-monospace"
                placeholder="http://localhost:11434/v1"
                title="The OpenAI-compatible endpoint on this machine. It must allow requests from this page's origin."
              />
            </label>
            <label class="col-5">
              <span class="tailor__label">Model</span>
              <input
                v-model="settings.localModel"
                class="form-control form-control-sm font-monospace"
                placeholder="llama3.1"
                title="The model name the local server knows"
              />
            </label>
          </template>
        </div>
        <div class="d-flex gap-2 mt-3 align-items-center">
          <button
            type="button"
            class="a-btn a-btn--primary"
            :disabled="!canRun || busy"
            title="Build the prompt from the Library and the job, run it, and open the result under CVs (unsaved)"
            @click="generate"
          >
            {{ result ? "Generate again" : "✦ Generate a CV" }}
          </button>
          <button
            v-if="result && settings.mode !== 'paste'"
            type="button"
            class="a-btn"
            :disabled="loading || busy"
            title="Send the measured sheets back to the model for one more correction pass"
            @click="fixAgain"
          >
            Fix the fit again
          </button>
          <span v-if="loading" class="small text-muted">Thinking…</span>
        </div>

        <!-- Paste mode: the prompt out, the reply back -->
        <div v-if="settings.mode === 'paste' && prompt" class="tailor__paste">
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <button
              type="button"
              class="a-btn"
              title="Copy the whole prompt (system and user parts) to the clipboard"
              @click="copyPrompt"
            >
              {{
                copied
                  ? "Copied"
                  : result
                    ? "Copy fix-up prompt"
                    : "Copy prompt"
              }}
            </button>
            <button
              type="button"
              class="a-btn a-btn--icon"
              title="Show the prompt here instead, to select and copy by hand"
              @click="showPrompt = !showPrompt"
            >
              {{ showPrompt ? "Hide prompt" : "Show prompt" }}
            </button>
            <span class="small text-muted">
              {{ result ? "Includes the measured fit of the last reply." : "" }}
            </span>
          </div>
          <textarea
            v-if="showPrompt"
            class="form-control form-control-sm font-monospace tailor__prompt mt-2"
            readonly
            rows="10"
            :value="promptText(prompt)"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
          <label class="d-block mt-2">
            <span class="tailor__label">Paste the reply</span>
            <textarea
              v-model="reply"
              rows="5"
              class="form-control form-control-sm font-monospace"
              placeholder='{"suggest": …, "why": "…", "cv": {…}}'
              title="The model's whole answer. The server reads the JSON object out of it and checks every id against the Library."
            ></textarea>
          </label>
          <button
            type="button"
            class="a-btn mt-2"
            :disabled="!reply.trim() || loading || busy"
            title="Read the pasted reply, open the CV under CVs and measure it"
            @click="readReply"
          >
            Read reply
          </button>
        </div>
      </div>

      <!-- What happened, and the result -->
      <div class="tailor__side">
        <div v-if="error" class="alert alert-danger py-1 px-2 small">
          {{ error }}
        </div>

        <div v-if="suggested" class="tailor__card is-suggest">
          <div class="tailor__label mb-1">A CV on file already fits</div>
          <strong>{{ suggested.name }}</strong>
          <span v-if="suggested.matcher" class="text-muted">
            · {{ suggested.matcher }}</span
          >
          <p class="small mb-2">{{ result?.suggest?.why }}</p>
          <button
            type="button"
            class="a-btn"
            title="Open this CV under CVs (the generated one is set aside)"
            @click="emit('open', suggested.id)"
          >
            Open {{ suggested.name }}
          </button>
        </div>

        <div v-if="result" class="tailor__card">
          <div class="tailor__label mb-1">
            Generated CV
            <span v-if="ran" class="text-muted fw-normal text-lowercase">
              · {{ ran.name }}{{ ran.model ? ` ${ran.model}` : "" }}
            </span>
            <span v-if="passes > 1" class="text-muted fw-normal">
              · {{ passes }} passes
            </span>
          </div>
          <strong>{{ result.variant.name }}</strong>
          <span class="text-muted"> · {{ result.variant.title }}</span>
          <p v-if="result.variant.matcher" class="small mb-1">
            <span
              class="tailor__chip"
              title="The matcher: what this CV is for, so a similar job can reuse it. Editable under CVs."
            >
              fits: {{ result.variant.matcher }}
            </span>
          </p>
          <p v-if="result.why" class="small text-muted mb-2">
            {{ result.why }}
          </p>
          <div
            v-if="fit.length"
            class="tailor__fit"
            :class="over ? 'is-over' : 'is-ok'"
          >
            <div v-for="line in fitLines" :key="line">{{ line }}</div>
          </div>
          <details v-if="result.dropped.length" class="small mt-2">
            <summary class="text-muted">
              {{ result.dropped.length }} thing{{
                result.dropped.length === 1 ? "" : "s"
              }}
              in the reply didn't match the Library and were dropped
            </summary>
            <ul class="mb-0 ps-3">
              <li v-for="d in result.dropped" :key="d">{{ d }}</li>
            </ul>
          </details>
          <p class="small mb-2 mt-2">
            It is open under <strong>CVs</strong>, unsaved: check the preview,
            tweak it, then Save there.
          </p>
          <button
            type="button"
            class="a-btn a-btn--primary"
            title="Switch to the CVs workspace, where this CV is open"
            @click="emit('open', result.variant.id)"
          >
            Open under CVs
          </button>
        </div>

        <div v-if="steps.length" class="tailor__log">
          <div v-for="(s, i) in steps" :key="i">{{ s }}</div>
        </div>
        <p v-else class="small text-muted">
          Paste a job description and press Generate. The model only ever picks
          entries and bullets that are in the Library; it writes the headline,
          the summary and a one-line matcher. The result opens under CVs for you
          to check and save.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tailor {
  font-size: 0.9rem;
}

.tailor__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 992px) {
  .tailor__grid {
    grid-template-columns: 1fr;
  }
}

.tailor__label {
  display: block;
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ad-muted);
}

.tailor__paste {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ad-line-strong);
}

.tailor__prompt {
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.tailor__card {
  border: 1px solid var(--ad-line);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: var(--ad-bg-2);

  &.is-suggest {
    border-color: var(--ad-on-line);
    background: var(--ad-on-bg);
  }
}

.tailor__chip {
  display: inline-block;
  border: 1px solid var(--ad-line-strong);
  background: var(--ad-bg);
  color: var(--ad-muted-2);
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.tailor__fit {
  font-family: var(--ad-label-font);
  font-size: 0.75rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.375rem;
  background: var(--ad-bg);
  border: 1px solid var(--ad-line);

  &.is-ok {
    color: var(--ad-success);
  }
  &.is-over {
    color: var(--ad-danger-text);
    border-color: var(--ad-danger);
  }
}

.tailor__log {
  font-family: var(--ad-label-font);
  font-size: 0.72rem;
  color: var(--ad-muted);
  padding: 0.5rem 0.6rem;
  border-radius: 0.375rem;
  background: var(--ad-bg-3);
  max-height: 16rem;
  overflow: auto;

  > div {
    padding: 0.1rem 0;
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
