/**
 * Types for the generated bundle (`npm run build:api` writes `_handler.mjs`).
 *
 * TypeScript resolves a `./_handler.mjs` import to a `_handler.d.mts` sibling, so this is
 * the file that has to exist. It restates the single export the function uses and mirrors
 * `server/challenge-handler.ts` — if that signature changes, this follows.
 */
export declare function handleChallengeRequest(body: unknown): Promise<unknown>;
