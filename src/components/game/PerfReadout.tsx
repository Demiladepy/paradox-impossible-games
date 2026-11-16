import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Frame rate and draw statistics, read straight off the renderer.
 *
 * This exists because the one thing we could never measure during development was frame
 * rate: the preview pane runs as a background page and throttles, so every timing number
 * taken through it is worthless. Rather than guess at performance, the game carries the
 * instrument and whoever plays it on a real window can read the truth.
 *
 * `renderer.info` is exact and free — three.js is already counting these.
 */

export interface PerfSample {
  fps: number;
  triangles: number;
  calls: number;
}

/** Lives inside the Canvas; reports out through a callback. */
export function PerfProbe({ onSample }: { onSample: (sample: PerfSample) => void }) {
  const { gl } = useThree();
  const frames = useRef(0);
  const since = useRef(performance.now());

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    const elapsed = now - since.current;

    // Average over roughly half a second: per-frame numbers are too noisy to read.
    if (elapsed >= 500) {
      onSample({
        fps: Math.round((frames.current * 1000) / elapsed),
        triangles: gl.info.render.triangles,
        calls: gl.info.render.calls,
      });
      frames.current = 0;
      since.current = now;
    }
  });

  return null;
}

/** The panel itself. Toggled with P so it never appears in a recording by accident. */
export function PerfPanel({ sample }: { sample: PerfSample | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "KeyP") setVisible((shown) => !shown);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible || !sample) return null;

  // 55 is the threshold where a recording starts to look like it is struggling.
  const healthy = sample.fps >= 55;

  return (
    <div className="hud perf-panel">
      <div className="row">
        <span className="k">fps</span>
        <span className={`v ${healthy ? "ok" : "bad"}`}>{sample.fps}</span>
      </div>
      <div className="row">
        <span className="k">triangles</span>
        <span className="v">{sample.triangles.toLocaleString()}</span>
      </div>
      <div className="row">
        <span className="k">draw calls</span>
        <span className="v">{sample.calls}</span>
      </div>
    </div>
  );
}
