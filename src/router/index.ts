import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";
import { pageMeta, site } from "@/data/site";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "home",
    component: HomeView,
  },
  {
    path: "/cv",
    name: "experience",
    component: () => import("../views/ExperienceView.vue"),
    // Reachable from the site's own links, not from search.
    meta: { noindex: true },
  },
  {
    path: "/timeline",
    name: "timeline",
    component: () => import("../views/TimelineView.vue"),
  },
  // Old links still work.
  { path: "/my-experience", redirect: "/cv" },
  { path: "/home", redirect: "/" },
];

// The CV dashboard only exists in dev; it needs the local API in cv/devApi.js.
if (process.env.NODE_ENV === "development") {
  routes.push({
    path: "/admin",
    name: "admin",
    component: () => import("../views/AdminView.vue"),
  });
}

// Catch-all last, so it never shadows a real route.
routes.push({
  path: "/:pathMatch(.*)*",
  name: "not-found",
  component: () => import("../views/NotFoundView.vue"),
});

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: "smooth" };
    return { top: 0 };
  },
});

// Per-route title, description and canonical URL. The static tags in
// public/index.html cover crawlers that don't run JavaScript; this keeps the
// tab title and share text right once the app is running.
const setMeta = (selector: string, attr: string, value: string) => {
  const el = document.head.querySelector<HTMLElement>(selector);
  if (el) el.setAttribute(attr, value);
};

router.afterEach((to) => {
  const meta = pageMeta[String(to.name)] ?? pageMeta.home;
  document.title = meta.title;
  setMeta('meta[name="description"]', "content", meta.description);
  setMeta('meta[property="og:title"]', "content", meta.title);
  setMeta('meta[property="og:description"]', "content", meta.description);
  setMeta('meta[name="twitter:title"]', "content", meta.title);
  setMeta('meta[name="twitter:description"]', "content", meta.description);
  setMeta(
    'meta[name="robots"]',
    "content",
    to.meta.noindex ? "noindex,follow" : "index,follow"
  );
  const url = `${site.url}${to.path === "/" ? "/" : to.path}`;
  setMeta('link[rel="canonical"]', "href", url);
  setMeta('meta[property="og:url"]', "content", url);
});

export default router;
