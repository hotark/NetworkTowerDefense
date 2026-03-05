// Core Layer: 経済システムテスト（tick, logic）

import { describe, it, expect, beforeEach } from 'vitest';
import { updateBuildTimers } from './tick';
import { canAfford, purchase, refund } from './logic';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type {
  EconomyView, TowerNode, NodeId, Edge, EdgeId, PacketId, Packet, MetricsStore,
} from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;
const pid = (s: string) => s as PacketId;

function makeNode(id: string, type: TowerNode['type'], x: number, overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid(id), type, x, y: 0, level: 1,
    hp: 100, maxHp: 100, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function makeEdge(id: string, from: string, to: string, overrides?: Partial<Edge>): Edge {
  return {
    id: eid(id), from: nid(from), to: nid(to), level: 1,
    hp: 40, maxHp: 40, status: 'active', disableTimer: 0,
    ...overrides,
  };
}

function makeMetrics(): MetricsStore {
  return {
    attackTower: new Map(), edge: new Map(), queueNode: new Map(),
    generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0,
  };
}

function createView(overrides?: Partial<EconomyView>): EconomyView {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    resources: 1000,
    metrics: makeMetrics(),
    ...overrides,
  };
}

// ── updateBuildTimers ──

describe('updateBuildTimers', () => {
  it('completes building node when timer reaches 0', () => {
    const node = makeNode('n1', 'sniper', 0, { status: 'building', buildTimer: 0.5 });
    const view = createView({ nodes: new Map([[node.id, node]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.6);
    expect(node.status).toBe('active');
    expect(node.buildTimer).toBe(0);
  });

  it('decrements building timer without completing', () => {
    const node = makeNode('n1', 'sniper', 0, { status: 'building', buildTimer: 1.0 });
    const view = createView({ nodes: new Map([[node.id, node]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.3);
    expect(node.status).toBe('building');
    expect(node.buildTimer).toBeCloseTo(0.7);
  });

  it('completes upgrading node and increases level/hp', () => {
    const node = makeNode('n1', 'sniper', 0, {
      status: 'upgrading', upgradeTimer: 0.1, level: 1,
      hp: 80, maxHp: 80,
    });
    const view = createView({ nodes: new Map([[node.id, node]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.2);
    expect(node.status).toBe('active');
    expect(node.level).toBe(2);
    expect(node.maxHp).toBeGreaterThan(80);
  });

  it('re-enables disabled node when timer expires', () => {
    const node = makeNode('n1', 'sniper', 0, { status: 'disabled', disableTimer: 0.5 });
    const view = createView({ nodes: new Map([[node.id, node]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.6);
    expect(node.status).toBe('active');
    expect(node.disableTimer).toBe(0);
  });

  it('keeps manually disabled node (disableTimer=0) disabled', () => {
    const node = makeNode('n1', 'sniper', 0, { status: 'disabled', disableTimer: 0 });
    const view = createView({ nodes: new Map([[node.id, node]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.5);
    expect(node.status).toBe('disabled');
  });

  it('re-enables disabled edge when timer expires', () => {
    const edge = makeEdge('e1', 'n1', 'n2', { status: 'disabled', disableTimer: 0.5 });
    const view = createView({ edges: new Map([[edge.id, edge]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.6);
    expect(edge.status).toBe('active');
    expect(edge.disableTimer).toBe(0);
  });

  it('keeps manually disabled edge (disableTimer=0) disabled', () => {
    const edge = makeEdge('e1', 'n1', 'n2', { status: 'disabled', disableTimer: 0 });
    const view = createView({ edges: new Map([[edge.id, edge]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.5);
    expect(edge.status).toBe('disabled');
  });

  it('completes edge upgrade and increases level/hp', () => {
    const edge = makeEdge('e1', 'n1', 'n2', {
      status: 'upgrading', disableTimer: 0.1, level: 1,
      hp: 40, maxHp: 40,
    });
    const view = createView({ edges: new Map([[edge.id, edge]]) });

    updateBuildTimers(view, GAME_CONFIG, 0.2);
    expect(edge.status).toBe('active');
    expect(edge.level).toBe(2);
    expect(edge.maxHp).toBeGreaterThan(40);
  });
});

// ── canAfford ──

describe('canAfford', () => {
  it('returns true when resources sufficient for tower', () => {
    const view = createView({ resources: 100 });
    // sniper costs 80
    expect(canAfford(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'sniper', x: 0, y: 0 })).toBe(true);
  });

  it('returns false when resources insufficient', () => {
    const view = createView({ resources: 10 });
    expect(canAfford(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'sniper', x: 0, y: 0 })).toBe(false);
  });
});

// ── purchase ──

describe('purchase', () => {
  beforeEach(() => resetIdCounter());

  it('places tower and deducts cost', () => {
    const view = createView({ resources: 200 });
    const ok = purchase(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'sniper', x: 50, y: 50 });
    expect(ok).toBe(true);
    expect(view.resources).toBe(200 - 80); // sniper cost = 80
    expect(view.nodes.size).toBe(1);
    const placed = Array.from(view.nodes.values())[0];
    expect(placed.type).toBe('sniper');
    expect(placed.status).toBe('building');
  });

  it('rejects purchase when insufficient resources', () => {
    const view = createView({ resources: 10 });
    const ok = purchase(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'sniper', x: 0, y: 0 });
    expect(ok).toBe(false);
    expect(view.nodes.size).toBe(0);
  });

  it('upgrades tower and deducts cost', () => {
    const node = makeNode('n1', 'sniper', 0, { level: 1, status: 'active' });
    const view = createView({
      nodes: new Map([[node.id, node]]),
      resources: 500,
    });
    const ok = purchase(view, GAME_CONFIG, { type: 'upgrade-tower', nodeId: nid('n1') });
    expect(ok).toBe(true);
    expect(node.status).toBe('upgrading');
    expect(view.resources).toBeLessThan(500);
  });

  it('creates edge between two nodes', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 50);
    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      resources: 500,
    });
    const ok = purchase(view, GAME_CONFIG, { type: 'create-edge', from: nid('n1'), to: nid('n2') });
    expect(ok).toBe(true);
    expect(view.edges.size).toBe(1);
    expect(view.resources).toBe(500 - GAME_CONFIG.edgeCost);
  });

  it('rejects edge creation when distance exceeds MAX_EDGE_LENGTH', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', GAME_CONFIG.MAX_EDGE_LENGTH + 100);
    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      resources: 500,
    });
    const ok = purchase(view, GAME_CONFIG, { type: 'create-edge', from: nid('n1'), to: nid('n2') });
    expect(ok).toBe(false);
  });
});

// ── refund ──

describe('refund', () => {
  beforeEach(() => resetIdCounter());

  it('removes node and connected edges, returns 50% cost', () => {
    const node = makeNode('n1', 'sniper', 0);
    const n2 = makeNode('n2', 'generator', 50);
    const edge = makeEdge('e1', 'n1', 'n2');
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 };
    const view = createView({
      nodes: new Map([[node.id, node], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
      resources: 100,
    });

    const amount = refund(view, GAME_CONFIG, nid('n1'));
    expect(amount).toBe(Math.round(80 * 0.5)); // sniper cost 80, 50% refund
    expect(view.nodes.has(nid('n1'))).toBe(false);
    expect(view.edges.has(eid('e1'))).toBe(false);
    expect(view.packets.has(pid('p1'))).toBe(false);
    expect(view.resources).toBe(100 + amount);
  });

  it('returns 0 for nonexistent node', () => {
    const view = createView();
    expect(refund(view, GAME_CONFIG, nid('nope'))).toBe(0);
  });
});
