<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import CvDocument from "@/components/CvDocument.vue";
import CvAtsDocument from "@/components/CvAtsDocument.vue";
import { CvLayout, PublishedSite } from "@/cv/types";
import published from "../../cv/published.json";

// The site shows the rich CV. Printing offers a choice: the rich layout, or
// the plain ATS one that applicant tracking systems parse cleanly.
const site = published as PublishedSite;
const rich = site.styled;
const ats = site.ats;

const chooser = ref<HTMLDialogElement | null>(null);
// Which layout is being printed. The ATS document only mounts for its print.
const printing = ref<CvLayout | null>(null);

const openChooser = () => chooser.value?.showModal();
const closeChooser = () => chooser.value?.close();

async function printAs(layout: CvLayout) {
  closeChooser();
  printing.value = layout;
  await nextTick();
  // Give the ATS document a frame to mount and its fonts a chance to settle.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await document.fonts?.ready;
  window.print();
}

const afterPrint = () => (printing.value = null);
onMounted(() => window.addEventListener("afterprint", afterPrint));
onBeforeUnmount(() => window.removeEventListener("afterprint", afterPrint));
</script>

<template>
  <div class="cv-view">
    <div class="cv-toolbar container no-print">
      <span class="cv-toolbar__hint">Two layouts, same content.</span>
      <button type="button" class="btn btn--solid" @click="openChooser">
        Print or save as PDF
      </button>
    </div>

    <dialog
      ref="chooser"
      class="chooser"
      aria-labelledby="chooser-title"
      @click.self="closeChooser"
    >
      <div class="chooser__body">
        <h2 id="chooser-title" class="chooser__title">Which layout?</h2>
        <p class="chooser__lede">
          Both print to A4. Pick the one that suits where it's going.
        </p>
        <div class="chooser__options">
          <button
            v-if="rich"
            type="button"
            class="chooser__option"
            autofocus
            @click="printAs('styled')"
          >
            <span class="chooser__name">Rich CV</span>
            <span class="chooser__desc">
              The two-column design you see here. For people.
            </span>
          </button>
          <button
            v-if="ats"
            type="button"
            class="chooser__option"
            @click="printAs('ats')"
          >
            <span class="chooser__name">ATS CV</span>
            <span class="chooser__desc">
              Plain single column, no styling tricks. For applicant tracking
              systems and job boards.
            </span>
          </button>
        </div>
        <button type="button" class="chooser__cancel" @click="closeChooser">
          Cancel
        </button>
      </div>
    </dialog>

    <!-- The rich CV is always on screen; hidden only while the ATS one prints. -->
    <div
      v-if="rich"
      class="cv-rich"
      :class="{ 'is-print-hidden': printing === 'ats' }"
    >
      <CvDocument :pages="rich.pages" />
    </div>
    <div v-if="ats && printing === 'ats'" class="cv-ats-print">
      <CvAtsDocument :pages="ats.pages" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.cv-view {
  flex-basis: 100%;
}

.cv-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  padding-top: 1.25rem;
  padding-bottom: 0.25rem;
}

.cv-toolbar__hint {
  font-size: 0.85rem;
  color: var(--muted);
}

// --- The layout chooser ---
.chooser {
  width: min(32rem, calc(100vw - 2rem));
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: var(--primary-soft);
  color: var(--secondary);
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.7);

  &::backdrop {
    background: rgba(8, 10, 20, 0.7);
    backdrop-filter: blur(2px);
  }
}

.chooser__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
}

.chooser__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 800;
}

.chooser__lede {
  margin: 0;
  color: var(--muted);
}

.chooser__options {
  display: grid;
  gap: 0.75rem;
}

.chooser__option {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  text-align: left;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  color: var(--secondary);
  transition: border-color 0.2s, background 0.2s;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
    background: rgba(255, 255, 255, 0.07);
  }
}

.chooser__name {
  font-weight: 800;
  font-size: 1.05rem;
}

.chooser__desc {
  font-size: 0.9rem;
  color: var(--muted);
}

.chooser__cancel {
  align-self: flex-end;
  background: none;
  border: none;
  padding: 0.25rem 0.5rem;
  color: var(--muted);
  &:hover {
    color: var(--secondary);
  }
}

// --- Print ---
.cv-ats-print {
  display: none;
}

@media print {
  .cv-rich.is-print-hidden {
    display: none;
  }
  .cv-ats-print {
    display: block;
  }
}
</style>
