import {
  _decorator,
  Camera,
  Color,
  Component,
  Node,
  Vec3,
  view,
} from 'cc';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
} from './game/PortraitFit';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _game: { dispose?: () => void } | null = null;
  private _mainCam: Camera | null = null;
  private _letterboxCam: Camera | null = null;
  private _applyingFrame = false;

  onLoad(): void {
    applyDesignResolution();
    this._tuneMainCamera();
    this._ensureLetterboxCam();
    this._applyPortraitFrame();
    view.on('canvas-resize', this._applyPortraitFrame, this);
    void this._boot();
  }

  onDestroy(): void {
    view.off('canvas-resize', this._applyPortraitFrame, this);
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
    this._mainCam = cam;
  }

  private _ensureLetterboxCam(): void {
    const scene = this.node.scene;
    if (!scene) return;
    let node = scene.getChildByName('LetterboxCam');
    if (!node) {
      node = new Node('LetterboxCam');
      scene.addChild(node);
      node.setPosition(0, 0, 0);
    }
    let cam = node.getComponent(Camera);
    if (!cam) cam = node.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 10;
    cam.priority = -100;
    cam.visibility = 0;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = LETTERBOX_CLEAR;
    cam.rect.set(0, 0, 1, 1);
    this._letterboxCam = cam;
  }

  private _applyPortraitFrame = (): void => {
    if (this._applyingFrame) return;
    this._applyingFrame = true;
    try {
      applyDesignResolution();
      if (this._mainCam?.isValid) {
        applyPortraitCameraRect(this._mainCam);
      }
      if (this._letterboxCam?.isValid) {
        this._letterboxCam.clearColor = LETTERBOX_CLEAR;
        this._letterboxCam.rect.set(0, 0, 1, 1);
        this._letterboxCam.enabled = true;
      }
    } finally {
      this._applyingFrame = false;
    }
  };
}
