import { _decorator, Component } from 'cc';

const { ccclass, property } = _decorator;

/** Prefab stub — collision gizmo/config from unit editor pack. */
@ccclass('UnitCollisionVolume')
export class UnitCollisionVolume extends Component {
  @property
  unitId = 0;

  @property
  collisionRadius = 0.5;

  @property
  collisionHeight = 1.5;

  @property
  collisionCenterY = 0.75;

  @property
  showInEditor = true;

  @property
  showInRuntime = false;
}
