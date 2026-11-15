/**
 * Sound, synthesised in the browser.
 *
 * No audio files: every cue is built from oscillators and noise at runtime. That keeps the
 * download exactly where it was and means the whole soundscape is a few hundred lines
 * rather than a folder of samples we would also have to license.
 *
 * Everything is lazy and gesture-gated — browsers refuse to start an AudioContext before a
 * user interaction, and a game that throws on load because of a muted tab is worse than a
 * silent one. Every call is wrapped so audio can never take the game down.
 */

type Cue =
  | "jump"
  | "land"
  | "unmake"
  | "remake"
  | "warn"
  | "flip"
  | "win"
  | "lose"
  | "step";

class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: { osc: OscillatorNode; gain: GainNode } | null = null;
  private muted = false;

  /** Call from a user gesture. Safe to call repeatedly. */
  resume(): void {
    try {
      if (!this.context) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.context.destination);
      }
      void this.context.resume();
    } catch {
      this.context = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.context.currentTime, 0.05);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** A low bed that makes the void feel like a place rather than an empty buffer. */
  startDrone(): void {
    try {
      if (!this.context || !this.master || this.drone) return;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 42;

      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;

      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.16, this.context.currentTime, 2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.drone = { osc, gain };
    } catch {
      /* a missing drone is not worth a crash */
    }
  }

  stopDrone(): void {
    try {
      if (!this.drone || !this.context) return;
      this.drone.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
      const { osc } = this.drone;
      window.setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }, 1200);
      this.drone = null;
    } catch {
      /* ignore */
    }
  }

  play(cue: Cue): void {
    try {
      if (!this.context || !this.master || this.muted) return;
      const now = this.context.currentTime;

      switch (cue) {
        case "jump":
          this.blip(now, 320, 520, 0.12, "triangle", 0.18);
          break;
        case "land":
          this.thud(now, 0.1);
          break;
        case "step":
          this.thud(now, 0.035, 0.5);
          break;
        // Falling pitch: something that was there is not any more.
        case "unmake":
          this.blip(now, 440, 150, 0.22, "sawtooth", 0.1);
          break;
        case "remake":
          this.blip(now, 180, 430, 0.18, "triangle", 0.09);
          break;
        case "warn":
          this.blip(now, 740, 740, 0.09, "square", 0.08);
          break;
        case "flip":
          this.sweep(now, 90, 620, 0.5);
          break;
        case "win":
          this.chord(now, [392, 523.25, 659.25], 0.9);
          break;
        case "lose":
          this.blip(now, 240, 70, 0.8, "sawtooth", 0.16);
          break;
      }
    } catch {
      /* never let a sound break a frame */
    }
  }

  private blip(
    at: number,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    level: number,
  ): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** Filtered noise burst — footsteps and landings. */
  private thud(at: number, duration: number, level = 1): void {
    if (!this.context || !this.master) return;
    const frames = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, Math.max(1, frames), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;

    const gain = this.context.createGain();
    gain.gain.value = 0.22 * level;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(at);
  }

  private sweep(at: number, from: number, to: number, duration: number): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);

    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private chord(at: number, frequencies: number[], duration: number): void {
    frequencies.forEach((frequency, index) => {
      this.blip(at + index * 0.07, frequency, frequency, duration - index * 0.07, "triangle", 0.12);
    });
  }
}

export const sound = new SoundEngine();
