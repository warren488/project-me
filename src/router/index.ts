import { nextTick } from "vue";
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";
import { pageMeta, site } from "@/data/site";
import { loadContent } from "@/data/content";

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

// Vue CLI only (Nuxt: a page with ssr: false). The CV dashboard: its own
// chunk, signed in through Firebase Auth, talking to /api/cv (functions/).
routes.push({
  path: "/admin",
  name: "admin",
  component: () => import("../views/AdminView.vue"),
  meta: { noindex: true },
});

// Catch-all last, so it never shadows a real route.
routes.push({
  path: "/:pathMatch(.*)*",
  name: "not-found",
  component: () => import("../views/NotFoundView.vue"),
});

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  async scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) {
      // The anchor may be inside content that is still loading.
      await loadContent();
      await nextTick();
      return { el: to.hash, behavior: "smooth" };
    }
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
