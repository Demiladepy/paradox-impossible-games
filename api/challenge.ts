/**
 * The challenge generator, as a serverless function.
 *
 * This is the same `handleChallengeRequest` the Vite dev server mounts at
 * `/api/challenge` — one implementation, two hosts. Nothing in `src/` can import it, so
 * the Anthropic key stays server-side on both.
 *
 * On a host with no functions (GitHub Pages) this file is simply never deployed, the
 * client's fetch fails, and `requestChallenge` falls back to the built-in pack. That is
 * the designed behaviour, not a degradation: the game is required to be complete with no
 * network at all.
 *
 * To deploy with live generation:
 *
 *   npx vercel            — link the project
 *   npx vercel env add ANTHROPIC_API_KEY production
 *   npx vercel --prod
 *
 * Be aware of what that means: the endpoint is public and every call spends credit on the
 * key you gave it. For a hackathon window that is usually fine. Rotate the key afterwards.
 */
// The generated bundle, not the source. Vercel leaves `.ts` import specifiers untouched
// and does not ship the files behind them, so the handler is bundled by `npm run build`
// into a single self-contained module that sits beside this file. See scripts/build-api.ts.
import { handleChallengeRequest } from "./_handler.mjs";

/**
 * Typed loosely on purpose.
 *
 * `@vercel/node` is not a dependency of this project and adding one for two type
 * annotations would mean the deploy target dictates the lockfile. These are the only two
 * shapes we touch.
 */
interface Req {
  method?: string | undefined;
  body?: unknown;
}

interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "POST only" }));
    return;
  }

  try {
    // Vercel parses JSON bodies already; tolerate a string in case it did not.
    const body: unknown =
      typeof req.body === "string" ? (JSON.parse(req.body || "{}") as unknown) : (req.body ?? {});

    const result = await handleChallengeRequest(body);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (error) {
    // Never hand an internal message to the browser; the client falls back regardless.
    console.error("[api/challenge]", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "challenge generation failed" }));
  }
}
