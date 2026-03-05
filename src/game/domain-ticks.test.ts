// Game Layer: DomainTick統合テスト

import { describe, it, expect } from 'vitest';
import { processHits, createSimulationFlow } from './domain-ticks';
import { GameFlow } from './game-flow';
import type { EnemyId, BulletId, Effect, Enemy, Bullet } from '@core/types';
import type { BulletHit } from '@core/combat/logic';
import type { GameConfig } from '@core/config';
import type { WaveRuntime } from '@core/wave/logic';
import type { StageData } from '@core/types';

// ── ヘルパー ──

function eid(s: string): EnemyId { return s as EnemyId; }
function bid(s: string): BulletId { return s as BulletId; }

function makeEnemy(id: string, hp: number, reward: number): Enemy {
  return {
    id: eid(id), type: 'normal', x: 100, y: 100,
    hp, maxHp: hp, speed: 50, pathIndex: 0, pathProgress: 0,
    reward, strength: 1, isBoss: false,
    attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0,
    angle: 0, atBase: false,
  };
}

function makeBullet(id: string, targetId: string): Bullet {
  return {
    id: bid(id), x: 50, y: 50, prevX: 50, prevY: 50,
    targetId: eid(targetId), deadPos: null,
    speed: 300, damage: 10, towerType: 'cannon', level: 1,
  };
}

function makeMinConfig(): GameConfig {
  return {
    enemyTypes: {
      normal: {
        label: 'Normal', color: '#fff', stroke: '#ff4466',
        radius: 8, behavior: 'path' as const,
        levels: [{ hp: 30, speed: 50, reward: 10 }],
      },
    },
  } as unknown as GameConfig;
}

function makeMinState() {
  return {
    effects: [] as Effect[],
    enemies: new Map<EnemyId, Enemy>(),
    bullets: new Map<BulletId, Bullet>(),
    resources: 100,
  };
}

// ── processHits ──

describe('processHits', () => {
  it('adds impact effects for each hit', () => {
    const state = makeMinState();
    const config = makeMinConfig();
    const e1 = makeEnemy('e1', 100, 10);
    state.enemies.set(e1.id, e1);

    const hits: BulletHit[] = [
      { targetId: eid('e1'), damage: 10, towerType: 'cannon', level: 1, x: 50, y: 50 },
      { targetId: eid('e1'), damage: 10, towerType: 'sniper', level: 2, x: 60, y: 60 },
    ];

    processHits(state, config, hits);

    // impact effects for both hits
    const impacts = state.effects.filter(e => e.type === 'impact');
    expect(impacts.length).toBe(2);
    // cannon hit also gets explosion particles
    const explosions = state.effects.filter(e => e.type === 'explosion');
    expect(explosions.length).toBe(6); // cannon adds 6 particles
  });

  it('applies damage and awards resources for kills', () => {
    const state = makeMinState();
    const config = makeMinConfig();
    const e1 = makeEnemy('e1', 20, 15);
    state.enemies.set(e1.id, e1);

    const hits: BulletHit[] = [
      { targetId: eid('e1'), damage: 25, towerType: 'rapid', level: 1, x: 50, y: 50 },
    ];

    processHits(state, config, hits);

    // Enemy killed → reward
    expect(state.resources).toBe(115); // 100 + 15
    // Dead enemy removed
    expect(state.enemies.has(eid('e1'))).toBe(false);
  });

  it('adds explosion particles for dead enemies', () => {
    const state = makeMinState();
    const config = makeMinConfig();
    const e1 = makeEnemy('e1', 5, 10);
    state.enemies.set(e1.id, e1);

    const hits: BulletHit[] = [
      { targetId: eid('e1'), damage: 10, towerType: 'cannon', level: 1, x: 50, y: 50 },
    ];

    processHits(state, config, hits);

    // Should have death explosion (8 particles) + cannon impact explosion (6)
    const explosions = state.effects.filter(e => e.type === 'explosion');
    expect(explosions.length).toBe(8 + 6);
  });

  it('sets deadPos on remaining bullets targeting dead enemy', () => {
    const state = makeMinState();
    const config = makeMinConfig();
    const e1 = makeEnemy('e1', 5, 10);
    e1.x = 200; e1.y = 200;
    state.enemies.set(e1.id, e1);

    const b2 = makeBullet('b2', 'e1');
    state.bullets.set(b2.id, b2);

    const hits: BulletHit[] = [
      { targetId: eid('e1'), damage: 10, towerType: 'cannon', level: 1, x: 50, y: 50 },
    ];

    processHits(state, config, hits);

    // Remaining bullet targeting dead enemy should have deadPos set
    const remaining = state.bullets.get(bid('b2'))!;
    expect(remaining.deadPos).toEqual({ x: 200, y: 200 });
  });
});

// ── createSimulationFlow ──

describe('createSimulationFlow', () => {
  it('returns a GameFlow instance', () => {
    const stage: StageData = {
      id: 'test',
      enemyPath: [{ x: 0, y: 0 }],
      waveDefs: [],
      basePos: { x: 400, y: 300 },
      nodeSlots: [],
    };
    const runtime: WaveRuntime = {
      spawnQueue: [],
      spawnTimer: 0,
      waveCountdown: 30,
      nextWaveDelay: 0,
    };

    const flow = createSimulationFlow(stage, runtime);
    expect(flow).toBeInstanceOf(GameFlow);
  });
});
