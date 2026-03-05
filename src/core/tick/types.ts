// Core Layer: DomainTickインターフェース + 共通タイマーユーティリティ

import type { GameState } from '@core/state';
import type { GameConfig } from '@core/config';

export interface DomainTick {
  tick(state: GameState, config: GameConfig, dt: number): void;
}

export function decrementCooldown(current: number, dt: number): number {
  return Math.max(0, current - dt);
}

export function isReady(cooldown: number): boolean {
  return cooldown <= 0;
}
