import type { AnimClip, AnimKeyframe, AnimProject, JointEuler, JointSnapshot, ModelPreset } from './animationTypes';
import { JOINT_NAMES } from './animationTypes';

export function blankPose(): JointSnapshot {
  const z = (): JointEuler => ({ x: 0, y: 0, z: 0 });
  const out = {} as JointSnapshot;
  for (const n of JOINT_NAMES) out[n] = z();
  return out;
}

export function clonePose(src: JointSnapshot): JointSnapshot {
  const out = {} as JointSnapshot;
  for (const n of JOINT_NAMES) {
    const e = src[n];
    out[n] = e ? { x: e.x, y: e.y, z: e.z } : { x: 0, y: 0, z: 0 };
  }
  return out;
}

export function interpolatePose(a: JointSnapshot, b: JointSnapshot, t: number): JointSnapshot {
  const out = {} as JointSnapshot;
  for (const n of JOINT_NAMES) {
    const ae = a[n] ?? { x: 0, y: 0, z: 0 };
    const be = b[n] ?? { x: 0, y: 0, z: 0 };
    out[n] = {
      x: ae.x + (be.x - ae.x) * t,
      y: ae.y + (be.y - ae.y) * t,
      z: ae.z + (be.z - ae.z) * t,
    };
  }
  return out;
}

export function getPoseAtTime(clip: AnimClip, time: number): JointSnapshot {
  if (clip.keyframes.length === 0) return blankPose();
  if (clip.keyframes.length === 1) return clonePose(clip.keyframes[0].joints);

  let t = time;
  if (clip.loop && clip.duration > 0) {
    t = ((t % clip.duration) + clip.duration) % clip.duration;
  }

  const kfs = clip.keyframes;
  let a = kfs[0], b = kfs[0];
  for (let i = 0; i < kfs.length; i++) {
    if (kfs[i].time >= t) {
      if (i === 0) return clonePose(kfs[0].joints);
      a = kfs[i - 1]; b = kfs[i];
      break;
    }
    a = kfs[i]; b = kfs[i];
  }
  if (t >= kfs[kfs.length - 1].time) return clonePose(kfs[kfs.length - 1].joints);

  const range = b.time - a.time;
  const frac = range > 0 ? (t - a.time) / range : 0;
  return interpolatePose(a.joints, b.joints, frac);
}

export function newClip(name: string, loop: boolean): AnimClip {
  const first: AnimKeyframe = { time: 0, joints: blankPose() };
  return { name, duration: name === 'idle' ? 2 : name === 'walk' ? 1 : 1, loop, keyframes: [first] };
}

