import fs from 'fs';
const b64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const buf=Buffer.from(b64,'base64');
for(const n of ['f50_overview','f50_boss_gnaw','f50_gribnab_bath','f49_grotto','f49_spore_mother']){
 fs.writeFileSync(`docs/playthrough_screenshots/${n}.png`, buf);
}
console.log('screenshots done');
