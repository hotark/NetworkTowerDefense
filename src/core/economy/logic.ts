// Core Layer: 経済システム — コスト計算・リソース管理ルール

import type { NodeId, EdgeId, NodeType, TowerNode, EconomyView } from '@core/types';
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

export function canAfford(view: EconomyView, config: GameConfig, action: EconomyAction): boolean {
  return getCost(view, config, action) <= view.resources;
}

function getCost(view: EconomyView, config: GameConfig, action: EconomyAction): number {
  switch (action.type) {
    case 'place-tower':
      return getTowerCost(config, action.nodeType);
    case 'upgrade-tower': {
      const node = view.nodes.get(action.nodeId);
      if (!node) return Infinity;
      return getUpgradeCost(config, node.type, node.level);
    }
    case 'upgrade-edge': {
      const edge = view.edges.get(action.edgeId);
      if (!edge) return Infinity;
      return getEdgeUpgradeCost(config, edge.level);
    }
    case 'create-edge':
      return config.edgeCost;
  }
}

// ── 購入実行 ──

export function purchase(view: EconomyView, config: GameConfig, action: EconomyAction): boolean {
  const cost = getCost(view, config, action);
  if (cost > view.resources) return false;

  switch (action.type) {
    case 'place-tower': {
      view.resources -= cost;
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
      view.nodes.set(id, node);
      return true;
    }
    case 'upgrade-tower': {
      const node = view.nodes.get(action.nodeId);
      if (!node || node.status !== 'active' || node.level >= config.MAX_LEVEL) return false;
      view.resources -= cost;
      node.status = 'upgrading';
      node.upgradeTimer = getUpgradeDuration(config, node.level);
      return true;
    }
    case 'upgrade-edge': {
      const edge = view.edges.get(action.edgeId);
      if (!edge || edge.status !== 'active' || edge.level >= config.MAX_LEVEL) return false;
      view.resources -= cost;
      edge.status = 'upgrading';
      edge.disableTimer = getUpgradeDuration(config, edge.level);
      return true;
    }
    case 'create-edge': {
      const fromNode = view.nodes.get(action.from);
      const toNode = view.nodes.get(action.to);
      if (!fromNode || !toNode) return false;
      const d = Math.hypot(fromNode.x - toNode.x, fromNode.y - toNode.y);
      if (d > config.MAX_EDGE_LENGTH) return false;
      view.resources -= cost;
      const id = generateEdgeId();
      const eLv = getEdgeLevelStats(config, 1);
      view.edges.set(id, {
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

export function refund(view: EconomyView, config: GameConfig, nodeId: NodeId): number {
  const node = view.nodes.get(nodeId);
  if (!node) return 0;
  const cost = getTowerCost(config, node.type);
  const refundAmount = Math.round(cost * 0.5);

  const edges = connectedEdges(view, nodeId);
  for (const edge of edges) {
    for (const [pid, pkt] of view.packets) {
      if (pkt.edgeId === edge.id) view.packets.delete(pid);
    }
    view.edges.delete(edge.id);
  }

  view.nodes.delete(nodeId);
  view.resources += refundAmount;
  return refundAmount;
}
