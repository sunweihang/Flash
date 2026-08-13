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

function write(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = typeof c === 'string' ? c : JSON.stringify(c, null, 2);
  fs.writeFileSync(p, text.replace(/\r?\n/g, '\r\n'));
}

function writeMeta(filePath, id, importer) {
  write(`${filePath}.meta`, {
    ver: '1.2.0',
    importer,
    imported: false,
    uuid: id,
    files: [],
    subMetas: {},
    userData: {},
  });
}

const root = 'd:/Custom/Flash/assets';
const ids = {
  effect: uuid(),
  matMonster: uuid(),
  matKnife: uuid(),
};

const effect = `CCEffect %{
  techniques:
  - name: opaque
    passes:
    - vert: neon-vs:vert
      frag: neon-fs:frag
      properties: &props
        mainColor:     { value: [0.02, 0.02, 0.02, 1.0], editor: { type: color } }
        rimColor:      { value: [1.0, 0.92, 0.15, 1.0], editor: { type: color } }
        rimPower:      { value: 2.4 }
        rimIntensity:  { value: 4.5 }
        glowBoost:     { value: 1.8 }
        outlineWidth:  { value: 0.04 }
      depthStencilState:
        depthTest: true
        depthWrite: true
      rasterizerState:
        cullMode: back
  - name: outline
    passes:
    - vert: outline-vs:vert
      frag: outline-fs:frag
      properties: *props
      depthStencilState:
        depthTest: true
        depthWrite: false
      rasterizerState:
        cullMode: front
}%

CCProgram neon-vs %{
  precision highp float;
  #include <legacy/input>
  #include <builtin/uniforms/cc-global>
  #include <legacy/local>
  #include <legacy/decode>
  #if USE_SKINNING
    #include <legacy/skinning>
  #endif

  out vec3 v_worldNormal;
  out vec3 v_viewDir;

  vec4 vert () {
    vec4 position;
    vec3 normal;
    vec3 tangent;
    CCDecode(position, normal, tangent);
    #if USE_SKINNING
      CCSkin(position, normal, tangent);
    #endif
    vec4 worldPos = cc_matWorld * position;
    v_worldNormal = normalize((cc_matWorldIT * vec4(normal, 0.0)).xyz);
    v_viewDir = normalize(cc_cameraPos.xyz - worldPos.xyz);
    return cc_matViewProj * worldPos;
  }
}%

CCProgram neon-fs %{
  precision highp float;
  #include <legacy/output>
  in vec3 v_worldNormal;
  in vec3 v_viewDir;
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };

  vec4 frag () {
    float ndv = abs(dot(normalize(v_worldNormal), normalize(v_viewDir)));
    float rim = pow(1.0 - clamp(ndv, 0.0, 1.0), rimPower);
    vec3 col = mainColor.rgb + rimColor.rgb * rim * rimIntensity * glowBoost;
    return CCFragOutput(vec4(col, 1.0));
  }
}%

CCProgram outline-vs %{
  precision highp float;
  #include <legacy/input>
  #include <builtin/uniforms/cc-global>
  #include <legacy/local>
  #include <legacy/decode>
  #if USE_SKINNING
    #include <legacy/skinning>
  #endif
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };

  vec4 vert () {
    vec4 position;
    vec3 normal;
    vec3 tangent;
    CCDecode(position, normal, tangent);
    #if USE_SKINNING
      CCSkin(position, normal, tangent);
    #endif
    float w = outlineWidth > 0.0 ? outlineWidth : 0.035;
    position.xyz += normalize(normal) * w;
    return cc_matViewProj * (cc_matWorld * position);
  }
}%

CCProgram outline-fs %{
  precision highp float;
  #include <legacy/output>
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };
  vec4 frag () {
    vec3 col = rimColor.rgb * (1.25 + glowBoost * 0.4);
    return CCFragOutput(vec4(col, 1.0));
  }
}%
`;

write(`${root}/effects/neon-rim.effect`, effect);
writeMeta(`${root}/effects/neon-rim.effect`, ids.effect, 'effect');

function matJson(effectUuid, props, useSkinning) {
  return {
    __type__: 'cc.Material',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: {
      __uuid__: effectUuid,
      __expectedType__: 'cc.EffectAsset',
    },
    _techIdx: 0,
    _defines: [
      useSkinning ? { USE_SKINNING: true } : {},
      {},
      {},
    ],
    _states: [
      { rasterizerState: {}, depthStencilState: {}, blendState: { targets: [{}] } },
      {},
      {},
    ],
    _props: [props, {}, {}],
  };
}

const monsterProps = {
  mainColor: { __type__: 'cc.Color', r: 8, g: 8, b: 10, a: 255 },
  rimColor: { __type__: 'cc.Color', r: 255, g: 235, b: 40, a: 255 },
  rimPower: 2.2,
  rimIntensity: 5.0,
  glowBoost: 2.2,
  outlineWidth: 0.04,
};

