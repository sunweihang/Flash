import {
  Color,
  EffectAsset,
  Material,
  MeshRenderer,
  Node,
  Vec3,
  Vec4,
  assetManager,
  primitives,
  utils,
} from 'cc';
import { Theme } from './Theme';

const _matCache = new Map<string, Material>();

/** Custom neon grid floor effect / material (see assets/effects/neon-floor.effect). */
export const NEON_FLOOR_EFFECT_UUID = 'd63b8277-cd84-4723-b3a2-b6b417ce9cfd';
export const NEON_FLOOR_MAT_UUID = '752bd306-3f3d-4e43-92a9-3763246502e9';

let _floorMat: Material | null = null;
let _floorMatPromise: Promise<Material | null> | null = null;

function loadByUuid<T extends object>(id: string): Promise<T> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid: id }, (err, asset) => {
      if (err || !asset) reject(err || new Error(`uuid ${id}`));
      else resolve(asset as T);
    });
  });
}

/** Shared NeonFloor material (cloned per mesh so light uniforms stay independent). */
export async function loadNeonFloorMaterial(): Promise<Material | null> {
  if (_floorMat) return _floorMat;
  if (_floorMatPromise) return _floorMatPromise;
  _floorMatPromise = (async () => {
    try {
      _floorMat = await loadByUuid<Material>(NEON_FLOOR_MAT_UUID);
      return _floorMat;
    } catch {
      // Fall through — build from effect if the .mtl is not imported yet.
    }
    try {
      const effect = await loadByUuid<EffectAsset>(NEON_FLOOR_EFFECT_UUID);
      const mat = new Material();
      mat.initialize({ effectAsset: effect });
      mat.setProperty('baseColor', Theme.floor);
      mat.setProperty('gridColor', Theme.grid);
      mat.setProperty('reflectTint', new Color(120, 220, 255, 255));
      mat.setProperty('gridSize', 2.4);
      mat.setProperty('lineWidth', 0.035);
      mat.setProperty('gridGlow', 2.4);
      mat.setProperty('reflectStrength', 0);
      mat.setProperty('horizonGlow', 0);
      _floorMat = mat;
      return mat;
    } catch (err) {
      console.warn('[NeonFactory] neon-floor material unavailable', err);
      return null;
    }
  })();
  return _floorMatPromise;
}

export type FloorLight = {
  x: number;
  y: number;
  z: number;
  intensity: number;
  color: Color;
};

/** Pack up to 4 emissive sources into the floor shader for stretched reflections. */
export function applyFloorLights(mat: Material, lights: FloorLight[]): void {
  const slots = [
    { p: 'light0', c: 'lightColor0' },
    { p: 'light1', c: 'lightColor1' },
    { p: 'light2', c: 'lightColor2' },
    { p: 'light3', c: 'lightColor3' },
  ];
  for (let i = 0; i < slots.length; i++) {
    const L = lights[i];
    if (L && L.intensity > 0.001) {
      mat.setProperty(slots[i].p, new Vec4(L.x, L.y, L.z, L.intensity));
      mat.setProperty(slots[i].c, L.color);
    } else {
      mat.setProperty(slots[i].p, new Vec4(0, 1, 0, 0));
      mat.setProperty(slots[i].c, new Color(0, 0, 0, 255));
    }
  }
}

function colorKey(c: Color, transparent: boolean): string {
  return `${transparent ? 't' : 'o'}_${c.r}_${c.g}_${c.b}_${c.a}`;
}

export function unlitMat(color: Color, transparent = false): Material {
  const key = colorKey(color, transparent);
  let mat = _matCache.get(key);
  if (mat) return mat;
  mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: transparent ? 1 : 0,
    defines: { USE_COLOR: true },
  });
  mat.setProperty('mainColor', color);
  _matCache.set(key, mat);
  return mat;
}

function attachPrimitive(
  parent: Node,
  name: string,
  geo: ReturnType<typeof primitives.box>,
  color: Color,
  pos: Vec3,
  scale: Vec3,
  euler?: Vec3,
  transparent = false,
): Node {
  const n = new Node(name);
  parent.addChild(n);
  n.setPosition(pos);
  n.setScale(scale);
  if (euler) n.setRotationFromEuler(euler.x, euler.y, euler.z);
  const mr = n.addComponent(MeshRenderer);
  mr.mesh = utils.MeshUtils.createMesh(geo);
  mr.setSharedMaterial(unlitMat(color, transparent), 0);
  return n;
}

