import { useRef } from "react";
import { sound } from "../audio/sound.ts";
import type { RoundSnapshot } from "../game/progression/round.ts";

/**
 * Turns simulation state into sound.
 *
 * Audio is a *view* of the simulation, exactly like the renderer: this diffs successive
 * snapshots and plays a cue when something changes. The game loop knows nothing about it,
 * so a muted tab, a missing AudioContext or a browser that refuses to start one cannot
 * affect what actually happens in the round.
 *
 * The cues are chosen to carry information the player would otherwise have to read off the
 * HUD: a platform coming apart has a falling pitch, one returning has a rising one, and the
 * gravity countdown ticks once a second so you can hear it coming while looking elsewhere.
 */
export function useGameAudio(): (snapshot: RoundSnapshot) => void {
  const previous = useRef<{
    grounded: boolean;
    phantom: string[];
    upSign: number;
    status: string;
    warningSecond: number;
    stepTimer: number;
  }>({
    grounded: true,
    phantom: [],
    upSign: 1,
    status: "running",
    warningSecond: -1,
    stepTimer: 0,
  });

  return (snapshot: RoundSnapshot) => {
    const prior = previous.current;
    const { player, rules, status, elapsed } = snapshot.game;

    // Jump and landing.
    if (prior.grounded && !player.grounded && player.locomotion === "rise") sound.play("jump");
    if (!prior.grounded && player.grounded) sound.play("land");

    // Footsteps, paced by how fast the player is actually moving.
    if (player.grounded && player.speed > 1.2) {
      const interval = Math.max(0.22, 0.62 - player.speed * 0.04);
      if (elapsed - prior.stepTimer > interval) {
        sound.play("step");
        prior.stepTimer = elapsed;
      }
    } else {
      prior.stepTimer = elapsed;
    }

    // Ground coming apart, and coming back.
    for (const id of rules.phantom) {
      if (!prior.phantom.includes(id)) sound.play("unmake");
    }
    for (const id of prior.phantom) {
      if (!rules.phantom.includes(id)) sound.play("remake");
    }

    // One tick per second of the gravity countdown.
    if (rules.warning) {
      const second = Math.ceil(rules.warning.secondsRemaining);
      if (second !== prior.warningSecond) {
        sound.play("warn");
        prior.warningSecond = second;
      }
    } else {
      prior.warningSecond = -1;
    }

    if (rules.upSign !== prior.upSign) sound.play("flip");

    if (status !== prior.status && prior.status === "running") {
      sound.play(status === "won" ? "win" : "lose");
    }

    previous.current = {
      grounded: player.grounded,
      phantom: [...rules.phantom],
      upSign: rules.upSign,
      status,
      warningSecond: prior.warningSecond,
      stepTimer: prior.stepTimer,
    };
  };
}
