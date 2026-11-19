import { promises as fs } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Mounts the challenge generator at /api/challenge during development.
 *
 * The handler is imported lazily and only ever runs inside the dev server's Node process,
 * so the Anthropic key stays server-side — nothing in `src/` can reach it. In production
 * the same `handleChallengeRequest` is the body of a serverless function; see
 * docs/API_INTEGRATION.md.
 */
function challengeApi(): Plugin {
  return {
    name: "paradox-challenge-api",
    apply: "serve",

    /**
     * Load .env into process.env for the dev server itself.
     *
     * Vite reads .env into `import.meta.env` for *client* code, and deliberately only
     * exposes VITE_-prefixed keys there. Server-side middleware gets nothing — so the
     * challenge handler was reading an undefined ANTHROPIC_API_KEY and silently falling
     * back to the built-in pack on every request, while the CLI (`node --env-file=.env`)
     * worked perfectly. The game said "no key configured" with the key sitting in .env.
     */
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return {};
    },

    configureServer(server) {
      server.middlewares.use("/api/challenge", (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "POST only" }));
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString("utf8");

          try {
            const body: unknown = raw.length > 0 ? JSON.parse(raw) : {};
            const { handleChallengeRequest } = await import("./server/challenge-handler.ts");
            const result = await handleChallengeRequest(body);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (error) {
            // Never leak an internal message to the browser; log it here instead.
            console.error("[challenge api]", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "challenge generation failed" }));
          }
        })();
      });
    },
  };
}


/**
 * Saves frames posted by the C key straight into the repo during development.
 *
 * Without it a capture lands in the browser's download folder under whatever name the
 * browser chose, which is a poor place for an asset that belongs in docs/. Dev-only: it is
 * `apply: "serve"`, so nothing about it exists in a production build.
 */
function captureApi(): Plugin {
  return {
    name: "paradox-capture-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/shot", (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end();
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);

          try {
            const { name, dataUrl } = JSON.parse(chunks.join("")) as {
              name?: string;
              dataUrl?: string;
            };
            const base64 = (dataUrl ?? "").split(",")[1];
            if (!base64) throw new Error("no image data");

            // Never let a posted name escape the target directory.
            const safe = (name ?? "shot.png").replace(/[^a-zA-Z0-9._-]/g, "-");
            const dir = path.resolve(process.cwd(), "docs/x-post-images");
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(path.join(dir, safe), Buffer.from(base64, "base64"));

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ saved: safe }));
          } catch (error) {
            console.error("[capture api]", error);
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "could not save frame" }));
          }
        })();
      });
    },
  };
}

export default defineConfig({
  /**
   * Where the site is served from.
   *
   * Root in development and on any host that serves the app at `/`. GitHub Pages serves a
   * project site from `/<repo>/`, so the deploy workflow sets PARADOX_BASE and every asset
   * URL follows it through `src/asset-url.ts`. Getting this wrong does not fail the build
   * — it ships an arena with no geometry in it, which is a far worse way to find out.
   */
  base: process.env["PARADOX_BASE"] ?? "/",
  plugins: [react(), challengeApi(), captureApi()],
  server: { port: 5173 },
  build: {
    target: "es2022",
    // GLB assets are large; don't inline them and don't warn about the three.js chunk.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
