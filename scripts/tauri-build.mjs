// Build the Tauri release bundle with the correct PATH (cargo + node).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const cargoBin = 'C:\\Users\\Nucleus\\.cargo\\bin';
const nodeBin = 'C:\\Users\\Nucleus\\AppData\\Local\\pi-node\\current';
const base = process.env.PATH ?? '';
const PATH = [cargoBin, nodeBin, base].join(';');
const env = {
  ...process.env,
  PATH,
  RUSTUP_TOOLCHAIN: 'stable-x86_64-pc-windows-msvc',
  CI: undefined,
};

const log = fs.openSync('tauri-build.log', 'w');
const out = spawnSync('npx tauri build', {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', log, log],
  shell: true,
});
fs.closeSync(log);
console.log('exit:', out.status, out.error ? out.error.message : '');
process.exit(out.status ?? 1);
