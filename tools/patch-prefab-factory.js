const fs = require('fs');
const p = 'd:/Custom/Flash/assets/scripts/game/PrefabFactory.ts';
let t = fs.readFileSync(p, 'utf8').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n');

if (!t.includes('entry.flashPrefab')) {
  t = t.replace(
    'async function instantiateMonsterModel(entry: MonsterEntry): Promise<Node> {\n  if (entry.fbxPrefabUuid) {',
    `async function instantiateMonsterModel(entry: MonsterEntry): Promise<Node> {
  if (entry.flashPrefab) {
    try {
      const prefab = await loadResourcesPrefab(entry.flashPrefab);
      return instantiate(prefab);
    } catch {
      // fall through
    }
  }
  if (entry.fbxPrefabUuid) {`,
  );
  console.log('flashPrefab priority added');
} else {
  console.log('already patched');
}

fs.writeFileSync(p, t.replace(/\n/g, '\r\n'));
const cat = JSON.parse(fs.readFileSync('d:/Custom/Flash/assets/resources/prefabs/catalog.json', 'utf8'));
console.log(cat.monsters.map((m) => m.flashPrefab));
