import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@studio": path.resolve(__dirname, "src/studio"),
      "@planner": path.resolve(__dirname, "src/planner"),
    },
  },
  build: {
    outDir: "dist/studio",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/studio/main.tsx",
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
