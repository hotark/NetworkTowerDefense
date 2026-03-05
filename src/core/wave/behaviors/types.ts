// Core Layer: EnemyBehavior Strategy interface

import type { Enemy, WaveView, StageData } from '@core/types';
import type { GameConfig } from '@core/config';

export interface EnemyBehavior {
  update(
    enemy: Enemy,
    view: WaveView,
    config: GameConfig,
    stage: StageData,
    dt: number,
  ): void;
}