export function defaultProject(): AnimProject {
  return {
    name: 'Untitled',
    clips: [
      newClip('idle', true),
      newClip('walk', true),
    ],
    modelType: 'player',
    modelConfig: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'sword',
  };
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'player', label: 'Player (Greg)',
    scheme: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'sword',
  },
  {
    id: 'player_staff', label: 'Wizard Greg',
    scheme: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'staff',
  },
  {
    id: 'player_torch', label: 'Greg (torch)',
    scheme: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'torch',
  },
  {
    id: 'player_bow', label: 'Greg (bow)',
    scheme: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'bow',
  },
  {
    id: 'player_dagger', label: 'Greg (dagger)',
    scheme: { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    weapon: 'dagger',
  },
  {
    id: 'goblin', label: 'Goblin (chibi)',
    scheme: { skin: 0x5a7a3a, cloth: 0x5a3a1a, accent: 0x3a2a0a, hair: 0x1a1000, hood: false, style: 'chibi', bulk: 0.85 },
    weapon: 'dagger',
  },
  {
    id: 'orc', label: 'Orc',
    scheme: { skin: 0x5a7a3a, cloth: 0x4a3a2a, accent: 0x2a1a0a, hair: 0x1a1005, hood: false, style: 'chibi', orc: true, bulk: 1.0 },
    weapon: 'club',
  },
  {
    id: 'rat', label: 'Rat',
    scheme: { skin: 0x5a4a3a, cloth: 0x8a7a6a, accent: 0x9a7060, hair: 0x1a1008, hood: false, style: 'normal', monster: 'rat' },
    weapon: null,
  },
  {
    id: 'bat', label: 'Bat',
    scheme: { skin: 0x3a3a4a, cloth: 0x4a4a5a, accent: 0x5a5a6a, hair: 0xff4444, hood: false, style: 'normal', monster: 'bat' },
    weapon: null,
  },
  {
    id: 'skeleton', label: 'Skeleton',
    scheme: { skin: 0xe8e0c8, cloth: 0x4a3a2a, accent: 0x3a2a1a, hair: 0xff4444, hood: false, style: 'normal', monster: 'skeleton' },
    weapon: 'sword',
  },
  {
    id: 'wizard', label: 'Wizard NPC',
    scheme: { skin: 0xf0d9b5, cloth: 0x2a2a6a, accent: 0x1a1a3a, hair: 0xd0d0d0, hood: false, style: 'normal', kind: 'wizard' },
    weapon: 'staff',
  },
  {
    id: 'barmaid', label: 'Barmaid NPC',
    scheme: { skin: 0xf0d9b5, cloth: 0x8a2a2a, accent: 0x5a1a1a, hair: 0x6a3a1a, hood: false, style: 'normal', kind: 'barmaid' },
    weapon: null,
  },
  {
    id: 'bouncer', label: 'Bouncer NPC',
    scheme: { skin: 0xe0c9a5, cloth: 0x2a2a2a, accent: 0x1a1a1a, hair: 0x3a2a1a, hood: false, style: 'normal', kind: 'bouncer', bulk: 1.1 },
    weapon: 'club',
  },
  {
    id: 'barkeep', label: 'Barkeep NPC',
    scheme: { skin: 0xe0c9a5, cloth: 0x5a4a3a, accent: 0x3a2a1a, hair: 0x4a3a2a, hood: false, style: 'normal', kind: 'barkeep' },
    weapon: null,
  },
];

export function poseToCodeSnippet(modeName: string, joints: JointSnapshot): string {
  const lines: string[] = [];
  lines.push(`  } else if (a.mode === '${modeName}') {`);
  const f = (n: number) => {
    const s = n.toFixed(3);
    return s.replace(/\.?0+$/, '');
  };
  const e = (v: number | undefined) => v !== undefined && v !== 0 ? f(v) : null;

  const torsoX = e(joints.torso?.x);
  const headX = e(joints.head?.x);
  if (torsoX) lines.push(`    torsoX = ${torsoX};`);
  if (headX) lines.push(`    headX = ${headX};`);

  const armLX = e(joints.armL?.x); const armLZ = e(joints.armL?.z);
  const armRX = e(joints.armR?.x); const armRZ = e(joints.armR?.z);
  if (armLX) lines.push(`    armLX = ${armLX};`);
  if (armLZ) lines.push(`    armLZ = ${armLZ};`);
  if (armRX) lines.push(`    armRX = ${armRX};`);
  if (armRZ) lines.push(`    armRZ = ${armRZ};`);

  const elbowL = e(joints.foreL?.x); const elbowLZ = e(joints.foreL?.z);
  const elbowR = e(joints.foreR?.x); const elbowRZ = e(joints.foreR?.z);
  if (elbowL) lines.push(`    elbowL = ${elbowL};`);
  if (elbowLZ) lines.push(`    elbowLZ = ${elbowLZ};`);
  if (elbowR) lines.push(`    elbowR = ${elbowR};`);
  if (elbowRZ) lines.push(`    elbowRZ = ${elbowRZ};`);

  const wristL = e(joints.wristL?.x); const wristR = e(joints.wristR?.x);
  if (wristL) lines.push(`    wristL = ${wristL};`);
  if (wristR) lines.push(`    wristR = ${wristR};`);

  const legLX = e(joints.legL?.x); const legRX = e(joints.legR?.x);
  if (legLX) lines.push(`    legLX = ${legLX};`);
  if (legRX) lines.push(`    legRX = ${legRX};`);

  const kneeL = e(joints.shinL?.x); const kneeR = e(joints.shinR?.x);
  if (kneeL) lines.push(`    kneeL = ${kneeL};`);
  if (kneeR) lines.push(`    kneeR = ${kneeR};`);

  lines.push('  }');
  return lines.join('\n');
}

