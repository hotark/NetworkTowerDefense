// Core Layer: Game state management and ID generation

import type {
  NodeId,
  EdgeId,
  PacketId,
  EnemyId,
  BulletId,
  TowerNode,
  Edge,
  Packet,
  Enemy,
  Bullet,
  EnemyBullet,
  Effect,
  AttackTowerMetrics,
  EdgeMetrics,
  QueueNodeMetrics,
  GeneratorMetrics,
  MetricsStore,
  WavePhase,
} from './types';
import type { GameConfig } from './config';
import type { RollingMetricsStore } from '@core/metrics';
import { createRollingMetricsStore } from '@core/metrics';

// MetricsStore は types.ts で定義 → re-export
export type { MetricsStore } from './types';

// ── GameState ──

export interface GameState {
  nodes: Map<NodeId, TowerNode>;
  edges: Map<EdgeId, Edge>;
  packets: Map<PacketId, Packet>;
  enemies: Map<EnemyId, Enemy>;
  bullets: Map<BulletId, Bullet>;
  enemyBullets: Map<BulletId, EnemyBullet>;
  effects: Effect[];
  resources: number;
  baseHp: number;
  maxBaseHp: number;
  waveIndex: number;
  wavePhase: WavePhase;
  simTime: number;
  simSpeed: number;
  gameResult: 'playing' | 'victory' | 'defeat';
  metrics: MetricsStore;
  rollingMetrics: RollingMetricsStore;
}

// ── ID生成 ──

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function generateNodeId(): NodeId {
  return `n_${++idCounter}` as NodeId;
}

export function generateEdgeId(): EdgeId {
  return `e_${++idCounter}` as EdgeId;
}

export function generatePacketId(): PacketId {
  return `p_${++idCounter}` as PacketId;
}

export function generateEnemyId(): EnemyId {
  return `en_${++idCounter}` as EnemyId;
}

export function generateBulletId(): BulletId {
  return `b_${++idCounter}` as BulletId;
}

// ── GameState ファクトリ ──

export function createGameState(config: GameConfig): GameState {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    enemies: new Map(),
    bullets: new Map(),
    enemyBullets: new Map(),
    effects: [],
    resources: config.INITIAL_RESOURCES,
    baseHp: config.BASE_HP,
    maxBaseHp: config.BASE_HP,
    waveIndex: 0,
    wavePhase: 'prep',
    simTime: 0,
    simSpeed: 1,
    gameResult: 'playing',
    metrics: {
      attackTower: new Map(),
      edge: new Map(),
      queueNode: new Map(),
      generator: new Map(),
      elapsedTime: 0,
      defenseHp: config.MAX_DEFENSE_HP,
    },
    rollingMetrics: createRollingMetricsStore(),
  };
}

// ── エッジ検索ヘルパー ──

export function outgoingEdges(state: { edges: Map<EdgeId, Edge> }, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.from === nodeId && edge.status === 'active') {
      result.push(edge);
    }
  }
  return result;
}

export function incomingEdges(state: { edges: Map<EdgeId, Edge> }, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.to === nodeId && edge.status === 'active') {
      result.push(edge);
    }
  }
  return result;
}

export function edgesBetween(state: { edges: Map<EdgeId, Edge> }, a: NodeId, b: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) {
      result.push(edge);
    }
  }
  return result;
}

export function connectedEdges(state: { edges: Map<EdgeId, Edge> }, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.from === nodeId || edge.to === nodeId) {
      result.push(edge);
    }
  }
  return result;
}

// ── メトリクス get-or-create ──

export function getAttackTowerMetrics(state: { metrics: MetricsStore }, id: NodeId): AttackTowerMetrics {
  let m = state.metrics.attackTower.get(id);
  if (!m) {
    m = { consumedAmmo: 0, receivedAmmo: 0, demandTime: 0, starvationTime: 0 };
    state.metrics.attackTower.set(id, m);
  }
  return m;
}

export function getEdgeMetrics(state: { metrics: MetricsStore }, id: EdgeId): EdgeMetrics {
  let m = state.metrics.edge.get(id);
  if (!m) {
    m = { sent: 0, lost: 0, arrived: 0 };
    state.metrics.edge.set(id, m);
  }
  return m;
}

export function getQueueNodeMetrics(state: { metrics: MetricsStore }, id: NodeId): QueueNodeMetrics {
  let m = state.metrics.queueNode.get(id);
  if (!m) {
    m = { received: 0, dropped: 0, forwarded: 0 };
    state.metrics.queueNode.set(id, m);
  }
  return m;
}

export function getGeneratorMetrics(state: { metrics: MetricsStore }, id: NodeId): GeneratorMetrics {
  let m = state.metrics.generator.get(id);
  if (!m) {
    m = { generated: 0, blocked: 0 };
    state.metrics.generator.set(id, m);
  }
  return m;
}
