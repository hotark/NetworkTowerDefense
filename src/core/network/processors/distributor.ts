// Core Layer: DistributorProcessor — charge=1 × fanout送出

import type { NodeProcessor } from './types';
import { getTowerLevelStats } from '@core/config';
import { getQueueNodeMetrics } from '@core/state';
import { emitPacketTracked, getFilteredOutgoing } from '../logic';

export const distributorProcessor: NodeProcessor = {
  processHeld(node, held, view, config) {
    const stats = getTowerLevelStats(config, 'distributor', node.level);
    const holdTime = getTowerLevelStats(config, node.type, node.level).holdTime;
    const edges = getFilteredOutgoing(view, node.id);

    if (edges.length === 0) {
      if (node.held.length < config.DIST_REP_MAX_QUEUE) {
        node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: held.charge });
      }
      return;
    }

    const qm = getQueueNodeMetrics(view, node.id);
    const fanout = Math.min(stats.maxFanout ?? 2, edges.length);
    let sent = 0;
    for (let i = 0; i < fanout; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const p = emitPacketTracked(view, node.id, edge, 1, config);
      if (p) { view.packets.set(p.id, p); sent++; qm.forwarded++; }
    }
    node.nextOut += fanout;

    if (sent === 0 && node.held.length < config.DIST_REP_MAX_QUEUE) {
      node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: 1 });
    }
  },
};
