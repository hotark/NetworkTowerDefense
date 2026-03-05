// Core Layer: AttackProcessor — ammo += 1 変換、charge>1は残りを再キュー

import type { NodeProcessor } from './types';
import { getTowerLevelStats } from '@core/config';
import { getAttackTowerMetrics } from '@core/state';

export const attackProcessor: NodeProcessor = {
  processHeld(node, held, view, config) {
    node.ammo += 1;
    const atm = getAttackTowerMetrics(view, node.id);
    atm.receivedAmmo++;
    if (held.charge > 1) {
      const holdTime = getTowerLevelStats(config, node.type, node.level).holdTime;
      node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: held.charge - 1 });
    }
  },
};
