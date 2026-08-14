import { Node } from 'cc';
import { FloorLight } from './NeonFactory';

/**
 * Binds the authored Arena node from Main.scene.
 * Scene mesh / material live in the .scene file — do not assemble them here.
 */
export class ArenaView {
  readonly root: Node;

  constructor(scene: Node) {
    const arena = scene.getChildByName('Arena');
    if (!arena) {
      console.warn('[ArenaView] Main.scene is missing Arena — place CJ there, do not spawn it in code');
    }
    this.root = arena ?? new Node('Arena');
  }

  /** Legacy neon-floor reflection hooks (no-op on the authored CJ mesh). */
  setReflectLights(_lights: FloorLight[]): void {}

  dispose(): void {
    // Arena is part of Main.scene — do not destroy it.
  }
}
