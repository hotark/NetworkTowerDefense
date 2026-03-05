import { describe, it, expect } from 'vitest';
import { checkGameEnd } from './game-end';
import { createWaveRuntime } from '@core/wave/logic';
import { GAME_CONFIG } from '@core/config';
import { stage1 } from '@core/stages';
import type { WaveView } from '@core/types';

function createWaveView(overrides?: Partial<WaveView>): WaveView {
  return {
    enemies: new Map(), enemyBullets: new Map(),
    nodes: new Map(), edges: new Map(), effects: [],
    baseHp: 20, waveIndex: 0, wavePhase: 'prep',
    ...overrides,
  };
}

describe('checkGameEnd (Game layer)', () => {
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
});
