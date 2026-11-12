import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: "es2022",
    // GLB assets are large; don't inline them and don't warn about the three.js chunk.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
