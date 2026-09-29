import { ADMIN_PATH, site } from "./app/data/site";

// The site is generated to static files (`nuxi generate`) and served by
// Firebase Hosting. Each page is rendered at build time with the content
// fetched from Firestore, then checks for a newer publish in the browser
// (composables/useContent.ts). The dashboard page is client-only.
const person = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: site.name,
  jobTitle: site.title,
  url: `${site.url}/`,
  image: `${site.url}/images/portrait.jpeg`,
  email: `mailto:${site.email}`,
  worksFor: { "@type": "Organization", name: "Warren Scantlebury Consulting" },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bridgetown",
    addressCountry: "BB",
  },
  alumniOf: [
    { "@type": "CollegeOrUniversity", name: "University of Nottingham" },
    {
      "@type": "CollegeOrUniversity",
      name: "University of the West Indies, Cave Hill",
    },
  ],
  knowsAbout: [
    "TypeScript",
    "React",
    "Next.js",
    "Vue.js",
    "Node.js",
    "Kubernetes",
    "Terraform",
    "Google Cloud",
    "Progressive Web Apps",
  ],
  sameAs: [site.github, site.linkedin, site.x],
};

const socialImage = `${site.url}${site.socialImage}`;

export default defineNuxtConfig({
  compatibilityDate: "2026-09-29",
  ssr: true,
  modules: ["@nuxt/eslint"],
  css: ["~/assets/css/global.scss"],
  eslint: { config: { stylistic: false } },
  typescript: {
    strict: true,
    // Nuxt 4 turns this on; the CV code indexes arrays it has just checked.
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
  },

  runtimeConfig: {
    public: {
      // Set NUXT_PUBLIC_FIRESTORE_EMULATOR / NUXT_PUBLIC_AUTH_EMULATOR to
      // read content from and sign in against the local emulators.
      firestoreEmulator: "",
      authEmulator: "",
    },
  },

  routeRules: {
    // The dashboard: no server render, just a shell that signs in.
    [ADMIN_PATH]: { ssr: false, prerender: true },
  },

  nitro: {
    preset: "static",
    prerender: {
      crawlLinks: true,
      routes: ["/", "/cv", "/timeline", ADMIN_PATH],
      // timeline.html rather than timeline/index.html: Hosting's cleanUrls
      // serves it at /timeline.
      autoSubfolderIndex: false,
      failOnError: true,
    },
    // The dashboard talks to the deployed Cloud Function, so the dev server
    // proxies /api to the live site: `npm run dev` edits the real content
    // behind a real sign-in. To work against local data instead, run
    // `npm run emulators` and point CV_API_TARGET at
    // http://127.0.0.1:5001/radiant-inferno-8721/europe-west2/cvApi
    devProxy: {
      "/api": {
        target: `${process.env.CV_API_TARGET || site.url}/api`,
        changeOrigin: true,
      },
    },
  },

  router: { options: { scrollBehaviorType: "smooth" } },

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      bodyAttrs: { class: "primary-polkadot-bg" },
      meta: [
        { name: "theme-color", content: "#151a2d" },
        { name: "author", content: site.name },
        // Link previews (LinkedIn, Slack and iMessage read Open Graph; X
        // reads the twitter:* tags). Per-page tags: composables/usePageMeta.ts.
        { property: "og:site_name", content: site.name },
        { property: "og:image", content: socialImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        {
          property: "og:image:alt",
          content: `${site.name}, ${site.title}`,
        },
        { property: "profile:first_name", content: "Warren" },
        { property: "profile:last_name", content: "Scantlebury" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:site", content: "@warrendadev" },
        { name: "twitter:image", content: socialImage },
      ],
      link: [
        { rel: "icon", href: "/logo-hand-drawn.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/img/icons/apple-touch-icon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap",
        },
        {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css",
          integrity:
            "sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC",
          crossorigin: "anonymous",
        },
      ],
      script: [
        { type: "application/ld+json", innerHTML: JSON.stringify(person) },
      ],
      // The pages are generated with the content in them, so without
      // JavaScript only the live-content check and the dashboard are lost.
      noscript: [
        {
          innerHTML: `<strong class="container">Some parts of this site need JavaScript. You can still reach me at ${site.email} or on <a href="${site.github}">GitHub</a>.</strong>`,
        },
      ],
    },
  },
});