export function makeBox(
  parent: Node,
  name: string,
  color: Color,
  pos: Vec3,
  scale: Vec3,
  euler?: Vec3,
  transparent = false,
): Node {
  return attachPrimitive(parent, name, primitives.box(), color, pos, scale, euler, transparent);
}

export function makeCylinder(
  parent: Node,
  name: string,
  color: Color,
  pos: Vec3,
  scale: Vec3,
  euler?: Vec3,
): Node {
  return attachPrimitive(parent, name, primitives.cylinder(), color, pos, scale, euler);
}

export function makeSphere(
  parent: Node,
  name: string,
  color: Color,
  pos: Vec3,
  scale: Vec3,
  transparent = false,
): Node {
  return attachPrimitive(parent, name, primitives.sphere(), color, pos, scale, undefined, transparent);
}

export function makeTorus(
  parent: Node,
  name: string,
  color: Color,
  pos: Vec3,
  scale: Vec3,
  euler?: Vec3,
  transparent = false,
): Node {
  return attachPrimitive(
    parent,
    name,
    primitives.torus(0.5, 0.12, { radialSegments: 24, tubularSegments: 16 }),
    color,
    pos,
    scale,
    euler,
    transparent,
  );
}

/** Elongated glowing knife shard + tight bloom shell (keep glow small so it never reads as floor scrap). */
export function makeKnifeShard(parent: Node, name: string, tipForward = true): Node {
  const root = new Node(name);
  parent.addChild(root);

  const yaw = tipForward ? 0 : 180;
  makeBox(
    root,
    'core',
    Theme.knife,
    new Vec3(0, 0, 0),
    new Vec3(0.22, 0.1, 1.55),
    new Vec3(0, yaw, 0),
  );
  makeBox(
    root,
    'glow',
    Theme.knifeGlow,
    new Vec3(0, 0, 0),
    new Vec3(0.32, 0.16, 1.7),
    new Vec3(0, yaw, 0),
    true,
  );
  makeBox(
    root,
    'tip',
    Theme.knife,
    new Vec3(0, 0, tipForward ? 0.9 : -0.9),
    new Vec3(0.12, 0.07, 0.32),
    new Vec3(0, yaw, 45),
  );
  return root;
}

/** Fan of knives matching the SlowMo Strike silhouette. */
export function makeKnifeCluster(parent: Node, name: string): Node {
  const root = new Node(name);
  parent.addChild(root);

  const offsets = [
    { x: 0, y: 0.55, z: 0.1, rz: 0 },
    { x: -0.35, y: 0.15, z: -0.15, rz: 18 },
    { x: 0.35, y: 0.15, z: -0.15, rz: -18 },
    { x: -0.55, y: -0.25, z: -0.35, rz: 32 },
    { x: 0.55, y: -0.25, z: -0.35, rz: -32 },
    { x: 0, y: -0.45, z: -0.55, rz: 0 },
  ];

  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i];
    const shard = makeKnifeShard(root, `k${i}`, true);
    shard.setPosition(o.x, o.y, o.z);
    shard.setRotationFromEuler(12, 0, o.rz);
  }

  const halo = makeTorus(
    root,
    'halo',
    Theme.halo,
    new Vec3(0, 0.35, 1.1),
    new Vec3(1.1, 1.1, 1.1),
    new Vec3(90, 0, 0),
  );
  makeTorus(
    halo,
    'haloGlow',
    Theme.haloGlow,
    new Vec3(0, 0, 0),
    new Vec3(1.35, 1.35, 1.35),
    new Vec3(0, 0, 0),
    true,
  );

  return root;
}

/** Simple neon stick figure in an action lean. */
export function makeStickFigure(parent: Node, name: string): Node {
  const root = new Node(name);
  parent.addChild(root);

  makeSphere(root, 'head', Theme.stick, new Vec3(0, 1.55, 0), new Vec3(0.28, 0.28, 0.28));
  makeCylinder(root, 'torso', Theme.stick, new Vec3(0, 0.95, 0), new Vec3(0.12, 0.55, 0.12));
  makeCylinder(
    root,
    'armL',
    Theme.stick,
    new Vec3(-0.45, 1.15, 0.15),
    new Vec3(0.08, 0.45, 0.08),
    new Vec3(0, 0, 55),
  );
  makeCylinder(
    root,
    'armR',
    Theme.stick,
    new Vec3(0.55, 1.25, 0.35),
    new Vec3(0.08, 0.55, 0.08),
    new Vec3(70, 0, -35),
  );
  makeCylinder(
    root,
    'legL',
    Theme.stick,
    new Vec3(-0.2, 0.25, -0.1),
    new Vec3(0.09, 0.5, 0.09),
    new Vec3(15, 0, 12),
  );
  makeCylinder(
    root,
    'legR',
    Theme.stick,
    new Vec3(0.22, 0.3, 0.15),
    new Vec3(0.09, 0.5, 0.09),
    new Vec3(-20, 0, -10),
  );
  return root;
}

