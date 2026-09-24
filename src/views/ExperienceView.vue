<script setup lang="ts">
import CvDocument from "@/components/CvDocument.vue";
import { PublishedCV } from "@/cv/types";
import published from "../../cv/published.json";

const cv = published as PublishedCV;
</script>

<template>
  <CvDocument :pages="cv.pages" />
</template>
