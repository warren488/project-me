// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import prettier from "eslint-config-prettier";

export default withNuxt(
  {
    // The Cloud Function and the one-off scripts are plain Node, not app code.
    ignores: ["functions/**", "scripts/**", "cv-bundle*.json"],
  },
  {
    rules: {
      // Overloaded emits and `delete obj[key]` read fine in this codebase.
      "@typescript-eslint/unified-signatures": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },
  prettier
);
