import type { JointEuler } from './animationTypes';
import { JOINT_GROUPS } from './animationTypes';

interface JointPanelProps {
  joints: Record<string, JointEuler>;
  grabbed: string | null;
  onJointChange: (joint: string, axis: 'x' | 'y' | 'z', value: number) => void;
}

const AXES: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
const AXIS_RANGE = Math.PI * 1.5;

export function JointPanel({ joints, grabbed, onJointChange }: JointPanelProps) {
  const s = (st: React.CSSProperties): React.CSSProperties => st;

  return (
    <div style={s({ overflowY: 'auto', flex: 1 })}>
      {JOINT_GROUPS.map((grp) => (
        <div key={grp.label}>
          <div style={sectionStyle}>{grp.label}</div>
          {grp.joints.map((jn) => {
            const e = joints[jn] ?? { x: 0, y: 0, z: 0 };
            const isDragging = grabbed === jn;
            return (
              <div key={jn} style={s({
                marginBottom: 4, padding: '2px 4px', borderRadius: 4,
                outline: isDragging ? '1px solid #6a5acd' : 'none',
                background: isDragging ? 'rgba(106,90,205,0.18)' : 'transparent',
              })}>
                <div style={s({
                  color: isDragging ? '#d0c4ff' : '#caa', fontSize: 11,
                  fontWeight: isDragging ? 700 : 400,
                })}>
                  {jn}{isDragging ? ' \u25C0 dragging' : ''}
                </div>
                {AXES.map((ax) => (
                  <SliderRow
                    key={ax} label={ax}
                    value={e[ax]}
                    onChange={(v) => onJointChange(jn, ax, v)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SliderRow({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
      <span style={{ width: 12, color: '#888', fontSize: 10 }}>{label}</span>
      <input
        type="range"
        min={-AXIS_RANGE} max={AXIS_RANGE} step={0.01}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ flex: 1 }}
      />
      <code style={{ minWidth: 40, textAlign: 'right', color: '#9ad', fontSize: 10 }}>
        {(value / Math.PI).toFixed(2)}&pi;
      </code>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  fontWeight: 700, color: '#ffd98a', marginTop: 10, marginBottom: 4,
  borderBottom: '1px solid #443', paddingBottom: 2, fontSize: 12,
};