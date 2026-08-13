const fs = require('fs');

function normWrite(p, text) {
  fs.writeFileSync(p, text.replace(/\r?\n/g, '\r\n'));
}

const gcPath = 'd:/Custom/Flash/assets/scripts/game/GameController.ts';
let t = fs.readFileSync(gcPath, 'utf8').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n');

t = t.replace(
  /import \{[^}]*\} from '\.\/NeonFactory';/,
  "import { makeStickFigure } from './NeonFactory';\nimport { spawnKnifePrefab, spawnMonsterPrefab, warmupPrefabs } from './PrefabFactory';",
);

if (!t.includes('warmupPrefabs()')) {
  t = t.replace(
    'this._arena = new ArenaView(this._world);\n    this._buildPlayer();',
    'this._arena = new ArenaView(this._world);\n    void warmupPrefabs();\n    this._buildPlayer();',
  );
}

t = t.replace(
  'const node = makeKnifeShard(this._world, \'Knife\', true);',
  "const node = spawnKnifePrefab(this._world, 'Knife');",
);

const spawnRe =
  /private _spawnMonster\(\): void \{[\s\S]*?this\._monsters\.push\(\{ node, pos, hit: false \}\);\n  \}/;

const newSpawn = `private _spawnMonster(): void {
    void this._spawnMonsterAsync();
  }

  private async _spawnMonsterAsync(): Promise<void> {
    const node = await spawnMonsterPrefab(this._world);
    const x =
      GameTune.monsterMinX + Math.random() * (GameTune.monsterMaxX - GameTune.monsterMinX);
    const z =
      GameTune.monsterMinZ + Math.random() * (GameTune.monsterMaxZ - GameTune.monsterMinZ);
    const pos = new Vec3(x, GameTune.monsterY, z);
    node.setPosition(pos);
    this._monsters.push({ node, pos, hit: false });
  }`;

if (spawnRe.test(t)) {
  t = t.replace(spawnRe, newSpawn);
  console.log('spawn replaced');
} else {
  console.log('spawn not found');
}

normWrite(gcPath, t);
console.log({
  PrefabFactory: t.includes('PrefabFactory'),
  asyncSpawn: t.includes('_spawnMonsterAsync'),
  knife: t.includes('spawnKnifePrefab'),
});

// GameBootstrap bloom + warmup camera
const bootPath = 'd:/Custom/Flash/assets/scripts/GameBootstrap.ts';
let b = fs.readFileSync(bootPath, 'utf8').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n');
if (!b.includes('Bloom')) {
  b = b.replace(
    "import {\n  _decorator,\n  Camera,\n  Color,\n  Component,\n  Node,\n  ResolutionPolicy,\n  Vec3,\n  view,\n} from 'cc';",
    "import {\n  _decorator,\n  Bloom,\n  Camera,\n  Color,\n  Component,\n  Node,\n  PostProcess,\n  ResolutionPolicy,\n  Vec3,\n  view,\n} from 'cc';",
  );
  b = b.replace(
    'cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;\n  }',
    `cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this._enableBloom(camNode);
  }

  private _enableBloom(camNode: Node): void {
    try {
      if (!camNode.getComponent(PostProcess)) camNode.addComponent(PostProcess);
      let bloom = camNode.getComponent(Bloom);
      if (!bloom) bloom = camNode.addComponent(Bloom);
      bloom.threshold = 0.55;
      bloom.intensity = 2.1;
      bloom.iterations = 4;
    } catch (e) {
      console.warn('[GameBootstrap] Bloom unavailable', e);
    }
  }`,
  );
  normWrite(bootPath, b);
  console.log('bootstrap bloom wired');
}

// Theme: yellower halo like video
const themePath = 'd:/Custom/Flash/assets/scripts/game/Theme.ts';
let theme = fs.readFileSync(themePath, 'utf8').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n');
theme = theme.replace(
  'halo: new Color(255, 170, 40, 255),\n  haloGlow: new Color(255, 120, 20, 80),',
  'halo: new Color(255, 235, 40, 255),\n  haloGlow: new Color(255, 220, 60, 100),',
);
normWrite(themePath, theme);

// Ensure PrefabFactory normalized
const pf = 'd:/Custom/Flash/assets/scripts/game/PrefabFactory.ts';
normWrite(pf, fs.readFileSync(pf, 'utf8').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n'));
