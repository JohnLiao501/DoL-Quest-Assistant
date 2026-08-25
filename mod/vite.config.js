import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const modDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(modDirectory, "..");

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: path.resolve(modDirectory, "src/entry.jsx"),
      name: "DoLQuestAssistantBundle",
      formats: ["iife"],
      fileName: () => "DoLQuestAssistant.js",
    },
    outDir: path.resolve(modDirectory, "dist"),
    emptyOutDir: true,
    minify: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
