import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Press C to save the current frame at full render resolution.
 *
 * Screenshots of this game were being taken by photographing the window, which caps out at
 * whatever the window happens to be and bakes in browser chrome. The renderer already holds
 * a much better image than that — at High quality the drawing buffer is close to 2000px
 * wide — so this just asks it for one.
 *
 * It reads the WebGL buffer directly, which only works when the context keeps its contents
 * after compositing. That is why both canvases set `preserveDrawingBuffer`. The cost is a
 * little memory bandwidth per frame; the benefit is that the single most important asset in
 * the submission is not a photograph of a window.
 *
 * The capture is the 3D render alone — the HUD is DOM and sits outside the canvas. For a
 * screenshot that is usually what you want: a clean frame with no overlay.
 *
 * In dev, a copy is also posted to the Vite server so it lands in the repo without going
 * through the browser's download folder; see `captureApi` in vite.config.ts. That request
 * failing is not an error worth surfacing — the download has already happened.
 */
export function Capture() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "c" && event.key !== "C") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Draw once more immediately before reading: with a post-processing composer in the
      // chain, whatever is in the buffer at an arbitrary moment may be an intermediate
      // pass rather than the finished frame.
      gl.render(scene, camera);

      const url = gl.domElement.toDataURL("image/png");
      const name = `paradox-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;

      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();

      if (import.meta.env.DEV) {
        void fetch("/api/shot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, dataUrl: url }),
        }).catch(() => {
          /* the download already succeeded; this copy is a convenience */
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gl, scene, camera]);

  return null;
}
