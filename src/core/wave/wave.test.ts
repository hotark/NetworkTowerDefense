// Core Layer: ウェーブシステムテスト（logic, tick, behaviors）

import { describe, it, expect, beforeEach } from 'vitest';
import { createEnemy, createWaveRuntime, createEnemyShot } from './logic';
import { startWave, updateWaveSpawning, updateEnemies } from './tick';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type {
  WaveView, StageData,
  TowerNode, NodeId, Edge, EdgeId,
} from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;

const testStage: StageData = {
  id: 'test',
  enemyPath: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ],
  waveDefs: [
    { enemies: [{ type: 'normal', count: 3, str: 1 }] },
    { enemies: [{ type: 'fast', count: 2, str: 1 }] },
  ],
  basePos: { x: 200, y: 0 },
  nodeSlots: [],
};

function makeNode(id: string, type: TowerNode['type'], x: number, y: number = 0, overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid(id), type, x, y, level: 1,
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

function createWaveView(overrides?: Partial<WaveView>): WaveView {
  return {
    enemies: new Map(),
    enemyBullets: new Map(),
    nodes: new Map(),
    edges: new Map(),
    effects: [],
    baseHp: 20,
    waveIndex: 0,
    wavePhase: 'prep',
    ...overrides,
  };
}

describe('createEnemy', () => {
  beforeEach(() => resetIdCounter());

  it('creates enemy at path start with correct stats', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    expect(enemy.x).toBe(0);
    expect(enemy.y).toBe(0);
    expect(enemy.hp).toBeGreaterThan(0);
    expect(enemy.pathIndex).toBe(0);
    expect(enemy.isBoss).toBe(false);
  });

  it('creates boss with bossLevels stats when available', () => {
    const boss = createEnemy(GAME_CONFIG, testStage, 'normal', 1, true);
    expect(boss.isBoss).toBe(true);
    // Boss should have different stats if bossLevels defined
    const normalEnemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    // At minimum, the boss flag is set
    expect(boss.isBoss).not.toBe(normalEnemy.isBoss);
  });
});

describe('createWaveRuntime', () => {
  it('initializes with empty spawn queue and config countdown', () => {
    const runtime = createWaveRuntime(GAME_CONFIG);
    expect(runtime.spawnQueue.length).toBe(0);
    expect(runtime.spawnTimer).toBe(0);
    expect(runtime.waveCountdown).toBe(GAME_CONFIG.WAVE_COUNTDOWN);
  });
});

describe('startWave', () => {
  beforeEach(() => resetIdCounter());

  it('populates spawn queue from wave definition', () => {
    const view = createWaveView();
    const runtime = createWaveRuntime(GAME_CONFIG);
    startWave(view, GAME_CONFIG, testStage, runtime);
    expect(view.waveIndex).toBe(1);
    expect(view.wavePhase).toBe('active');
    expect(runtime.spawnQueue.length).toBe(3); // 3 normals from wave 1
  });

  it('does nothing when all waves exhausted', () => {
    const view = createWaveView({ waveIndex: 2 }); // Already past all waves
    const runtime = createWaveRuntime(GAME_CONFIG);
    startWave(view, GAME_CONFIG, testStage, runtime);
    expect(view.waveIndex).toBe(2); // unchanged
    expect(runtime.spawnQueue.length).toBe(0);
  });
});

describe('updateWaveSpawning', () => {
  beforeEach(() => resetIdCounter());

  it('spawns enemies from queue when timer expires', () => {
    const view = createWaveView({ waveIndex: 1, wavePhase: 'active' });
    const runtime = createWaveRuntime(GAME_CONFIG);
    runtime.spawnQueue.push(
      { type: 'normal', str: 1, boss: false },
      { type: 'normal', str: 1, boss: false },
    );
    runtime.spawnTimer = 0; // ready to spawn
    runtime.nextWaveDelay = 0;

    updateWaveSpawning(view, GAME_CONFIG, testStage, runtime, 0.1);
    expect(view.enemies.size).toBe(1);
    expect(runtime.spawnQueue.length).toBe(1);
  });

  it('auto-starts next wave when countdown reaches 0', () => {
    const view = createWaveView({ waveIndex: 0 });
    const runtime = createWaveRuntime(GAME_CONFIG);
    runtime.waveCountdown = 0.05;
    runtime.nextWaveDelay = 0;

    const autoStarted = updateWaveSpawning(view, GAME_CONFIG, testStage, runtime, 0.1);
    expect(autoStarted).toBe(true);
    expect(view.waveIndex).toBe(1);
  });

  it('decrements nextWaveDelay before countdown', () => {
    const view = createWaveView({ waveIndex: 0 });
    const runtime = createWaveRuntime(GAME_CONFIG);
    runtime.nextWaveDelay = 1.0;
    const originalCountdown = runtime.waveCountdown;

    updateWaveSpawning(view, GAME_CONFIG, testStage, runtime, 0.5);
    expect(runtime.nextWaveDelay).toBeCloseTo(0.5);
    expect(runtime.waveCountdown).toBe(originalCountdown); // countdown not touched
  });
});

