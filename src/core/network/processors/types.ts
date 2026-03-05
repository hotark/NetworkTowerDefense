// Core Layer: NodeProcessor Strategy interface

import type { TowerNode, HeldPacket, NetworkView } from '@core/types';
import type { GameConfig } from '@core/config';

export interface NodeProcessor {
  processHeld(
    node: TowerNode,
    held: HeldPacket,
    view: NetworkView,
    config: GameConfig,
  ): void;
}
