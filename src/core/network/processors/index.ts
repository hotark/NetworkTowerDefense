// Core Layer: NodeProcessor dispatch map

import type { NodeType } from '@core/types';
import type { NodeProcessor } from './types';
import { attackProcessor } from './attack';
import { repeaterProcessor } from './repeater';
import { distributorProcessor } from './distributor';
import { getTowerLevelStats } from '@core/config';
import { emitPacketTracked, getFilteredOutgoing } from '../logic';

/** デフォルト: 1 charge転送 */
const defaultProcessor: NodeProcessor = {
  processHeld(node, held, view, config) {
    const holdTime = getTowerLevelStats(config, node.type, node.level).holdTime;
    const edges = getFilteredOutgoing(view, node.id);

    if (edges.length > 0) {
      let sent = false;
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[(node.nextOut + i) % edges.length];
        const p = emitPacketTracked(view, node.id, edge, 1, config);
        if (p) {
          view.packets.set(p.id, p);
          node.nextOut += i + 1;
          sent = true;
          if (held.charge > 1) {
            node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: held.charge - 1 });
          }
          break;
        }
      }
      if (!sent && node.held.length < config.DIST_REP_MAX_QUEUE) {
        node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: held.charge });
      }
    } else if (node.held.length < config.DIST_REP_MAX_QUEUE) {
      node.held.push({ timer: holdTime, fromEdgeId: held.fromEdgeId, charge: held.charge });
    }
  },
};

export const processorMap: Record<NodeType, NodeProcessor> = {
  repeater: repeaterProcessor,
  distributor: distributorProcessor,
  sniper: attackProcessor,
  rapid: attackProcessor,
  cannon: attackProcessor,
  generator: defaultProcessor,
};

export type { NodeProcessor } from './types';
