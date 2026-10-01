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

### Condensing bullets

The dashboard has two workspaces: **Library** (the content) and **CVs**
(what each CV prints). In the Library, a job or client engagement's editor
has a Condensed section with one group per CV: "✦ Condense…" turns the
saved bullets into a few highlights written for that CV with a model's help
(the CV's headline and summary are the audience), and each CV can hold its
own set. Highlights never appear on the timeline. Under CVs, every job and
client row has a **Full / Condensed** switch: Condensed prints the
highlights written for that CV (or the general ones), Full prints all the
bullets, and ticking rows by hand gives a Custom pick. The prompt is always
built by the function, and the dialog offers three ways to run it:

- **Server**: the provider set in `functions/.env` (`AI_PROVIDER` is
  `anthropic`, or `openai` for any OpenAI-compatible endpoint such as OpenAI,
  OpenRouter, Ollama or LM Studio, with `AI_MODEL` and `AI_BASE_URL`). The
  key lives in Secret Manager: `firebase functions:secrets:set AI_API_KEY`
  before the first deploy (deploy prompts for it otherwise). Leave
  `AI_PROVIDER` empty to run without one.
- **Local model**: the browser calls an OpenAI-compatible server on this
  machine directly, so it works against the live dashboard for free. The
  server must allow the dashboard's origin: for Ollama set
  `OLLAMA_ORIGINS=https://warren.scantlebury.io,http://localhost:3000`; LM
  Studio has a CORS switch.
- **Copy prompt**: copy the prompt into any chat tool or CLI (Claude, ChatGPT,
  Claude Code, Codex) and paste the reply back. It reads the JSON array the
  prompt asks for, or plain bullet lines.

With the emulators, the server mode can use a local model too: put
`AI_PROVIDER=openai`, `AI_BASE_URL=http://127.0.0.1:11434/v1` and
`AI_MODEL=<name>` in `functions/.env.local` and any value for `AI_API_KEY` in
`functions/.secret.local` (both ignored by git). `npm --prefix functions test`
covers the prompt, the reply parser and the API route.

### Editing in the preview

Under CVs, with the preview shown and **Edit text** ticked, any text in the
preview can be typed into, so the sheet reflows and the overflow warning
updates as you write. Enter in a bullet starts a new one below it; Escape
puts the text back. The line above the preview says what the text belongs
to: the headline and summary are the CV's own, everything else is Library
text shared with the other CVs and the timeline. Condensed bullets always
end up in that CV's own set: editing one from the general set (or another
CV's) copies it for this CV first. Dates, tech and contact details open
their editor instead. Nothing is written until **Save**, which sends the CV
and the edited entries in one request (`POST save`); Revert discards both.
The function's preview carries the library ids behind each text
(`resolveVariant(..., { trace: true })`); published pages never do.

Deploy everything (site, the `cvApi` function, Firestore rules) with
`npm run deploy`. It names the function on purpose: the project still holds
two old functions (`api` and `uwibase` in us-central1) that are not in this
repo, and a bare `--only functions` refuses to run non-interactively until
they are deleted.
Firebase settings the code expects: Blaze plan, Firestore in `europe-west2`,
Google sign-in enabled, and the web app config pasted into
`app/firebaseConfig.ts`.
