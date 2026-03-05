// Core Layer: パケットシステム — Tickオーケストレーション

import type {
  PacketId,
  NetworkView,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import {
  outgoingEdges,
  getGeneratorMetrics,
  getQueueNodeMetrics,
  getEdgeMetrics,
} from '@core/state';
import { dist } from '@core/spatial/math';
import { emitPacketTracked } from './logic';
import { processorMap } from './processors';

/** 生成器のタイマーを進め、パケットを生成 */
export function tickGenerators(view: NetworkView, config: GameConfig, dt: number): void {
  for (const node of view.nodes.values()) {
    if (node.type !== 'generator') continue;
    if (node.status !== 'active') continue;

    const stats = getTowerLevelStats(config, 'generator', node.level);
    node.cooldown -= dt;
    if (node.cooldown > 0) continue;
    node.cooldown = stats.interval ?? 2.0;

    const edges = outgoingEdges(view, node.id);
    if (edges.length === 0) continue;

    const gm = getGeneratorMetrics(view, node.id);
    let sent = false;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const dest = view.nodes.get(edge.to);
      if (!dest || dest.status !== 'active' || dest.type === 'generator') continue;

      const p = emitPacketTracked(view, node.id, edge, 1, config);
      if (p) {
        view.packets.set(p.id, p);
        node.nextOut += i + 1;
        sent = true;
        gm.generated++;
        break;
      }
    }
    if (!sent) { node.cooldown = 0; gm.blocked++; }
  }
}

/** パケットをエッジ上で移動させ、到着したものをholdキューに追加 */
export function updatePackets(view: NetworkView, config: GameConfig, dt: number): void {
  const toDelete: PacketId[] = [];

  for (const p of view.packets.values()) {
    const edge = view.edges.get(p.edgeId);
    if (!edge || edge.status !== 'active') {
      if (edge && edge.status !== 'active') {
        const em = getEdgeMetrics(view, edge.id);
        em.lost += p.charge;
      }
      toDelete.push(p.id);
      continue;
    }

    const fromNode = view.nodes.get(edge.from);
    const toNode = view.nodes.get(edge.to);
    if (!fromNode || !toNode) {
      toDelete.push(p.id);
      continue;
    }

    const len = dist(fromNode, toNode);
    if (len < 1) { toDelete.push(p.id); continue; }

    const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
    p.progress += (config.PACKET_SPEED * edgeLvl.speedMultiplier / len) * dt;

    if (p.progress >= 1) {
      const destNode = view.nodes.get(edge.to);
      if (destNode && destNode.type !== 'generator') {
        const holdTime = getTowerLevelStats(config, destNode.type, destNode.level).holdTime;
        if (destNode.type === 'distributor' || destNode.type === 'repeater') {
          const qm = getQueueNodeMetrics(view, destNode.id);
          const em = getEdgeMetrics(view, edge.id);
          for (let c = 0; c < p.charge; c++) {
            if (destNode.held.length >= config.DIST_REP_MAX_QUEUE) {
              qm.dropped++;
              em.lost += 1;
            } else {
              destNode.held.push({ timer: holdTime, fromEdgeId: p.edgeId, charge: 1 });
              qm.received++;
            }
          }
        } else {
          destNode.held.push({
            timer: holdTime,
            fromEdgeId: p.edgeId,
            charge: p.charge,
          });
        }
      }
      toDelete.push(p.id);
    }
  }

  for (const id of toDelete) {
    view.packets.delete(id);
  }
}

/** holdキューのタイマーを進め、処理可能なパケットをタイプ別に処理 */
export function tickHeldPackets(view: NetworkView, config: GameConfig, dt: number): void {
  for (const node of view.nodes.values()) {
    if (node.held.length === 0) continue;
    if (node.status !== 'active') continue;

    const h = node.held[0];
    h.timer -= dt;
    if (h.timer > 0) continue;

    node.held.shift();
    const processor = processorMap[node.type];
    processor.processHeld(node, h, view, config);
  }
}