const knifeProps = {
  mainColor: { __type__: 'cc.Color', r: 18, g: 36, b: 55, a: 255 },
  rimColor: { __type__: 'cc.Color', r: 180, g: 245, b: 255, a: 255 },
  rimPower: 1.5,
  rimIntensity: 6.2,
  glowBoost: 2.6,
  outlineWidth: 0.02,
};

write(`${root}/materials/NeonMonster.mtl`, matJson(ids.effect, monsterProps, true));
writeMeta(`${root}/materials/NeonMonster.mtl`, ids.matMonster, 'material');
write(`${root}/materials/NeonKnife.mtl`, matJson(ids.effect, knifeProps, false));
writeMeta(`${root}/materials/NeonKnife.mtl`, ids.matKnife, 'material');

// Also write a second material using outline technique index 1 for dual-pass via two renderers if needed
const outlineOnly = {
  ...matJson(ids.effect, monsterProps, true),
  _techIdx: 1,
};
write(`${root}/materials/NeonMonsterOutline.mtl`, outlineOnly);
writeMeta(`${root}/materials/NeonMonsterOutline.mtl`, uuid(), 'material');

function readFbxSceneUuid(metaPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  for (const key of Object.keys(meta.subMetas || {})) {
    const sm = meta.subMetas[key];
    if (sm.importer === 'gltf-scene') return sm.uuid;
  }
  return null;
}

const monsters = [
  {
    key: 'Enemy00',
    unit: '2000',
    fbxMeta: `${root}/resources/units/2000/Res/FBX/Enemy00.fbx.meta`,
    resourcesPath: 'units/2000/Output/2000',
  },
  {
    key: 'Enemy01',
    unit: '2001',
    fbxMeta: `${root}/resources/units/2001/Res/FBX/Demo_Zombie_01@skin.fbx.meta`,
    resourcesPath: 'units/2001/Output/2001',
  },
  {
    key: 'Enemy02',
    unit: '2002',
    fbxMeta: `${root}/resources/units/2002/Res/FBX/Enemy02.fbx.meta`,
    resourcesPath: 'units/2002/Output/2002',
  },
  {
    key: 'Enemy03',
    unit: '2003',
    fbxMeta: `${root}/resources/units/2003/Res/FBX/Enemy03.fbx.meta`,
    resourcesPath: 'units/2003/Output/2003',
  },
];

for (const m of monsters) {
  m.fbxPrefabUuid = fs.existsSync(m.fbxMeta) ? readFbxSceneUuid(m.fbxMeta) : null;
  delete m.fbxMeta;
}

const catalog = {
  materials: {
    monster: ids.matMonster,
    knife: ids.matKnife,
    effect: ids.effect,
  },
  monsters,
  knifePrefab: 'prefabs/Knife',
};

write(`${root}/resources/prefabs/catalog.json`, catalog);
writeMeta(`${root}/resources/prefabs/catalog.json`, uuid(), 'json');

// Create wrapper prefabs: root + NeonMonsterVisual component placeholder via script attachment later.
// Minimal prefab root for each monster (visual filled at runtime by PrefabFactory).
function emptyVisualPrefab(name, prefabUuid) {
  return [
    {
      __type__: 'cc.Prefab',
      _name: name,
      _objFlags: 0,
      __editorExtras__: {},
      _native: '',
      data: { __id__: 1 },
      optimizationPolicy: 0,
      persistent: false,
    },
    {
      __type__: 'cc.Node',
      _name: name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: null,
      _children: [],
      _active: true,
      _components: [{ __id__: 2 }],
      _prefab: { __id__: 3 },
      _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
      _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
      _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
      _mobility: 0,
      _layer: 1073741824,
      _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
      _id: '',
    },
    {
      __type__: 'cc.CompPrefabInfo',
      fileId: 'a1b2c3d4e5f67890',
    },
    {
      __type__: 'cc.PrefabInfo',
      root: { __id__: 1 },
      asset: { __id__: 0 },
      fileId: prefabUuid.replace(/-/g, '').slice(0, 16),
      instance: null,
      targetOverrides: null,
      nestedPrefabInstanceRoots: null,
    },
  ];
}

// Knife procedural marker prefab (runtime fills mesh)
const knifeId = uuid();
write(`${root}/resources/prefabs/Knife.prefab`, emptyVisualPrefab('Knife', knifeId));
writeMeta(`${root}/resources/prefabs/Knife.prefab`, knifeId, 'prefab');

for (const m of monsters) {
  const pid = uuid();
  const name = `Monster_${m.key}`;
  write(`${root}/resources/prefabs/${name}.prefab`, emptyVisualPrefab(name, pid));
  writeMeta(`${root}/resources/prefabs/${name}.prefab`, pid, 'prefab');
  m.flashPrefab = `prefabs/${name}`;
  m.flashPrefabUuid = pid;
}

write(`${root}/resources/prefabs/catalog.json`, catalog);
write('d:/Custom/Flash/temp_ids.json', ids);
console.log('created', ids);
console.log('monsters', monsters.map((m) => `${m.key}:${m.fbxPrefabUuid || m.resourcesPath}`).join(', '));
