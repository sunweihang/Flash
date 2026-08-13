/**
 * Build Flash monster prefabs from backrooms Output packs:
 * - strip unknown script comps
 * - retarget Mesh/Skinned materials to NeonMonster
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuid() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const neonMonster = JSON.parse(
  fs.readFileSync('d:/Custom/Flash/assets/materials/NeonMonster.mtl.meta', 'utf8'),
).uuid;

const units = [
  ['2000', 'Enemy00'],
  ['2001', 'Enemy01'],
  ['2002', 'Enemy02'],
  ['2003', 'Enemy03'],
];

const outDir = 'd:/Custom/Flash/assets/resources/prefabs';

for (const [unit, key] of units) {
  const src = `d:/Custom/Flash/assets/resources/units/${unit}/Output/${unit}.prefab`;
  if (!fs.existsSync(src)) {
    console.warn('missing', src);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  const keep = [];
  const idMap = new Map();

  // Drop custom script components (compressed __type__ hashes / Attachment*)
  const dropTypes = new Set();
  for (const obj of data) {
    if (!obj || typeof obj !== 'object') continue;
    const t = obj.__type__;
    if (typeof t !== 'string') continue;
    if (
      t.startsWith('cc.') ||
      t === 'CCPropertyOverrideInfo' ||
      t === 'cc.TargetInfo' ||
      t === 'cc.TargetOverrideInfo' ||
      t === 'cc.MountedChildrenInfo' ||
      t === 'cc.PrefabInstance' ||
      t === 'cc.CompPrefabInfo' ||
      t === 'cc.PrefabInfo' ||
      t === 'cc.ModelBakeSettings' ||
      t === 'cc.Prefab'
    ) {
      continue;
    }
    // custom scripts
    dropTypes.add(t);
  }

  // Also drop physics / particles for Flash arena
  const dropExact = new Set([
    'cc.RigidBody',
    'cc.BoxCollider',
    'cc.SphereCollider',
    'cc.ParticleSystem',
    'cc.ParticleSystemRenderer',
    'cc.ColorOvertimeModule',
    'cc.ShapeModule',
    'cc.SizeOvertimeModule',
    'cc.VelocityOvertimeModule',
    'cc.ForceOvertimeModule',
    'cc.LimitVelocityOvertimeModule',
    'cc.RotationOvertimeModule',
    'cc.TextureAnimationModule',
    'cc.NoiseModule',
    'cc.TrailModule',
    'cc.CurveRange',
    'cc.GradientRange',
    'cc.Gradient',
    'cc.AlphaKey',
    'cc.RealCurve',
    'cc.RealKeyframeValue',
    ...dropTypes,
  ]);

  // Soft filter: keep core render graph; remove objects of dropExact type
  // But particle modules are referenced - safer to keep prefab and only swap materials + rename.
  // Material retarget only:
  for (const obj of data) {
    if (!obj || typeof obj !== 'object') continue;
    if (obj.__type__ === 'cc.MeshRenderer' || obj.__type__ === 'cc.SkinnedMeshRenderer') {
      if (Array.isArray(obj._materials)) {
        obj._materials = obj._materials.map(() => ({
          __uuid__: neonMonster,
          __expectedType__: 'cc.Material',
        }));
        if (obj._materials.length === 0) {
          obj._materials = [{ __uuid__: neonMonster, __expectedType__: 'cc.Material' }];
        }
      }
    }
    if (obj.__type__ === 'cc.Prefab') {
      obj._name = `Monster_${key}`;
    }
    if (obj.__type__ === 'cc.Node' && obj._parent === null) {
      obj._name = `Monster_${key}`;
      obj._lpos = { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 };
    }
  }

  const name = `Monster_${key}`;
  const outPrefab = path.join(outDir, `${name}.prefab`);
  const metaPath = `${outPrefab}.meta`;
  let prefabUuid = uuid();
  if (fs.existsSync(metaPath)) {
    try {
      prefabUuid = JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid || prefabUuid;
    } catch {}
  }

  fs.writeFileSync(outPrefab, JSON.stringify(data, null, 2).replace(/\n/g, '\r\n'));
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ver: '1.1.50',
        importer: 'prefab',
        imported: false,
        uuid: prefabUuid,
        files: ['.json'],
        subMetas: {},
        userData: {},
      },
      null,
      2,
    ).replace(/\n/g, '\r\n'),
  );
  console.log('wrote', name, 'uuid', prefabUuid, 'droppedTypes', [...dropTypes].slice(0, 6));
}

// Knife prefab: keep marker; runtime builds mesh. Update catalog flashPrefab paths.
const catalogPath = path.join(outDir, 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
for (const m of catalog.monsters) {
  m.flashPrefab = `prefabs/Monster_${m.key}`;
}
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n'));
console.log('catalog updated');
