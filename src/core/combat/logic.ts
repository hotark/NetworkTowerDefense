// Core Layer: 戦闘システム — ダメージ計算・命中判定ルール

import type {
  NodeType, EnemyId,
} from '@core/types';

export interface BulletHit {
  targetId: EnemyId;
  damage: number;
  towerType: NodeType;
  level: number;
  x: number;
  y: number;
}

const TOWER_TURN_SPEED = 6; // rad/秒

/** 角度を最短経路でスムーズ補間 */
export function lerpAngle(current: number, target: number, speed: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = speed * dt;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}

export { TOWER_TURN_SPEED };
