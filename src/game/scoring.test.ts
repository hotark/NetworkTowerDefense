import { describe, it, expect, beforeEach } from 'vitest';
import { calculateScores, calculateFinalScore, updateMetricsElapsed, shouldUpdateDisplay, resetDisplayTimer } from './scoring';
import type { GameState } from '@core/state';
import { GAME_CONFIG } from '@core/config';
import type { GameConfig } from '@core/config';
import type { MetricsStore, NodeId, EdgeId, TowerNode, Edge } from '@core/types';
import { resetIdCounter } from '@core/state';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createMetrics(overrides?: Partial<MetricsStore>): MetricsStore {
  return {
    attackTower: new Map(),
    edge: new Map(),
    queueNode: new Map(),
    generator: new Map(),
    waveSkips: [],
    totalCountdownTime: 0,
    elapsedTime: 0,
    ...overrides,
  };
}

function createMinState(metrics: MetricsStore): GameState {
  return { metrics } as unknown as GameState;
}

describe('calculateScores', () => {
  it('returns 100% availability when no starvation', () => {
    const metrics = createMetrics({
      attackTower: new Map([
        [nid('t1'), { consumedAmmo: 10, receivedAmmo: 10, demandTime: 10, starvationTime: 0 }],
      ]),
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    expect(scores.availability.value).toBeCloseTo(100);
  });

  it('reduces availability based on starvation ratio', () => {
    const metrics = createMetrics({
      attackTower: new Map([
        [nid('t1'), { consumedAmmo: 5, receivedAmmo: 5, demandTime: 10, starvationTime: 5 }],
      ]),
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    // starvationRate = 5/10 = 0.5 → availability = 50%
    expect(scores.availability.value).toBeCloseTo(50);
  });

  it('returns 100% reliability when no losses', () => {
    const metrics = createMetrics({
      edge: new Map([[nid('e1') as any, { sent: 100, lost: 0 }]]),
      generator: new Map([[nid('g1'), { generated: 50, blocked: 0 }]]),
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    expect(scores.reliability.value).toBeCloseTo(100);
  });

  it('reduces reliability based on loss ratio', () => {
    const metrics = createMetrics({
      edge: new Map([[nid('e1') as any, { sent: 80, lost: 20 }]]),
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    // totalSent=80, totalLost=20 → lossRate = 20/80 = 0.25 → reliability = 75%
    expect(scores.reliability.value).toBeCloseTo(75);
  });

  it('calculates buildSpeed from wave skip data', () => {
    const metrics = createMetrics({
      waveSkips: [
        { waveIndex: 1, remainingSec: 30 },
        { waveIndex: 2, remainingSec: 20 },
      ],
      totalCountdownTime: 100,
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    // totalSkip = 50, totalCountdown = 100 → buildSpeed = 50%
    expect(scores.buildSpeed.value).toBeCloseTo(50);
  });

  it('computes overall score as weighted average', () => {
    const metrics = createMetrics({
      totalCountdownTime: 100,
      waveSkips: [{ waveIndex: 1, remainingSec: 100 }], // buildSpeed = 100%
      // No starvation → availability = 100%, no losses → reliability = 100%
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    // overall = 100*0.2 + 100*0.5 + 100*0.3 = 100
    expect(scores.overall).toBeCloseTo(100);
    expect(scores.rank).toBe('S+');
  });

  it('assigns rank based on overall score', () => {
    const metrics = createMetrics({
      // All zero → buildSpeed=0, availability=100, reliability=100
      // overall = 0*0.2 + 100*0.5 + 100*0.3 = 80
    });
    const state = createMinState(metrics);
    const scores = calculateScores(state, {} as GameConfig);
    expect(scores.overall).toBeCloseTo(80);
    expect(scores.rank).toBe('A');
  });
});

describe('updateMetricsElapsed', () => {
  it('increments elapsed time', () => {
    const metrics = createMetrics({ elapsedTime: 5.0 });
    const state = createMinState(metrics);
    updateMetricsElapsed(state, 0.5);
    expect(state.metrics.elapsedTime).toBeCloseTo(5.5);
  });
});

describe('shouldUpdateDisplay', () => {
  it('returns true when enough time has passed', () => {
    resetDisplayTimer();
    // First call at simTime >= 2.5 should return true
    expect(shouldUpdateDisplay(3.0)).toBe(true);
  });

  it('returns false when not enough time has passed', () => {
    resetDisplayTimer();
    shouldUpdateDisplay(3.0); // resets timer
    expect(shouldUpdateDisplay(3.5)).toBe(false); // only 0.5s later
  });
});

// ── calculateFinalScore ──

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

function createFullState(overrides?: Partial<GameState>): GameState {
  return {
    nodes: new Map(),
    edges: new Map(),
    packets: new Map(),
    enemies: new Map(),
    bullets: new Map(),
    enemyBullets: new Map(),
    effects: [],
    resources: 0,
    baseHp: 20,
    maxBaseHp: 20,
    waveIndex: 0,
    wavePhase: 'prep',
    simTime: 0,
    simSpeed: 1,
    gameResult: 'playing',
    metrics: createMetrics({ elapsedTime: 10 }),
    ...overrides,
  };
}

describe('calculateFinalScore', () => {
  beforeEach(() => resetIdCounter());

  it('generates attack tower scorecards', () => {
    const node = makeNode('t1', 'sniper', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 5, receivedAmmo: 10, demandTime: 8, starvationTime: 2 }],
        ]),
      }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 't1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('sniper');
    expect(card!.lossRate).toBe('25%'); // starvation 2/8 = 0.25
  });

  it('generates edge scorecards', () => {
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 100);
    const edge = makeEdge('e1', 'n1', 'n2');
    const state = createFullState({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      metrics: createMetrics({
        elapsedTime: 10,
        edge: new Map([[eid('e1'), { sent: 20, lost: 2 }]]),
      }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityType === 'edge');
    expect(card).toBeDefined();
    expect(card!.lossRate).toBe('10%'); // 2/20 = 0.10
  });

  it('generates queue node scorecards (distributor)', () => {
    const node = makeNode('d1', 'distributor', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        queueNode: new Map([
          [nid('d1'), { received: 20, dropped: 5, forwarded: 15 }],
        ]),
      }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 'd1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('distributor');
    // dropped/(received+dropped) = 5/25 = 20%
    expect(card!.lossRate).toBe('20%');
  });

  it('generates generator scorecards', () => {
    const node = makeNode('g1', 'generator', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        generator: new Map([
          [nid('g1'), { generated: 10, blocked: 0 }],
        ]),
      }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 'g1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('generator');
    expect(card!.lossRate).toBe('0%');
    expect(card!.rateIn).toBe('-');
  });

  it('marks bottleneck when starvation rate > 30%', () => {
    const node = makeNode('t1', 'sniper', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 2, receivedAmmo: 5, demandTime: 10, starvationTime: 5 }],
        ]),
      }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 't1');
    expect(card!.isBottleneck).toBe(true);
  });
});
