/**
 * A deliberately trivial endpoint.
 *
 * When /api/challenge returns FUNCTION_INVOCATION_FAILED there are two very different
 * causes: the serverless runtime is not working at all, or it is working and something the
 * handler imports blows up on load. This separates them in one request.
 */
export default function handler(_req: unknown, res: { setHeader(n: string, v: string): void; end(b: string): void }): void {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, node: process.version, hasKey: Boolean(process.env["ANTHROPIC_API_KEY"]) }));
}