export function projectToJSON(project: AnimProject): string {
  return JSON.stringify(project, null, 2);
}

export function projectFromJSON(json: string): AnimProject | null {
  try {
    const obj = JSON.parse(json) as AnimProject;
    if (!obj.clips || !Array.isArray(obj.clips)) return null;
    return obj;
  } catch { return null; }
}

export function copyToClipboard(text: string): void {
  try { if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(text); return; } } catch { /* fallthrough */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  } catch { /* ignore */ }
}

/**
 * Format a joint euler as a compact numeric literal (no trailing zeros).
 */
function fmt(n: number): string { const s = n.toFixed(3); return s.replace(/\.?0+$/, ''); }

/**
 * Generate a complete, ready-to-use TypeScript module that defines a clip
 * and shows how to wire it into updateRig().
 *
 * The output is a self-contained .ts file. Save it, import the clip in
 * characters.ts, add the one-liner in updateRig() below the existing
 * pose presets, and the animation plays in-game pixel-identical to the editor.
 */
export function clipToCodeModule(clip: AnimClip): string {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Clip "${clip.name}" — exported from the Animation Editor.`);
  lines.push(` * Duration: ${clip.duration}s  Loop: ${clip.loop}  Keyframes: ${clip.keyframes.length}`);
  lines.push(` *`);
  lines.push(` * USAGE (in src/game/characters.ts updateRig):`);
  lines.push(` *`);
  lines.push(` *   1. Import at the top:`);
  lines.push(` *        import { playClipOnRig } from '@/animationEditor/AnimationRuntime';`);
  lines.push(` *        import { ${clip.name}Clip } from '@/animationData/${clip.name}Clip';`);
  lines.push(` *`);
  lines.push(` *   2. Add in the pose-presets section (after the else-if chain):`);
  lines.push(` *        } else if (a.mode === '${clip.name}') {`);
  lines.push(` *          playClipOnRig(rig, ${clip.name}Clip, a.t);`);
  lines.push(` *          return;`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { AnimClip } from '@/animationEditor/animationTypes';`);
  lines.push(``);
  lines.push(`export const ${clip.name}Clip: AnimClip = {`);
  lines.push(`  name: '${clip.name}',`);
  lines.push(`  duration: ${fmt(clip.duration)},`);
  lines.push(`  loop: ${clip.loop},`);
  lines.push(`  keyframes: [`);
  for (const kf of clip.keyframes) {
    lines.push(`    { time: ${fmt(kf.time)},`);
    lines.push(`      joints: {`);
    for (const name of JOINT_NAMES) {
      const e = kf.joints[name];
      if (!e || (e.x === 0 && e.y === 0 && e.z === 0)) continue;
      lines.push(`        ${name}: { x: ${fmt(e.x)}, y: ${fmt(e.y)}, z: ${fmt(e.z)} },`);
    }
    lines.push(`      },`);
    lines.push(`    },`);
  }
  lines.push(`  ],`);
  lines.push(`};`);
  return lines.join('\n');
}

/**
 * Generate just the updateRig() insertion snippet — paste it into the
 * pose-preset if/else chain in characters.ts.
 */
export function clipToUpdateRigSnippet(clip: AnimClip): string {
  return [
    `} else if (a.mode === '${clip.name}') {`,
    `  playClipOnRig(rig, ${clip.name}Clip, a.t);`,
    `  return;`,
  ].join('\n');
}