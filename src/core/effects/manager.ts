// Core Layer: エフェクト生成・タイマー更新・位置追跡（描画API依存ゼロ）

import type { Effect } from '@core/types';

export function addEffect(
  effects: Effect[],
  type: Effect['type'],
  x: number,
  y: number,
  duration: number,
  overrides?: Partial<Effect>,
): void {
  effects.push({
    type,
    x,
    y,
    timer: duration,
    duration,
    color: '',
    params: {},
    ...overrides,
  });
}

export function updateEffects(effects: Effect[], dt: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].timer -= dt;
    if (effects[i].timer <= 0) {
      effects.splice(i, 1);
    }
  }
}

export function updateEffectPositions(effects: Effect[], dt: number): void {
  for (const fx of effects) {
    if (fx.type === 'explosion' && fx.params.vx != null) {
      fx.x += fx.params.vx * dt;
      fx.y += fx.params.vy * dt;
      fx.params.vx *= 0.95;
      fx.params.vy *= 0.95;
    }
  }
}
