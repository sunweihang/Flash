import {
  Color,
  ImageAsset,
  JsonAsset,
  Material,
  MeshRenderer,
  Node,
  Texture2D,
  gfx,
  resources,
  utils,
} from 'cc';
import {
  FloorLight,
  applyFloorLights,
  getFloorMaterial,
  makeFloorPanel,
} from './NeonFactory';

/** Max Z-up → Cocos Y-up: (x,y,z) → (x, z, -y). */
function bakeMaxToCocos(pos: number[], nrm: number[] | null): void {
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    pos[i] = x;
    pos[i + 1] = z;
    pos[i + 2] = -y;
    if (nrm) {
      const nx = nrm[i];
      const ny = nrm[i + 1];
      const nz = nrm[i + 2];
      nrm[i] = nx;
      nrm[i + 1] = nz;
      nrm[i + 2] = -ny;
    }
  }
}

function readAccessorF32(
  accessor: {
    bufferView: number;
    byteOffset?: number;
    count: number;
    type: string;
  },
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[],
  buffer: ArrayBuffer,
): Float32Array {
  const bv = bufferViews[accessor.bufferView];
  const offset = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const comps = accessor.type === 'VEC3' ? 3 : accessor.type === 'VEC2' ? 2 : accessor.type === 'VEC4' ? 4 : 1;
  return new Float32Array(buffer, offset, accessor.count * comps);
}

function readAccessorU32(
  accessor: {
    bufferView: number;
    byteOffset?: number;
    count: number;
    componentType: number;
  },
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[],
  buffer: ArrayBuffer,
): number[] {
  const bv = bufferViews[accessor.bufferView];
  const offset = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out: number[] = new Array(accessor.count);
  if (accessor.componentType === 5125) {
    const src = new Uint32Array(buffer, offset, accessor.count);
    for (let i = 0; i < accessor.count; i++) out[i] = src[i];
  } else if (accessor.componentType === 5123) {
    const src = new Uint16Array(buffer, offset, accessor.count);
    for (let i = 0; i < accessor.count; i++) out[i] = src[i];
  } else {
    throw new Error(`unsupported index type ${accessor.componentType}`);
  }
  return out;
}

function decodeDataUri(uri: string): ArrayBuffer {
  const m = uri.match(/^data:[^;]+;base64,(.+)$/);
  if (!m) throw new Error('expected base64 data uri buffer');
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function loadJson(path: string): Promise<JsonAsset> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err, asset) => {
      if (err || !asset) reject(err || new Error(path));
      else resolve(asset);
    });
  });
}

function loadTextureFromDataUri(uri: string): Promise<Texture2D> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const imageAsset = new ImageAsset(img);
        const texture = new Texture2D();
        texture.image = imageAsset;
        resolve(texture);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('scene texture decode failed'));
    img.src = uri;
  });
}

type GltfDoc = {
  accessors: {
    bufferView: number;
    byteOffset?: number;
    count: number;
    type: string;
    componentType: number;
  }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
  buffers: { byteLength: number; uri?: string }[];
  images?: { uri?: string }[];
  meshes: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
    }[];
  }[];
};

/**
 * Arena backdrop: CJ corridor mesh + cj1 texture.
 * Falls back to the neon grid plate if assets fail to load.
 */
export class ArenaView {
  readonly root: Node;
  private _floor: Node | null = null;
  private _scene: Node | null = null;

  constructor(parent: Node) {
    this.root = new Node('Arena');
    parent.addChild(this.root);
    void this._boot();
  }

  /** Legacy neon-floor reflection hooks (no-op on CJ mesh). */
  setReflectLights(lights: FloorLight[]): void {
    if (!this._floor) return;
    const mat = getFloorMaterial(this._floor);
    if (!mat) return;
    mat.setProperty('reflectStrength', 0);
    mat.setProperty('horizonGlow', 0);
    applyFloorLights(mat, lights);
  }

  dispose(): void {
    this.root.destroy();
  }

  private async _boot(): Promise<void> {
    try {
      this._scene = await this._spawnCjScene();
      console.log('[ArenaView] CJ scene ready');
    } catch (err) {
      console.warn('[ArenaView] CJ scene failed, neon floor fallback', err);
      this._floor = makeFloorPanel(this.root, 'floor', 22, 72);
      this._floor.setPosition(0, 0, 24);
    }
  }

  private async _spawnCjScene(): Promise<Node> {
    const jsonAsset = await loadJson('scene/CJ');
    const gltf = jsonAsset.json as GltfDoc;
    if (!gltf?.meshes?.length || !gltf.buffers?.length) {
      throw new Error('invalid CJ gltf json');
    }

    const imageUri = gltf.images?.[0]?.uri;
    if (!imageUri) throw new Error('CJ json missing embedded texture');
    const texture = await loadTextureFromDataUri(imageUri);

    const buffer = decodeDataUri(gltf.buffers[0].uri!);
    const prim = gltf.meshes[0].primitives[0];
    const posAcc = gltf.accessors[prim.attributes.POSITION];
    const nrmAcc = prim.attributes.NORMAL != null ? gltf.accessors[prim.attributes.NORMAL] : null;
    const uvAcc = prim.attributes.TEXCOORD_0 != null ? gltf.accessors[prim.attributes.TEXCOORD_0] : null;
    const idxAcc = prim.indices != null ? gltf.accessors[prim.indices] : null;
    if (!idxAcc) throw new Error('CJ mesh missing indices');

    const pos = Array.from(readAccessorF32(posAcc, gltf.bufferViews, buffer));
    const nrm = nrmAcc ? Array.from(readAccessorF32(nrmAcc, gltf.bufferViews, buffer)) : null;
    const uvs = uvAcc ? Array.from(readAccessorF32(uvAcc, gltf.bufferViews, buffer)) : undefined;
    const indices = readAccessorU32(idxAcc, gltf.bufferViews, buffer);

    bakeMaxToCocos(pos, nrm);

    const mesh = utils.MeshUtils.createMesh({
      positions: pos,
      normals: nrm ?? undefined,
      uvs,
      indices,
    });

    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      defines: { USE_TEXTURE: true },
    });
    mat.overridePipelineStates({
      rasterizerState: { cullMode: gfx.CullMode.NONE },
    });
    mat.setProperty('mainTexture', texture);
    mat.setProperty('mainColor', Color.WHITE);

    const host = new Node('CJ_Scene');
    this.root.addChild(host);
    // Local span ~±100 xz / 135 y. Stretch Z so far spawns (z≈28–48) stay inside.
    host.setScale(0.12, 0.12, 0.25);
    host.setPosition(0, 0, 25);

    const plate = new Node('mesh');
    host.addChild(plate);
    const mr = plate.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    return host;
  }
}
