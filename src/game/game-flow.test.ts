import { describe, it, expect } from 'vitest';
import { GameFlow } from './game-flow';
import type { GameState } from '@core/state';
import type { GameConfig } from '@core/config';

describe('GameFlow', () => {
  it('calls registered ticks in order', () => {
    const order: string[] = [];
    const flow = new GameFlow();
    flow.addTick({ tick: () => order.push('network') });
    flow.addTick({ tick: () => order.push('combat') });
    flow.addTick({ tick: () => order.push('wave') });
    flow.addTick({ tick: () => order.push('economy') });
    flow.tick({} as GameState, {} as GameConfig, 0.016);
    expect(order).toEqual(['network', 'combat', 'wave', 'economy']);
  });

  it('passes state, config, and dt to each tick', () => {
    const received: { state: unknown; config: unknown; dt: number }[] = [];
    const flow = new GameFlow();
    flow.addTick({
      tick: (state, config, dt) => received.push({ state, config, dt }),
    });
    const mockState = { marker: 'state' } as unknown as GameState;
    const mockConfig = { marker: 'config' } as unknown as GameConfig;
    flow.tick(mockState, mockConfig, 0.016);
    expect(received[0].state).toBe(mockState);
    expect(received[0].config).toBe(mockConfig);
    expect(received[0].dt).toBe(0.016);
  });

  it('works with no registered ticks', () => {
    const flow = new GameFlow();
    expect(() => flow.tick({} as GameState, {} as GameConfig, 0.016)).not.toThrow();
  });
});
