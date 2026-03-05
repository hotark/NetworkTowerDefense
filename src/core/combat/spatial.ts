// Core Layer: 戦闘システム — 射程判定・最近接敵探索

import type { Enemy, CombatView } from '@core/types';

/** 射程内の最近接敵を返す */
export function findClosestEnemy(
  view: CombatView, x: number, y: number, range: number,
): Enemy | null {
  let closest: Enemy | null = null;
  let closestDist = Infinity;
  for (const e of view.enemies.values()) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(x - e.x, y - e.y);
    if (d < range && d < closestDist) {
      closest = e;
      closestDist = d;
    }
  }
  return closest;
}
