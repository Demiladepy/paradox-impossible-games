import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetViewer, type ModelStats } from "./components/AssetViewer.tsx";
import { EMPTY_MANIFEST, type AssetManifest, type ManifestEntry } from "./types/manifest.ts";

const MANIFEST_URL = "/assets/generated/manifest.json";

/**
 * Milestone 0 validation harness.
 *
 * Its only job is to prove that a real Lux3D-generated GLB loads and renders in this
 * project, and to report what the file actually contains — triangle count, whether it
 * carries a skeleton, and which animation clips are really in it. Those numbers decide
 * what we can afford in the game, so they are shown rather than assumed.
 *
 * This screen is scaffolding, not the game. Milestone 1 replaces it with the arena.
 */
export default function App() {
  const [manifest, setManifest] = useState<AssetManifest>(EMPTY_MANIFEST);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: AssetManifest) => {
        if (cancelled) return;
        setManifest(data);
        setSelected((current) => current ?? data.entries[0]?.name ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = useMemo(
    () => manifest.entries.find((e) => e.name === selected) ?? null,
    [manifest, selected],
  );

  const handleStats = useCallback((next: ModelStats) => setStats(next), []);

  useEffect(() => {
    setStats(null);
    setActiveClip(null);
  }, [selected]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>Paradox</h1>
          <p>Lux3D asset validation — Milestone 0</p>
          <span className="tag">{manifest.entries.length} generated asset(s)</span>
        </div>

        {manifest.entries.length === 0 ? (
          <div className="empty">
            <p>
              No generated assets yet.{" "}
              {loadError ? <>Manifest could not be read ({loadError}).</> : null}
            </p>
            <p>Add your Lux3D Global key to <strong>.env</strong>, then generate one:</p>
            <code>npm run gen:asset -- --prompt "a cracked obsidian platform slab, sci-fi arena floor tile" --name platform-slab</code>
            <p>Or build a full contestant (text → rig → animations):</p>
            <code>npm run gen:character -- --prompt "a lean humanoid contestant in a reflective survival suit, T-pose, game character" --name contestant-01</code>
          </div>
        ) : (
          <div className="asset-list">
            {manifest.entries.map((item) => (
              <button
                key={item.name}
                className="asset"
                aria-pressed={item.name === selected}
                onClick={() => setSelected(item.name)}
              >
                <div className="name">{item.name}</div>
                <div className="meta">
                  {item.kind} · {(item.bytes / 1_048_576).toFixed(1)} MB · task {item.taskId}
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="stage">
        {entry ? (
          <>
            <AssetViewer
              url={entry.file}
              activeClip={activeClip}
              showSkeleton={showSkeleton}
              onStats={handleStats}
            />
            <ClipBar
              clips={stats?.clips ?? []}
              activeClip={activeClip}
              onPick={setActiveClip}
              showSkeleton={showSkeleton}
              onToggleSkeleton={() => setShowSkeleton((v) => !v)}
            />
            <Hud entry={entry} stats={stats} />
          </>
        ) : (
          <div className="loading">Generate an asset to begin</div>
        )}
      </main>
    </div>
  );
}

function ClipBar({
  clips,
  activeClip,
  onPick,
  showSkeleton,
  onToggleSkeleton,
}: {
  clips: string[];
  activeClip: string | null;
  onPick: (clip: string | null) => void;
  showSkeleton: boolean;
  onToggleSkeleton: () => void;
}) {
  return (
    <div className="clips">
      <button className="clip" aria-pressed={showSkeleton} onClick={onToggleSkeleton}>
        skeleton
      </button>
      {clips.map((clip) => (
        <button
          key={clip}
          className="clip"
          aria-pressed={clip === activeClip}
          onClick={() => onPick(clip === activeClip ? null : clip)}
        >
          {clip}
        </button>
      ))}
    </div>
  );
}

/** Budget above which a single in-game asset starts costing us framerate. */
const TRIANGLE_BUDGET = 40_000;

function Hud({ entry, stats }: { entry: ManifestEntry; stats: ModelStats | null }) {
  return (
    <div className="hud">
      <Row k="asset" v={entry.name} />
      <Row k="source" v={`${entry.source}${entry.version ? ` · ${entry.version}` : ""}`} />
      <Row k="task id" v={String(entry.taskId)} />
      {entry.prompt ? <Row k="prompt" v={entry.prompt} /> : null}
      {stats ? (
        <>
          <Row
            k="triangles"
            v={stats.triangles.toLocaleString()}
            tone={stats.triangles > TRIANGLE_BUDGET ? "warn" : "ok"}
          />
          <Row k="meshes" v={`${stats.meshes} (${stats.skinnedMeshes} skinned)`} />
          <Row
            k="skeleton"
            v={stats.bones > 0 ? `${stats.bones} bones` : "none"}
            tone={stats.bones > 0 ? "ok" : undefined}
          />
          <Row
            k="clips"
            v={stats.clips.length > 0 ? `${stats.clips.length}: ${stats.clips.join(", ")}` : "none"}
            tone={stats.clips.length > 0 ? "ok" : undefined}
          />
          <Row k="bbox" v={`${stats.sizeMeters.toFixed(2)} units longest side`} />
        </>
      ) : (
        <Row k="status" v="reading file…" />
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "warn" | "ok" }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className={tone ? `v ${tone}` : "v"}>{v}</span>
    </div>
  );
}
