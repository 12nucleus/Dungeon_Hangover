import { useRef, useCallback, useEffect, useState } from 'react';
import type { AnimClip } from './animationTypes';

interface TimelineProps {
  clip: AnimClip;
  playTime: number;
  isPlaying: boolean;
  selectedKfIdx: number;
  onScrub: (time: number) => void;
  onSelectKeyframe: (idx: number) => void;
  onMoveKeyframe: (idx: number, newTime: number) => void;
  onDeleteKeyframe: (idx: number) => void;
  onChangeDuration: (dur: number) => void;
  onToggleLoop: () => void;
  onAddKeyframe: () => void;
}

export function Timeline({
  clip, playTime, selectedKfIdx,
  onScrub, onSelectKeyframe, onMoveKeyframe, onDeleteKeyframe,
  onChangeDuration, onToggleLoop, onAddKeyframe,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingKf, setDraggingKf] = useState<number | null>(null);

  const duration = clip.duration || 2;
  const trackWidth = () => trackRef.current?.clientWidth ?? 800;
  const timeToX = (t: number) => (t / duration) * trackWidth();
  const xToTime = (x: number) => (x / trackWidth()) * duration;

  const onTrackClick = useCallback((e: React.MouseEvent) => {
    if (draggingKf !== null) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    onScrub(Math.max(0, Math.min(duration, xToTime(x))));
  }, [duration, onScrub, xToTime, draggingKf]);

  const onKfMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingKf(idx);
    onSelectKeyframe(idx);
  }, [onSelectKeyframe]);

  useEffect(() => {
    if (draggingKf === null) return;
    const onMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      onMoveKeyframe(draggingKf, Math.max(0, Math.min(duration, xToTime(x))));
    };
    const onUp = () => setDraggingKf(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingKf, duration, onMoveKeyframe, xToTime]);

  const style = (s: React.CSSProperties): React.CSSProperties => s;

  return (
    <div style={style({
      flexShrink: 0, background: '#1a1612', borderTop: '1px solid #443',
      padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4,
      userSelect: 'none', minHeight: 80,
    })}>
      <div style={style({ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#998' })}>
        <button onClick={onAddKeyframe} title="Add keyframe at current time"
          style={btnStyle}>+ Key</button>
        {selectedKfIdx >= 0 && clip.keyframes.length > 1 && (
          <button onClick={() => onDeleteKeyframe(selectedKfIdx)} style={{ ...btnStyle, background: '#5a2a2a', borderColor: '#7a3a3a' }}>
            Del Key
          </button>
        )}
        <span>Dur:</span>
        <input type="number" min={0.1} max={20} step={0.1} value={duration}
          onChange={(e) => onChangeDuration(Math.max(0.1, +e.target.value))}
          style={numInputStyle} />
        <label style={{ cursor: 'pointer', color: clip.loop ? '#ffd98a' : '#998' }}>
          <input type="checkbox" checked={clip.loop} onChange={onToggleLoop} style={{ marginRight: 3 }} />
          Loop
        </label>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace' }}>
          {playTime.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
      </div>

      <div ref={trackRef}
        onClick={onTrackClick}
        style={style({
          position: 'relative', height: 36, background: '#0d0b08',
          borderRadius: 6, border: '1px solid #332', cursor: 'crosshair',
          overflow: 'visible',
        })}>
        {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
          <div key={i} style={style({
            position: 'absolute', left: timeToX(i), top: 0, width: 1,
            height: '100%', background: '#222', pointerEvents: 'none',
          })} />
        ))}
        {clip.keyframes.map((kf, i) => (
          <div key={i}
            onMouseDown={(e) => onKfMouseDown(e, i)}
            style={style({
              position: 'absolute', left: timeToX(kf.time) - 7, top: 8,
              width: 14, height: 14, borderRadius: 3,
              background: i === selectedKfIdx ? '#ffd98a' : '#6a5acd',
              border: i === selectedKfIdx ? '2px solid #fff' : '1px solid #998',
              cursor: 'grab', zIndex: draggingKf === i ? 10 : 5,
              transform: draggingKf === i ? 'scale(1.3)' : 'scale(1)',
              boxShadow: i === selectedKfIdx ? '0 0 6px #ffd98a' : 'none',
            })}
          />
        ))}
        <div style={style({
          position: 'absolute', left: timeToX(playTime), top: 0,
          width: 2, height: '100%', background: '#ff6644',
          pointerEvents: 'none', zIndex: 4,
        })} />
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '3px 8px', background: '#3a2f6a', color: '#ddd',
  border: '1px solid #5a4a8a', borderRadius: 4, cursor: 'pointer', fontSize: 11,
};

const numInputStyle: React.CSSProperties = {
  width: 50, background: '#221c14', color: '#e8e2d6', border: '1px solid #553',
  borderRadius: 4, padding: '2px 4px', fontFamily: 'monospace', fontSize: 11,
  textAlign: 'center',
};