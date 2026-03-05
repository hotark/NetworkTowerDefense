import { describe, it, expect, beforeEach } from 'vitest';
import { distributorProcessor } from './distributor';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { TowerNode, HeldPacket, NetworkView, NodeId, EdgeId } from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createNode(overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid('d1'), type: 'distributor', x: 100, y: 0, level: 1,
    hp: 50, maxHp: 50, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function createDestNode(id: string, x: number): TowerNode {
  return {
    id: nid(id), type: 'sniper', x, y: 0, level: 1,
    hp: 80, maxHp: 80, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
  };
}

function createView(overrides?: Partial<NetworkView>): NetworkView {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0 },
    ...overrides,
  };
}

describe('distributorProcessor', () => {
  beforeEach(() => resetIdCounter());

  it('emits charge=1 on up to maxFanout outgoing edges', () => {
    const node = createNode();
    const n2 = createDestNode('n2', 200);
    const n3 = createDestNode('n3', 300);
    const n4 = createDestNode('n4', 400);
    const view = createView({
      nodes: new Map([[node.id, node], [n2.id, n2], [n3.id, n3], [n4.id, n4]]),
      edges: new Map([
        [eid('e1'), { id: eid('e1'), from: nid('d1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
        [eid('e2'), { id: eid('e2'), from: nid('d1'), to: nid('n3'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
        [eid('e3'), { id: eid('e3'), from: nid('d1'), to: nid('n4'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
      ]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    distributorProcessor.processHeld(node, held, view, GAME_CONFIG);

    // Lv1 distributor maxFanout=2, so 2 packets emitted
    expect(view.packets.size).toBe(2);
  });

  it('requeues when no outgoing edges exist', () => {
    const node = createNode();
    const view = createView({
      nodes: new Map([[node.id, node]]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    distributorProcessor.processHeld(node, held, view, GAME_CONFIG);

    expect(view.packets.size).toBe(0);
    expect(node.held.length).toBe(1);
    expect(node.held[0].charge).toBe(1);
  });

  it('respects maxQueue limit', () => {
    const node = createNode();
    // Fill held queue to DIST_REP_MAX_QUEUE
    for (let i = 0; i < GAME_CONFIG.DIST_REP_MAX_QUEUE; i++) {
      node.held.push({ timer: 1, fromEdgeId: eid('e0'), charge: 1 });
    }
    const view = createView({
      nodes: new Map([[node.id, node]]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    distributorProcessor.processHeld(node, held, view, GAME_CONFIG);

    // Queue was already full, should not add more
    expect(node.held.length).toBe(GAME_CONFIG.DIST_REP_MAX_QUEUE);
  });

  it('tracks forwarded metric per fanout', () => {
    const node = createNode();
    const n2 = createDestNode('n2', 200);
    const n3 = createDestNode('n3', 300);
    const view = createView({
      nodes: new Map([[node.id, node], [n2.id, n2], [n3.id, n3]]),
      edges: new Map([
        [eid('e1'), { id: eid('e1'), from: nid('d1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
        [eid('e2'), { id: eid('e2'), from: nid('d1'), to: nid('n3'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
      ]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    distributorProcessor.processHeld(node, held, view, GAME_CONFIG);

    const qm = view.metrics.queueNode.get(nid('d1'));
    expect(qm?.forwarded).toBe(2);
  });
});
