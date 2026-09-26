const path = require("path");
const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    // Local API behind the /admin CV dashboard (dev server only).
    setupMiddlewares(middlewares, devServer) {
      // Loaded fresh on every request, so edits under cv/ take effect
      // without restarting the dev server.
      const cvDir = path.join(__dirname, "cv") + path.sep;
      devServer.app.use("/__cv", (req, res, next) => {
        for (const key of Object.keys(require.cache)) {
          if (key.startsWith(cvDir)) delete require.cache[key];
        }
        require("./cv/devApi").handle(req, res, next);
      });
      return middlewares;
    },
  },
});
