import { describe, it, expect, beforeEach } from 'vitest';
import { attackProcessor } from './attack';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { TowerNode, HeldPacket, NetworkView, NodeId, EdgeId } from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createNode(overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid('n1'), type: 'sniper', x: 0, y: 0, level: 1,
    hp: 80, maxHp: 80, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function createView(): NetworkView {
  return {
    nodes: new Map(), edges: new Map(), packets: new Map(),
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0 },
  };
}

describe('attackProcessor', () => {
  beforeEach(() => resetIdCounter());

  it('converts held packet to ammo += 1', () => {
    const node = createNode({ ammo: 5 });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e1'), charge: 1 };
    const view = createView();
    attackProcessor.processHeld(node, held, view, GAME_CONFIG);
    expect(node.ammo).toBe(6);
  });

  it('requeues remainder when charge > 1', () => {
    const node = createNode({ ammo: 0 });
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e1'), charge: 3 };
    const view = createView();
    attackProcessor.processHeld(node, held, view, GAME_CONFIG);
    expect(node.ammo).toBe(1);
    expect(node.held.length).toBe(1);
    expect(node.held[0].charge).toBe(2);
  });

  it('tracks receivedAmmo metric', () => {
    const node = createNode();
    const held: HeldPacket = { timer: 0, fromEdgeId: eid('e1'), charge: 1 };
    const view = createView();
    attackProcessor.processHeld(node, held, view, GAME_CONFIG);
    const metrics = view.metrics.attackTower.get(nid('n1'));
    expect(metrics?.receivedAmmo).toBe(1);
  });
});
