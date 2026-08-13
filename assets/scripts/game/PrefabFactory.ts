import {
  AnimationClip,
  Color,
  EffectAsset,
  JsonAsset,
  Layers,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  SkeletalAnimation,
  SkinnedMeshRenderer,
  assetManager,
  instantiate,
  resources,
} from 'cc';
import { attachMonsterNeonAura, makeKnifeShard } from './NeonFactory';

type MonsterEntry = {
  key: string;
  unit: string;
  fbxPrefabUuid: string | null;
  resourcesPath: string;
  flashPrefab?: string;
  idleClipUuid?: string;
  runClipUuid?: string;
  materialUuid?: string;
};

type Catalog = {
  materials: { monster: string; knife: string; effect: string };
  monsters: MonsterEntry[];
};

const NEON_RIM_EFFECT_UUID = '402b29ed-02b9-4274-a1fd-f8a9f7d38a9f';

const ZOMBIE: MonsterEntry = {
  key: 'Enemy01',
  unit: '2001',
  resourcesPath: 'units/2001/Output/2001',
  fbxPrefabUuid: '30bb0a00-acb7-440e-8ac5-ba5771785771@2b0a7',
  flashPrefab: 'prefabs/Monster_Enemy01',
  idleClipUuid: '308ee41d-7369-4228-82a5-7921a6c4b070@1f586',
  runClipUuid: '5461a370-5b6a-4f3b-922e-689f4828ea20@cf5ee',
  // Dark body + yellow rim (reference silhouette glow).
  materialUuid: '9bd6d7a1-8842-4363-8d14-dd57a83c8efc',
};

const ZOMBIE_MAT_FALLBACKS = [
  '9bd6d7a1-8842-4363-8d14-dd57a83c8efc', // NeonMonster neon-rim
  'e57ad8c0-0093-4df0-8603-00ce9c797b51', // NeonMonsterOutline
  'c3f8a1b2-4d5e-6f70-8192-a3b4c5d6e7f8', // ZombieNeon
];

const HIDE_NAME_RE =
  /RoleShadow|BloodHUD|BloodHUDBG|NeonAura|bone_hud|bone_hit|fire_point|HpBar|^Shadow$/i;

let _zombieMat: Material | null = null;
let _idleClip: AnimationClip | null = null;
let _runClip: AnimationClip | null = null;
let _ready: Promise<void> | null = null;

export function warmupPrefabs(): Promise<void> {
  if (_ready) return _ready;
  _ready = (async () => {
    // Best-effort warmup; spawn never depends on this succeeding.
    await Promise.allSettled([
      (async () => {
        // Prefer resources path so web-mobile always packs neon-rim.
        try {
          const mat = await new Promise<Material>((resolve, reject) => {
            resources.load('materials/NeonMonster', Material, (err, asset) => {
              if (err || !asset) reject(err || new Error('NeonMonster'));
              else resolve(asset);
            });
          });
          const effectUuid = (mat.effectAsset as EffectAsset | null)?.uuid;
          if (effectUuid === NEON_RIM_EFFECT_UUID) {
            _zombieMat = mat;
            return;
          }
        } catch {
          // fall through to UUID / build
        }
        for (const id of ZOMBIE_MAT_FALLBACKS) {
          try {
            const mat = await loadByUuid<Material>(id);
            // Reject stale unlit/textured mats that lost the neon-rim effect.
            const effectUuid = (mat.effectAsset as EffectAsset | null)?.uuid;
            if (effectUuid !== NEON_RIM_EFFECT_UUID) continue;
            _zombieMat = mat;
            return;
          } catch {
            // try next
          }
        }
        _zombieMat = await buildNeonRimMaterial();
      })(),
      loadByUuid<AnimationClip>(ZOMBIE.idleClipUuid!).then((c) => {
        _idleClip = c;
      }),
      loadByUuid<AnimationClip>(ZOMBIE.runClipUuid!).then((c) => {
        _runClip = c;
      }),
      loadJson<Catalog>('prefabs/catalog').catch(() => null),
    ]);
    console.log('[PrefabFactory] warmup', {
      zombieMat: !!_zombieMat,
      idle: !!_idleClip,
      run: !!_runClip,
    });
  })();
  return _ready;
}

/**
 * Always try to return the zombie skinned mesh.
 * Animation / material failures must NOT fall back to stick figures.
 */
