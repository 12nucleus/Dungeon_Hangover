/**
 * Tier-1 cutscene / level tweaker.
 *
 * Live, read/write access to the same IsoCamera + tavern-actor fields
 * that the cutscene beats in `src/game/cutscenes.ts` set every frame.
 * The DebugPanel wires React sliders into this state; this module
 * owns the pure helpers (snapshot reads + pasteable-snippet writers).
 *
 * Design rule: the editor never re-implements cutscene logic. It only
 * exposes the well-known fields (`desiredYaw/Dist/Pitch`, `box`,
 * `focus` target, `rig.group.position` / `rotation.y`) and prints out
 * the exact one-liners a beat in `cutscenes.ts` already uses, so you
 * tune a shot in the browser, copy the printed line, and paste it
 * back into the cutscene source. The serial code stays the truth.
 */

export interface EditorCameraValues {
  yaw: number;
  pitch: number;
  dist: number;
  lerp: number;
  focusX: number;
  focusY: number;
  focusZ: number;
}

export interface EditorActorValues {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;   // radians
}

/** a small mutable pouch the panel binds to. Updated by `bindEditor`. */
export const editorState: {
  enabled: boolean;
  selectedActorId: string | null;
  lastCopied: string;
} = {
  enabled: false,
  selectedActorId: null,
  lastCopied: '',
};

/** clamp helper shared by the slider setters */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** pretty-print a number with trimmed trailing zeros + fixed precision */
function fmt(n: number, p = 3): string {
  const s = n.toFixed(p);
  return s.replace(/\.?0+$/, '');
}

/**
 * Read the live camera values from an IsoCamera-like object.
 * `iso` is intentionally `any` (same as the CutsceneHost typing in
 * cutscenes.ts) so this stays decoupled from engine.ts internals.
 */
export function readCamera(iso: any): EditorCameraValues {
  return {
    yaw: iso?.desiredYaw ?? 0,
    pitch: iso?.desiredPitch ?? 0,
    dist: iso?.desiredDist ?? 0,
    lerp: iso?.lerp ?? 0,
    focusX: iso?.desiredTarget?.x ?? 0,
    focusY: iso?.desiredTarget?.y ?? 0,
    focusZ: iso?.desiredTarget?.z ?? 0,
  };
}

/** write back the live camera values.
 *  `focusTarget` is a reusable THREE.Vector3 the editor keeps around
 *  (passed in by the engine's `getEditorHandles()`); we mutate its
 *  components and call `iso.focus()` with it, never allocate per-set. */
export function writeCamera(
  iso: any,
  vals: Partial<EditorCameraValues>,
  focusTarget?: { x: number; y: number; z: number },
): void {
  if (!iso) return;
  if (vals.yaw !== undefined) iso.desiredYaw = vals.yaw;
  if (vals.pitch !== undefined) iso.desiredPitch = vals.pitch;
  if (vals.dist !== undefined) iso.desiredDist = vals.dist;
  if (vals.lerp !== undefined) iso.lerp = vals.lerp;
  if (focusTarget && (vals.focusX !== undefined || vals.focusY !== undefined || vals.focusZ !== undefined)) {
    focusTarget.x = vals.focusX ?? focusTarget.x;
    focusTarget.y = vals.focusY ?? focusTarget.y;
    focusTarget.z = vals.focusZ ?? focusTarget.z;
    iso.focus?.(focusTarget);
  }
}

/** Ship a snippet to the clipboard and remember it for the UI badge. */
export async function copySnippet(text: string): Promise<void> {
  editorState.lastCopied = text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be blocked outside a secure context; fall through to UI copy text */
  }
}

/** Emit the canonical camera beat line(s) a cutscene would use. */
export function cameraSnippet(vals: EditorCameraValues, withFocus = true): string {
  const lines = [
    `h.iso.desiredYaw = ${fmt(vals.yaw)};`,
    `h.iso.desiredPitch = ${fmt(vals.pitch)};`,
    `h.iso.desiredDist = ${fmt(vals.dist)};`,
  ];
  if (vals.lerp) lines.push(`h.iso.lerp = ${fmt(vals.lerp)};`);
  if (withFocus) {
    lines.push(
      `h.iso.focus(new THREE.Vector3(${fmt(vals.focusX)}, ${fmt(vals.focusY)}, ${fmt(vals.focusZ)}));`,
    );
  }
  return lines.join(' ');
}

/** Emit a `box` clamp line (the AABB that keeps the camera framed). */
export function boxSnippet(box: any): string {
  if (!box) return '';
  return `h.iso.box = { minX: ${fmt(box.minX)}, maxX: ${fmt(box.maxX)}, minZ: ${fmt(box.minZ)}, maxZ: ${fmt(box.maxZ)}, minY: ${fmt(box.minY)}, maxY: ${fmt(box.maxY)} };`;
}

/** Read every tavern actor as plain x/y/z/yaw for the panel list. */
export function readActors(
  tavern: any | null,
  tavernActors: Record<string, any> | null,
): EditorActorValues[] {
  const out: EditorActorValues[] = [];
  if (!tavern) return out;
  // collect from tavernActors first (named), then any other rig children
  const seen = new Set<string>();
  if (tavernActors) {
    for (const [id, rig] of Object.entries(tavernActors)) {
      if (!rig?.group?.position) continue;
      out.push({
        id,
        x: rig.group.position.x,
        y: rig.group.position.y,
        z: rig.group.position.z,
        yaw: rig.group.rotation.y,
      });
      seen.add(id);
    }
  }
  return out;
}

/** Push changed actor values back into the live rig. */
export function writeActor(
  tavernActors: Record<string, any> | null,
  id: string,
  patch: Partial<EditorActorValues>,
): void {
  const rig = tavernActors?.[id];
  if (!rig?.group) return;
  if (patch.x !== undefined) rig.group.position.x = patch.x;
  if (patch.y !== undefined) rig.group.position.y = patch.y;
  if (patch.z !== undefined) rig.group.position.z = patch.z;
  if (patch.yaw !== undefined) rig.group.rotation.y = patch.yaw;
}

/** Emit an `addNpc(buildCharacter({...}), x, z, yaw, 'idle', 'id');` style line.
 *  Note: we can't introspect the buildCharacter args live, so the panel lets
 *  you paste the original `buildCharacter({...})` call and only the
 *  coordinates/rotation are kept freshly generated. */
export function actorSnippet(a: EditorActorValues): string {
  // yaw is radians in-engine; keep it that way (matches addNpc calls).
  return `addNpc(buildCharacter({...}), ${fmt(a.x)}, ${fmt(a.z)}, ${fmt(a.yaw)}, 'idle', '${a.id}'${a.y ? `, ${fmt(a.y)}` : ''});`;
}
