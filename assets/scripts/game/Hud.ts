import {
  Color,
  Label,
  Layers,
  Node,
  UITransform,
  Widget,
} from 'cc';
import { DESIGN_H, DESIGN_W, Theme } from './Theme';

function markUi(node: Node): void {
  node.layer = Layers.Enum.UI_2D;
}

export class Hud {
  readonly root: Node;
  private _levelLabel: Label;
  private _scoreLabel: Label;
  private _hintLabel: Label;
  private _slowLabel: Label;
  private _livesLabel: Label;
  private _bannerLabel: Label;

  constructor(canvas: Node) {
    this.root = new Node('Hud');
    canvas.addChild(this.root);
    markUi(this.root);
    const ut = this.root.addComponent(UITransform);
    ut.setContentSize(DESIGN_W, DESIGN_H);
    const widget = this.root.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;

    this._levelLabel = this._mkLabel('Level', 'LEVEL 1', 52, Theme.uiWhite, 0, DESIGN_H * 0.5 - 120, 0.5, 1);
    this._levelLabel.node.active = false;
    this._scoreLabel = this._mkLabel('Score', '0', 40, Theme.uiDim, 0, DESIGN_H * 0.5 - 180, 0.5, 1);
    this._scoreLabel.node.active = false;
    this._livesLabel = this._mkLabel('Lives', '♥♥♥', 36, Theme.danger, DESIGN_W * 0.5 - 80, DESIGN_H * 0.5 - 120, 1, 1);
    this._slowLabel = this._mkLabel('Slow', 'SLOW-MO DRAW', 34, Theme.halo, 0, -DESIGN_H * 0.5 + 220, 0.5, 0);
    this._slowLabel.node.active = false;
    this._hintLabel = this._mkLabel(
      'Hint',
      '单击/上下滑/拖拽出刀：直刺 · 横扫 · 弧线 · 折线',
      28,
      Theme.uiDim,
      0,
      -DESIGN_H * 0.5 + 140,
      0.5,
      0,
    );
    this._hintLabel.node.active = false;
    this._bannerLabel = this._mkLabel('Banner', '', 64, Theme.knife, 0, 80, 0.5, 0.5);
    this._bannerLabel.node.active = false;
  }

  private _mkLabel(
    name: string,
    text: string,
    size: number,
    color: Color,
    x: number,
    y: number,
    anchorX: number,
    anchorY: number,
  ): Label {
    const n = new Node(name);
    this.root.addChild(n);
    markUi(n);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(900, 90);
    ut.setAnchorPoint(anchorX, anchorY);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.color = color;
    label.isBold = true;
    label.overflow = Label.Overflow.NONE;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }

  setLevel(level: number): void {
    this._levelLabel.string = `LEVEL ${level}`;
  }

  setScore(score: number): void {
    this._scoreLabel.string = `${score}`;
  }

  setLives(lives: number): void {
    this._livesLabel.string = '♥'.repeat(Math.max(0, lives)) || '—';
  }

  setSlowMo(_on: boolean): void {
    this._slowLabel.node.active = false;
  }

  showBanner(_text: string, _color?: Color): void {
    this._bannerLabel.node.active = false;
  }

  hideBanner(): void {
    this._bannerLabel.node.active = false;
  }

  hideHint(): void {
    this._hintLabel.node.active = false;
  }

  dispose(): void {
    this.root.destroy();
  }
}
