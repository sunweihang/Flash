import {
  Camera,
  Canvas,
  Component,
  EventMouse,
  EventTouch,
  Input,
  Layers,
  Node,
  UITransform,
  Vec2,
  Vec3,
  Widget,
  director,
  geometry,
  input,
  sys,
  view,
} from 'cc';
import { ArenaView } from './ArenaView';
import { classifyGesture } from './GestureRecognizer';
import { Hud } from './Hud';
import {
  ShatterFx,
  makeStickFigure,
  spawnMonsterShatter,
  tickShatter,
} from './NeonFactory';
import { spawnKnifePrefab, spawnMonsterPrefab, warmupPrefabs } from './PrefabFactory';
import {
  applyDesignResolution,
  applyPortraitCameraRect,
  portraitVisibleSize,
} from './PortraitFit';
import { DESIGN_H, DESIGN_W, GameTune, Theme } from './Theme';

type Monster = {
  node: Node;
  pos: Vec3;
  hit: boolean;
};

type Knife = {
  node: Node;
  vel: Vec3;
  alive: boolean;
  /** Stuck under the finger until the stroke ends. */
  held: boolean;
  launchDir: Vec3;
  /** Countdown before this knife actually shoots (release cascade). */
  launchDelay: number;
  /** >0 while boosting out of the hand — drives stretch + speed punch. */
  boostT: number;
  /** Flight budget after release; 0 while held. */
  life: number;
};

export class GameController extends Component {
  private _world!: Node;
  private _arena!: ArenaView;
  private _hud!: Hud;
  private _canvas!: Node;
  private _player!: Node;
  private _mainCam: Camera | null = null;
  private _uiCam: Camera | null = null;
  private _applyingUiFrame = false;

  private _monsters: Monster[] = [];
  private _shatters: ShatterFx[] = [];
  private _knives: Knife[] = [];
  private _stroke: Vec2[] = [];
  private _drawing = false;
  /** Newest knives from the active stroke (oldest first); trimmed to max 20. */
  private _strokeQueue: Knife[] = [];
  private _knifeSeq = 0;
  private _lastFireUi: Vec2 | null = null;
  private _lastFireScreen: Vec2 | null = null;
  /** Avoid double-firing when the runtime maps mouse ↔ touch. */
  private _pointer: 'touch' | 'mouse' | null = null;
  /** True while left mouse button is physically down (survives ghost touch-end). */
  private _mouseHeld = false;
  private _wheelCooldown = 0;
  /** Wall-clock-ish fade after release so the fly-out is visible. */
  private _throwFade = 0;

  private _level = 1;
  private _score = 0;
  private _lives = GameTune.startLives;
  private _hitsThisLevel = 0;
  private _waveTimer = 0.4;
  private _running = true;
  private _hintTimer = 5;
  private _bannerTimer = 0;
  private _time = 0;

  static async create(scene: Node): Promise<GameController> {
    const host = new Node('Game');
    scene.addChild(host);
    const ctrl = host.addComponent(GameController);
    ctrl._boot(scene);
    return ctrl;
  }

  dispose(): void {
    view.off('canvas-resize', this._applyUiPortraitFrame, this);
    this._teardownInput();
    director.getScheduler().setTimeScale(1);
    this._shatters.length = 0;
    this._hud?.dispose();
    this._canvas?.destroy();
    this._world?.destroy();
    this.node.destroy();
  }

  private _boot(scene: Node): void {
    this._world = new Node('World');
    scene.addChild(this._world);

    this._arena = new ArenaView(scene);
    void warmupPrefabs();
    this._buildPlayer();
    this._buildUi(scene);
    this._cacheCamera(scene);
    this._applyUiPortraitFrame();
    view.on('canvas-resize', this._applyUiPortraitFrame, this);
    this._bindInput();

    this._hud.setLevel(this._level);
    this._hud.setScore(this._score);
    this._hud.setLives(this._lives);
    this._hud.showBanner('DRAW TO THROW', Theme.knife);
    this._bannerTimer = 1.8;
  }

  private _cacheCamera(scene: Node): void {
    const camNode = scene.getChildByName('Main Camera');
    this._mainCam = camNode?.getComponent(Camera) ?? null;
  }

  private _buildPlayer(): void {
    this._player = new Node('Player');
    this._world.addChild(this._player);
    const figure = makeStickFigure(this._player, 'Stick');
    figure.setPosition(0, 0, 0);
    figure.setScale(0.9, 0.9, 0.9);
    this._player.setPosition(0, 0, -1.5);
  }

