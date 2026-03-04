// Game Layer: Packet generation, edge movement, hold-queue processing

import type {
  NodeId, EdgeId, PacketId,
  TowerNode, Edge, Packet, HeldPacket,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import type { GameState } from '@core/state';
import {
  generatePacketId,
  outgoingEdges,
} from '@core/state';

// ── ヘルパー ──

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** エッジ上のcharge合計 */
export function chargeOnEdge(state: GameState, edgeId: EdgeId): number {
  let total = 0;
  for (const p of state.packets.values()) {
    if (p.edgeId === edgeId) total += p.charge;
  }
  return total;
}

/** パケットをエッジに送出（容量チェック付き、部分送信対応） */
function emitPacket(
  state: GameState, _nodeId: NodeId, edge: Edge, charge: number, config: GameConfig,
): Packet | null {
  if (edge.status !== 'active') return null;
  const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
  const capacity = edgeLvl.capacity;
  const currentCharge = chargeOnEdge(state, edge.id);
  const available = capacity - currentCharge;
  if (available < 1) return null;
  const actualCharge = Math.min(charge, Math.floor(available));

  const fromNode = state.nodes.get(edge.from);
  const toNode = state.nodes.get(edge.to);
  if (!fromNode || !toNode) return null;
  const len = dist(fromNode.x, fromNode.y, toNode.x, toNode.y);
  if (len < 1) return null;

  return {
    id: generatePacketId(),
    edgeId: edge.id,
    progress: 0,
    charge: actualCharge,
    speed: config.PACKET_SPEED * edgeLvl.speedMultiplier,
  };
}

// ── 公開API ──

/** 生成器のタイマーを進め、パケットを生成 */
export function tickGenerators(state: GameState, config: GameConfig, dt: number): void {
  for (const node of state.nodes.values()) {
    if (node.type !== 'generator') continue;
    if (node.status !== 'active') continue;

    const stats = getTowerLevelStats(config, 'generator', node.level);
    node.cooldown -= dt;
    if (node.cooldown > 0) continue;
    node.cooldown = stats.interval ?? 2.0;

    const edges = outgoingEdges(state, node.id);
    if (edges.length === 0) continue;

    let sent = false;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      // 送信先ノードチェック
      const dest = state.nodes.get(edge.to);
      if (!dest || dest.status !== 'active' || dest.type === 'generator') continue;

      const p = emitPacket(state, node.id, edge, 1, config);
      if (p) {
        state.packets.set(p.id, p);
        node.nextOut += i + 1;
        sent = true;
        break;
      }
    }
    if (!sent) node.cooldown = 0; // 全エッジ拒否 → 次フレームで再試行
  }
}

/** パケットをエッジ上で移動させ、到着したものをholdキューに追加 */
export function updatePackets(state: GameState, config: GameConfig, dt: number): void {
  const toDelete: PacketId[] = [];

  for (const p of state.packets.values()) {
    const edge = state.edges.get(p.edgeId);
    if (!edge) {
      toDelete.push(p.id);
      continue;
    }

    const fromNode = state.nodes.get(edge.from);
    const toNode = state.nodes.get(edge.to);
    if (!fromNode || !toNode) {
      toDelete.push(p.id);
      continue;
    }

    const len = dist(fromNode.x, fromNode.y, toNode.x, toNode.y);
    if (len < 1) { toDelete.push(p.id); continue; }

    const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
    p.progress += (config.PACKET_SPEED * edgeLvl.speedMultiplier / len) * dt;

    if (p.progress >= 1) {
      const destNode = state.nodes.get(edge.to);
      if (destNode && destNode.type !== 'generator') {
        const holdTime = getTowerLevelStats(config, destNode.type, destNode.level).holdTime;
        destNode.held.push({
          timer: holdTime,
          fromEdgeId: p.edgeId,
          charge: p.charge,
        });
      }
      toDelete.push(p.id);
    }
  }

  for (const id of toDelete) {
    state.packets.delete(id);
  }
}

