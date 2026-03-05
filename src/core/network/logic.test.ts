import { describe, it, expect, beforeEach } from 'vitest';
import { chargeOnEdge, emitPacket, emitPacketTracked, getFilteredOutgoing } from './logic';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { NetworkView, NodeId, EdgeId, PacketId } from '@core/types';

function createView(overrides?: Partial<NetworkView>): NetworkView {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0 },
    ...overrides,
  };
}

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;
const pid = (s: string) => s as PacketId;

describe('chargeOnEdge', () => {
  it('returns 0 for empty edge', () => {
    const view = createView();
    expect(chargeOnEdge(view, eid('e1'))).toBe(0);
  });

  it('sums charge of packets on the edge', () => {
    const view = createView({
      packets: new Map([
        [pid('p1'), { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 3, speed: 100 }],
        [pid('p2'), { id: pid('p2'), edgeId: eid('e1'), progress: 0.2, charge: 2, speed: 100 }],
        [pid('p3'), { id: pid('p3'), edgeId: eid('e2'), progress: 0.1, charge: 5, speed: 100 }],
      ]),
    });
    expect(chargeOnEdge(view, eid('e1'))).toBe(5);
    expect(chargeOnEdge(view, eid('e2'))).toBe(5);
  });
});

describe('emitPacket', () => {
  beforeEach(() => resetIdCounter());

  it('returns null if edge is not active', () => {
    const view = createView({
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'destroyed', disableTimer: 0 }]]),
    });
    const result = emitPacket(view, nid('n1'), view.edges.get(eid('e1'))!, 1, GAME_CONFIG);
    expect(result).toBeNull();
  });

  it('creates packet with correct charge when capacity available', () => {
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'repeater', x: 100, y: 0, level: 1, hp: 60, maxHp: 60, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
    });
    const result = emitPacket(view, nid('n1'), view.edges.get(eid('e1'))!, 1, GAME_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.charge).toBe(1);
    expect(result!.progress).toBe(0);
  });

  it('returns null when edge is at capacity', () => {
    const packets = new Map<PacketId, any>();
    // Fill capacity (level 1 = 3 capacity)
    for (let i = 0; i < 3; i++) {
      packets.set(pid(`p${i}`), { id: pid(`p${i}`), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 });
    }
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'repeater', x: 100, y: 0, level: 1, hp: 60, maxHp: 60, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
      packets,
    });
    const result = emitPacket(view, nid('n1'), view.edges.get(eid('e1'))!, 1, GAME_CONFIG);
    expect(result).toBeNull();
  });
});

describe('emitPacketTracked', () => {
  beforeEach(() => resetIdCounter());

  it('records sent charge amount on successful emit', () => {
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'sniper', x: 100, y: 0, level: 1, hp: 80, maxHp: 80, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
    });
    const p = emitPacketTracked(view, nid('n1'), view.edges.get(eid('e1'))!, 2, GAME_CONFIG);
    expect(p).not.toBeNull();
    expect(p!.charge).toBe(2);
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.sent).toBe(2);  // 試みたcharge量
    expect(em?.lost).toBe(0);
  });

  it('records partial charge loss when edge capacity is limited', () => {
    // Edge Lv1 capacity=3, put 1 charge already → available=2
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'sniper', x: 100, y: 0, level: 1, hp: 80, maxHp: 80, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
      packets: new Map([
        [pid('existing'), { id: pid('existing'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 }],
      ]),
    });
    // Try to emit charge=4, but only 2 available
    const p = emitPacketTracked(view, nid('n1'), view.edges.get(eid('e1'))!, 4, GAME_CONFIG);
    expect(p).not.toBeNull();
    expect(p!.charge).toBe(2); // clamped to available
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.sent).toBe(4);  // 試みたcharge量
    expect(em?.lost).toBe(2);  // ロス (4 - 2)
    // ロス率 = lost / sent = 2/4 = 50%
  });

  it('records full charge loss when edge is at capacity', () => {
    // Fill edge to capacity (Lv1 = 3)
    const packets = new Map<PacketId, any>();
    for (let i = 0; i < 3; i++) {
      packets.set(pid(`p${i}`), { id: pid(`p${i}`), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 });
    }
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'sniper', x: 100, y: 0, level: 1, hp: 80, maxHp: 80, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([[eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }]]),
      packets,
    });
    const p = emitPacketTracked(view, nid('n1'), view.edges.get(eid('e1'))!, 3, GAME_CONFIG);
    expect(p).toBeNull();
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.sent).toBe(3);  // 試みたcharge量
    expect(em?.lost).toBe(3);  // 全量ロス → ロス率 100%
  });
});

describe('getFilteredOutgoing', () => {
  it('filters inactive destinations and generators', () => {
    const view = createView({
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'repeater', x: 0, y: 0, level: 1, hp: 60, maxHp: 60, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'generator', x: 100, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n3'), { id: nid('n3'), type: 'sniper', x: 200, y: 0, level: 1, hp: 80, maxHp: 80, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n4'), { id: nid('n4'), type: 'rapid', x: 300, y: 0, level: 1, hp: 60, maxHp: 60, status: 'building', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 2, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([
        [eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
        [eid('e2'), { id: eid('e2'), from: nid('n1'), to: nid('n3'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
        [eid('e3'), { id: eid('e3'), from: nid('n1'), to: nid('n4'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
      ]),
    });
    const result = getFilteredOutgoing(view, nid('n1'));
    expect(result.length).toBe(1);
    expect(result[0].to).toBe(nid('n3'));
  });
});
