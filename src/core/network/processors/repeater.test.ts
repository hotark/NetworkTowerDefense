import { describe, it, expect, beforeEach } from 'vitest';
import { repeaterProcessor } from './repeater';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { TowerNode, HeldPacket, NetworkView, NodeId, EdgeId } from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createNode(overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid('r1'), type: 'repeater', x: 100, y: 0, level: 1,
    hp: 60, maxHp: 60, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
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

describe('repeaterProcessor', () => {
  beforeEach(() => resetIdCounter());

  it('emits packet with charge=1+boost on outgoing edge', () => {
    const node = createNode();
    const destNode: TowerNode = {
      id: nid('n2'), type: 'sniper', x: 200, y: 0, level: 1,
      hp: 80, maxHp: 80, status: 'active', ammo: 0,
      nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
      disableTimer: 0, held: [], facingAngle: null,
    };
    const view = createView({
      nodes: new Map([[node.id, node], [destNode.id, destNode]]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('r1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    repeaterProcessor.processHeld(node, held, view, GAME_CONFIG);

    // Lv1 repeater: chargeBoost=1 → emit charge=1+1=2
    expect(view.packets.size).toBe(1);
    const pkt = Array.from(view.packets.values())[0];
    expect(pkt.charge).toBe(2);
    // No boost copies added to queue
    expect(node.held.length).toBe(0);
  });

  it('requeues when all outgoing edges are at capacity', () => {
    const node = createNode();
    const destNode: TowerNode = {
      id: nid('n2'), type: 'sniper', x: 200, y: 0, level: 1,
      hp: 80, maxHp: 80, status: 'active', ammo: 0,
      nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
      disableTimer: 0, held: [], facingAngle: null,
    };
    // Fill edge to capacity (level 1 capacity = 3)
    const packets = new Map<any, any>();
    for (let i = 0; i < 3; i++) {
      const pid = `p${i}` as any;
      packets.set(pid, { id: pid, edgeId: eid('e1'), progress: 0.3, charge: 1, speed: 100 });
    }
    const view = createView({
      nodes: new Map([[node.id, node], [destNode.id, destNode]]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('r1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
      packets,
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    repeaterProcessor.processHeld(node, held, view, GAME_CONFIG);

    // No new packets emitted
    expect(view.packets.size).toBe(3);
    // Original requeued
    expect(node.held.length).toBe(1);
  });

  it('requeues when no outgoing edges exist', () => {
    const node = createNode();
    const view = createView({
      nodes: new Map([[node.id, node]]),
      // No edges
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    repeaterProcessor.processHeld(node, held, view, GAME_CONFIG);

    // Only requeue of original (no boost since not emitted)
    expect(node.held.length).toBe(1);
    expect(node.held[0].charge).toBe(1);
  });

  it('tracks forwarded metric', () => {
    const node = createNode();
    const destNode: TowerNode = {
      id: nid('n2'), type: 'sniper', x: 200, y: 0, level: 1,
      hp: 80, maxHp: 80, status: 'active', ammo: 0,
      nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
      disableTimer: 0, held: [], facingAngle: null,
    };
    const view = createView({
      nodes: new Map([[node.id, node], [destNode.id, destNode]]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('r1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    repeaterProcessor.processHeld(node, held, view, GAME_CONFIG);

    const qm = view.metrics.queueNode.get(nid('r1'));
    expect(qm?.forwarded).toBe(1);
    // Edge metrics: sent=2 (試みた量), lost=0
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.sent).toBe(2);  // emitCharge=2を試みた
    expect(em?.lost).toBe(0);  // ロスなし
  });

  it('records partial charge loss when edge capacity limits boosted charge', () => {
    const node = createNode({ level: 3 }); // Lv3: chargeBoost=3 → emitCharge=4
    const destNode: TowerNode = {
      id: nid('n2'), type: 'sniper', x: 200, y: 0, level: 1,
      hp: 80, maxHp: 80, status: 'active', ammo: 0,
      nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
      disableTimer: 0, held: [], facingAngle: null,
    };
    // Edge Lv1 capacity=3, put 1 charge already → available=2
    const view = createView({
      nodes: new Map([[node.id, node], [destNode.id, destNode]]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('r1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
      packets: new Map([['p0' as any, { id: 'p0' as any, edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 }]]),
    });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e0'), charge: 1 };

    repeaterProcessor.processHeld(node, held, view, GAME_CONFIG);

    // emitCharge=4, available=2 → sent=4(試みた量), lost=2
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.sent).toBe(4);  // 4を試みた
    expect(em?.lost).toBe(2);  // 2ロス → ロス率 50%
  });
});
