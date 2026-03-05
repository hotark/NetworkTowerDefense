// Core Layer: パケットシステム — 座標計算

import type { Packet, NetworkView } from '@core/types';

/** パケットの現在ワールド座標を算出 */
export function packetPosition(
  packet: Packet, view: NetworkView,
): { x: number; y: number } | null {
  const edge = view.edges.get(packet.edgeId);
  if (!edge) return null;
  const from = view.nodes.get(edge.from);
  const to = view.nodes.get(edge.to);
  if (!from || !to) return null;
  return {
    x: from.x + (to.x - from.x) * packet.progress,
    y: from.y + (to.y - from.y) * packet.progress,
  };
}
