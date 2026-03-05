import { describe, it, expect, beforeEach } from 'vitest';
import { updatePackets } from './tick';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { NetworkView, NodeId, EdgeId, PacketId, Packet, TowerNode, Edge } from '@core/types';

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

function createView(overrides?: Partial<NetworkView>): NetworkView {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), elapsedTime: 0, defenseHp: 1000 },
    ...overrides,
  };
}

describe('updatePackets', () => {
  beforeEach(() => resetIdCounter());

  it('advances packet progress along edge', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 120); // distance = 120
    const edge = makeEdge('e1', 'n1', 'n2');
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0, charge: 1, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.5);

    // PACKET_SPEED=120, speedMultiplier=0.8 (Lv1), length=120 → rate=0.8/s
    // After 0.5s: progress = 0.4
    expect(pkt.progress).toBeCloseTo(0.4, 1);
    expect(view.packets.has(pid('p1'))).toBe(true);
  });

  it('delivers packet to destination held queue on arrival', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 120);
    const edge = makeEdge('e1', 'n1', 'n2');
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.95, charge: 1, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.5);

    // Packet arrived → removed from packets, added to dest held queue
    expect(view.packets.has(pid('p1'))).toBe(false);
    expect(n2.held.length).toBe(1);
    expect(n2.held[0].charge).toBe(1);
  });

  it('decomposes charge for distributor/repeater destinations', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'repeater', 120, { hp: 60, maxHp: 60 });
    const edge = makeEdge('e1', 'n1', 'n2');
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.95, charge: 3, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.5);

    // For repeater/distributor, charge is decomposed: 3 → 3 individual held items
    expect(n2.held.length).toBe(3);
    for (const h of n2.held) {
      expect(h.charge).toBe(1);
    }
  });

  it('respects maxQueue for distributor/repeater', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'distributor', 120, { hp: 50, maxHp: 50 });
    // Pre-fill held queue
    for (let i = 0; i < GAME_CONFIG.DIST_REP_MAX_QUEUE; i++) {
      n2.held.push({ timer: 1, fromEdgeId: eid('e0'), charge: 1 });
    }
    const edge = makeEdge('e1', 'n1', 'n2');
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.95, charge: 2, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.5);

    // Queue was full → no additional items, dropped
    expect(n2.held.length).toBe(GAME_CONFIG.DIST_REP_MAX_QUEUE);
  });

  it('removes packet if edge no longer exists', () => {
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 };
    const view = createView({
      packets: new Map([[pkt.id, pkt]]),
      // No edges → edge is missing
    });

    updatePackets(view, GAME_CONFIG, 0.1);

    expect(view.packets.has(pid('p1'))).toBe(false);
  });

  it('removes packet and records loss when edge is destroyed', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 120);
    const edge = makeEdge('e1', 'n1', 'n2', { status: 'destroyed' });
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.1);

    expect(view.packets.has(pid('p1'))).toBe(false);
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.lost).toBe(1);
  });

  it('removes packet when edge is disabled', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 120);
    const edge = makeEdge('e1', 'n1', 'n2', { status: 'disabled' });
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 };

    const view = createView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
    });

    updatePackets(view, GAME_CONFIG, 0.1);

    expect(view.packets.has(pid('p1'))).toBe(false);
  });
});
