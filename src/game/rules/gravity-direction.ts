import { arenaObjectIds, type ArenaDefinition } from "../arena/types.ts";
import {
  booleanParam,
  fail,
  numberParam,
  ok,
  type GameRule,
  type ParseResult,
  type RuleModule,
} from "./types.ts";

/**
 * GRAVITY ZERO — gravity reverses on a schedule.
 *
 * Scope, stated plainly: this inverts gravity along Y, so "down" becomes "up" and the
 * player falls onto the undersides of platforms. It does not support arbitrary gravity
 * directions — walking on walls would need the character controller re-based onto an
 * arbitrary axis, and that is not something to attempt four days from a deadline.
 *
 * The flip is instantaneous, preceded by a visible countdown. An eased transition through
 * zero gravity was considered and dropped: it leaves the player floating with no control
 * authority and no clear moment of change, and it introduces a window where the gravity
 * vector is near zero, which every "which way is up" calculation then has to special-case.
 * A hard flip with two seconds of warning is both more readable and more honest.
 */

export interface GravityDirectionParams {
  /** Seconds between flips. */
  intervalSeconds: number;
  /** How long the countdown is visible before each flip. */
  warnSeconds: number;
  /** Strength, always positive; direction comes from the flip state. */
  magnitude: number;
  startInverted: boolean;
}

const SUPPORTED_TRIGGERS = new Set(["TIMER", "INTERVAL", "ALWAYS"]);

interface FlipState {
  inverted: boolean;
  nextFlipAt: number;
  /** Guards against re-applying identical gravity every single step. */
  applied: boolean;
}

const flipState = new WeakMap<GravityDirectionParams, FlipState>();

export const gravityDirection: RuleModule<GravityDirectionParams> = {
  type: "GRAVITY_DIRECTION",

  parse(rule: GameRule, arena: ArenaDefinition): ParseResult<GravityDirectionParams> {
    if (!SUPPORTED_TRIGGERS.has(rule.trigger.type)) {
      return fail(
        `${rule.id}: trigger "${rule.trigger.type}" is not supported by GRAVITY_DIRECTION ` +
          `(expected one of ${[...SUPPORTED_TRIGGERS].join(", ")})`,
      );
    }

    // Gravity is global, so targets are optional — but a named target must still exist,
    // otherwise a generated rule could quietly reference nothing at all.
    const known = new Set(arenaObjectIds(arena));
    const missing = rule.targetIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      return fail(`${rule.id}: unknown target id(s) ${missing.map((m) => `"${m}"`).join(", ")}`);
    }

    const intervalSeconds = numberParam(rule, "intervalSeconds", 8, 2, 120);
    if (!intervalSeconds.ok) return intervalSeconds;

    const warnSeconds = numberParam(rule, "warnSeconds", 2, 0, 10);
    if (!warnSeconds.ok) return warnSeconds;

    if (warnSeconds.value >= intervalSeconds.value) {
      return fail(
        `${rule.id}: warnSeconds (${warnSeconds.value}) must be shorter than intervalSeconds ` +
          `(${intervalSeconds.value}), otherwise the warning never clears`,
      );
    }

    const magnitude = numberParam(rule, "magnitude", Math.abs(arena.gravity.y), 4, 60);
    if (!magnitude.ok) return magnitude;

    const startInverted = booleanParam(rule, "startInverted", false);
    if (!startInverted.ok) return startInverted;

    return ok({
      intervalSeconds: intervalSeconds.value,
      warnSeconds: warnSeconds.value,
      magnitude: magnitude.value,
      startInverted: startInverted.value,
    });
  },

  init(ctx, params) {
    flipState.set(params, {
      inverted: params.startInverted,
      nextFlipAt: ctx.time + params.intervalSeconds,
      applied: false,
    });
  },

  update(ctx, params) {
    const state = flipState.get(params);
    if (!state) return;

    if (ctx.time >= state.nextFlipAt) {
      state.inverted = !state.inverted;
      state.applied = false;
      // Advance by whole intervals so a long frame cannot desynchronise the schedule.
      do {
        state.nextFlipAt += params.intervalSeconds;
      } while (state.nextFlipAt <= ctx.time);
    }

    const sign = state.inverted ? 1 : -1;
    if (!state.applied) {
      ctx.setGravity({ x: 0, y: sign * params.magnitude, z: 0 });
      state.applied = true;
    }

    ctx.effects.upSign = state.inverted ? -1 : 1;

    const untilFlip = state.nextFlipAt - ctx.time;
    if (untilFlip <= params.warnSeconds) {
      ctx.effects.warning = {
        message: state.inverted ? "GRAVITY RESTORING" : "GRAVITY INVERTING",
        secondsRemaining: Math.max(0, untilFlip),
      };
    }
  },

  dispose(ctx, params) {
    flipState.delete(params);
    // Hand the world back the way the arena authored it.
    ctx.setGravity(ctx.arena.gravity);
    ctx.effects.upSign = 1;
  },
};
