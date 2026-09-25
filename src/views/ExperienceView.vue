<script setup lang="ts">
import CvDocument from "@/components/CvDocument.vue";
import CvAtsDocument from "@/components/CvAtsDocument.vue";
import { PublishedCV } from "@/cv/types";
import published from "../../cv/published.json";

const cv = published as PublishedCV;
</script>

<template>
  <CvAtsDocument v-if="cv.layout === 'ats'" :pages="cv.pages" />
  <CvDocument v-else :pages="cv.pages" />
</template>
