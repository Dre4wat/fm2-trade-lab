import { access, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../data/fm2-data.json', import.meta.url);
const target = new URL('../data/season1.json', import.meta.url);

try {
  await access(target);
  console.log('Season 1 snapshot already exists; leaving it frozen.');
  process.exit(0);
} catch {}

const db = JSON.parse(await readFile(source, 'utf8'));

const players = (db.players || []).map(p => ({
  id:p.id,pageId:p.pageId,team:p.team,name:p.name,pos:p.pos,dev:p.dev,ovr:p.ovr,age:p.age,
  jersey:p.jersey,college:p.college,yearsPro:p.yearsPro,rookieYear:p.rookieYear,
  capHit:p.capHit,yearsLeft:p.yearsLeft,value:p.value,speed:p.speed,headshot:p.headshot,
  archetype:p.archetype
}));

const snapshot = {
  meta: {
    ...(db.meta || {}),
    label: 'Season 1',
    frozenAt: new Date().toISOString(),
    frozen: true,
    note: 'FM2 Season 1 final snapshot used by FM2 Wrapped.'
  },
  teams: db.teams || [],
  players,
  games: db.games || [],
  standings: db.standings || []
};

await writeFile(target, JSON.stringify(snapshot));
console.log(`Frozen Season 1: ${players.length} players, ${snapshot.games.length} games, ${snapshot.standings.length} standings rows.`);
