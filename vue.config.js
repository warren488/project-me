const { defineConfig } = require("@vue/cli-service");

// Vue CLI only (Nuxt: nitro.devProxy). The /admin dashboard talks to the
// deployed Cloud Function, so the dev server proxies /api to the live site:
// `npm run serve` edits the real content behind a real sign-in. To work
// against local data instead, run `npm run emulators` and point
// CV_API_TARGET at http://127.0.0.1:5001/radiant-inferno-8721/europe-west2/cvApi
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    proxy: {
      "/api": {
        target: process.env.CV_API_TARGET || "https://warren.scantlebury.io",
        changeOrigin: true,
      },
    },
  },
});
