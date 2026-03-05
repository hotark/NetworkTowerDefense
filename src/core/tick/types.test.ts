import { describe, it, expect } from 'vitest';
import { decrementCooldown, isReady } from './types';

describe('TickFoundation', () => {
  describe('decrementCooldown', () => {
    it('dtを減算する', () => {
      expect(decrementCooldown(1.0, 0.3)).toBeCloseTo(0.7);
    });
    it('0未満にはならない', () => {
      expect(decrementCooldown(0.1, 0.5)).toBe(0);
    });
  });

  describe('isReady', () => {
    it('cooldown 0はtrue', () => {
      expect(isReady(0)).toBe(true);
    });
    it('cooldown 負はtrue', () => {
      expect(isReady(-0.1)).toBe(true);
    });
    it('cooldown 正はfalse', () => {
      expect(isReady(0.5)).toBe(false);
    });
  });
});
