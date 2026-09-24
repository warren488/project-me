import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";
import ExperienceView from "../views/ExperienceView.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "home",
    component: HomeView,
  },
  {
    path: "/my-experience",
    name: "experience",
    component: ExperienceView,
  },
  {
    path: "/home",
    redirect: "/",
  },
];

// The CV dashboard only exists in dev; it needs the local API in cv/devApi.js.
if (process.env.NODE_ENV === "development") {
  routes.push({
    path: "/admin",
    name: "admin",
    component: () => import("../views/AdminView.vue"),
  });
}

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
