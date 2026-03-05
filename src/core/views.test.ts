import { describe, it, expect } from 'vitest';
import type { GameState } from '@core/state';
import type {
  NetworkView, CombatView, WaveView, EconomyView,
} from '@core/types';

// 型互換性チェック用ヘルパー（コンパイル時に検証）
function assertAssignable<T>(_value: T): void { /* noop */ }

describe('View Interfaces', () => {
  it('GameStateはNetworkViewを満たす', () => {
    assertAssignable<(s: GameState) => NetworkView>((s) => s);
    expect(true).toBe(true);
  });

  it('GameStateはCombatViewを満たす', () => {
    assertAssignable<(s: GameState) => CombatView>((s) => s);
    expect(true).toBe(true);
  });

  it('GameStateはWaveViewを満たす', () => {
    assertAssignable<(s: GameState) => WaveView>((s) => s);
    expect(true).toBe(true);
  });

  it('GameStateはEconomyViewを満たす', () => {
    assertAssignable<(s: GameState) => EconomyView>((s) => s);
    expect(true).toBe(true);
  });

  it('NetworkViewは必要なフィールドのみ', () => {
    const mock: NetworkView = {
      nodes: new Map(),
      edges: new Map(),
      packets: new Map(),
      metrics: {
        attackTower: new Map(),
        edge: new Map(),
        queueNode: new Map(),
        generator: new Map(),
        elapsedTime: 0,
        defenseHp: 1000,
      },
    };
    expect(mock.nodes).toBeDefined();
    expect(mock.edges).toBeDefined();
    expect(mock.packets).toBeDefined();
    expect(mock.metrics).toBeDefined();
  });
});