/** holdキューのタイマーを進め、処理可能なパケットをタイプ別に処理 */
export function tickHeldPackets(state: GameState, config: GameConfig, dt: number): void {
  for (const node of state.nodes.values()) {
    if (node.held.length === 0) continue;
    if (node.status !== 'active') continue;

    const h = node.held[0];
    h.timer -= dt;
    if (h.timer > 0) continue;

    node.held.shift();
    processHeldPacket(state, config, node, h);
  }
}

/** ノードタイプ別のパケット処理 */
function processHeldPacket(
  state: GameState, config: GameConfig, node: TowerNode, h: HeldPacket,
): void {
  const charge = h.charge;
  const holdTime = getTowerLevelStats(config, node.type, node.level).holdTime;

  // 攻撃タワー → ammo変換（1サイクル=1 charge）
  if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
    node.ammo += 1;
    if (charge > 1) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge - 1 });
    }
    return;
  }

  // リピーター → charge増幅して送出
  if (node.type === 'repeater') {
    const stats = getTowerLevelStats(config, 'repeater', node.level);
    const outCharge = charge + (stats.chargeBoost ?? 0);
    const edges = getFilteredOutgoing(state, node.id);

    if (edges.length === 0) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: outCharge });
      return;
    }

    let remaining = outCharge;
    let sentAny = false;
    for (let i = 0; i < edges.length && remaining > 0; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const p = emitPacket(state, node.id, edge, remaining, config);
      if (p) {
        state.packets.set(p.id, p);
        remaining -= p.charge;
        sentAny = true;
      }
    }
    if (sentAny) node.nextOut++;
    if (remaining > 0) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: remaining });
    }
    return;
  }

  // 分配器 → 1 charge消費してfanout先に分配
  if (node.type === 'distributor') {
    const stats = getTowerLevelStats(config, 'distributor', node.level);
    const edges = getFilteredOutgoing(state, node.id);

    if (edges.length === 0) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge });
      return;
    }

    const fanout = Math.min(stats.maxFanout ?? 2, edges.length);
    let sent = 0;
    for (let i = 0; i < fanout; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const p = emitPacket(state, node.id, edge, 1, config);
      if (p) { state.packets.set(p.id, p); sent++; }
    }
    node.nextOut += fanout;

    if (sent === 0) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge });
    } else if (charge > 1) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge - 1 });
    }
    return;
  }

  // デフォルト → 1 charge転送
  const edges = getFilteredOutgoing(state, node.id);

  if (edges.length > 0) {
    let sent = false;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(node.nextOut + i) % edges.length];
      const p = emitPacket(state, node.id, edge, 1, config);
      if (p) {
        state.packets.set(p.id, p);
        node.nextOut += i + 1;
        sent = true;
        if (charge > 1) {
          node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge - 1 });
        }
        break;
      }
    }
    if (!sent) {
      node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge });
    }
  } else {
    node.held.push({ timer: holdTime, fromEdgeId: h.fromEdgeId, charge: charge });
  }
}

/** アクティブな送信先のみフィルタした出力エッジ */
function getFilteredOutgoing(state: GameState, nodeId: NodeId): Edge[] {
  return outgoingEdges(state, nodeId).filter(e => {
    const dest = state.nodes.get(e.to);
    return dest && dest.status === 'active' && dest.type !== 'generator';
  });
}

/** パケットの現在ワールド座標を算出 */
export function packetPosition(
  packet: Packet, state: GameState,
): { x: number; y: number } | null {
  const edge = state.edges.get(packet.edgeId);
  if (!edge) return null;
  const from = state.nodes.get(edge.from);
  const to = state.nodes.get(edge.to);
  if (!from || !to) return null;
  return {
    x: from.x + (to.x - from.x) * packet.progress,
    y: from.y + (to.y - from.y) * packet.progress,
  };
}