/**
 * Soft bloom shell + floating gold shards around a skinned monster.
 * Matches the reference: dark body, yellow edge bleed, cube debris.
 */
export function attachMonsterNeonAura(root: Node): void {
  const old = root.getChildByName('RimGlow');
  if (old?.isValid) old.destroy();

  const aura = new Node('RimGlow');
  root.addChild(aura);
  // Body center for the scaled zombie (root scale ~3.2).
  aura.setPosition(0, 0.55, 0);

  makeSphere(
    aura,
    'bloomOuter',
    new Color(255, 210, 40, 55),
    new Vec3(0, 0.15, 0),
    new Vec3(1.05, 1.55, 1.05),
    true,
  );
  makeSphere(
    aura,
    'bloomInner',
    new Color(255, 230, 80, 70),
    new Vec3(0, 0.2, 0),
    new Vec3(0.55, 0.85, 0.55),
    true,
  );

  const sparks = new Node('sparks');
  aura.addChild(sparks);
  const sparkCount = 10;
  for (let i = 0; i < sparkCount; i++) {
    const ang = (i / sparkCount) * Math.PI * 2;
    const radius = 0.55 + (i % 3) * 0.18;
    const y = (i % 5) * 0.22 - 0.15;
    const s = 0.06 + (i % 3) * 0.03;
    makeBox(
      sparks,
      `sp${i}`,
      i % 2 === 0 ? Theme.halo : Theme.haloGlow,
      new Vec3(Math.cos(ang) * radius, y, Math.sin(ang) * radius),
      new Vec3(s, s, s),
      new Vec3(20 * i, 35 * i, 12 * i),
      i % 2 === 1,
    );
  }
}

/** Distant gold monster orb (reference halo target). */
export function makeMonster(parent: Node, name: string): Node {
  const root = new Node(name);
  parent.addChild(root);

  makeSphere(root, 'core', Theme.halo, new Vec3(0, 0, 0), new Vec3(0.55, 0.55, 0.55));
  makeSphere(root, 'shell', Theme.haloGlow, new Vec3(0, 0, 0), new Vec3(0.95, 0.95, 0.95));
  makeTorus(
    root,
    'ring',
    Theme.halo,
    new Vec3(0, 0, 0),
    new Vec3(1.35, 1.35, 1.35),
    new Vec3(90, 0, 0),
  );
  makeTorus(
    root,
    'ringGlow',
    Theme.haloGlow,
    new Vec3(0, 0, 0),
    new Vec3(1.7, 1.7, 1.7),
    new Vec3(90, 0, 0),
    true,
  );
  return root;
}

export type ShatterShard = {
  node: Node;
  vel: Vec3;
  spin: Vec3;
  life: number;
  maxLife: number;
  baseScale: Vec3;
};

export type ShatterFx = {
  root: Node;
  flash: Node | null;
  flashLife: number;
  shards: ShatterShard[];
};

const SHATTER_COLORS = [
  Theme.danger,
  Theme.halo,
  Theme.haloGlow,
  new Color(90, 140, 70, 255),
  new Color(40, 70, 45, 255),
  new Color(255, 120, 80, 220),
];

/**
 * Neon corpse burst at world position (body center). Caller must tick + destroy.
 */
