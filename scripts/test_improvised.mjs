// Slot-use contract checks. node scripts/test_improvised.mjs
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_imp_test');
const OUT = resolve(OUT_DIR, 'items.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'game', 'items.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: OUT,
  logLevel: 'silent',
});

const improvisedOut = resolve(OUT_DIR, 'improvised.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'game', 'improvised.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: improvisedOut,
  logLevel: 'silent',
});

const { makeItem } = await import(pathToFileURL(OUT).href);
const { itemUses, canEquipIn, throwProfile, extraSlotsFor, isThrowable } = await import(pathToFileURL(improvisedOut).href);

let failed = 0;
function check(name, cond) {
  if (!cond) { console.error('FAIL', name); failed++; }
  else console.log('ok  ', name);
}

const bucket = makeItem('wooden_bucket');
const slots = itemUses(bucket).map((u) => u.slot).sort().join(',');
check('bucket uses weapon/offHand/head/boots', slots === 'boots,head,offHand,weapon');
check('bucket equips on head', canEquipIn(bucket, 'head'));
check('bucket equips on boots', canEquipIn(bucket, 'boots'));
check('bucket throw dice', throwProfile(bucket).dice === '1d4');
check('bucket extra slots include head', extraSlotsFor('wooden_bucket', 'weapon').includes('head'));
check('bucket throwable', isThrowable(bucket));
check('makeItem fills altSlots', (bucket.altSlots ?? []).includes('head'));

const potion = makeItem('potion');
check('potion has no wear slots', itemUses(potion).length === 0);
check('potion not wearable on head', !canEquipIn(potion, 'head'));
check('potion still throwable', isThrowable(potion));

const wine = makeItem('wine_bottle');
check('wine is a club and a toast', canEquipIn(wine, 'weapon') && canEquipIn(wine, 'offHand'));
const duck = makeItem('rubber_duck');
check('duck is a helmet', canEquipIn(duck, 'head'));

const sword = makeItem('rusty_sword');
check('one-hand sword dual-wields', canEquipIn(sword, 'offHand'));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall improvised checks passed');
