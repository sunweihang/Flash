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

const root = 'd:/Custom/Flash/assets/resources/scene';
const ids = {
  dir: uuid(),
  png: uuid(),
  gltf: uuid(),
  fbx: uuid(),
  mtl: uuid(),
};

write(`${root}.meta`, {
  ver: '1.2.0',
  importer: 'directory',
  imported: true,
  uuid: ids.dir,
  files: [],
  subMetas: {},
  userData: {},
});

write(`${root}/cj1.png.meta`, {
  ver: '1.0.27',
  importer: 'image',
  imported: false,
  uuid: ids.png,
  files: [],
  subMetas: {},
  userData: {
    type: 'texture',
    fixAlphaTransparencyArtifacts: false,
    hasAlpha: false,
  },
});

write(`${root}/CJ.gltf.meta`, {
  ver: '2.3.14',
  importer: 'gltf',
  imported: false,
  uuid: ids.gltf,
  files: [],
  subMetas: {},
  userData: {
    imageDatas: {},
  },
});

write(`${root}/CJ.fbx.meta`, {
  ver: '2.3.14',
  importer: 'fbx',
  imported: false,
  uuid: ids.fbx,
  files: [],
  subMetas: {},
  userData: {},
});

// Unlit textured material — texture uuid filled after image import (png@6c48a)
const texUuid = `${ids.png}@6c48a`;
write(`${root}/SceneCJ.mtl`, {
  __type__: 'cc.Material',
  _name: 'SceneCJ',
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  _effectAsset: {
    __uuid__: 'a3cd009f-0ab0-420d-9278-b9fdab939bbc',
    __expectedType__: 'cc.EffectAsset',
  },
  _techIdx: 0,
  _defines: [{ USE_TEXTURE: true }],
  _states: [
    {
      rasterizerState: {},
      depthStencilState: {},
      blendState: { targets: [{}] },
    },
  ],
  _props: [
    {
      mainTexture: {
        __uuid__: texUuid,
        __expectedType__: 'cc.Texture2D',
      },
      mainColor: {
        __type__: 'cc.Color',
        r: 255,
        g: 255,
        b: 255,
        a: 255,
      },
    },
  ],
});

write(`${root}/SceneCJ.mtl.meta`, {
  ver: '1.0.21',
  importer: 'material',
  imported: false,
  uuid: ids.mtl,
  files: [],
  subMetas: {},
  userData: {},
});

write('d:/Custom/Flash/temp_ids_scene.json', ids);
console.log('wrote metas', ids);
