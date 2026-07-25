import { useEffect, useRef, useState } from 'react';
import {
  JOINT_GROUPS,
  POSE_PRESETS,
  applyPose,
  poseSnippet,
  copySnippet,
  blankPose,
  createPoseStage,
  type PoseJoints,
  type PoseStageHandles,
  type JointEuler,
} from '@/game/poseEditor';

/**
 * Standalone pose editor page (mounted only under `?pose` via App.tsx).
 *
 * Completely self-contained: it builds its own THREE scene + Greg dummy via
 * `createPoseStage` — NO GameEngine, NO tavern, NO audio. The panel owns the
 * joint state in React and pushes it onto the dummy on every slider change.
 *
 * Workflow: pick a preset (or start blank) → nudge the joint sliders → type a
 * mode name → "Copy pose" → paste the printed `else if (a.mode === '<name>')`
 * block straight into the pose-preset section of `updateRig` in characters.ts.
 */

const AXES: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
const AXIS_RANGE = Math.PI * 1.5; // ±270° headroom

export function PoseEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<PoseStageHandles | null>(null);
  const [joints, setJoints] = useState<PoseJoints>(() => blankPose());
  const [presetIdx, setPresetIdx] = useState<number>(0);
  const [poseName, setPoseName] = useState('myPose');
  const [copied, setCopied] = useState(false);
  // camera sliders (local state; pushed to the stage camera on change)
  const [yaw, setYaw] = useState(-Math.PI * 0.25);
  const [pitch, setPitch] = useState(0.55);
  const [dist, setDist] = useState(4.2);

  // build the standalone stage once
  useEffect(() => {
    if (!hostRef.current || stageRef.current) return;
    const stage = createPoseStage(hostRef.current);
    stageRef.current = stage;
    // WASD orbit updates the camera in the render loop — pull those back into
    // the slider state so the sliders stay in sync (skip if already ≈equal, so
    // dragging a slider doesn't fight the key-driven updates).
    const off = stage.onCamChange((y, p, d) => {
      setYaw((cur) => Math.abs(cur - y) > 0.001 ? y : cur);
      setPitch((cur) => Math.abs(cur - p) > 0.001 ? p : cur);
      setDist((cur) => Math.abs(cur - d) > 0.001 ? d : cur);
    });
    // click-drag on a limb writes rotation deltas straight onto the 3D part —
    // pull those back into the joint slider state so the panel reflects them.
    const offJ = stage.onJointChange((jn, x, y, z) => {
      setJoints((prev) => {
        const cur = prev[jn] ?? { x: 0, y: 0, z: 0 };
        if (Math.abs(cur.x - x) < 1e-4 && Math.abs(cur.y - y) < 1e-4 && Math.abs(cur.z - z) < 1e-4) return prev;
        return { ...prev, [jn]: { x, y, z } };
      });
    });
    return () => { off(); offJ(); stage.dispose(); stageRef.current = null; };
  }, []);

  // track which joint is currently grabbed (click-drag) so we can highlight it
  const [grabbed, setGrabbed] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const g = stageRef.current?.grabbed() ?? null;
      setGrabbed((cur) => (cur === g ? cur : g));
    }, 60);
    return () => clearInterval(id);
  }, []);

  // push joint state onto the dummy whenever it changes
  useEffect(() => {
    if (stageRef.current) applyPose(stageRef.current.subject, joints);
  }, [joints]);

  // push camera controls
  useEffect(() => { stageRef.current?.camera.set(yaw, pitch, dist); }, [yaw, pitch, dist]);

  const setJointAxis = (jointName: string, axis: 'x' | 'y' | 'z', value: number) => {
    setJoints((prev) => ({
      ...prev,
      [jointName]: { ...(prev[jointName] ?? { x: 0, y: 0, z: 0 }), [axis]: value },
    }));
  };

  const loadPreset = (idx: number) => {
    setPresetIdx(idx);
    const src = POSE_PRESETS[idx].joints;
    const clone: PoseJoints = blankPose();
    for (const k of Object.keys(clone)) {
      const ej = src[k];
      if (ej) clone[k] = { x: ej.x, y: ej.y, z: ej.z };
    }
    setJoints(clone);
  };

  const doCopy = () => {
    const snip = poseSnippet(poseName.trim() || 'myPose', joints);
    copySnippet(snip);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    // eslint-disable-next-line no-console
    console.log('[pose editor snippet]\n' + snip);
  };

  const sty = (s: React.CSSProperties): React.CSSProperties => s;

  return (
    <div style={sty({ position: 'fixed', inset: 0, display: 'flex', background: '#14110d', color: '#e8e2d6', fontFamily: 'ui-monospace, monospace', fontSize: 12 })}>
      {/* ── viewport ── */}
      <div ref={hostRef} style={sty({ flex: 1, position: 'relative', minHeight: 0 })} />

      {/* ── panel ── */}
      <div style={sty({ width: 360, height: '100vh', overflowY: 'auto', padding: 10, borderLeft: '1px solid #443', background: 'rgba(20,17,13,0.95)', zIndex: 50 })}>
        <div style={sty({ fontWeight: 700, fontSize: 13, marginBottom: 4 })}>
          🎭 Pose Editor <span style={{ opacity: 0.5, fontSize: 11 }}>standalone · Greg dummy</span>
        </div>
        <div style={{ color: '#887', fontSize: 11, marginBottom: 8 }}>
          Click a limb in the view and drag to rotate it directly — sliders track live.
        </div>

        {/* camera */}
        <div style={sectionStyle}>Camera</div>
        <div style={{ color: '#887', fontSize: 11, margin: '2px 0 4px' }}>
          <b>WASD</b>{} orbit · <b>Q/E</b> (or R/F) zoom — sliders track the keys live.
        </div>
        <Slider label="yaw"   min={-Math.PI} max={Math.PI} step={0.01} value={yaw}   onChange={setYaw}   fmtRad />
        <Slider label="pitch" min={0.1}      max={1.4}     step={0.01} value={pitch} onChange={setPitch} fmtRad />
        <Slider label="dist"  min={1.5}      max={12}      step={0.1}  value={dist}  onChange={setDist} />

        {/* preset */}
        <div style={sectionStyle}>Preset</div>
        <div style={{ display: 'flex', gap: 6, margin: '4px 0', flexWrap: 'wrap' }}>
          <select style={inputStyle} value={presetIdx} onChange={(e) => loadPreset(+e.target.value)}>
            {POSE_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.label}</option>)}
          </select>
          <button style={smallBtn} onClick={() => { setPresetIdx(0); setJoints(blankPose()); }}>clear</button>
          <button style={smallBtn} onClick={() => {
            const nm = window.prompt('New pose — name it (mode key for updateRig):', 'myPose');
            setPresetIdx(0); setJoints(blankPose());
            if (nm && nm.trim()) setPoseName(nm.trim());
          }}>+ new pose</button>
        </div>

        {/* joints */}
        {JOINT_GROUPS.map((grp) => (
          <div key={grp.label}>
            <div style={sectionStyle}>{grp.label}</div>
            {grp.joints.map((jn) => {
              const e: JointEuler = joints[jn] ?? { x: 0, y: 0, z: 0 };
              return (
                <div key={jn} style={{ marginBottom: 4, outline: grabbed === jn ? '1px solid #6a5acd' : 'none', borderRadius: 4, padding: '2px 4px', background: grabbed === jn ? 'rgba(106,90,205,0.18)' : 'transparent' }}>
                  <div style={{ color: grabbed === jn ? '#d0c4ff' : '#caa', fontSize: 11, fontWeight: grabbed === jn ? 700 : 400 }}>{jn}{grabbed === jn ? ' ◀ dragging' : ''}</div>
                  {AXES.map((ax) => (
                    <Slider
                      key={ax} label={ax}
                      min={-AXIS_RANGE} max={AXIS_RANGE} step={0.01}
                      value={e[ax]} fmtRad
                      onChange={(v) => setJointAxis(jn, ax, v)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}

        {/* export */}
        <div style={sectionStyle}>Export</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}>
          <span style={{ color: '#887' }}>mode</span>
          <input style={{ ...inputStyle, flex: 1 }} value={poseName} onChange={(e) => setPoseName(e.target.value)} placeholder="myPose" />
        </div>
        <button style={btnStyle} onClick={doCopy}>{copied ? '✓ copied!' : 'Copy pose snippet'}</button>
        <div style={{ marginTop: 6, color: '#887', fontSize: 11, lineHeight: 1.4 }}>
          Paste the printed block into the pose-preset section of
          <code style={{ color: '#9ad' }}> updateRig</code> in
          <code style={{ color: '#9ad' }}> characters.ts</code>. (Also logged to the devtools console.)
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step, fmtRad }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; fmtRad?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
      <span style={{ width: 12, color: '#888' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} style={{ flex: 1 }} />
      <code style={{ minWidth: 46, textAlign: 'right', color: '#9ad' }}>
        {fmtRad ? (value / Math.PI).toFixed(2) + 'π' : value.toFixed(2)}
      </code>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  fontWeight: 700, color: '#ffd98a', marginTop: 10, marginBottom: 4,
  borderBottom: '1px solid #443', paddingBottom: 2,
};
const inputStyle: React.CSSProperties = {
  background: '#221c14', color: '#e8e2d6', border: '1px solid #553', borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 12,
};
const smallBtn: React.CSSProperties = {
  padding: '4px 8px', background: '#333', color: '#ddd', border: '1px solid #555', borderRadius: 5, cursor: 'pointer', fontSize: 11,
};
const btnStyle: React.CSSProperties = {
  marginTop: 8, padding: '6px 10px', background: '#3a2f6a', color: '#fff', border: '1px solid #6a5acd', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
};
