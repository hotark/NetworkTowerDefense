// Game Layer: Target selection, bullet creation, bullet movement, hit detection

import type {
  NodeType, EnemyId, BulletId,
  Bullet, Enemy,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import type { GameState } from '@core/state';
import { generateBulletId, connectedEdges } from '@core/state';

// ── 公開型 ──

export interface BulletHit {
  targetId: EnemyId;
  damage: number;
  towerType: NodeType;
  level: number;
  x: number;
  y: number;
}

// ── 旋回ヘルパー ──

const TOWER_TURN_SPEED = 6; // rad/秒

/** 角度を最短経路でスムーズ補間 */
function lerpAngle(current: number, target: number, speed: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = speed * dt;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}

// ── タワー攻撃 ──

/** 攻撃タワーがammo保持+射程内の最近接敵に弾を発射 */
export function updateTowerAttacks(state: GameState, config: GameConfig, dt: number): void {
  for (const node of state.nodes.values()) {
    if (node.status !== 'active') continue;
    if (node.type !== 'sniper' && node.type !== 'rapid' && node.type !== 'cannon') continue;

    const stats = getTowerLevelStats(config, node.type, node.level);
    if (!stats.range || !stats.cooldown || !stats.damage) continue;

    // 射程内の最近接敵を探索（向き更新にも使う）
    const closest = findClosestEnemy(state, node.x, node.y, stats.range);

    // 向き更新（敵がいれば旋回、いなければ現在の向きを維持）
    if (closest) {
      const targetAngle = Math.atan2(closest.y - node.y, closest.x - node.x);
      if (node.facingAngle == null) {
        node.facingAngle = targetAngle;
      } else {
        node.facingAngle = lerpAngle(node.facingAngle, targetAngle, TOWER_TURN_SPEED, dt);
      }
    }

    if (node.cooldown > 0) { node.cooldown -= dt; continue; }
    if (!closest) continue;

    const ammoNeeded = stats.ammoPerShot ?? 1;
    if (node.ammo < ammoNeeded) continue;

    node.ammo -= ammoNeeded;
    node.cooldown = stats.cooldown;

    const bullet: Bullet = {
      id: generateBulletId(),
      x: node.x, y: node.y,
      prevX: node.x, prevY: node.y,
      targetId: closest.id,
      deadPos: null,
      speed: config.BULLET_SPEED,
      damage: stats.damage,
      towerType: node.type,
      level: node.level,
    };
    state.bullets.set(bullet.id, bullet);
  }
}

/** 拠点の基本攻撃（ammo不要） */
export function updateBaseAttack(state: GameState, config: GameConfig, dt: number): void {
  baseCooldown -= dt;
  if (baseCooldown > 0) return;

  const closest = findClosestEnemy(state, config.basePos.x, config.basePos.y, config.BASE_ATTACK.range);
  if (!closest) return;

  baseCooldown = config.BASE_ATTACK.cooldown;
  const bullet: Bullet = {
    id: generateBulletId(),
    x: config.basePos.x, y: config.basePos.y,
    prevX: config.basePos.x, prevY: config.basePos.y,
    targetId: closest.id,
    deadPos: null,
    speed: config.BULLET_SPEED,
    damage: config.BASE_ATTACK.damage,
    towerType: 'cannon',
    level: 1,
  };
  state.bullets.set(bullet.id, bullet);
}

let baseCooldown = 0;
export function resetBaseCooldown(): void { baseCooldown = 0; }

// ── 弾移動・命中 ──

/** 弾を追尾移動させ、命中時のヒット情報を返す */
export function updateBullets(state: GameState, dt: number): BulletHit[] {
  const hits: BulletHit[] = [];
  const toDelete: BulletId[] = [];

  for (const b of state.bullets.values()) {
    const target = state.enemies.get(b.targetId);

    if ((!target || target.hp <= 0) && !b.deadPos) {
      b.deadPos = target ? { x: target.x, y: target.y } : { x: b.x, y: b.y };
    }

    const tx = b.deadPos ? b.deadPos.x : target!.x;
    const ty = b.deadPos ? b.deadPos.y : target!.y;
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy);

    if (d < 8) {
      if (!b.deadPos && target) {
        hits.push({
          targetId: b.targetId,
          damage: b.damage,
          towerType: b.towerType,
          level: b.level,
          x: b.x, y: b.y,
        });
      }
      toDelete.push(b.id);
    } else {
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += (dx / d) * b.speed * dt;
      b.y += (dy / d) * b.speed * dt;
    }
  }

  for (const id of toDelete) state.bullets.delete(id);
  return hits;
}

/** ヒットのダメージを適用し、HP0の敵にリソース報酬 */
export function applyBulletHits(state: GameState, hits: BulletHit[]): void {
  for (const hit of hits) {
    const enemy = state.enemies.get(hit.targetId);
    if (!enemy) continue;
    enemy.hp -= hit.damage;
    if (enemy.hp <= 0) {
      state.resources += enemy.reward;
    }
  }
}

/** 敵弾の移動と構造物への命中判定 */
export function updateEnemyBullets(state: GameState, _config: GameConfig, dt: number): void {
  const toDelete: BulletId[] = [];

  for (const b of state.enemyBullets.values()) {
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);

    if (d < 8) {
      if (b.targetKind === 'edge' && b.edgeId) {
        const edge = state.edges.get(b.edgeId);
        if (edge && edge.status !== 'destroyed') {
          edge.hp -= b.damage;
          if (edge.hp <= 0) {
            edge.status = 'destroyed';
            for (const [pid, pkt] of state.packets) {
              if (pkt.edgeId === edge.id) state.packets.delete(pid);
            }
          }
        }
      } else if (b.targetKind === 'node' && b.nodeId) {
        const node = state.nodes.get(b.nodeId);
        if (node && node.hp > 0) {
          node.hp -= b.damage;
          if (node.hp <= 0) {
            const edges = connectedEdges(state, node.id);
            for (const edge of edges) {
              edge.status = 'destroyed';
              for (const [pid, pkt] of state.packets) {
                if (pkt.edgeId === edge.id) state.packets.delete(pid);
              }
            }
            state.nodes.delete(node.id);
          }
        }
      }
      toDelete.push(b.id);
    } else {
      b.x += (dx / d) * b.speed * dt;
      b.y += (dy / d) * b.speed * dt;
    }
  }

  for (const id of toDelete) state.enemyBullets.delete(id);
}

// ── ヘルパー ──

function findClosestEnemy(
  state: GameState, x: number, y: number, range: number,
): Enemy | null {
  let closest: Enemy | null = null;
  let closestDist = Infinity;
  for (const e of state.enemies.values()) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(x - e.x, y - e.y);
    if (d < range && d < closestDist) {
      closest = e;
      closestDist = d;
    }
  }
  return closest;
}