describe('updateEnemies', () => {
  beforeEach(() => resetIdCounter());

  it('moves enemy along path', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    const view = createWaveView({
      enemies: new Map([[enemy.id, enemy]]),
    });
    const startX = enemy.x;
    updateEnemies(view, GAME_CONFIG, testStage, 0.5);
    expect(enemy.x).toBeGreaterThan(startX);
  });

  it('removes dead enemies', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    enemy.hp = 0;
    const view = createWaveView({
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateEnemies(view, GAME_CONFIG, testStage, 0.1);
    expect(view.enemies.size).toBe(0);
  });

  it('enemy at base attacks baseHp', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    enemy.atBase = true;
    enemy.attackTimer = 0; // ready to attack
    const view = createWaveView({
      enemies: new Map([[enemy.id, enemy]]),
      baseHp: 20,
    });
    updateEnemies(view, GAME_CONFIG, testStage, 0.1);
    expect(view.baseHp).toBe(19);
  });

  it('sets atBase when reaching end of path', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    // Place past last path point so pathIndex+1 is undefined
    enemy.x = testStage.enemyPath[2].x;
    enemy.y = testStage.enemyPath[2].y;
    enemy.pathIndex = 2; // path[3] is undefined → triggers atBase
    const view = createWaveView({
      enemies: new Map([[enemy.id, enemy]]),
      baseHp: 20,
    });
    updateEnemies(view, GAME_CONFIG, testStage, 0.1);
    expect(enemy.atBase).toBe(true);
    expect(view.baseHp).toBe(19); // -1 on arrival
  });
});

describe('createEnemyShot', () => {
  beforeEach(() => resetIdCounter());

  it('creates edgeAttack bullet targeting an edge', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    enemy.attackRange = 200;
    enemy.attackDamage = 5;
    const n1 = makeNode('n1', 'generator', 10, 0);
    const n2 = makeNode('n2', 'sniper', 50, 0);
    const edge = makeEdge('e1', 'n1', 'n2');
    const view = createWaveView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
    });
    const shot = createEnemyShot(enemy, view, GAME_CONFIG, 'edgeAttack');
    if (shot) {
      expect(shot.targetKind).toBe('edge');
      expect(shot.edgeId).toBe(eid('e1'));
    }
    // shot can be null if no edge in range, but our setup should hit
    expect(shot).not.toBeNull();
  });

  it('creates towerAttack bullet targeting a node', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    enemy.attackRange = 200;
    enemy.attackDamage = 5;
    const n1 = makeNode('n1', 'sniper', 10, 0);
    const view = createWaveView({
      nodes: new Map([[n1.id, n1]]),
    });
    const shot = createEnemyShot(enemy, view, GAME_CONFIG, 'towerAttack');
    if (shot) {
      expect(shot.targetKind).toBe('node');
      expect(shot.nodeId).toBe(nid('n1'));
    }
    expect(shot).not.toBeNull();
  });

  it('returns null when no targets in range', () => {
    const enemy = createEnemy(GAME_CONFIG, testStage, 'normal', 1, false);
    enemy.attackRange = 1; // very short range
    const n1 = makeNode('n1', 'sniper', 500, 0); // far away
    const view = createWaveView({
      nodes: new Map([[n1.id, n1]]),
    });
    const shot = createEnemyShot(enemy, view, GAME_CONFIG, 'towerAttack');
    expect(shot).toBeNull();
  });
});
