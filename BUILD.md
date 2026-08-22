# Building the game (Tauri 2 + React + Three.js)

This is a Tauri 2 desktop app. The frontend is Vite/React/TypeScript and the
native shell is Rust. The distributable is a single Windows executable:
`src-tauri/target/release/app.exe`.

## Prerequisites (this machine)

The toolchain lives in non‑default locations, so **every shell command must
prefix `PATH`** or the build will fail with "command not found":

```
$env:PATH = "G:\devtools\node\current;G:\devtools\node\current\node_modules\.bin;G:\devtools\bun\bin;G:\devtools\cargo\bin;C:\Users\Nucleus\.local\bin;" + $env:PATH
```

Verified versions: Node v22.22.3, npm 10.9.8, Rust cargo/rustc 1.97.1,
bun 1.3.14, Tauri 2.11.3.

## Build steps

### 1. Front‑end (TypeScript + Vite)

```
npm run build
```

This runs `tsc -b && vite build`. It type‑checks the whole `src/` tree and
emits `dist/`. If `tsc` reports an error, the build stops — fix the type
error first (do **not** bypass `tsc`; the error is real).

### 2. Native executable

```
# Kill any running instance first, or the build fails with:
#   "failed to remove file ... Access is denied. (os error 5)"
Stop-Process -Name "app" -Force

npx tauri build --no-bundle
```

- `--no-bundle` skips the installer/wix packaging and just produces the raw
  `.exe` (faster; no MSI). Drop `--no-bundle` to also build an installer.
- Output: `src-tauri/target/release/app.exe` (~45 MB).
- First Rust compile is slow (~1–2 min); subsequent builds are incremental.

## Common pitfalls

- **"Access is denied. (os error 5)"** → `app.exe` is still running. Kill it
  with `Stop-Process -Name "app" -Force` before building.
- **`tsc` errors that only appear on a "fresh" build** → `tsc -b` uses
  incremental caches and may skip re‑checking unchanged files. A clean/full
  build can surface latent type errors elsewhere in the tree. Fix them; they
  are real.
- **Chunk‑size warning** ("Some chunks are larger than 500 kB") → harmless
  Vite advisory, not an error.
- **`npx playwright` needs the dev server** → the webServer auto‑starts on
  `http://127.0.0.1:3000` (see `playwright.config.js`). If a stale server
  holds the port, kill node/vite processes or set `PW_PORT` to a free port.

## Dev / test (no build)

```
npm run dev        # vite dev server on http://127.0.0.1:3000

# Item‑model checks (require the dev server):
npx playwright test tests/model-signatures.spec.ts   # confirms all 102 item models are structurally distinct
npx playwright test tests/gallery-all.spec.ts        # renders all 102 into test-results/gallery-all.png
npx playwright test tests/gallery-review.spec.ts      # BATCH=0..8 -> review-shots/review-bN.png (larger, labeled)
```

## File map (item visuals)

- `src/components/VoxelItemIcon.tsx` — all 102 voxel item models + the
  `BASE_MODELS` registry. Camera framing here controls on‑screen size.
- `src/game/items.ts` — `ITEM_BASES` (the 102 item templates) and loot tables.
- `src/game/skilltree.ts` — skill tree (unrelated to items; watch the
  `Unit.classes`/`ClassId` type check noted above).
