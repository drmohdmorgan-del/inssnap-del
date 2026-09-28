import { defineConfig } from "vitest/config";

/**
 * Route-handler tests exercise server code only — no CSS pipeline.
 * The inline (empty) PostCSS config keeps vite from loading the app's
 * Tailwind PostCSS config, whose string-form plugin spec the bundled
 * postcss-load-config cannot resolve.
 */
export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    // Never pick up stylesheets or client components.
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
