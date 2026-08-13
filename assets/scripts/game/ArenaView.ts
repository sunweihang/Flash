import { Node, Vec3 } from 'cc';
import {
  FloorLight,
  applyFloorLights,
  getFloorMaterial,
  makeFloorPanel,
  makeSphere,
} from './NeonFactory';
import { Theme } from './Theme';

/** Static neon grid floor for the throw arena. */
export class ArenaView {
  readonly root: Node;
  private readonly _floor: Node;

  constructor(parent: Node) {
    this.root = new Node('Arena');
    parent.addChild(this.root);

    // One continuous plate covering near player → far spawn depth.
    this._floor = makeFloorPanel(this.root, 'floor', 22, 72);
    this._floor.setPosition(0, 0, 24);

    this._spawnHorizonBeacons();
  }

  /** Clear / update floor reflection light slots (dead knives must not leave puddles). */
  setReflectLights(lights: FloorLight[]): void {
    const mat = getFloorMaterial(this._floor);
    if (!mat) return;
    mat.setProperty('reflectStrength', 0);
    mat.setProperty('horizonGlow', 0);
    applyFloorLights(mat, lights);
  }

  dispose(): void {
    this.root.destroy();
  }

  private _spawnHorizonBeacons(): void {
    const z = 58;
    const xs = [-9, -6, -3, 0, 3, 6, 9];
    for (let i = 0; i < xs.length; i++) {
      makeSphere(
        this.root,
        `beacon${i}`,
        Theme.grid,
        new Vec3(xs[i], 0.08, z + (i % 2) * 0.6),
        new Vec3(0.12, 0.12, 0.12),
      );
    }
  }
}
