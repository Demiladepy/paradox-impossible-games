import type { ArenaDefinition } from "../arena/types.ts";
import {
  emptyEffects,
  type GameRule,
  type RuleContext,
  type RuleEffects,
  type RuleModule,
} from "./types.ts";

/**
 * Loads validated rules and runs them every fixed step.
 *
 * Loading is deliberately total: a rule that fails validation is *rejected and reported*,
 * never partially applied. A challenge that half-loaded would be worse than one that was
 * refused, because the player would be inside a world that does not match its own
 * briefing.
 */

export interface RuleRejection {
  ruleId: string;
  type: string;
  reason: string;
}

export interface LoadReport {
  accepted: GameRule[];
  rejected: RuleRejection[];
}

/** A rule with its parameters already bound, so the engine never juggles untyped params. */
interface LoadedRule {
  rule: GameRule;
  init(ctx: RuleContext): void;
  update(ctx: RuleContext): void;
  dispose(ctx: RuleContext): void;
}

export class RuleEngine {
  private readonly modules = new Map<string, RuleModule<unknown>>();
  private loaded: LoadedRule[] = [];
  readonly effects: RuleEffects = emptyEffects();

  constructor(modules: readonly RuleModule<never>[] = []) {
    for (const module of modules) this.register(module);
  }

  register<P>(module: RuleModule<P>): void {
    if (this.modules.has(module.type)) {
      throw new Error(`A module for rule type "${module.type}" is already registered`);
    }
    this.modules.set(module.type, module as RuleModule<unknown>);
  }

  get supportedTypes(): string[] {
    return [...this.modules.keys()];
  }

  get ruleCount(): number {
    return this.loaded.length;
  }

  /**
   * Validate and bind a set of rules against an arena.
   *
   * Nothing is applied until every rule has been parsed, so a later failure cannot leave
   * earlier rules half-installed.
   */
  load(rules: readonly GameRule[], arena: ArenaDefinition, ctx: RuleContext): LoadReport {
    const accepted: GameRule[] = [];
    const rejected: RuleRejection[] = [];
    const pending: LoadedRule[] = [];
    const seenIds = new Set<string>();

    for (const rule of rules) {
      if (seenIds.has(rule.id)) {
        rejected.push({ ruleId: rule.id, type: rule.type, reason: "duplicate rule id" });
        continue;
      }
      seenIds.add(rule.id);

      const module = this.modules.get(rule.type);
      if (!module) {
        rejected.push({
          ruleId: rule.id,
          type: rule.type,
          reason: `unsupported rule type "${rule.type}" (known: ${this.supportedTypes.join(", ")})`,
        });
        continue;
      }

      const parsed = module.parse(rule, arena);
      if (!parsed.ok) {
        rejected.push({ ruleId: rule.id, type: rule.type, reason: parsed.error });
        continue;
      }

      const params = parsed.value;
      pending.push({
        rule,
        init: (c) => module.init?.(c, params),
        update: (c) => module.update(c, params),
        dispose: (c) => module.dispose?.(c, params),
      });
      accepted.push(rule);
    }

    this.unload(ctx);
    this.loaded = pending;
    for (const entry of this.loaded) entry.init(ctx);

    return { accepted, rejected };
  }

  /** Runs before the player moves, so this step acts on this step's world. */
  update(ctx: RuleContext): void {
    this.effects.phantom.clear();
    this.effects.observed.clear();
    this.effects.warning = null;

    for (const entry of this.loaded) entry.update(ctx);
  }

  unload(ctx: RuleContext): void {
    for (const entry of this.loaded) entry.dispose(ctx);
    this.loaded = [];
    this.effects.phantom.clear();
    this.effects.observed.clear();
    this.effects.warning = null;
    this.effects.upSign = 1;
  }
}