export async function spawnMonsterPrefab(parent: Node, _preferredKey?: string): Promise<Node> {
  await warmupPrefabs();

  const loadErrors: string[] = [];
  let model: Node | null = null;

  // 1) Raw FBX skin — simplest, most reliable skinned mesh.
  try {
    model = instantiate(await loadByUuid<Prefab>(ZOMBIE.fbxPrefabUuid!));
  } catch (err) {
    loadErrors.push(`fbx-uuid: ${errMsg(err)}`);
  }

  // 2) resources path to FBX
  if (!model) {
    try {
      model = instantiate(await loadResourcesPrefab('units/2001/Res/FBX/Demo_Zombie_01@skin'));
    } catch (err) {
      loadErrors.push(`fbx-path: ${errMsg(err)}`);
    }
  }

  // 3) unit output pack
  if (!model) {
    try {
      model = instantiate(await loadResourcesPrefab(ZOMBIE.resourcesPath));
    } catch (err) {
      loadErrors.push(`unit-pack: ${errMsg(err)}`);
    }
  }

  // 4) flash wrapper prefab
  if (!model) {
    try {
      model = instantiate(await loadResourcesPrefab(ZOMBIE.flashPrefab!));
    } catch (err) {
      loadErrors.push(`flash: ${errMsg(err)}`);
    }
  }

  if (!model) {
    console.error('[PrefabFactory] zombie load failed', loadErrors);
    const { makeStickFigure } = await import('./NeonFactory');
    return makeStickFigure(parent, 'Monster');
  }

  const skinned = model.getComponentInChildren(SkinnedMeshRenderer);
  if (!skinned) {
    console.error('[PrefabFactory] loaded prefab has no SkinnedMeshRenderer', model.name);
    model.destroy();
    const { makeStickFigure } = await import('./NeonFactory');
    return makeStickFigure(parent, 'Monster');
  }

  model.name = 'Monster_Enemy01';
  parent.addChild(model);

  // Soft post-process — never destroy the mesh if these fail.
  try {
    sanitizeRuntimeNode(model);
  } catch (err) {
    console.warn('[PrefabFactory] sanitize skipped', err);
  }
  try {
    applyZombieMaterial(model);
  } catch (err) {
    console.warn('[PrefabFactory] material skipped', err);
  }
  try {
    attachMonsterNeonAura(model);
  } catch (err) {
    console.warn('[PrefabFactory] aura skipped', err);
  }
  try {
    setupAndPlayRun(model);
  } catch (err) {
    console.warn('[PrefabFactory] animation skipped', err);
  }
  try {
    model.setScale(3.2, 3.2, 3.2);
  } catch {
    // ignore
  }

  console.log('[PrefabFactory] spawned zombie OK');
  return model;
}

export function spawnKnifePrefab(parent: Node, name = 'Knife'): Node {
  // Keep procedural unlit cyan/glow from makeKnifeShard.
  // NeonKnife (neon-rim) on these meshes shows as magenta/purple missing-shader.
  return makeKnifeShard(parent, name, true);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sanitizeRuntimeNode(root: Node): void {
  for (const c of [...root.components]) {
    const n = c.constructor?.name || '';
    if (/Enemy|Boss|Attachment|UnitActor|NavAgent|HpBar|Motor|Spawner|Missing|RigidBody|Collider/i.test(n)) {
      c.destroy();
    }
  }

  const stack: Node[] = [...root.children];
  while (stack.length) {
    const n = stack.pop()!;
    if (HIDE_NAME_RE.test(n.name)) n.active = false;
    for (const child of n.children) stack.push(child);
  }

  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (isSkinned(mr)) continue;
    const n = mr.node.name || '';
    if (HIDE_NAME_RE.test(n) || /Quad/i.test(n)) mr.node.active = false;
  }

  for (const smr of root.getComponentsInChildren(SkinnedMeshRenderer)) {
    smr.enabled = true;
    smr.node.active = true;
    let p: Node | null = smr.node;
    while (p) {
      p.layer = Layers.Enum.DEFAULT;
      p.active = true;
      if (p === root) break;
      p = p.parent;
    }
  }
  root.layer = Layers.Enum.DEFAULT;
  root.active = true;
}

function isSkinned(mr: MeshRenderer): boolean {
  return (
    mr instanceof SkinnedMeshRenderer ||
    mr.constructor?.name === 'SkinnedMeshRenderer' ||
    !!mr.node.getComponent(SkinnedMeshRenderer)
  );
}

