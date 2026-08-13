const fs = require('fs');
const p = 'd:/Custom/Flash/assets/scripts/GameBootstrap.ts';
const content = `import {
  _decorator,
  Camera,
  Color,
  Component,
  Node,
  ResolutionPolicy,
  Vec3,
  view,
} from 'cc';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _game: { dispose?: () => void } | null = null;

  onLoad(): void {
    view.setDesignResolutionSize(1080, 1920, ResolutionPolicy.SHOW_ALL);
    this._tuneMainCamera();
    void this._boot();
  }

  onDestroy(): void {
    this._game?.dispose?.();
    this._game = null;
  }

  private async _boot(): Promise<void> {
    const { GameController } = await import('./game/GameController');
    this._game = await GameController.create(this.node.scene!);
  }

  private _tuneMainCamera(): void {
    const camNode = this.node.scene?.getChildByName('Main Camera');
    const cam = camNode?.getComponent(Camera);
    if (!cam || !camNode) return;
    // Over-the-shoulder view toward distant monsters.
    camNode.setPosition(0, 6.2, -11);
    camNode.lookAt(new Vec3(0, 1.4, 32));
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = 42;
    cam.near = 0.1;
    cam.far = 220;
    cam.clearColor = new Color(0, 0, 0, 255);
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this._enableBloom(camNode);
  }

  private _enableBloom(camNode: Node): void {
    try {
      // Optional: requires custom-pipeline-post-process module.
      const ccAny = require('cc') as Record<string, any>;
      const PostProcess = ccAny.PostProcess;
      const Bloom = ccAny.Bloom;
      if (!PostProcess || !Bloom) return;
      if (!camNode.getComponent(PostProcess)) camNode.addComponent(PostProcess);
      let bloom = camNode.getComponent(Bloom) as {
        threshold: number;
        intensity: number;
        iterations: number;
      } | null;
      if (!bloom) {
        bloom = camNode.addComponent(Bloom) as {
          threshold: number;
          intensity: number;
          iterations: number;
        };
      }
      bloom.threshold = 0.55;
      bloom.intensity = 2.1;
      bloom.iterations = 4;
    } catch (e) {
      console.warn('[GameBootstrap] Bloom unavailable', e);
    }
  }
}
`;
fs.writeFileSync(p, content.replace(/\n/g, '\r\n'));
console.log('bootstrap fixed');
