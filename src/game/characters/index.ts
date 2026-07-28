// ─────────────────────────────────────────────────────────────
// characters barrel — re-exports the exact same public API
// as the original characters.ts
// ─────────────────────────────────────────────────────────────
export type { Rig, DeathState } from './vox';
export { buildCharacter, setWeapon } from './build';
export { updateRig } from './animation';
export { buildHierarchy } from './hierarchy';
