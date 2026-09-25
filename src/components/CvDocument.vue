<script setup lang="ts">
import { computed, PropType } from "vue";
import CvPage from "@/components/CvPage.vue";
import { CVPage } from "@/cv/types";
import { mergePages } from "@/cv/merge";
import { usePrintPage } from "@/cv/usePrintPage";

// The styled two-column CV. `pages` are the printed sheets. On screen they
// merge into one continuous document unless `paged` asks for A4 sheets.
const props = defineProps({
  pages: { type: Array as PropType<CVPage[]>, required: true },
  paged: { type: Boolean, default: false },
});

// The sidebar bleeds to the paper edge, so print with no page margin.
usePrintPage("size: A4; margin: 0;");

const merged = computed(() => mergePages(props.pages));
</script>

<template>
  <div class="cv-wrapper" :class="{ 'is-paged': paged }">
    <!-- Continuous view for the screen -->
    <div v-if="merged" class="cv-container cv-screen">
      <CvPage :page="merged" />
    </div>
    <!-- One sheet per page: shown when paged, and always when printing -->
    <div class="cv-container cv-sheets">
      <CvPage
        v-for="(page, index) in pages"
        :key="index"
        :page="page"
        :sidebar="index === 0"
        :class="{ 'cv-page--last': index === pages.length - 1 }"
      />
    </div>
  </div>
</template>

<style scoped>
.cv-wrapper {
  --border-radius: 8px;
  --space-md: 20px;
  --space-lg: 40px;
  display: flex;
  justify-content: center;
  padding: var(--space-lg) var(--space-md);
  width: 100%;
}

.cv-container {
  width: 100%;
  max-width: 1050px;
}

.cv-screen .cv-page {
  border-radius: var(--border-radius);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.cv-sheets {
  display: none;
}

/* --- PAGED: A4 sheets on screen (the dashboard preview) --- */
.is-paged {
  padding: 0;
}

.is-paged .cv-screen {
  display: none;
}

.is-paged .cv-sheets {
  display: block;
  max-width: none;
  width: auto;
}

.is-paged .cv-page {
  width: 210mm;
  height: 297mm;
  margin: 0 auto 8mm;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  --sidebar-width: 280px;
}

@media (max-width: 768px) {
  .cv-screen .cv-page {
    grid-template-columns: 1fr;
  }
}

@media print {
  :global(nav),
  :global(header),
  :global(footer),
  :global(.no-print) {
    display: none !important;
  }

  .cv-wrapper {
    /* "absolute" lets it flow across pages; "fixed" would repeat it. */
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    z-index: 9999;
    background-color: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .cv-screen {
    display: none;
  }

  .cv-sheets {
    display: block;
    max-width: none;
    width: 100%;
  }

  /* One sheet per page, clipped, with a hard break after each. Sized to the
     printable area (100vh is one page in print) rather than fixed mm, so it
     fits whatever paper and margins the print dialog ends up with. */
  .cv-page {
    width: 100%;
    height: 100vh;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
    --sidebar-width: 280px;
    break-after: page;
    page-break-after: always;
  }

  .cv-page--last {
    break-after: auto;
    page-break-after: auto;
  }
}
</style>
