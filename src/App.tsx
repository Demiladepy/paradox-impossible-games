import { useState } from "react";
import { GameScreen } from "./components/game/GameScreen.tsx";
import { AssetLab } from "./components/AssetLab.tsx";

type View = "play" | "assets";

/**
 * Application shell.
 *
 * `play` is the game. `assets` is the inspection harness from Milestone 0, kept because
 * it answers "what is actually in this file" faster than anything else and produces the
 * asset screenshots the project report needs.
 */
export default function App() {
  const [view, setView] = useState<View>("play");

  return (
    <div className="app">
      <nav className="topbar">
        <span className="wordmark">
          PARADOX<span className="sub">the impossible games</span>
        </span>
        <div className="tabs">
          <button className="tab" aria-pressed={view === "play"} onClick={() => setView("play")}>
            Play
          </button>
          <button
            className="tab"
            aria-pressed={view === "assets"}
            onClick={() => setView("assets")}
          >
            Asset Lab
          </button>
        </div>
        <span className="milestone">AI-designed rounds · verified before you play</span>
      </nav>

      <div className="view">{view === "play" ? <GameScreen /> : <AssetLab />}</div>
    </div>
  );
}
