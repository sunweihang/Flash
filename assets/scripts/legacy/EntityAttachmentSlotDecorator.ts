import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AttachmentSlotMapping')
export class AttachmentSlotMapping {
  @property
  slot = 0;

  @property(Node)
  target: Node | null = null;
}

/** Prefab stub for unit attachment slots from the full framework pack. */
@ccclass('EntityAttachmentSlotDecorator')
export class EntityAttachmentSlotDecorator extends Component {
  @property([AttachmentSlotMapping])
  slotMappings: AttachmentSlotMapping[] = [];

  @property
  autoScanOnLoad = true;
}
