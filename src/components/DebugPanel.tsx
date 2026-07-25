import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import {
  editorState,
  readCamera,
  writeCamera,
  readActors,
  writeActor,
  cameraSnippet,
  boxSnippet,
  actorSnippet,
  copySnippet,
  clamp,
  type EditorCameraValues,
  type EditorActorValues,
} from '@/game/editor';

/**
 * Live cutscene / level tweaker.
 * Renders only when the URL has `?debug`. The panel polls the engine's
 * IsoCamera + tavernActor references at ~20Hz (cheap — just reading a
 * handful of numbers) and pushes slider edits back live. "Copy" buttons
 * emit the exact one-liners a beat in cutscenes.ts uses, so you tune a
 * shot, copy, and paste straight into the source.
 */
export function DebugPanel({ engine }: { engine: GameEngine | null }) {
  const [, force] = useState(0);
  const handlesRef = useRef<ReturnType<GameEngine['getEditorHandles']> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const cam = useRef<EditorCameraValues>({
    yaw: 0, pitch: 0, dist: 0, lerp: 0,
    focusX: 0, focusY: 0, focusZ: 0,
  });

  // resolve handles once the engine is ready
  useEffect(() => {
    if (!engine) return;
    if (!handlesRef.current) handlesRef.current = engine.getEditorHandles();
    // NOTE: the engine decides whether to build the tavern — entering
    // editor mode only happens once via GameCanvas (?debug path).
  }, [engine]);

  // polling loop — read live values so sliders track external camera moves
  useEffect(() => {
    const id = setInterval(() => {
      const h = handlesRef.current;
      if (!h) return;
      const live = readCamera(h.iso);
      // only override fields the user isn't actively dragging
      cam.current = live;
      force((n) => (n + 1) & 0xffff);
    }, 50);
    return () => clearInterval(id);
  }, []);

  if (!engine || !handlesRef.current) return null;
  const h = handlesRef.current;

  // ── camera setters (mutate live + refresh local) ──
  const setCam = (patch: Partial<EditorCameraValues>) => {
    writeCamera(h.iso, patch, h.focusTarget);
    cam.current = { ...cam.current, ...patch };
    force((n) => (n + 1) & 0xffff);
  };

  // ── actors ──
  const actors = readActors(h.tavern, h.tavernActors);
  void readActors; // guard against accidental dead-code elision

  // ── copy actions ──
  const copyCam = () => {
    const snap = readCamera(h.iso);
    copySnippet(cameraSnippet(snap));
  };
  const copyBox = () => {
    const b = h.iso?.box;
    if (b) copySnippet(boxSnippet(b));
  };
  const copyActor = (a: EditorActorValues) => {
    writeActor(h.tavernActors, a.id, {});   // ensure still present
    copySnippet(actorSnippet(a));
  };

  const s = editorState;

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>🎬 Cutscene/Level Editor <span style={{ opacity: 0.5, fontSize: 11 }}>Tier 1</span></div>

      {/* ── CAMERA ── */}
      <div style={sectionStyle}>Camera</div>
      <div style={rowStyle}>yaw
        <input type="range" min={-Math.PI} max={Math.PI} step={0.01}
          value={cam.current.yaw}
          onChange={(e) => setCam({ yaw: +e.target.value })} />
        <code style={valStyle}>{cam.current.yaw.toFixed(2)}</code>
      </div>
      <div style={rowStyle}>pitch
        <input type="range" min={0.1} max={1.4} step={0.01}
          value={cam.current.pitch}
          onChange={(e) => setCam({ pitch: clamp(+e.target.value, 0.1, 1.4) })} />
        <code style={valStyle}>{cam.current.pitch.toFixed(2)}</code>
      </div>
      <div style={rowStyle}>dist
        <input type="range" min={2} max={20} step={0.1}
          value={cam.current.dist}
          onChange={(e) => setCam({ dist: +e.target.value })} />
        <code style={valStyle}>{cam.current.dist.toFixed(2)}</code>
      </div>
      <div style={rowStyle}>lerp
        <input type="range" min={0.5} max={10} step={0.1}
          value={cam.current.lerp}
          onChange={(e) => setCam({ lerp: +e.target.value })} />
        <code style={valStyle}>{cam.current.lerp.toFixed(2)}</code>
      </div>
      <div style={subSectionStyle}>focus point</div>
      <div style={rowStyle}>x
        <input type="range" min={-5} max={5} step={0.05}
          value={cam.current.focusX}
          onChange={(e) => setCam({ focusX: +e.target.value })} />
        <code style={valStyle}>{cam.current.focusX.toFixed(2)}</code>
      </div>
      <div style={rowStyle}>y
        <input type="range" min={0} max={4} step={0.05}
          value={cam.current.focusY}
          onChange={(e) => setCam({ focusY: +e.target.value })} />
        <code style={valStyle}>{cam.current.focusY.toFixed(2)}</code>
      </div>
      <div style={rowStyle}>z
        <input type="range" min={-5} max={6} step={0.05}
          value={cam.current.focusZ}
          onChange={(e) => setCam({ focusZ: +e.target.value })} />
        <code style={valStyle}>{cam.current.focusZ.toFixed(2)}</code>
      </div>
      <button style={btnStyle} onClick={copyCam}>📋 Copy camera beat</button>
      <button style={btnStyle} onClick={copyBox}>📋 Copy iso.box clamp</button>

      {/* ── ACTORS ── */}
      <div style={sectionStyle}>Tavern actors</div>
      {actors.length === 0 && (
        <div style={{ fontSize: 11, opacity: 0.6, padding: '4px 6px' }}>
          No tavern built yet — make sure the engine entered editor mode.
        </div>
      )}
      {actors.map((a) => {
        const open = selected === a.id;
        return (
          <div key={a.id} style={actorRowStyle}>
            <div
              style={{ cursor: 'pointer', padding: '3px 6px', fontWeight: open ? 700 : 400 }}
              onClick={() => setSelected(open ? null : a.id)}>
              {open ? '▾' : '▸'} {a.id}
            </div>
            {open && (
              <div style={{ padding: '4px 6px' }}>
                <ActorInput label="x" value={a.x} step={0.05} min={-5} max={5}
                  onCommit={(v) => {
                    writeActor(h.tavernActors, a.id, { x: v });
                    force((n) => (n + 1) & 0xffff);
                  }} />
                <ActorInput label="y" value={a.y} step={0.05} min={0} max={3}
                  onCommit={(v) => {
                    writeActor(h.tavernActors, a.id, { y: v });
                    force((n) => (n + 1) & 0xffff);
                  }} />
                <ActorInput label="z" value={a.z} step={0.05} min={-5} max={6}
                  onCommit={(v) => {
                    writeActor(h.tavernActors, a.id, { z: v });
                    force((n) => (n + 1) & 0xffff);
                  }} />
                <ActorInput label="yaw" value={a.yaw} step={0.05} min={-Math.PI} max={Math.PI}
                  onCommit={(v) => {
                    writeActor(h.tavernActors, a.id, { yaw: v });
                    force((n) => (n + 1) & 0xffff);
                  }} />
                <button style={btnStyle} onClick={() => copyActor(readActors(h.tavern, h.tavernActors).find((x) => x.id === a.id)!)}>
                  📋 Copy addNpc line
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── status ── */}
      {s.lastCopied && (
        <div style={{ ...boxStyle, marginTop: 6 }}>
          <div style={{ opacity: 0.6, fontSize: 10 }}>last copied:</div>
          <code style={{ fontSize: 10, wordBreak: 'break-word' }}>{s.lastCopied}</code>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 10, opacity: 0.45 }}>
        Tip: paste printed lines into cutscenes.ts beats. Engine stays idle in this view.
      </div>
    </div>
  );
}

/** actor row input — drag then commit on release so it doesn't fight the live poller */
function ActorInput({
  label, value, step, min, max, onCommit,
}: {
  label: string; value: number; step: number; min: number; max: number;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div style={rowStyle}>
      <span style={{ width: 28, display: 'inline-block' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => setV(+e.target.value)}
        onPointerUp={() => onCommit(v)} />
      <code style={valStyle}>{v.toFixed(2)}</code>
    </div>
  );
}

// ── inline styles (keeps the editor zero-config; no Tailwind deps in here) ──
const panelStyle: React.CSSProperties = {
  position: 'fixed', top: 12, right: 12, width: 290, maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto', padding: 10, zIndex: 9999,
  background: 'rgba(20,18,16,0.92)', color: '#e8e0d0',
  border: '1px solid #5a4a3a', borderRadius: 8,
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12,
  boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(2px)',
};
const titleStyle: React.CSSProperties = { fontWeight: 700, marginBottom: 6 };
const sectionStyle: React.CSSProperties = {
  marginTop: 8, marginBottom: 2, padding: '2px 6px',
  background: 'rgba(90,74,58,0.4)', borderRadius: 4, fontWeight: 700,
};
const subSectionStyle: React.CSSProperties = {
  marginTop: 4, marginBottom: 2, padding: '1px 6px', opacity: 0.7, fontSize: 10,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '1px 6px',
};
const valStyle: React.CSSProperties = { minWidth: 42, fontSize: 10, textAlign: 'right' };
const btnStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 4,
  padding: '4px 6px', fontSize: 11, cursor: 'pointer',
  background: '#3a2e22', color: '#e8e0d0',
  border: '1px solid #6a5a3a', borderRadius: 4,
};
const actorRowStyle: React.CSSProperties = { borderBottom: '1px solid rgba(90,74,58,0.4)' };
const boxStyle: React.CSSProperties = {
  padding: 4, background: 'rgba(40,30,20,0.6)', borderRadius: 4,
};
