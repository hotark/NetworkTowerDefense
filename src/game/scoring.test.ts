import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateScores,
  calculateFinalScore,
  updateMetricsElapsed,
  shouldUpdateDisplay,
  resetDisplayTimer,
} from './scoring';
import type { GameState } from '@core/state';
import { resetIdCounter } from '@core/state';
import { GAME_CONFIG } from '@core/config';
import type { MetricsStore, NodeId, EdgeId, TowerNode, Edge } from '@core/types';
import {
  createRollingMetricsStore,
  getNodeRollingMetrics,
  getEdgeRollingMetrics,
} from '@core/metrics';
import type { RollingMetricsStore } from '@core/metrics';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

function createMetrics(overrides?: Partial<MetricsStore>): MetricsStore {
  return {
    attackTower: new Map(),
    edge: new Map(),
    queueNode: new Map(),
    generator: new Map(),
    elapsedTime: 0,
    defenseHp: 1000,
    ...overrides,
  };
}

function createMinState(
  metrics: MetricsStore,
  rollingMetrics?: RollingMetricsStore,
): GameState {
  return {
    metrics,
    rollingMetrics: rollingMetrics ?? createRollingMetricsStore(),
  } as unknown as GameState;
}

function makeNode(
  id: string,
  type: TowerNode['type'],
  x: number,
  overrides?: Partial<TowerNode>,
): TowerNode {
  return {
    id: nid(id), type, x, y: 0, level: 1,
    hp: 100, maxHp: 100, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function makeEdge(
  id: string,
  from: string,
  to: string,
  overrides?: Partial<Edge>,
): Edge {
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
    rollingMetrics: createRollingMetricsStore(),
    ...overrides,
  };
}

// ── TwoAxisScores ──

describe('calculateScores', () => {
  describe('availability axis', () => {
    it('returns 100% when no starvation', () => {
      const metrics = createMetrics({
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 10, receivedAmmo: 10, demandTime: 10, starvationTime: 0 }],
        ]),
      });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.availability.value).toBeCloseTo(100);
    });

    it('reduces based on starvation ratio', () => {
      const metrics = createMetrics({
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 5, receivedAmmo: 5, demandTime: 10, starvationTime: 5 }],
        ]),
      });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // starvationRate = 5/10 = 0.5 -> availability = (1 - 0.5) * 100 = 50
      expect(scores.availability.value).toBeCloseTo(50);
    });

    it('returns 100% when no towers exist (no demand)', () => {
      const metrics = createMetrics();
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // totalDemand = 0 -> starvationRate = 0 -> availability = 100
      expect(scores.availability.value).toBeCloseTo(100);
    });

    it('aggregates across multiple towers', () => {
      const metrics = createMetrics({
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 10, receivedAmmo: 10, demandTime: 20, starvationTime: 10 }],
          [nid('t2'), { consumedAmmo: 10, receivedAmmo: 10, demandTime: 20, starvationTime: 0 }],
        ]),
      });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // totalDemand = 40, totalStarvation = 10 -> rate = 0.25 -> availability = 75
      expect(scores.availability.value).toBeCloseTo(75);
    });
  });

  describe('defense axis', () => {
    it('returns 100% when defenseHp equals MAX_DEFENSE_HP', () => {
      const metrics = createMetrics({ defenseHp: 1000 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // 1000 / 1000 * 100 = 100
      expect(scores.defense.value).toBeCloseTo(100);
    });

    it('returns 50% when defenseHp is half', () => {
      const metrics = createMetrics({ defenseHp: 500 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.defense.value).toBeCloseTo(50);
    });

    it('returns 0% when defenseHp is 0', () => {
      const metrics = createMetrics({ defenseHp: 0 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.defense.value).toBeCloseTo(0);
    });
  });

  describe('overall and rank', () => {
    it('computes overall as 50/50 weighted average of availability and defense', () => {
      // availability = 100 (no starvation), defense = 100 (full hp)
      const metrics = createMetrics({ defenseHp: 1000 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // overall = 100 * 0.5 + 100 * 0.5 = 100
      expect(scores.overall).toBeCloseTo(100);
    });

    it('computes overall with mixed axes', () => {
      // availability = 50 (starvation 50%), defense = 80 (800/1000)
      const metrics = createMetrics({
        defenseHp: 800,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 5, receivedAmmo: 5, demandTime: 10, starvationTime: 5 }],
        ]),
      });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      // overall = 50 * 0.5 + 80 * 0.5 = 65
      expect(scores.overall).toBeCloseTo(65);
    });

    it('assigns rank S+ for overall >= 95', () => {
      const metrics = createMetrics({ defenseHp: 1000 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(100);
      expect(scores.rank).toBe('S+');
    });

    it('assigns rank S for overall >= 85 and < 95', () => {
      // availability = 100, defense = 80 -> overall = 90
      const metrics = createMetrics({ defenseHp: 800 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(90);
      expect(scores.rank).toBe('S');
    });

    it('assigns rank A for overall >= 70 and < 85', () => {
      // availability = 100, defense = 50 -> overall = 75
      const metrics = createMetrics({ defenseHp: 500 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(75);
      expect(scores.rank).toBe('A');
    });

    it('assigns rank B for overall >= 55 and < 70', () => {
      // availability = 100, defense = 20 -> overall = 60
      const metrics = createMetrics({ defenseHp: 200 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(60);
      expect(scores.rank).toBe('B');
    });

    it('assigns rank C for overall >= 40 and < 55', () => {
      // availability = 100, defense = 0 -> overall = 50
      const metrics = createMetrics({ defenseHp: 0 });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(50);
      expect(scores.rank).toBe('C');
    });

    it('assigns rank D for overall < 40', () => {
      // availability = 0 (full starvation), defense = 0 -> overall = 0
      const metrics = createMetrics({
        defenseHp: 0,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 0, receivedAmmo: 0, demandTime: 10, starvationTime: 10 }],
        ]),
      });
      const state = createMinState(metrics);
      const scores = calculateScores(state, GAME_CONFIG);
      expect(scores.overall).toBeCloseTo(0);
      expect(scores.rank).toBe('D');
    });
  });
});

// ── updateMetricsElapsed ──

describe('updateMetricsElapsed', () => {
  it('increments elapsed time', () => {
    const metrics = createMetrics({ elapsedTime: 5.0 });
    const state = createMinState(metrics);
    updateMetricsElapsed(state, 0.5);
    expect(state.metrics.elapsedTime).toBeCloseTo(5.5);
  });
});

// ── shouldUpdateDisplay ──

describe('shouldUpdateDisplay', () => {
  it('returns true when enough time has passed', () => {
    resetDisplayTimer();
    expect(shouldUpdateDisplay(3.0)).toBe(true);
  });

  it('returns false when not enough time has passed', () => {
    resetDisplayTimer();
    shouldUpdateDisplay(3.0); // resets internal timer to 3.0
    expect(shouldUpdateDisplay(3.5)).toBe(false); // only 0.5s later
  });
});

// ── calculateFinalScore / EntityScorecard ──

describe('calculateFinalScore', () => {
  beforeEach(() => resetIdCounter());

  it('generates attack tower scorecards with rolling metrics', () => {
    const rm = createRollingMetricsStore();
    const node = makeNode('t1', 'sniper', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 5, receivedAmmo: 10, demandTime: 8, starvationTime: 2 }],
        ]),
      }),
      rollingMetrics: rm,
    });

    // Record supply and consumption events on the rolling windows
    const nrm = getNodeRollingMetrics(rm, nid('t1'));
    for (let t = 1; t <= 10; t++) {
      nrm.supply.recordEvent(t, 1);
    }
    for (let t = 1; t <= 8; t++) {
      nrm.consumption.recordEvent(t, 1);
    }
    // Record some idle time so utilization is < 1
    nrm.idle.recordIdle(5, 20); // 20s idle -> utilization = (60-20)/60 = 0.667

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 't1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('sniper');
    expect(card!.label).toBe('sniper Lv1');
    expect(card!.theoretical).toContain('pkt/s');
    expect(card!.supplyRate).toContain('pkt/s');
    expect(card!.consumptionRate).toContain('pkt/s');
    expect(typeof card!.utilization).toBe('number');
  });

  it('generates edge scorecards with rolling metrics', () => {
    const rm = createRollingMetricsStore();
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 100);
    const edge = makeEdge('e1', 'n1', 'n2');
    const state = createFullState({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      metrics: createMetrics({
        elapsedTime: 10,
        edge: new Map([[eid('e1'), { sent: 20, lost: 2, arrived: 18 }]]),
      }),
      rollingMetrics: rm,
    });

    // Record supply events on edge rolling metrics
    const erm = getEdgeRollingMetrics(rm, eid('e1'));
    for (let t = 1; t <= 5; t++) {
      erm.supply.recordEvent(t, 1);
    }

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityType === 'edge');
    expect(card).toBeDefined();
    expect(card!.entityId).toBe('e1');
    expect(card!.label).toBe('Edge Lv1');
    expect(card!.theoretical).toContain('pkt/s');
    expect(card!.supplyRate).toContain('pkt/s');
    expect(card!.consumptionRate).toContain('pkt/s');
    expect(typeof card!.utilization).toBe('number');
  });

  it('generates queue node scorecards (distributor)', () => {
    const rm = createRollingMetricsStore();
    const node = makeNode('d1', 'distributor', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        queueNode: new Map([
          [nid('d1'), { received: 20, dropped: 5, forwarded: 15 }],
        ]),
      }),
      rollingMetrics: rm,
    });

    const nrm = getNodeRollingMetrics(rm, nid('d1'));
    for (let t = 1; t <= 6; t++) {
      nrm.supply.recordEvent(t, 1);
      nrm.consumption.recordEvent(t, 1);
    }

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 'd1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('distributor');
    expect(card!.label).toBe('distributor Lv1');
    expect(card!.supplyRate).toContain('pkt/s');
    expect(card!.consumptionRate).toContain('pkt/s');
  });

  it('generates generator scorecards', () => {
    const rm = createRollingMetricsStore();
    const node = makeNode('g1', 'generator', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        generator: new Map([
          [nid('g1'), { generated: 10, blocked: 0 }],
        ]),
      }),
      rollingMetrics: rm,
    });

    const nrm = getNodeRollingMetrics(rm, nid('g1'));
    for (let t = 1; t <= 5; t++) {
      nrm.consumption.recordEvent(t, 1);
    }

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 'g1');
    expect(card).toBeDefined();
    expect(card!.entityType).toBe('generator');
    expect(card!.label).toBe('generator Lv1');
    expect(card!.supplyRate).toBe('-');
    expect(card!.consumptionRate).toContain('pkt/s');
  });

  it('marks entity as bottleneck when utilization < 0.7', () => {
    const rm = createRollingMetricsStore();
    const node = makeNode('t1', 'sniper', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 2, receivedAmmo: 5, demandTime: 10, starvationTime: 5 }],
        ]),
      }),
      rollingMetrics: rm,
    });

    // Record 25s of idle -> utilization = (60-25)/60 = 0.583 < 0.7
    const nrm = getNodeRollingMetrics(rm, nid('t1'));
    nrm.idle.recordIdle(5, 25);

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 't1');
    expect(card).toBeDefined();
    expect(card!.utilization).toBeCloseTo(0.583, 2);
    expect(card!.isBottleneck).toBe(true);
  });

  it('does not mark entity as bottleneck when utilization >= 0.7', () => {
    const rm = createRollingMetricsStore();
    const node = makeNode('t1', 'sniper', 0);
    const state = createFullState({
      nodes: new Map([[node.id, node]]),
      metrics: createMetrics({
        elapsedTime: 10,
        attackTower: new Map([
          [nid('t1'), { consumedAmmo: 10, receivedAmmo: 10, demandTime: 10, starvationTime: 0 }],
        ]),
      }),
      rollingMetrics: rm,
    });

    // Record 10s of idle -> utilization = (60-10)/60 = 0.833 >= 0.7
    const nrm = getNodeRollingMetrics(rm, nid('t1'));
    nrm.idle.recordIdle(5, 10);

    const result = calculateFinalScore(state, GAME_CONFIG);
    const card = result.entityScorecards.find(c => c.entityId === 't1');
    expect(card).toBeDefined();
    expect(card!.utilization).toBeCloseTo(0.833, 2);
    expect(card!.isBottleneck).toBe(false);
  });

  it('returns axes scores alongside entity scorecards', () => {
    const state = createFullState({
      metrics: createMetrics({ defenseHp: 1000 }),
    });

    const result = calculateFinalScore(state, GAME_CONFIG);
    expect(result.axes).toBeDefined();
    expect(result.axes.availability.value).toBeCloseTo(100);
    expect(result.axes.defense.value).toBeCloseTo(100);
    expect(result.axes.overall).toBeCloseTo(100);
    expect(result.axes.rank).toBe('S+');
    expect(result.entityScorecards).toEqual([]);
  });
});
