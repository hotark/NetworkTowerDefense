// Game Layer: Resource management, costs, upgrades, build timers

import type { NodeId, EdgeId, NodeType, TowerNode } from '@core/types';
import type { GameConfig } from '@core/config';
import {
  getTowerCost,
  getUpgradeCost,
  getEdgeUpgradeCost,
  getBuildDuration,
  getUpgradeDuration,
  getTowerHp,
  getEdgeLevelStats,
} from '@core/config';
import type { GameState } from '@core/state';
import {
  generateNodeId,
  generateEdgeId,
  connectedEdges,
} from '@core/state';

// ── アクション型 ──

export type EconomyAction =
  | { type: 'place-tower'; nodeType: NodeType; x: number; y: number }
  | { type: 'upgrade-tower'; nodeId: NodeId }
  | { type: 'upgrade-edge'; edgeId: EdgeId }
  | { type: 'create-edge'; from: NodeId; to: NodeId };

// ── コスト判定 ──

export function canAfford(state: GameState, config: GameConfig, action: EconomyAction): boolean {
  return getCost(state, config, action) <= state.resources;
}

function getCost(state: GameState, config: GameConfig, action: EconomyAction): number {
  switch (action.type) {
    case 'place-tower':
      return getTowerCost(config, action.nodeType);
    case 'upgrade-tower': {
      const node = state.nodes.get(action.nodeId);
      if (!node) return Infinity;
      return getUpgradeCost(config, node.type, node.level);
    }
    case 'upgrade-edge': {
      const edge = state.edges.get(action.edgeId);
      if (!edge) return Infinity;
      return getEdgeUpgradeCost(config, edge.level);
    }
    case 'create-edge':
      return config.edgeCost;
  }
}

// ── 購入実行 ──

export function purchase(state: GameState, config: GameConfig, action: EconomyAction): boolean {
  const cost = getCost(state, config, action);
  if (cost > state.resources) return false;

  switch (action.type) {
    case 'place-tower': {
      state.resources -= cost;
      const id = generateNodeId();
      const hp = getTowerHp(config, action.nodeType, 1);
      const node: TowerNode = {
        id,
        type: action.nodeType,
        x: action.x, y: action.y,
        level: 1,
        hp, maxHp: hp,
        status: 'building',
        ammo: 0,
        nextOut: 0,
        cooldown: 0,
        buildTimer: getBuildDuration(config, action.nodeType),
        upgradeTimer: 0,
        disableTimer: 0,
        held: [],
        facingAngle: null,
      };
      state.nodes.set(id, node);
      return true;
    }
    case 'upgrade-tower': {
      const node = state.nodes.get(action.nodeId);
      if (!node || node.status !== 'active' || node.level >= config.MAX_LEVEL) return false;
      state.resources -= cost;
      node.status = 'upgrading';
      node.upgradeTimer = getUpgradeDuration(config, node.level);
      return true;
    }
    case 'upgrade-edge': {
      const edge = state.edges.get(action.edgeId);
      if (!edge || edge.status !== 'active' || edge.level >= config.MAX_LEVEL) return false;
      state.resources -= cost;
      edge.status = 'upgrading';
      edge.disableTimer = getUpgradeDuration(config, edge.level);
      return true;
    }
    case 'create-edge': {
      const fromNode = state.nodes.get(action.from);
      const toNode = state.nodes.get(action.to);
      if (!fromNode || !toNode) return false;
      const d = Math.hypot(fromNode.x - toNode.x, fromNode.y - toNode.y);
      if (d > config.MAX_EDGE_LENGTH) return false;
      state.resources -= cost;
      const id = generateEdgeId();
      const eLv = getEdgeLevelStats(config, 1);
      state.edges.set(id, {
        id,
        from: action.from,
        to: action.to,
        level: 1,
        hp: eLv.hp,
        maxHp: eLv.hp,
        status: 'active',
        disableTimer: 0,
      });
      return true;
    }
  }
}

// ── 撤去・返金 ──

export function refund(state: GameState, config: GameConfig, nodeId: NodeId): number {
  const node = state.nodes.get(nodeId);
  if (!node) return 0;
  const cost = getTowerCost(config, node.type);
  const refundAmount = Math.round(cost * 0.5);

  // 接続エッジを削除
  const edges = connectedEdges(state, nodeId);
  for (const edge of edges) {
    // エッジ上のパケットを消滅
    for (const [pid, pkt] of state.packets) {
      if (pkt.edgeId === edge.id) state.packets.delete(pid);
    }
    state.edges.delete(edge.id);
  }

  state.nodes.delete(nodeId);
  state.resources += refundAmount;
  return refundAmount;
}

// ── 建設・アップグレードタイマー ──

export function updateBuildTimers(state: GameState, config: GameConfig, dt: number): void {
  // ノード
  for (const node of state.nodes.values()) {
    if (node.status === 'building') {
      node.buildTimer -= dt;
      if (node.buildTimer <= 0) {
        node.buildTimer = 0;
        node.status = 'active';
      }
    }
    if (node.status === 'upgrading') {
      node.upgradeTimer -= dt;
      if (node.upgradeTimer <= 0) {
        node.upgradeTimer = 0;
        const oldMaxHp = node.maxHp;
        node.level++;
        const newMaxHp = getTowerHp(config, node.type, node.level);
        node.maxHp = newMaxHp;
        node.hp = Math.round(node.hp * (newMaxHp / oldMaxHp));
        node.status = 'active';
      }
    }
    // ディスエーブラーによる無効化タイマー
    if (node.status === 'disabled') {
      node.disableTimer -= dt;
      if (node.disableTimer <= 0) {
        node.disableTimer = 0;
        node.status = 'active';
      }
    }
  }

  // エッジ
  for (const edge of state.edges.values()) {
    if (edge.status === 'disabled') {
      edge.disableTimer -= dt;
      if (edge.disableTimer <= 0) {
        edge.disableTimer = 0;
        edge.status = 'active';
      }
    }
    if (edge.status === 'upgrading') {
      edge.disableTimer -= dt;
      if (edge.disableTimer <= 0) {
        edge.disableTimer = 0;
        const oldMaxHp = edge.maxHp;
        edge.level++;
        const newStats = getEdgeLevelStats(config, edge.level);
        edge.maxHp = newStats.hp;
        edge.hp = Math.round(edge.hp * (newStats.hp / oldMaxHp));
        edge.status = 'active';
      }
    }
  }
}
