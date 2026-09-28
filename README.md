# project-me

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).

## Content and the admin dashboard

The CV, timeline and project cards live in Firestore (project
`radiant-inferno-8721`), not in this repo. The public site fetches them as one
document (`site/content`) at load time; `src/data/content.ts` is the only place
that reads it. Edit them at `/admin`: sign in with one of the Google accounts in
`functions/.env`, change entries in the Library tab and what each CV variant
prints in the Layout tab, then Save & publish. Every save republishes the
timeline and project cards; Export downloads a backup bundle and Import
restores one.

The dashboard talks to `/api/cv/*`, a Cloud Function in `functions/`
(`functions/cv/api.js` and `publish.js` hold the logic, `store.js` the
Firestore access). In development the dev server proxies `/api` to the live
site, so `npm run serve` edits the real content. To work on the function
itself, run the emulators and point the proxy at them:

```
npm run emulators
CV_API_TARGET=http://127.0.0.1:5001/radiant-inferno-8721/europe-west2/cvApi npm run serve
```

Deploy everything (site, function, Firestore rules) with `npm run deploy`.
Firebase settings the code expects: Blaze plan, Firestore in `europe-west2`,
Google sign-in enabled, and the web app config pasted into
`src/firebaseConfig.ts` and the preload tag in `public/index.html`.
