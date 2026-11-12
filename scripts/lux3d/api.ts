/**
 * Aholo Lux3D API client — BUILD TIME ONLY.
 *
 * This module reads LUX3D_API_KEY and must never be imported from `src/`.
 * Contract verified against https://lux3d.aholo.ai/docs on 2026-11-12:
 *   - auth header is `Authorization: <key>` with NO "Bearer" prefix
 *   - every response is the envelope { f, c, m, d }; c === "0" means the CALL succeeded
 *   - create returns d = taskid (number); query returns d = { taskId, status, outputs }
 *   - result URLs expire after 2 hours, so callers must download immediately
 */

import { isTerminal, TaskStatus, type TaskResult } from "./outputs.ts";

const DEFAULT_BASE_URL = "https://api.aholo.ai/global";

export interface LuxEnvelope<T> {
  f: unknown;
  c: string;
  m: string;
  d: T;
}

export class LuxApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "LuxApiError";
  }

  get isConcurrencyLimit(): boolean {
    return this.code === "GENERATION_CONCURRENCY_LIMIT_EXCEEDED";
  }
}

function baseUrl(): string {
  return (process.env.LUX3D_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.LUX3D_API_KEY?.trim();
  if (!key) {
    throw new LuxApiError(
      "LUX3D_API_KEY is not set. Copy .env.example to .env and add your Lux3D *Global* API key.",
      "MISSING_API_KEY",
    );
  }
  return key;
}

async function unwrap<T>(res: Response, where: string): Promise<T> {
  const text = await res.text();
  let envelope: LuxEnvelope<T>;
  try {
    envelope = JSON.parse(text) as LuxEnvelope<T>;
  } catch {
    throw new LuxApiError(
      `${where}: expected JSON, got HTTP ${res.status}: ${text.slice(0, 200)}`,
      "BAD_RESPONSE",
      res.status,
    );
  }
  if (envelope.c !== "0") {
    throw new LuxApiError(
      `${where}: ${envelope.m || "request rejected"} [${envelope.c}]`,
      envelope.c,
      res.status,
    );
  }
  return envelope.d;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey() },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, `POST ${path}`);
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${baseUrl()}${path}?${qs}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", Authorization: apiKey() },
  });
  return unwrap<T>(res, `GET ${path}`);
}

/* ------------------------------------------------------------------ */
/* Task creation                                                       */
/* ------------------------------------------------------------------ */

export type Lux3DStyle =
  | "photorealistic"
  | "cartoon"
  | "anime"
  | "hand_painted"
  | "cyberpunk"
  | "fantasy"
  | "glass";

export interface TextTo3DRequest {
  prompt: string;
  version: "G1" | "G1-Turbo";
  style?: Lux3DStyle;
  /** [10000, 300000]; defaults to 300000 server-side, which is far too heavy for us. */
  faceCount?: number;
  outputFormat?: ("zip" | "glb" | "ply")[];
  /** G1-Turbo only: false returns an untextured white mesh. */
  enablePbr?: boolean;
  aiPredictSize?: boolean;
  img?: string;
}

export function createTextTo3D(req: TextTo3DRequest): Promise<number> {
  return post<number>("/lux3d/v1/generate/text-to-3d/task/create", req);
}

export function createRig(modelUrl: string): Promise<number> {
  return post<number>("/lux3d/v1/animations/rig/task/create", { modelUrl });
}

export interface RetargetRequest {
  rigModelUrl: string;
  /** 1-10 distinct, case-sensitive ids from the documented list of 85. */
  animationIds: string[];
  /** "combined" puts every clip in one file — what we want for AnimationMixer. */
  animationOutputMode?: "separate" | "combined";
  outFormat?: "glb" | "fbx";
  /** true strips root motion, required because movement is code-driven. */
  animateInPlace?: boolean;
}

export function createRetarget(req: RetargetRequest): Promise<number> {
  return post<number>("/lux3d/v1/animations/retarget/task/create", req);
}

/* ------------------------------------------------------------------ */
/* Task query + polling                                                */
/* ------------------------------------------------------------------ */

export function getTask(taskId: number): Promise<TaskResult> {
  return get<TaskResult>("/lux3d/v1/generate/task/get", { taskid: String(taskId) });
}

export interface PollOptions {
  /** Docs recommend 10-15s. */
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (task: TaskResult, elapsedMs: number) => void;
}

/**
 * Polls until the task reaches a terminal state. Returns the terminal result without
 * judging it — callers use assertSucceeded/pickGlbUrl to interpret it.
 */
export async function pollTask(taskId: number, options: PollOptions = {}): Promise<TaskResult> {
  const intervalMs = options.intervalMs ?? 12_000;
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  const startedAt = Date.now();

  for (;;) {
    const task = await getTask(taskId);
    const elapsed = Date.now() - startedAt;
    options.onTick?.(task, elapsed);

    if (isTerminal(task.status)) return task;

    if (elapsed + intervalMs > timeoutMs) {
      throw new LuxApiError(
        `Task ${taskId} still at status ${task.status} after ${Math.round(elapsed / 1000)}s ` +
          `(last seen: ${task.status === TaskStatus.Running ? "running" : "queued"})`,
        "POLL_TIMEOUT",
      );
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
