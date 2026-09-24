const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    // Local API behind the /admin CV dashboard (dev server only).
    setupMiddlewares(middlewares, devServer) {
      require("./cv/devApi")(devServer.app);
      return middlewares;
    },
  },
});
