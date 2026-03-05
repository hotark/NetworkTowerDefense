// Core Layer: パケットフロー統合テスト
// Generator → Edge → Repeater → Edge → Distributor の一貫フロー検証

import { describe, it, expect, beforeEach } from 'vitest';
import { tickGenerators, updatePackets, tickHeldPackets } from './tick';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type { NetworkView, NodeId, EdgeId, TowerNode, Edge } from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function makeNode(id: string, type: TowerNode['type'], x: number, overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid(id), type, x, y: 0, level: 1,
    hp: 100, maxHp: 100, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function makeEdge(id: string, from: string, to: string): Edge {
  return {
    id: eid(id), from: nid(from), to: nid(to), level: 1,
    hp: 40, maxHp: 40, status: 'active', disableTimer: 0,
  };
}

function createView(): NetworkView {
  // Network: gen → (e1) → rep → (e2) → dist
  const gen = makeNode('gen', 'generator', 0);
  const rep = makeNode('rep', 'repeater', 10, { hp: 60, maxHp: 60 }); // Short distance for fast arrival
  const dist = makeNode('dist', 'distributor', 20, { hp: 50, maxHp: 50 });
  const e1 = makeEdge('e1', 'gen', 'rep');
  const e2 = makeEdge('e2', 'rep', 'dist');

  return {
    nodes: new Map([[gen.id, gen], [rep.id, rep], [dist.id, dist]]),
    edges: new Map([[e1.id, e1], [e2.id, e2]]),
    packets: new Map(),
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0 },
  };
}

describe('Packet flow integration', () => {
  beforeEach(() => resetIdCounter());

  it('completes full lifecycle: generate → travel → arrive → process → emit → travel → arrive', () => {
    const view = createView();
    const dt = GAME_CONFIG.FIXED_DT;

    // Phase 1: Generator creates packet
    // Generator Lv1 interval=2.0, cooldown starts at 0 → will generate immediately
    tickGenerators(view, GAME_CONFIG, dt);
    expect(view.packets.size).toBe(1);

    // Phase 2: Packet travels on edge e1
    // With short distance (10px), PACKET_SPEED=120, speedMultiplier=0.8:
    // rate = 120*0.8/10 = 9.6/s → about 0.1s to cross
    for (let i = 0; i < 10; i++) {
      updatePackets(view, GAME_CONFIG, dt);
    }

    // Phase 3: Packet should arrive at repeater
    const rep = view.nodes.get(nid('rep'))!;
    expect(rep.held.length).toBeGreaterThan(0);

    // Phase 4: Repeater processes held packet
    // Need to wait for holdTime (1.5s for Lv1) or set timer to 0
    rep.held[0].timer = 0; // Fast-forward hold time
    tickHeldPackets(view, GAME_CONFIG, dt);

    // After processing: repeater should emit on edge e2
    // Also adds chargeBoost=1 items to its own queue
    const packetsOnE2 = Array.from(view.packets.values()).filter(p => p.edgeId === eid('e2'));
    expect(packetsOnE2.length).toBe(1);

    // Phase 5: Packet travels on edge e2 to distributor
    for (let i = 0; i < 10; i++) {
      updatePackets(view, GAME_CONFIG, dt);
    }

    // Phase 6: Packet arrives at distributor
    const dist = view.nodes.get(nid('dist'))!;
    expect(dist.held.length).toBeGreaterThan(0);
  });

  it('tracks metrics through the full flow', () => {
    const view = createView();
    const dt = GAME_CONFIG.FIXED_DT;

    // Generate
    tickGenerators(view, GAME_CONFIG, dt);
    const genMetrics = view.metrics.generator.get(nid('gen'));
    expect(genMetrics?.generated).toBe(1);

    // Travel to repeater
    for (let i = 0; i < 10; i++) {
      updatePackets(view, GAME_CONFIG, dt);
    }

    // Process at repeater
    const rep = view.nodes.get(nid('rep'))!;
    if (rep.held.length > 0) {
      rep.held[0].timer = 0;
      tickHeldPackets(view, GAME_CONFIG, dt);

      const qmRep = view.metrics.queueNode.get(nid('rep'));
      expect(qmRep?.forwarded).toBeGreaterThanOrEqual(1);
    }
  });
});
