/**
 * Pure helpers for interpreting Lux3D task responses.
 *
 * Every rule encoded here comes from https://lux3d.aholo.ai/docs and is unit tested in
 * outputs.test.ts. No network, no secrets, no side effects — keep it that way so the
 * envelope rules stay verifiable.
 */

/** Lux3D task status codes. */
export const TaskStatus = {
  Initialized: 0,
  Running: 1,
  Succeeded: 3,
  Failed: 4,
  Cancelled: 6,
} as const;

export type TaskStatusCode = (typeof TaskStatus)[keyof typeof TaskStatus];

export interface TaskOutput {
  content?: string;
}

export interface TaskResult {
  taskId: number;
  status: number;
  outputs?: TaskOutput[];
}

/** Placeholder the API puts in a slot for a format that was not requested. */
export const NOT_REQUESTED = "NOT_REQUESTED";

export class LuxTaskError extends Error {
  constructor(
    message: string,
    readonly taskId: number,
    readonly status: number,
  ) {
    super(message);
    this.name = "LuxTaskError";
  }
}

export function isTerminal(status: number): boolean {
  return (
    status === TaskStatus.Succeeded ||
    status === TaskStatus.Failed ||
    status === TaskStatus.Cancelled
  );
}

/**
 * A slot is only a download URL if it is a non-empty https URL that is not the
 * NOT_REQUESTED placeholder. Mesh-retopology uses "" for an absent third slot, and
 * failed tasks can put error JSON in `content` — neither is a URL.
 */
export function isUsableUrl(content: string | undefined): content is string {
  if (typeof content !== "string") return false;
  const value = content.trim();
  if (value.length === 0) return false;
  if (value === NOT_REQUESTED) return false;
  return value.startsWith("https://") || value.startsWith("http://");
}

/** Throws unless the task finished successfully. Call before reading outputs. */
export function assertSucceeded(task: TaskResult): void {
  if (task.status === TaskStatus.Succeeded) return;
  if (task.status === TaskStatus.Failed) {
    throw new LuxTaskError("Lux3D task failed", task.taskId, task.status);
  }
  if (task.status === TaskStatus.Cancelled) {
    throw new LuxTaskError("Lux3D task was cancelled", task.taskId, task.status);
  }
  throw new LuxTaskError(
    `Lux3D task has not finished (status ${task.status}); outputs are not final`,
    task.taskId,
    task.status,
  );
}

/**
 * Pick the GLB from a text-to-3d / img-to-3d result.
 *
 * G1 always returns [ZIP, GLB] (+PLY when asked), so the GLB is index 1.
 * G1-Turbo returns only the formats requested, in the canonical zip/glb/ply order.
 *
 * We match on the `.glb` extension first because that is robust to both layouts, and
 * fall back to the documented positional rule if the URL carries no extension.
 */
export function pickGlbUrl(
  task: TaskResult,
  version: "G1" | "G1-Turbo",
  requestedFormats: readonly string[] = ["zip", "glb"],
): string {
  assertSucceeded(task);
  const outputs = task.outputs ?? [];
  const usable = outputs.map((o) => o.content).filter(isUsableUrl);

  if (usable.length === 0) {
    throw new LuxTaskError("Task succeeded but returned no usable outputs", task.taskId, task.status);
  }

  const byExtension = usable.find((url) => stripQuery(url).toLowerCase().endsWith(".glb"));
  if (byExtension) return byExtension;

  const index =
    version === "G1"
      ? 1
      : canonicalOrder(requestedFormats).indexOf("glb");

  if (index < 0) {
    throw new LuxTaskError("No GLB was requested for this task", task.taskId, task.status);
  }
  const positional = outputs[index]?.content;
  if (!isUsableUrl(positional)) {
    throw new LuxTaskError(
      `Expected a GLB at output index ${index} but found none`,
      task.taskId,
      task.status,
    );
  }
  return positional;
}

/** Lux3D emits formats in this fixed order, filtered to the ones requested. */
function canonicalOrder(requested: readonly string[]): string[] {
  const lower = requested.map((f) => f.toLowerCase());
  return ["zip", "glb", "ply"].filter((f) => lower.includes(f));
}

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** Single-output tasks: rig, part-split, articulation. */
export function pickSingleUrl(task: TaskResult): string {
  assertSucceeded(task);
  const content = task.outputs?.[0]?.content;
  if (!isUsableUrl(content)) {
    throw new LuxTaskError(
      "Task succeeded but outputs[0] is not a download URL (it may be error JSON)",
      task.taskId,
      task.status,
    );
  }
  return content;
}

export interface RetargetAction {
  animation_id: string;
  status: string;
  animationGlbUrl?: string;
  fbxUrl?: string;
  error?: { code?: string; message?: string };
}

/**
 * Retargeting returns outputs[0].content as a JSON *string* holding { actions: [...] }.
 * Task status is 3 when at least one action succeeded, so per-action status must be
 * checked individually — a successful task can still contain failed clips.
 */
export function parseRetargetActions(task: TaskResult): RetargetAction[] {
  assertSucceeded(task);
  const content = task.outputs?.[0]?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new LuxTaskError("Retarget task returned no action payload", task.taskId, task.status);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LuxTaskError(
      "Retarget payload was not valid JSON (expected a stringified { actions: [...] })",
      task.taskId,
      task.status,
    );
  }
  const actions = (parsed as { actions?: unknown })?.actions;
  if (!Array.isArray(actions)) {
    throw new LuxTaskError("Retarget payload had no actions array", task.taskId, task.status);
  }
  return actions as RetargetAction[];
}

export function successfulActions(actions: readonly RetargetAction[]): RetargetAction[] {
  return actions.filter(
    (a) => a.status === "success" && (isUsableUrl(a.animationGlbUrl) || isUsableUrl(a.fbxUrl)),
  );
}
