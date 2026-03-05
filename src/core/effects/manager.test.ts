import { describe, it, expect } from 'vitest';
import type { Effect } from '@core/types';
import { addEffect, updateEffects, updateEffectPositions } from './manager';

function makeEffect(overrides: Partial<Effect> = {}): Effect {
  return {
    type: 'muzzle',
    x: 0, y: 0,
    timer: 1.0, duration: 1.0,
    color: '',
    params: {},
    ...overrides,
  };
}

describe('EffectsManager', () => {
  describe('addEffect', () => {
    it('配列にエフェクトを追加する', () => {
      const effects: Effect[] = [];
      addEffect(effects, 'muzzle', 10, 20, 0.5);
      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('muzzle');
      expect(effects[0].x).toBe(10);
      expect(effects[0].y).toBe(20);
      expect(effects[0].timer).toBe(0.5);
      expect(effects[0].duration).toBe(0.5);
    });

    it('追加パラメータをマージする', () => {
      const effects: Effect[] = [];
      addEffect(effects, 'impact', 0, 0, 0.25, { color: '#ff0000', params: { variant: 2 } });
      expect(effects[0].color).toBe('#ff0000');
      expect(effects[0].params.variant).toBe(2);
    });
  });

  describe('updateEffects', () => {
    it('タイマーを減算する', () => {
      const effects: Effect[] = [makeEffect({ timer: 1.0 })];
      updateEffects(effects, 0.3);
      expect(effects[0].timer).toBeCloseTo(0.7);
    });

    it('期限切れエフェクトを削除する', () => {
      const effects: Effect[] = [
        makeEffect({ timer: 0.1 }),
        makeEffect({ timer: 1.0 }),
      ];
      updateEffects(effects, 0.5);
      expect(effects).toHaveLength(1);
      expect(effects[0].timer).toBeCloseTo(0.5);
    });

    it('全て期限切れなら空配列になる', () => {
      const effects: Effect[] = [
        makeEffect({ timer: 0.1 }),
        makeEffect({ timer: 0.2 }),
      ];
      updateEffects(effects, 1.0);
      expect(effects).toHaveLength(0);
    });
  });

  describe('updateEffectPositions', () => {
    it('explosionパーティクルの座標を速度で更新する', () => {
      const effects: Effect[] = [
        makeEffect({ type: 'explosion', x: 0, y: 0, params: { vx: 10, vy: 20 } }),
      ];
      updateEffectPositions(effects, 0.5);
      expect(effects[0].x).toBeCloseTo(5);
      expect(effects[0].y).toBeCloseTo(10);
    });

    it('速度を減衰させる', () => {
      const effects: Effect[] = [
        makeEffect({ type: 'explosion', x: 0, y: 0, params: { vx: 100, vy: 100 } }),
      ];
      updateEffectPositions(effects, 0.1);
      expect(effects[0].params.vx).toBeCloseTo(100 * 0.95);
      expect(effects[0].params.vy).toBeCloseTo(100 * 0.95);
    });

    it('非explosionエフェクトは更新しない', () => {
      const effects: Effect[] = [
        makeEffect({ type: 'muzzle', x: 5, y: 10, params: { vx: 100, vy: 100 } }),
      ];
      updateEffectPositions(effects, 0.5);
      expect(effects[0].x).toBe(5);
      expect(effects[0].y).toBe(10);
    });
  });
});
