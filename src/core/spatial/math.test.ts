import { describe, it, expect } from 'vitest';
import {
  dist, distSq, normalize, scale, add, sub, lerp,
  pointInCircle, segmentNearest,
} from './math';

describe('SpatialMath', () => {
  describe('dist', () => {
    it('同一点の距離は0', () => {
      expect(dist({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
    });
    it('3-4-5三角形の距離は5', () => {
      expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
  });

  describe('distSq', () => {
    it('3-4-5三角形の距離二乗は25', () => {
      expect(distSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    });
  });

  describe('normalize', () => {
    it('単位ベクトルに正規化される', () => {
      const n = normalize({ x: 3, y: 4 });
      expect(n.x).toBeCloseTo(0.6);
      expect(n.y).toBeCloseTo(0.8);
    });
    it('ゼロベクトルはゼロのまま', () => {
      const n = normalize({ x: 0, y: 0 });
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
    });
  });

  describe('scale', () => {
    it('スカラー倍が正しい', () => {
      const v = scale({ x: 2, y: 3 }, 4);
      expect(v.x).toBe(8);
      expect(v.y).toBe(12);
    });
  });

  describe('add / sub', () => {
    it('加算が正しい', () => {
      const v = add({ x: 1, y: 2 }, { x: 3, y: 4 });
      expect(v.x).toBe(4);
      expect(v.y).toBe(6);
    });
    it('減算が正しい', () => {
      const v = sub({ x: 5, y: 7 }, { x: 2, y: 3 });
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });
  });

  describe('lerp', () => {
    it('t=0で始点', () => {
      const v = lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0);
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });
    it('t=1で終点', () => {
      const v = lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 1);
      expect(v.x).toBe(10);
      expect(v.y).toBe(20);
    });
    it('t=0.5で中間点', () => {
      const v = lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
    });
  });

  describe('pointInCircle', () => {
    it('円内の点はtrue', () => {
      expect(pointInCircle({ x: 1, y: 1 }, { x: 0, y: 0 }, 2)).toBe(true);
    });
    it('円外の点はfalse', () => {
      expect(pointInCircle({ x: 3, y: 0 }, { x: 0, y: 0 }, 2)).toBe(false);
    });
    it('境界上はtrue', () => {
      expect(pointInCircle({ x: 2, y: 0 }, { x: 0, y: 0 }, 2)).toBe(true);
    });
  });

  describe('segmentNearest', () => {
    it('線分の始点が最近点', () => {
      const p = segmentNearest({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(0);
    });
    it('線分の終点が最近点', () => {
      const p = segmentNearest({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(0);
    });
    it('線分の中間点が最近点', () => {
      const p = segmentNearest({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(0);
    });
    it('退化線分（長さ0）はaを返す', () => {
      const p = segmentNearest({ x: 3, y: 4 }, { x: 1, y: 1 }, { x: 1, y: 1 });
      expect(p.x).toBe(1);
      expect(p.y).toBe(1);
    });
  });
});