export function spawnMonsterShatter(parent: Node, pos: Vec3): ShatterFx {
  const root = new Node('MonsterShatter');
  parent.addChild(root);
  root.setPosition(pos.x, pos.y, pos.z);

  const flash = makeSphere(
    root,
    'flash',
    new Color(255, 230, 120, 160),
    new Vec3(0, 0, 0),
    new Vec3(0.9, 0.9, 0.9),
    true,
  );
  makeSphere(
    root,
    'flashCore',
    Theme.halo,
    new Vec3(0, 0, 0),
    new Vec3(0.35, 0.35, 0.35),
  );

  const shards: ShatterShard[] = [];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const color = SHATTER_COLORS[i % SHATTER_COLORS.length];
    const sx = 0.12 + Math.random() * 0.28;
    const sy = 0.1 + Math.random() * 0.32;
    const sz = 0.08 + Math.random() * 0.22;
    const offset = new Vec3(
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.2) * 1.1,
      (Math.random() - 0.5) * 0.7,
    );
    const piece = makeBox(
      root,
      `s${i}`,
      color,
      offset,
      new Vec3(sx, sy, sz),
      new Vec3(Math.random() * 360, Math.random() * 360, Math.random() * 360),
      color.a < 255,
    );

    // Outward burst + slight upward kick.
    const dir = new Vec3(
      offset.x + (Math.random() - 0.5) * 0.4,
      0.35 + Math.random() * 0.9,
      offset.z + (Math.random() - 0.5) * 0.4,
    );
    if (dir.lengthSqr() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const speed = 4.5 + Math.random() * 7.5;
    const life = 0.45 + Math.random() * 0.35;
    shards.push({
      node: piece,
      vel: new Vec3(dir.x * speed, dir.y * speed, dir.z * speed),
      spin: new Vec3(
        (Math.random() - 0.5) * 720,
        (Math.random() - 0.5) * 720,
        (Math.random() - 0.5) * 720,
      ),
      life,
      maxLife: life,
      baseScale: new Vec3(sx, sy, sz),
    });
  }

  return { root, flash, flashLife: 0.18, shards };
}

/** Advance shatter; returns false when finished (caller should destroy root). */
export function tickShatter(fx: ShatterFx, dt: number): boolean {
  let alive = 0;

  if (fx.flash?.isValid) {
    fx.flashLife -= dt;
    const s = fx.flash.scale;
    const grow = 1 + dt * 6;
    fx.flash.setScale(s.x * grow, s.y * grow, s.z * grow);
    if (fx.flashLife <= 0) {
      fx.flash.destroy();
      fx.flash = null;
      const core = fx.root.getChildByName('flashCore');
      if (core?.isValid) core.destroy();
    } else {
      alive++;
    }
  }

  for (const sh of fx.shards) {
    if (!sh.node.isValid || sh.life <= 0) continue;
    sh.life -= dt;
    if (sh.life <= 0) {
      sh.node.active = false;
      continue;
    }
    alive++;

    sh.vel.y -= 14 * dt;
    const p = sh.node.position;
    sh.node.setPosition(p.x + sh.vel.x * dt, p.y + sh.vel.y * dt, p.z + sh.vel.z * dt);

    const e = sh.node.eulerAngles;
    sh.node.setRotationFromEuler(
      e.x + sh.spin.x * dt,
      e.y + sh.spin.y * dt,
      e.z + sh.spin.z * dt,
    );

    const t = Math.max(0, sh.life / sh.maxLife);
    const fade = t * t;
    sh.node.setScale(sh.baseScale.x * fade, sh.baseScale.y * fade, sh.baseScale.z * fade);
  }

  return alive > 0;
}

/** @deprecated Use makeMonster. */
export function makeTargetGate(parent: Node, name: string): Node {
  return makeMonster(parent, name);
}

/**
 * Single mesh floor plate with neon-grid + reflection shader.
 * Falls back to the old unlit box grid if the custom effect is missing.
 */
export function makeFloorPanel(parent: Node, name: string, width: number, depth: number): Node {
  const root = new Node(name);
  parent.addChild(root);

  const plate = new Node('plate');
  root.addChild(plate);
  plate.setPosition(0, -0.01, 0);
  plate.setScale(width, 0.06, depth);
  const mr = plate.addComponent(MeshRenderer);
  mr.mesh = utils.MeshUtils.createMesh(primitives.box());
  // Placeholder until async material lands.
  mr.setSharedMaterial(unlitMat(Theme.floor), 0);

  void loadNeonFloorMaterial().then((shared) => {
    if (!shared || !plate.isValid) return;
    mr.setSharedMaterial(shared, 0);
    const mat = mr.getMaterialInstance(0) ?? shared;
    mat.setProperty('reflectStrength', 0);
    mat.setProperty('horizonGlow', 0);
    applyFloorLights(mat, []);
    (root as Node & { __floorMat?: Material }).__floorMat = mat;
  });

  return root;
}

export function getFloorMaterial(floorRoot: Node): Material | null {
  return (floorRoot as Node & { __floorMat?: Material }).__floorMat ?? null;
}