  private _buildUi(scene: Node): void {
    this._canvas = new Node('Canvas');
    scene.addChild(this._canvas);
    this._canvas.layer = Layers.Enum.UI_2D;

    const ut = this._canvas.addComponent(UITransform);
    ut.setContentSize(DESIGN_W, DESIGN_H);

    const canvas = this._canvas.addComponent(Canvas);
    canvas.alignCanvasWithScreen = true;

    const widget = this._canvas.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;

    const camNode = new Node('UiCamera');
    this._canvas.addChild(camNode);
    camNode.layer = Layers.Enum.UI_2D;
    camNode.setPosition(0, 0, 1000);
    const uiCam = camNode.addComponent(Camera);
    uiCam.projection = Camera.ProjectionType.ORTHO;
    uiCam.orthoHeight = DESIGN_H * 0.5;
    uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    uiCam.priority = 10;
    uiCam.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = uiCam;
    this._uiCam = uiCam;

    this._canvas.setPosition(DESIGN_W * 0.5, DESIGN_H * 0.5, 0);
    this._hud = new Hud(this._canvas);
  }

  private _applyUiPortraitFrame = (): void => {
    if (this._applyingUiFrame || !this._canvas?.isValid) return;
    this._applyingUiFrame = true;
    try {
      applyDesignResolution();
      const vis = portraitVisibleSize();
      const ut = this._canvas.getComponent(UITransform);
      if (ut) ut.setContentSize(vis.width, vis.height);
      this._canvas.setPosition(vis.width * 0.5, vis.height * 0.5, 0);
      if (this._uiCam?.isValid) {
        this._uiCam.orthoHeight = vis.height * 0.5;
        this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        applyPortraitCameraRect(this._uiCam);
      }
      if (this._mainCam?.isValid) {
        applyPortraitCameraRect(this._mainCam);
      }
    } finally {
      this._applyingUiFrame = false;
    }
  };

