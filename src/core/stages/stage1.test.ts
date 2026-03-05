import { describe, it, expect } from 'vitest';
import type { StageData } from '@core/types';
import { stage1 } from './stage1';

describe('Stage1', () => {
  it('StageData型を満たす', () => {
    const check: StageData = stage1;
    expect(check).toBeDefined();
  });

  it('idが設定されている', () => {
    expect(stage1.id).toBe('stage1');
  });

  it('enemyPathが2点以上', () => {
    expect(stage1.enemyPath.length).toBeGreaterThanOrEqual(2);
  });

  it('waveDefsが30ウェーブ', () => {
    expect(stage1.waveDefs).toHaveLength(30);
  });

  it('basePosが定義されている', () => {
    expect(stage1.basePos.x).toBeGreaterThan(0);
    expect(stage1.basePos.y).toBeGreaterThan(0);
  });

  it('nodeSlotsが定義されている', () => {
    expect(stage1.nodeSlots.length).toBeGreaterThan(0);
  });
});
