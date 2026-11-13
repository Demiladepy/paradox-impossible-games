import { useEffect, useRef } from "react";
import type { PlayerInput } from "../game/player/controller.ts";

/**
 * Keyboard and pointer-lock mouse input.
 *
 * Everything lands in a ref rather than React state: input is read once per frame inside
 * `useFrame`, and re-rendering the React tree sixty times a second to deliver a keypress
 * would be wasteful and would fight the renderer.
 */

export interface InputSnapshot extends PlayerInput {
  deltaYaw: number;
  deltaPitch: number;
}

export interface InputHandle {
  /** Reads current input and clears the accumulated mouse delta. */
  consume(): InputSnapshot;
  /** Edge-triggered: true once per press. */
  consumePressed(action: "toggleCamera" | "restart"): boolean;
  isPointerLocked(): boolean;
}

const MOUSE_SENSITIVITY = 0.0022;

export function useInput(targetRef: React.RefObject<HTMLElement | null>): InputHandle {
  const keys = useRef(new Set<string>());
  const mouse = useRef({ yaw: 0, pitch: 0 });
  const pressed = useRef({ toggleCamera: false, restart: false });
  const locked = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const code = event.code;
      if (!keys.current.has(code)) {
        if (code === "KeyV") pressed.current.toggleCamera = true;
        if (code === "KeyR") pressed.current.restart = true;
      }
      keys.current.add(code);
      // Space scrolls the page; arrows do too. Neither should.
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);

    // A lost window must not leave a key stuck down.
    const clearKeys = () => keys.current.clear();

    const onMouseMove = (event: MouseEvent) => {
      if (!locked.current) return;
      mouse.current.yaw += event.movementX * MOUSE_SENSITIVITY;
      mouse.current.pitch += event.movementY * MOUSE_SENSITIVITY;
    };

    const onPointerLockChange = () => {
      locked.current = document.pointerLockElement === targetRef.current;
      if (!locked.current) clearKeys();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, [targetRef]);

  // Requesting pointer lock must happen in a user gesture.
  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;
    const onClick = () => {
      if (document.pointerLockElement !== element) void element.requestPointerLock();
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [targetRef]);

  const handle = useRef<InputHandle>({
    consume: () => {
      const held = keys.current;
      const axis = (positive: string[], negative: string[]): number =>
        (positive.some((k) => held.has(k)) ? 1 : 0) - (negative.some((k) => held.has(k)) ? 1 : 0);

      const snapshot: InputSnapshot = {
        forward: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
        right: axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]),
        jump: held.has("Space"),
        sprint: held.has("ShiftLeft") || held.has("ShiftRight"),
        deltaYaw: mouse.current.yaw,
        deltaPitch: mouse.current.pitch,
      };
      mouse.current.yaw = 0;
      mouse.current.pitch = 0;
      return snapshot;
    },
    consumePressed: (action) => {
      const value = pressed.current[action];
      pressed.current[action] = false;
      return value;
    },
    isPointerLocked: () => locked.current,
  });

  return handle.current;
}
