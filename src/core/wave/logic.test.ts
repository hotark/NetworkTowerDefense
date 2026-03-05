import { describe, it, expect } from 'vitest';
import { checkGameEnd, createWaveRuntime } from './logic';
import { GAME_CONFIG } from '@core/config';
import { stage1 } from '@core/stages';
import type { WaveView, EnemyId } from '@core/types';

const eid = (s: string) => s as EnemyId;

function createWaveView(overrides?: Partial<WaveView>): WaveView {
  return {
    enemies: new Map(), enemyBullets: new Map(),
    nodes: new Map(), edges: new Map(), effects: [],
    baseHp: 20, waveIndex: 0, wavePhase: 'prep',
    ...overrides,
  };
}

describe('checkGameEnd', () => {
  it('returns defeat when baseHp <= 0', () => {
    const view = createWaveView({ baseHp: 0 });
    const runtime = createWaveRuntime(GAME_CONFIG);
    expect(checkGameEnd(view, stage1, runtime)).toBe('defeat');
  });

  it('returns victory when all waves cleared and no enemies', () => {
    const view = createWaveView({ waveIndex: 30, baseHp: 10 });
    const runtime = createWaveRuntime(GAME_CONFIG);
    runtime.spawnQueue = [];
    expect(checkGameEnd(view, stage1, runtime)).toBe('victory');
  });

  it('returns playing during active game', () => {
    const view = createWaveView({ waveIndex: 5, baseHp: 15 });
    const runtime = createWaveRuntime(GAME_CONFIG);
    expect(checkGameEnd(view, stage1, runtime)).toBe('playing');
  });

  it('returns playing if enemies remain after last wave', () => {
    const view = createWaveView({
      waveIndex: 30, baseHp: 10,
      enemies: new Map([[eid('en1'), { id: eid('en1'), type: 'normal', x: 0, y: 0, hp: 50, maxHp: 50, speed: 50, pathIndex: 0, pathProgress: 0, reward: 10, strength: 1, isBoss: false, attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0, angle: 0, atBase: false }]]),
    });
    const runtime = createWaveRuntime(GAME_CONFIG);
    runtime.spawnQueue = [];
    expect(checkGameEnd(view, stage1, runtime)).toBe('playing');
  });
});
