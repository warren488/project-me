# project-me

The source of [warren.scantlebury.io](https://warren.scantlebury.io): a Nuxt 4
site generated to static files and served by Firebase Hosting, with a CV
dashboard behind Google sign-in and a Cloud Function in `functions/`.

## Working on it

```
npm install
npm run dev        # dev server on http://localhost:3000
npm run lint       # eslint + prettier
npm run typecheck  # vue-tsc through nuxi
npm run generate   # static site in .output/public
npm run preview    # serve the generated site
```

Every public page is rendered at build time with the content fetched from
Firestore, so the HTML carries the text and the right `<title>` and preview
tags. In the browser the page then fetches the live document once and swaps
it in if a newer version was published, so publishing from the dashboard
needs no rebuild; `npm run deploy` refreshes the baked-in copy.

Layout: `app/pages` (one file per route), `app/components`,
`app/composables` (`useContent`, `useAuth`, `usePageMeta`), `app/cv` (CV
types and helpers), `app/data` (site copy, content fetch), `public/`
(static files). Site-wide `<head>` tags live in `nuxt.config.ts`; per-page
ones in `app/data/site.ts`.

## Content and the admin dashboard

The CV, timeline and project cards live in Firestore (project
`radiant-inferno-8721`), not in this repo. The public site fetches them as one
document (`site/content`); `app/data/content.ts` is the only place that
reads it. Edit them at the dashboard route (`ADMIN_PATH` in
`app/data/site.ts`, kept out of robots.txt on purpose): sign in with one of the Google accounts in
`functions/.env`, change entries in the Library tab and what each CV variant
prints in the Layout tab, then Save & publish. Every save republishes the
timeline and project cards; Export downloads a backup bundle and Import
restores one.

The dashboard talks to `/api/cv/*`, a Cloud Function in `functions/`
(`functions/cv/api.js` and `publish.js` hold the logic, `store.js` the
Firestore access). In development the dev server proxies `/api` to the live
site, so `npm run dev` edits the real content. To work on the function
itself, run the emulators (they need a JDK 21) and point the site at them:

```
npm run emulators
CV_API_TARGET=http://127.0.0.1:5001/radiant-inferno-8721/europe-west2/cvApi \
NUXT_PUBLIC_FIRESTORE_EMULATOR=http://127.0.0.1:8085 \
NUXT_PUBLIC_AUTH_EMULATOR=http://127.0.0.1:9099 npm run dev
```

Deploy everything (site, function, Firestore rules) with `npm run deploy`.
Firebase settings the code expects: Blaze plan, Firestore in `europe-west2`,
Google sign-in enabled, and the web app config pasted into
`app/firebaseConfig.ts`.