  private _bindInput(): void {
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this._onMouseWheel, this);
  }

  private _teardownInput(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this._onMouseWheel, this);
  }

  private _onTouchStart(e: EventTouch): void {
    // Desktop browsers often synthesize touch+mouse; mouse owns desktop input.
    if (!sys.isMobile) return;
    if (this._drawing || this._pointer || this._mouseHeld) return;
    this._pointer = 'touch';
    this._beginStroke(e.getUILocation(), e.getLocation());
  }

  private _onTouchMove(e: EventTouch): void {
    if (!sys.isMobile) return;
    if (!this._drawing || this._pointer !== 'touch') return;
    const ui = e.getUILocation();
    const screen = e.getLocation();
    this._streamKnives(ui, screen);
    this._recordStroke(ui);
  }

  private _onTouchEnd(e: EventTouch): void {
    if (!sys.isMobile) return;
    if (this._pointer && this._pointer !== 'touch') return;
    if (!this._drawing) {
      this._pointer = null;
      return;
    }
    // Mouse is the real press — ignore ghost touch-end, keep knives held.
    if (this._mouseHeld) {
      this._pointer = 'mouse';
      return;
    }
    const ui = e.getUILocation();
    const screen = e.getLocation();
    this._streamKnives(ui, screen);
    this._recordStroke(ui);
    this._endStroke(screen);
    this._pointer = null;
  }

  private _onMouseDown(e: EventMouse): void {
    if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._mouseHeld = true;
    // Steal stroke from a synthetic touch so release waits for real mouse-up.
    if (this._drawing && this._pointer === 'touch') {
      this._pointer = 'mouse';
      return;
    }
    if (this._drawing || this._pointer) return;
    this._pointer = 'mouse';
    this._beginStroke(e.getUILocation(), e.getLocation());
  }

  private _onMouseMove(e: EventMouse): void {
    if (!this._drawing || this._pointer !== 'mouse') return;
    const ui = e.getUILocation();
    const screen = e.getLocation();
    this._streamKnives(ui, screen);
    this._recordStroke(ui);
  }

  private _onMouseUp(e: EventMouse): void {
    if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._mouseHeld = false;
    if (this._pointer && this._pointer !== 'mouse') return;
    if (!this._drawing) {
      this._pointer = null;
      return;
    }
    const ui = e.getUILocation();
    const screen = e.getLocation();
    this._streamKnives(ui, screen);
    this._recordStroke(ui);
    this._endStroke(screen);
    this._pointer = null;
  }

  /** Mouse wheel = short knife burst toward cursor. */
  private _onMouseWheel(e: EventMouse): void {
    e.propagationStopped = true;
    if (this._drawing || this._wheelCooldown > 0) return;
    if (!this._running) {
      this._restart();
      return;
    }

    const dy = e.getScrollY();
    if (Math.abs(dy) < 0.05) return;

    const screen = e.getLocation();
    this._wheelCooldown = 0.12;
    this._strokeQueue.length = 0;
    this._lastFireUi = null;
    this._lastFireScreen = null;
    const burst = Math.min(8, GameTune.maxKnivesPerStroke);
    for (let i = 0; i < burst; i++) this._emitKnife(screen, false);
    this._hud.showBanner(`${burst} KNIVES`, Theme.knife);
    this._bannerTimer = 0.45;
    this._strokeQueue.length = 0;
  }

  private _beginStroke(ui: Vec2, screen: Vec2): void {
    if (!this._running) {
      this._restart();
      this._pointer = null;
      return;
    }
    this._drawing = true;
    this._throwFade = 0;
    this._stroke = [ui.clone()];
    this._strokeQueue.length = 0;
    this._lastFireUi = ui.clone();
    this._lastFireScreen = screen.clone();
    director.getScheduler().setTimeScale(GameTune.slowMoScale);
    this._hud.setSlowMo(true);
    // First knife sticks under the finger — rest stream while dragging.
    this._emitKnife(screen, true, ui);
    this._realignStrokeKnives();
  }

  private _recordStroke(ui: Vec2): void {
    if (!this._drawing) return;
    const last = this._stroke[this._stroke.length - 1];
    if (last && this._stroke.length > 1 && Vec2.distance(last, ui) < 2) return;
    if (last && Vec2.distance(last, ui) < 0.5) return;
    this._stroke.push(ui.clone());
  }

  private _endStroke(screenEnd: Vec2): void {
    if (!this._drawing) return;

    // Tap with almost no drag: still throw a small burst (still held).
    if (this._strokeQueue.length <= 1 && this._stroke.length <= 2) {
      const tipUi = this._stroke.length > 0 ? this._stroke[this._stroke.length - 1] : null;
      while (this._strokeQueue.length < 3) this._emitKnife(screenEnd, true, tipUi);
      this._realignStrokeKnives();
    }

    const kept = this._strokeQueue.length;
    const gesture = this._stroke.length > 0 ? classifyGesture(this._stroke) : null;
    this._stroke.length = 0;
    this._lastFireUi = null;
    this._lastFireScreen = null;

    // Release: cascade knives out while slow-mo still holds, then fade time back.
    this._drawing = false;
    this._realignStrokeKnives();
    this._launchHeldKnives();
    this._strokeQueue.length = 0;
    this._throwFade = GameTune.throwSlowFade;
    director.getScheduler().setTimeScale(GameTune.throwSlowMo);
    this._hud.setSlowMo(true);

    if (gesture && kept > 0) {
      this._hud.showBanner(`${gesture.label} ×${kept}`, Theme.knife);
      this._bannerTimer = 0.55;
    }
  }

  /** Spawn knives along the stroke as the pointer moves; keep only the newest N. */
  private _streamKnives(ui: Vec2, screen: Vec2): void {
    if (!this._lastFireUi || !this._lastFireScreen) {
      this._lastFireUi = ui.clone();
      this._lastFireScreen = screen.clone();
      this._emitKnife(screen, true, ui);
      this._stickTipKnife(screen, ui);
      this._realignStrokeKnives();
      return;
    }

    let guard = 0;
    while (guard++ < 64) {
      const dx = ui.x - this._lastFireUi.x;
      const dy = ui.y - this._lastFireUi.y;
      const dist = Math.hypot(dx, dy);
      if (dist < GameTune.knifeFireSpacing) break;
      const step = GameTune.knifeFireSpacing / dist;
      this._lastFireUi.x += dx * step;
      this._lastFireUi.y += dy * step;
      // Advance screen by the same fraction of the remaining segment (UI≠screen scale).
      const sdx = screen.x - this._lastFireScreen.x;
      const sdy = screen.y - this._lastFireScreen.y;
      this._lastFireScreen.x += sdx * step;
      this._lastFireScreen.y += sdy * step;
      this._emitKnife(this._lastFireScreen.clone(), true, this._lastFireUi.clone());
    }
    this._stickTipKnife(screen, ui);
    this._realignStrokeKnives();
  }

  /** Newest held knife always hugs the live fingertip. */
  private _stickTipKnife(screen: Vec2, ui: Vec2): void {
    const tip = this._strokeQueue[this._strokeQueue.length - 1];
    if (!tip || !tip.alive || !tip.held) return;
    const hand = this._strokeWorldPos(screen, ui);
    tip.node.setPosition(hand);
  }

  /** Straight into the lane from each knife's rest spot — not along the stroke tip. */
  private _forwardDir(): Vec3 {
    return new Vec3(0, 0, 1);
  }

  /**
   * Hold knives at their stroke samples, tip facing forward (+Z).
   * Do not bend them toward the newest / last point on the trail.
   */
  private _realignStrokeKnives(): void {
    const q = this._strokeQueue;
    const n = q.length;
    if (n < 1) return;

    const dir = this._forwardDir();
    for (let i = 0; i < n; i++) {
      const k = q[i];
      if (!k.alive || !k.held) continue;
      // Orient only — any position rewrite pulls the trail off the cursor.
      k.launchDir.set(dir);
      this._orientKnife(k.node, dir);
    }
  }

  private _emitKnife(screen: Vec2, held: boolean, ui: Vec2 | null = null): void {
    this._knifeSeq++;
    // Place on the cursor camera-ray (held trail + wheel burst).
    const hand = this._strokeWorldPos(screen, ui);

    // Held trail: face forward from rest. Wheel burst: aim into the lane.
    const dir = held ? this._forwardDir() : this._aimDirFrom(hand);

    const node = spawnKnifePrefab(this._world, 'Knife');
    node.setPosition(hand.x, hand.y, hand.z);
    node.setScale(held ? 1.05 : 1.15, held ? 1.05 : 1.15, held ? 1.45 : 1.15);
    this._orientKnife(node, dir);

    const speed = GameTune.knifeSpeed * GameTune.knifeLaunchBoost;
    const knife: Knife = {
      node,
      vel: held ? new Vec3(0, 0, 0) : new Vec3(dir.x * speed, dir.y * speed, dir.z * speed),
      alive: true,
      held,
      launchDir: dir.clone(),
      launchDelay: 0,
      boostT: held ? 0 : 0.2,
      life: held ? 0 : GameTune.knifeMaxLife,
    };
    if (!held) {
      node.setScale(0.85, 0.85, 2.1);
      this._orientKnife(node, dir);
    }
    this._knives.push(knife);
    this._strokeQueue.push(knife);
    this._trimStrokeQueue();
  }

  /**
   * Place a knife exactly under the cursor: stay on the camera ray.
   * Screen Y only picks distance (near/far) — world Y is free, not locked.
   */
  private _strokeWorldPos(screen: Vec2, ui: Vec2 | null = null): Vec3 {
    let t: number;
    if (ui) t = Math.max(0, Math.min(1, ui.y / DESIGN_H));
    else {
      const h = Math.max(1, view.getVisibleSize().height);
      t = Math.max(0, Math.min(1, screen.y / h));
    }
    const eased = t * t * (3 - 2 * t);
    const dist =
      GameTune.strokeNearDist + (GameTune.strokeFarDist - GameTune.strokeNearDist) * eased;
    return this._worldAlongScreenRay(screen, dist);
  }

  /** Aim from a world point into the monster lane (wheel burst only). */
  private _aimDirFrom(from: Vec3): Vec3 {
    const hitY = GameTune.monsterHitY;
    let tx = from.x * 0.35;
    let ty = Math.max(hitY, GameTune.knifeMinY + 0.2);
    let tz = (GameTune.monsterMinZ + GameTune.monsterMaxZ) * 0.55;
    let bestD = Number.POSITIVE_INFINITY;
    for (const m of this._monsters) {
      if (m.hit || !m.node.isValid) continue;
      const dx = m.pos.x - from.x;
      const dy = m.pos.y + hitY - from.y;
      const dz = m.pos.z - from.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        tx = m.pos.x;
        ty = Math.max(m.pos.y + hitY, GameTune.knifeMinY + 0.2);
        tz = m.pos.z;
      }
    }
    const dir = new Vec3(
      tx - from.x,
      Math.max(0.05, ty - from.y + 0.35),
      Math.max(6, tz - from.z),
    );
    dir.normalize();
    return dir;
  }

  private _launchHeldKnives(): void {
    // Only launch when the stroke actually ended — never while still drawing.
    if (this._drawing) return;
    const n = this._strokeQueue.length;
    const forward = this._forwardDir();
    // Tip (newest) leaves first — whip / throw read; rest chase in a cascade.
    for (let i = 0; i < n; i++) {
      const k = this._strokeQueue[n - 1 - i];
      if (!k.alive || !k.held) continue;
      k.held = false;
      k.launchDelay = i * GameTune.knifeStagger;
      k.vel.set(0, 0, 0);
      k.life = GameTune.knifeMaxLife;
      // Straight +Z from rest sample — hit uses full-body capsule, not aim.
      k.launchDir.set(forward);
      this._orientKnife(k.node, forward);
      // Tip has delay 0 — fire immediately; others wait for stagger countdown.
      if (k.launchDelay <= 0) this._fireKnife(k);
    }
  }

  private _fireKnife(k: Knife): void {
    const speed = GameTune.knifeSpeed * GameTune.knifeLaunchBoost;
    k.vel.set(k.launchDir.x * speed, k.launchDir.y * speed, k.launchDir.z * speed);
    k.boostT = 0.28;
    k.life = GameTune.knifeMaxLife;
    k.node.setScale(0.75, 0.75, 2.35);
    this._orientKnife(k.node, k.launchDir);
  }

  /** Hide + destroy so glow shells cannot linger as floor scrap for a frame. */
  private _disposeKnife(k: Knife): void {
    k.alive = false;
    k.held = false;
    k.vel.set(0, 0, 0);
    if (k.node.isValid) {
      k.node.active = false;
      k.node.destroy();
    }
  }

  /** Keep every in-stroke knife glued in place until release. */
  private _freezeHeldKnives(): void {
    for (const k of this._strokeQueue) {
      if (!k.alive) continue;
      k.held = true;
      k.launchDelay = 0;
      k.vel.set(0, 0, 0);
    }
  }

  /** Cancel older knives from this stroke so only the newest N remain. */
  private _trimStrokeQueue(): void {
    while (this._strokeQueue.length > GameTune.maxKnivesPerStroke) {
      const old = this._strokeQueue.shift();
      if (!old) break;
      this._disposeKnife(old);
      const idx = this._knives.indexOf(old);
      if (idx >= 0) this._knives.splice(idx, 1);
    }
  }

  /** World point on the cursor ray at a given distance from the camera. */
  private _worldAlongScreenRay(screen: Vec2, distance: number): Vec3 {
    if (!this._mainCam) return new Vec3(0, GameTune.strokeHeight, GameTune.handZ);
    const ray = new geometry.Ray();
    // getLocation() space matches screenPointToRay in CC 3.8.
    this._mainCam.screenPointToRay(screen.x, screen.y, ray);
    const len = Math.hypot(ray.d.x, ray.d.y, ray.d.z) || 1;
    const inv = distance / len;
    return new Vec3(
      ray.o.x + ray.d.x * inv,
      ray.o.y + ray.d.y * inv,
      ray.o.z + ray.d.z * inv,
    );
  }

  private _orientKnife(node: Node, dir: Vec3): void {
    const yaw = (Math.atan2(dir.x, dir.z) * 180) / Math.PI;
    const pitch = (-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 180) / Math.PI;
    node.setRotationFromEuler(pitch, yaw, 0);
  }

  update(dt: number): void {
    if (this._wheelCooldown > 0) this._wheelCooldown = Math.max(0, this._wheelCooldown - dt);
    if (!this._running) return;
    this._time += dt;

    // Hard lock: while finger/mouse is down, knives must not fly.
    if (this._drawing) this._freezeHeldKnives();

    // After release: hold slow-mo so the cascade is readable, then ease out.
    if (!this._drawing && this._throwFade > 0) {
      this._throwFade = Math.max(0, this._throwFade - dt);
      const u = 1 - this._throwFade / GameTune.throwSlowFade;
      const s = u * u * (3 - 2 * u); // smoothstep
      const scale = GameTune.throwSlowMo + (1 - GameTune.throwSlowMo) * s;
      director.getScheduler().setTimeScale(scale);
      if (this._throwFade <= 0) {
        director.getScheduler().setTimeScale(1);
        this._hud.setSlowMo(false);
      }
    }

    this._waveTimer -= dt;
    if (this._waveTimer <= 0 && this._monsters.length < GameTune.maxMonsters) {
      this._spawnWave();
      this._waveTimer = Math.max(1.1, GameTune.waveGap - this._level * 0.08);
    }

    this._tickMonsters(dt);
    this._tickKnives(dt);
    this._resolveHits();
    this._tickShatters(dt);
    // Wipe floor glow slots every frame so dead knives never leave puddles.
    this._arena.setReflectLights([]);

    if (this._hintTimer > 0) {
      this._hintTimer -= dt;
      if (this._hintTimer <= 0) this._hud.hideHint();
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this._hud.hideBanner();
    }
  }

  private _spawnWave(): void {
    const count = Math.min(
      GameTune.waveSize + Math.floor((this._level - 1) / 2),
      GameTune.maxMonsters - this._monsters.length,
    );
    for (let i = 0; i < count; i++) this._spawnMonster();
  }

  private _spawnMonster(): void {
    void this._spawnMonsterAsync();
  }

  private async _spawnMonsterAsync(): Promise<void> {
    const node = await spawnMonsterPrefab(this._world, 'Enemy01');
    const x =
      GameTune.monsterMinX + Math.random() * (GameTune.monsterMaxX - GameTune.monsterMinX);
    const z =
      GameTune.monsterMinZ + Math.random() * (GameTune.monsterMaxZ - GameTune.monsterMinZ);
    const pos = new Vec3(x, GameTune.monsterY, z);
    node.setPosition(pos);
    this._monsters.push({ node, pos, hit: false });
  }

  private _tickMonsters(dt: number): void {
    const approach = GameTune.monsterApproach + this._level * 0.12;
    for (let i = this._monsters.length - 1; i >= 0; i--) {
      const m = this._monsters[i];
      if (m.hit) continue;
      m.pos.z -= approach * dt;
      m.pos.y = GameTune.monsterY;
      m.node.setPosition(m.pos);
      // Face the player (toward -Z); don't spin — lets run/idle anim read clearly.
      m.node.setRotationFromEuler(0, 180, 0);

      if (m.pos.z < GameTune.monsterDangerZ) {
        this._onMonsterBreach(m);
        m.node.destroy();
        this._monsters.splice(i, 1);
      }
    }
  }

  private _tickKnives(dt: number): void {
    for (let i = this._knives.length - 1; i >= 0; i--) {
      const k = this._knives[i];
      if (!k.alive || !k.node.isValid) {
        this._disposeKnife(k);
        this._knives.splice(i, 1);
        continue;
      }
      if (k.held) continue;

      // Staggered release: keep rest pose, then punch out.
      if (k.launchDelay > 0) {
        k.launchDelay -= dt;
        if (k.launchDelay <= 0) this._fireKnife(k);
        continue;
      }

      k.life -= dt;
      if (k.life <= 0) {
        this._disposeKnife(k);
        this._knives.splice(i, 1);
        continue;
      }

      if (k.boostT > 0) {
        k.boostT = Math.max(0, k.boostT - dt);
        const t = k.boostT / 0.28;
        // Stretch along flight, then settle.
        const zScale = 1.55 + 1.1 * t;
        const xy = 0.9 - 0.2 * t;
        k.node.setScale(xy, xy, zScale);
        // Extra surge in the first beats of flight.
        const surge = 1 + 0.75 * t;
        k.vel.set(
          k.launchDir.x * GameTune.knifeSpeed * GameTune.knifeLaunchBoost * surge,
          k.launchDir.y * GameTune.knifeSpeed * GameTune.knifeLaunchBoost * surge,
          k.launchDir.z * GameTune.knifeSpeed * GameTune.knifeLaunchBoost * surge,
        );
      } else {
        const cur = k.node.scale;
        k.node.setScale(
          cur.x + (1.05 - cur.x) * Math.min(1, dt * 8),
          cur.y + (1.05 - cur.y) * Math.min(1, dt * 8),
          cur.z + (1.55 - cur.z) * Math.min(1, dt * 8),
        );
      }

      const p = k.node.position;
      const ny = p.y + k.vel.y * dt;
      // Dipping to the grid = scrap light; cull instead of clamping into a puddle.
      if (ny < GameTune.knifeMinY) {
        this._disposeKnife(k);
        this._knives.splice(i, 1);
        continue;
      }
      k.node.setPosition(p.x + k.vel.x * dt, ny, p.z + k.vel.z * dt);
      this._orientKnife(k.node, k.launchDir);
      if (
        k.node.position.z > GameTune.monsterMaxZ + 8 ||
        k.node.position.z < GameTune.strokeNearZ - 1.5 ||
        Math.abs(k.node.position.x) > 16
      ) {
        this._disposeKnife(k);
        this._knives.splice(i, 1);
      }
    }
  }

  private _resolveHits(): void {
    // Vertical capsule: XZ disk + Y from feet through head (old torso sphere missed head).
    const r2 = GameTune.knifeHitRadius * GameTune.knifeHitRadius;
    const y0 = GameTune.monsterHitMinY;
    const y1 = GameTune.monsterHitMaxY;
    for (const k of this._knives) {
      // Held trail knives sit on the stroke and must not count as hits.
      if (!k.alive || k.held) continue;
      const kp = k.node.position;
      for (const m of this._monsters) {
        if (m.hit) continue;
        const localY = kp.y - m.pos.y;
        if (localY < y0 || localY > y1) continue;
        const dx = kp.x - m.pos.x;
        const dz = kp.z - m.pos.z;
        if (dx * dx + dz * dz <= r2) {
          m.hit = true;
          this._disposeKnife(k);
          this._onHit(m);
          break;
        }
      }
    }

    for (let i = this._monsters.length - 1; i >= 0; i--) {
      if (!this._monsters[i].hit) continue;
      this._spawnDeathShatter(this._monsters[i]);
      this._monsters[i].node.destroy();
      this._monsters.splice(i, 1);
    }
  }

  private _spawnDeathShatter(m: Monster): void {
    const p = m.node.isValid ? m.node.worldPosition.clone() : m.pos.clone();
    // Lift to torso so the burst reads as a body break, not floor scrap.
    p.y += 1.15;
    this._shatters.push(spawnMonsterShatter(this._world, p));
  }

  private _tickShatters(dt: number): void {
    for (let i = this._shatters.length - 1; i >= 0; i--) {
      const fx = this._shatters[i];
      if (!fx.root.isValid || !tickShatter(fx, dt)) {
        if (fx.root.isValid) fx.root.destroy();
        this._shatters.splice(i, 1);
      }
    }
  }

  private _onHit(_m: Monster): void {
    this._score += 10 + this._level * 2;
    this._hitsThisLevel += 1;
    this._hud.setScore(this._score);

    if (this._hitsThisLevel >= GameTune.hitsPerLevel) {
      this._level += 1;
      this._hitsThisLevel = 0;
      this._hud.setLevel(this._level);
      this._hud.showBanner(`LEVEL ${this._level}`, Theme.halo);
      this._bannerTimer = 1.1;
    }
  }

  private _onMonsterBreach(_m: Monster): void {
    this._lives -= 1;
    this._hud.setLives(this._lives);
    if (this._lives <= 0) this._gameOver();
    else {
      this._hud.showBanner('BREACH', Theme.danger);
      this._bannerTimer = 0.7;
    }
  }

  private _gameOver(): void {
    this._running = false;
    this._drawing = false;
    this._pointer = null;
    this._mouseHeld = false;
    this._throwFade = 0;
    director.getScheduler().setTimeScale(1);
    this._hud.setSlowMo(false);
    this._hud.showBanner('TAP TO RETRY', Theme.uiWhite);
  }

  private _restart(): void {
    for (const m of this._monsters) m.node.destroy();
    this._monsters.length = 0;
    for (const fx of this._shatters) {
      if (fx.root.isValid) fx.root.destroy();
    }
    this._shatters.length = 0;
    for (const k of this._knives) this._disposeKnife(k);
    this._knives.length = 0;
    this._arena?.setReflectLights([]);
    this._strokeQueue.length = 0;
    this._stroke.length = 0;
    this._lastFireUi = null;
    this._mouseHeld = false;
    this._pointer = null;
    this._drawing = false;
    this._throwFade = 0;
    director.getScheduler().setTimeScale(1);
    this._hud.setSlowMo(false);
    this._level = 1;
    this._score = 0;
    this._lives = GameTune.startLives;
    this._hitsThisLevel = 0;
    this._waveTimer = 0.5;
    this._running = true;
    this._hud.setLevel(this._level);
    this._hud.setScore(this._score);
    this._hud.setLives(this._lives);
    this._hud.showBanner('GO!', Theme.knife);
    this._bannerTimer = 0.8;
  }
}

