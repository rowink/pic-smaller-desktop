/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0"
  },
  preview: {
    port: 3001,
    host: "0.0.0.0",
  },
  build: {
    // Chunks are served from the local app:// origin (no network), so vite's
    // 500 kB advisory threshold is not meaningful here: the largest entry
    // chunk is ~582 kB raw / ~188 kB gzip. Splitting vendors via manualChunks
    // was tried and broke cross-chunk init order at runtime ("createContext
    // of undefined" in the rc-* chunk), so the default layout is kept.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      onwarn(warning, warn) {
        // The vendored emscripten glue (src/engines/*WasmModule.js) and vconsole
        // intentionally use eval(). Rewriting generated wasm glue would risk the
        // compression engines, so these advisory warnings are filtered here.
        // Any other eval usage still surfaces normally.
        if (warning.code === "EVAL") {
          const id = (warning.id ?? "").replace(/\\/g, "/");
          if (id.includes("/src/engines/") || id.includes("/vconsole/")) {
            return;
          }
        }
        warn(warning);
      },
    },
  },
  test: {
    include: ["tests/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
