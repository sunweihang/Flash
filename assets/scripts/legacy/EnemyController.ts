import { _decorator, Animation, CCFloat, CCInteger, Component, MeshRenderer, Node } from 'cc';

const { ccclass, property } = _decorator;

/** Prefab stub — Flash uses GameController hit logic, not this AI. */
@ccclass('EnemyController')
export class EnemyController extends Component {
  @property({ type: Animation })
  m_animation: Animation | null = null;

  @property(MeshRenderer)
  m_mesh: MeshRenderer | null = null;

  @property(Node)
  hitBone: Node | null = null;

  @property(CCFloat)
  Speed = 2;

  @property(CCInteger)
  maxHealth = 100;

  @property(CCFloat)
  deadTime = 1;
}
