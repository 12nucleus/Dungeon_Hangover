import esbuild from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'node_modules', '.tmp_skill_progression');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

async function bundle(entry, name) {
  const outfile = resolve(outDir, name);
  await esbuild.build({ entryPoints: [resolve(root, entry)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const runtime = await bundle('src/game/skillRuntime.ts', 'runtime.mjs');
const treeModule = await bundle('src/game/skilltree.ts', 'tree.mjs');
const issues = runtime.validateSkills();
if (issues.length) {
  console.error(`Skill validation failed (${issues.length} issue(s))`);
  for (const issue of issues) console.error(`- ${issue.id}: ${issue.message}`);
  process.exit(1);
}

const tree = treeModule.buildClassTree(['bar_bouncer', 'gutter_rogue']);
const capstones = tree.filter((node) => node.capstone);
if (tree.length !== 102 || capstones.length !== 2 || capstones.some((node) => (node.requiresAll?.length ?? 0) < 3)) {
  console.error(`Unexpected two-class tree shape: ${tree.length} nodes, ${capstones.length} capstones`);
  process.exit(1);
}

console.log(`Skill progression OK: ${tree.length} nodes, ${capstones.length} capstones, ${issues.length} validation issues.`);
