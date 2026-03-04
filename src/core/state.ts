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
} from './types';
import type { GameConfig } from './config';

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
  wavePhase: 'prep' | 'active' | 'complete';
  simTime: number;
  simSpeed: number;
  gameResult: 'playing' | 'victory' | 'defeat';
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
  };
}

// ── エッジ検索ヘルパー ──

export function outgoingEdges(state: GameState, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.from === nodeId && edge.status === 'active') {
      result.push(edge);
    }
  }
  return result;
}

export function incomingEdges(state: GameState, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.to === nodeId && edge.status === 'active') {
      result.push(edge);
    }
  }
  return result;
}

export function edgesBetween(state: GameState, a: NodeId, b: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) {
      result.push(edge);
    }
  }
  return result;
}

export function connectedEdges(state: GameState, nodeId: NodeId): Edge[] {
  const result: Edge[] = [];
  for (const edge of state.edges.values()) {
    if (edge.from === nodeId || edge.to === nodeId) {
      result.push(edge);
    }
  }
  return result;
}
