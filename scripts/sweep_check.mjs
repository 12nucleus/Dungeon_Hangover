import { F50_DEBUG } from '../src/levels/floor50.ts';
import { FLOORS } from '../src/levels/index.ts';

const map = F50_DEBUG.map;
const walk = map.walk;
const S = walk.length;
let walkable=0, blocked=0;
for(let x=0;x<S;x++) for(let z=0;z<S;z++) if(walk[x][z]) walkable++; else blocked++;
console.log(`walkable ${walkable} blocked ${blocked} S ${S}`);
// BFS from spawn
const spawn = F50_DEBUG.structures.partySpawn;
console.log('spawn', spawn);
const visited=new Set(); const q=[spawn]; visited.add(`${spawn.x},${spawn.z}`);
let idx=0;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
while(idx<q.length){
 const cur=q[idx++];
 for(const [dx,dz] of dirs){
   const nx=cur.x+dx, nz=cur.z+dz;
   if(nx<0||nz<0||nx>=S||nz>=S) continue;
   const k=`${nx},${nz}`;
   if(visited.has(k)) continue;
   if(!walk[nx][nz]) continue;
   visited.add(k); q.push({x:nx,z:nz});
 }
}
console.log(`reachable from spawn: ${visited.size}`);
// check rooms
for(const r of F50_DEBUG.ROOMS){
 const rect=map.rooms[r.id];
 if(!rect) { console.log(`missing rect ${r.id}`); continue; }
 let reach=0, total=0;
 for(let x=rect.x0;x<=rect.x1;x++) for(let z=rect.z0;z<=rect.z1;z++){ total++; if(visited.has(`${x},${z}`)) reach++; }
 console.log(`${r.id} ${r.name} ${reach}/${total} ${reach===total?'OK':'PARTIAL'} rect ${rect.x0},${rect.z0}-${rect.x1},${rect.z1}`);
}
// check all walk tiles reachable
let unreachable = walkable - visited.size;
console.log(`unreachable walk tiles: ${unreachable} (${(unreachable/walkable*100).toFixed(1)}%)`);
