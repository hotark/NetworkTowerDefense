import { describe, it, expect, beforeEach } from 'vitest';
import { canAfford, purchase, refund } from './logic';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { EconomyView, NodeId, EdgeId } from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createView(overrides?: Partial<EconomyView>): EconomyView {
  return {
    nodes: new Map(), edges: new Map(), packets: new Map(),
    resources: 600,
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), elapsedTime: 0, defenseHp: 1000 },
    ...overrides,
  };
}

describe('canAfford', () => {
  it('returns true when enough resources', () => {
    const view = createView({ resources: 100 });
    expect(canAfford(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'generator', x: 0, y: 0 })).toBe(true);
  });

  it('returns false when not enough resources', () => {
    const view = createView({ resources: 10 });
    expect(canAfford(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'generator', x: 0, y: 0 })).toBe(false);
  });
});

describe('purchase', () => {
  beforeEach(() => resetIdCounter());

  it('places tower and deducts resources', () => {
    const view = createView({ resources: 200 });
    const result = purchase(view, GAME_CONFIG, { type: 'place-tower', nodeType: 'sniper', x: 100, y: 200 });
    expect(result).toBe(true);
    expect(view.resources).toBe(120); // 200 - 80
    expect(view.nodes.size).toBe(1);
    const node = [...view.nodes.values()][0];
    expect(node.type).toBe('sniper');
    expect(node.status).toBe('building');
  });

  it('creates edge between nodes', () => {
    const view = createView({
      resources: 100,
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
        [nid('n2'), { id: nid('n2'), type: 'repeater', x: 100, y: 0, level: 1, hp: 60, maxHp: 60, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
    });
    const result = purchase(view, GAME_CONFIG, { type: 'create-edge', from: nid('n1'), to: nid('n2') });
    expect(result).toBe(true);
    expect(view.edges.size).toBe(1);
    expect(view.resources).toBe(90); // 100 - 10
  });
});

describe('refund', () => {
  beforeEach(() => resetIdCounter());

  it('removes tower and connected edges, gives 50% refund', () => {
    const view = createView({
      resources: 0,
      nodes: new Map([
        [nid('n1'), { id: nid('n1'), type: 'generator', x: 0, y: 0, level: 1, hp: 100, maxHp: 100, status: 'active', ammo: 0, nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0, disableTimer: 0, held: [], facingAngle: null }],
      ]),
      edges: new Map([
        [eid('e1'), { id: eid('e1'), from: nid('n1'), to: nid('n2'), level: 1, hp: 40, maxHp: 40, status: 'active', disableTimer: 0 }],
      ]),
    });
    const amount = refund(view, GAME_CONFIG, nid('n1'));
    expect(amount).toBe(25); // 50 * 0.5
    expect(view.resources).toBe(25);
    expect(view.nodes.size).toBe(0);
    expect(view.edges.size).toBe(0);
  });
});
