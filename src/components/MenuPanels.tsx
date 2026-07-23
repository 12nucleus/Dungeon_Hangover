import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GameEngine } from '@/game/engine';
import type { GameSettings, SaveSlotMeta } from '@/game/save';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/** Slot picker shared by the title screen and the pause menu. */
export function SlotPicker({ engineRef, intent, onPick, onBack }: {
  engineRef: MutableRefObject<GameEngine | null>;
  intent: 'new' | 'load';
  onPick: (slotId: string) => void;
  onBack: () => void;
}) {
  const [slots, setSlots] = useState<Record<string, SaveSlotMeta | null>>({});

  const refresh = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const next: Record<string, SaveSlotMeta | null> = {};
    for (let i = 1; i <= eng.maxSlots; i++) next[`slot${i}`] = eng.getSlotMeta(`slot${i}`);
    setSlots(next);
  };

  // refresh once when the panel mounts (the engine is already initialized)
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <>
      <div className="splash__panel-title">{intent === 'load' ? 'LOAD GAME' : 'NEW GAME — choose a slot'}</div>
      <div className="splash__slots">
        {Object.entries(slots).map(([id, meta]) => (
          <div className="splash__slot" key={id}>
            <div className="splash__slot-info">
              <div className="splash__slot-name">{meta ? meta.name : 'Empty Slot'}</div>
              <div className="splash__slot-sub">
                {meta ? `Floor ${meta.floor} · ${fmtTime(meta.timestamp)}` : 'No save yet'}
              </div>
            </div>
            <div className="splash__slot-actions">
              {intent === 'load' ? (
                <button className="splash__btn splash__btn--sm" disabled={!meta} onClick={() => onPick(id)}>Load</button>
              ) : (
                <button className="splash__btn splash__btn--sm" onClick={() => onPick(id)}>{meta ? 'Overwrite' : 'Start'}</button>
              )}
              {meta && (
                <button
                  className="splash__btn splash__btn--sm splash__btn--danger"
                  onClick={() => { engineRef.current?.deleteSlot(id); refresh(); }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="splash__btn splash__btn--back" onClick={onBack}>← Back</button>
    </>
  );
}

/** Volume / mute settings panel shared by the title screen and pause menu. */
export function SettingsPanel({ engineRef, onBack }: {
  engineRef: MutableRefObject<GameEngine | null>;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<GameSettings | null>(null);
  useEffect(() => { const eng = engineRef.current; if (eng) setSettings(eng.getSettings()); }, []);

  const apply = (patch: Partial<GameSettings>) => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = { ...(settings ?? eng.getSettings()), ...patch };
    setSettings(next);
    eng.setSettings(next);
  };

  if (!settings) return null;
  return (
    <>
      <div className="splash__panel-title">SETTINGS</div>
      <div className="splash__settings">
        <label className="splash__set-row">
          <span>Master Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={settings.master}
            onChange={(e) => apply({ master: Number(e.target.value) })} />
        </label>
        <label className="splash__set-row">
          <span>SFX Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={settings.sfx}
            onChange={(e) => apply({ sfx: Number(e.target.value) })} />
        </label>
        <label className="splash__set-row">
          <span>Music Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={settings.music}
            onChange={(e) => apply({ music: Number(e.target.value) })} />
        </label>
        <label className="splash__set-row splash__set-row--toggle">
          <span>Mute</span>
          <input type="checkbox" checked={settings.muted} onChange={(e) => apply({ muted: e.target.checked })} />
        </label>
      </div>
      <button className="splash__btn splash__btn--back" onClick={onBack}>← Back</button>
    </>
  );
}
