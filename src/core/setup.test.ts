import { describe, it, expect } from 'vitest';

describe('テスト基盤スモークテスト', () => {
  it('vitestがnode環境で動作する', () => {
    expect(1 + 1).toBe(2);
  });

  it('パスエイリアス @core/ が解決される', async () => {
    const mod = await import('@core/config');
    expect(mod).toBeDefined();
  });
});
