import type { ModelPreset } from './animationTypes';
import { MODEL_PRESETS } from './animationUtils';

interface CharacterSelectorProps {
  current: string;
  onSelect: (preset: ModelPreset) => void;
}

export function CharacterSelector({ current, onSelect }: CharacterSelectorProps) {
  return (
    <div>
      <div style={{
        fontWeight: 700, color: '#ffd98a', marginTop: 4, marginBottom: 6,
        borderBottom: '1px solid #443', paddingBottom: 2, fontSize: 12,
      }}>
        Character
      </div>
      <select
        value={current}
        onChange={(e) => {
          const p = MODEL_PRESETS.find((m) => m.id === e.target.value);
          if (p) onSelect(p);
        }}
        style={{
          width: '100%', background: '#221c14', color: '#e8e2d6',
          border: '1px solid #553', borderRadius: 4, padding: '5px 6px',
          fontFamily: 'inherit', fontSize: 12,
        }}
      >
        {MODEL_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
    </div>
  );
}