function applyZombieMaterial(root: Node): void {
  if (!_zombieMat) return;
  // Ensure rim params survive stale library caches of the .mtl.
  try {
    _zombieMat.setProperty('mainColor', new Color(4, 3, 2, 255));
    _zombieMat.setProperty('rimColor', new Color(255, 230, 30, 255));
    _zombieMat.setProperty('rimPower', 2.8);
    _zombieMat.setProperty('rimIntensity', 5.8);
    _zombieMat.setProperty('glowBoost', 2.2);
    _zombieMat.setProperty('outlineWidth', 0.022);
  } catch {
    // Material may still be compiling / wrong effect — still try assign.
  }
  for (const smr of root.getComponentsInChildren(SkinnedMeshRenderer)) {
    const count = Math.max(1, smr.sharedMaterials?.length || 1);
    for (let i = 0; i < count; i++) smr.setSharedMaterial(_zombieMat, i);
  }
}

async function buildNeonRimMaterial(): Promise<Material | null> {
  try {
    let effect: EffectAsset;
    try {
      effect = await new Promise<EffectAsset>((resolve, reject) => {
        resources.load('effects/neon-rim', EffectAsset, (err, asset) => {
          if (err || !asset) reject(err || new Error('neon-rim'));
          else resolve(asset);
        });
      });
    } catch {
      effect = await loadByUuid<EffectAsset>(NEON_RIM_EFFECT_UUID);
    }
    const mat = new Material();
    mat.initialize({ effectAsset: effect, technique: 0 });
    mat.setProperty('mainColor', new Color(4, 3, 2, 255));
    mat.setProperty('rimColor', new Color(255, 230, 30, 255));
    mat.setProperty('rimPower', 2.8);
    mat.setProperty('rimIntensity', 5.8);
    mat.setProperty('glowBoost', 2.2);
    mat.setProperty('outlineWidth', 0.022);
    return mat;
  } catch (err) {
    console.warn('[PrefabFactory] buildNeonRimMaterial failed', err);
    return null;
  }
}

function setupAndPlayRun(root: Node): void {
  const smr = root.getComponentInChildren(SkinnedMeshRenderer);
  if (!smr) return;

  // Prefer the skinning root node for SkeletalAnimation.
  const skinRoot = smr.skinningRoot && smr.skinningRoot.isValid ? smr.skinningRoot : root;
  let anim = skinRoot.getComponent(SkeletalAnimation) || root.getComponentInChildren(SkeletalAnimation);
  if (!anim) anim = skinRoot.addComponent(SkeletalAnimation);

  // Baked mode with empty/unbaked clips stays in T-pose forever.
  anim.useBakedAnimation = false;

  const clips: AnimationClip[] = [];
  for (const c of anim.clips || []) {
    if (c && !clips.includes(c)) clips.push(c);
  }
  if (_idleClip && !clips.includes(_idleClip)) clips.push(_idleClip);
  if (_runClip && !clips.includes(_runClip)) clips.push(_runClip);

  if (!clips.length) {
    console.warn('[PrefabFactory] no clips loaded yet');
    return;
  }

  anim.clips = clips;
  const run =
    clips.find((c) => /run|walk|move/i.test(c.name)) ||
    _runClip ||
    clips.find((c) => /idle/i.test(c.name)) ||
    clips[0];
  if (!run) return;

  anim.defaultClip = run;
  anim.playOnLoad = true;
  anim.play(run.name);
  console.log(
    '[PrefabFactory] playing',
    run.name,
    'clips=',
    clips.map((c) => c.name),
  );
}

function loadResourcesPrefab(path: string): Promise<Prefab> {
  return new Promise((resolve, reject) => {
    resources.load(path, Prefab, (err, asset) => {
      if (err || !asset) reject(err || new Error(`missing prefab ${path}`));
      else resolve(asset);
    });
  });
}

function loadJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err, asset) => {
      if (err || !asset) {
        reject(err || new Error(`missing json ${path}`));
        return;
      }
      const data = (asset as JsonAsset).json;
      if (!data || typeof data !== 'object') {
        reject(new Error(`invalid json asset ${path}`));
        return;
      }
      resolve(data as T);
    });
  });
}

function loadByUuid<T extends object>(id: string): Promise<T> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid: id }, (err, asset) => {
      if (err || !asset) reject(err || new Error(`uuid ${id}`));
      else resolve(asset as T);
    });
  });
}
