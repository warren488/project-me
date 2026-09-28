import { createApp } from "vue";
import App from "./App.vue";
// import "./registerServiceWorker";
import router from "./router";
import { loadContent } from "@/data/content";
import "@/assets/css/global.scss";

// Vue CLI only: start the content request before the app mounts (Nuxt does
// this through useAsyncData in the pages instead).
loadContent();

createApp(App).use(router).mount("#app");
