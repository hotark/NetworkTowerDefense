// Core Layer: 戦闘システム — エフェクト生成（描画API依存ゼロ）

import type { NodeType, Effect } from '@core/types';

/** マズルフラッシュエフェクト生成 */
export function addMuzzleEffect(
  effects: Effect[], x: number, y: number, towerType: NodeType,
): void {
  const variant = towerType === 'sniper' ? 1 : towerType === 'rapid' ? 2 : towerType === 'cannon' ? 3 : 0;
  effects.push({
    type: 'muzzle',
    x, y,
    timer: 0.15,
    duration: 0.15,
    color: '',
    params: { variant },
  });
}

/** 着弾エフェクト生成 */
export function addImpactEffect(
  effects: Effect[], x: number, y: number, towerType: NodeType, level: number,
): void {
  const variant = towerType === 'sniper' ? 1 : towerType === 'rapid' ? 2 : towerType === 'cannon' ? 3 : 0;
  effects.push({
    type: 'impact',
    x, y,
    timer: 0.25,
    duration: 0.25,
    color: '',
    params: { variant, level },
  });
}

/** 撃破パーティクル（複数生成） */
export function addExplosionParticles(
  effects: Effect[], x: number, y: number, color: string, count: number = 8,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 30 + Math.random() * 40;
    const dur = 0.3 + Math.random() * 0.2;
    effects.push({
      type: 'explosion',
      x: x + Math.cos(angle) * 2,
      y: y + Math.sin(angle) * 2,
      timer: dur,
      duration: dur,
      color,
      params: { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
    });
  }
}

/** アップグレード完了エフェクト */
export function addUpgradeEffect(effects: Effect[], x: number, y: number): void {
  effects.push({
    type: 'upgrade',
    x, y,
    timer: 0.4,
    duration: 0.4,
    color: '',
    params: { variant: 0 },
  });
  effects.push({
    type: 'upgrade',
    x, y,
    timer: 0.6,
    duration: 0.6,
    color: '',
    params: { variant: 1 },
  });
}
