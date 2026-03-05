// Core Layer: パケットシステム — 容量チェック・charge規則・emit共通ヘルパー

import type {
  NodeId, EdgeId,
  Edge, Packet, NetworkView,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { generatePacketId, outgoingEdges, getEdgeMetrics } from '@core/state';
import { dist } from '@core/spatial/math';

/** エッジ上のcharge合計 */
export function chargeOnEdge(view: NetworkView, edgeId: EdgeId): number {
  let total = 0;
  for (const p of view.packets.values()) {
    if (p.edgeId === edgeId) total += p.charge;
  }
  return total;
}

/** パケットをエッジに送出（容量チェック付き、部分送信対応） */
export function emitPacket(
  view: NetworkView, _nodeId: NodeId, edge: Edge, charge: number, config: GameConfig,
): Packet | null {
  if (edge.status !== 'active') return null;
  const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
  const capacity = edgeLvl.capacity;
  const currentCharge = chargeOnEdge(view, edge.id);
  const available = capacity - currentCharge;
  if (available < 1) return null;
  const actualCharge = Math.min(charge, Math.floor(available));

  const fromNode = view.nodes.get(edge.from);
  const toNode = view.nodes.get(edge.to);
  if (!fromNode || !toNode) return null;
  const len = dist(fromNode, toNode);
  if (len < 1) return null;

  return {
    id: generatePacketId(),
    edgeId: edge.id,
    progress: 0,
    charge: actualCharge,
    speed: config.PACKET_SPEED * edgeLvl.speedMultiplier,
  };
}

/** emitPacket + エッジメトリクス追跡 */
export function emitPacketTracked(
  view: NetworkView, nodeId: NodeId, edge: Edge, charge: number, config: GameConfig,
): Packet | null {
  const p = emitPacket(view, nodeId, edge, charge, config);
  const em = getEdgeMetrics(view, edge.id);
  em.sent += charge;          // 送出を試みた総charge
  if (p) {
    const chargeLost = charge - p.charge;
    if (chargeLost > 0) em.lost += chargeLost;
  } else {
    em.lost += charge;         // 全量ロス
  }
  return p;
}

/** アクティブな送信先のみフィルタした出力エッジ */
export function getFilteredOutgoing(view: NetworkView, nodeId: NodeId): Edge[] {
  return outgoingEdges(view, nodeId).filter(e => {
    const dest = view.nodes.get(e.to);
    return dest && dest.status === 'active' && dest.type !== 'generator';
  });
}
