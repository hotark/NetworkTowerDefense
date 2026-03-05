// Game Layer: DomainTick登録型オーケストレーター

import type { DomainTick } from '@core/tick/types';
import type { GameState } from '@core/state';
import type { GameConfig } from '@core/config';

export class GameFlow {
  private ticks: DomainTick[] = [];

  addTick(domainTick: DomainTick): void {
    this.ticks.push(domainTick);
  }

  tick(state: GameState, config: GameConfig, dt: number): void {
    for (const t of this.ticks) {
      t.tick(state, config, dt);
    }
  }
}
