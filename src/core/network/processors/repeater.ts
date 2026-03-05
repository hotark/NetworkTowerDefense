// Core Layer: RepeaterProcessor — charge=1+boost送出

import type { NodeProcessor } from './types';
import { getTowerLevelStats } from '@core/config';
import { getQueueNodeMetrics } from '@core/state';
import { emitPacketTracked, getFilteredOutgoing } from '../logic';

export const repeaterProcessor: NodeProcessor = {
  processHeld(node, held, view, config) {
    const stats = getTowerLevelStats(config, 'repeater', node.level);
    const holdTime = stats.holdTime;
    const boost = stats.chargeBoost ?? 0;
    const emitCharge = 1 + boost; // 増幅: 1 charge → 1+boost charge

    const edges = getFilteredOutgoing(view, node.id);
    if (edges.length === 0) {
      if (node.held.length < config.DIST_REP_MAX_QUEUE) {
        node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: 1 });
      }
      return;
    }

    const qm = getQueueNodeMetrics(view, node.id);
    let sent = false;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const p = emitPacketTracked(view, node.id, edge, emitCharge, config);
      if (p) {
        view.packets.set(p.id, p);
        node.nextOut += i + 1;
        qm.forwarded++;
        sent = true;
        break;
      }
    }
    if (!sent && node.held.length < config.DIST_REP_MAX_QUEUE) {
      node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: 1 });
    }
  },
};
