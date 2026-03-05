// Core Layer: 戦闘システム — Tickオーケストレーション

import type {
  BulletId,
  Bullet,
  CombatView,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import { generateBulletId, connectedEdges, getAttackTowerMetrics, getEdgeMetrics } from '@core/state';
import { findClosestEnemy } from './spatial';
import { lerpAngle, TOWER_TURN_SPEED } from './logic';
import type { BulletHit } from './logic';

export type { BulletHit } from './logic';

/** 攻撃タワーがammo保持+射程内の最近接敵に弾を発射 */
export function updateTowerAttacks(view: CombatView, config: GameConfig, dt: number): void {
  for (const node of view.nodes.values()) {
    if (node.status !== 'active') continue;
    if (node.type !== 'sniper' && node.type !== 'rapid' && node.type !== 'cannon') continue;

    const stats = getTowerLevelStats(config, node.type, node.level);
    if (!stats.range || !stats.cooldown || !stats.damage) continue;

    const closest = findClosestEnemy(view, node.x, node.y, stats.range);

    if (closest) {
      const targetAngle = Math.atan2(closest.y - node.y, closest.x - node.x);
      if (node.facingAngle == null) {
        node.facingAngle = targetAngle;
      } else {
        node.facingAngle = lerpAngle(node.facingAngle, targetAngle, TOWER_TURN_SPEED, dt);
      }
    }

    const atm = getAttackTowerMetrics(view, node.id);
    const ammoNeeded = stats.ammoPerShot ?? 1;
    if (closest) {
      atm.demandTime += dt;
      if (node.cooldown <= 0 && node.ammo < ammoNeeded) {
        atm.starvationTime += dt;
      }
    }

    if (node.cooldown > 0) { node.cooldown -= dt; continue; }
    if (!closest) continue;

    if (node.ammo < ammoNeeded) continue;

    node.ammo -= ammoNeeded;
    node.cooldown = stats.cooldown;
    atm.consumedAmmo += ammoNeeded;

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
    view.bullets.set(bullet.id, bullet);
  }
}

/** 拠点の基本攻撃（ammo不要） */
let baseCooldown = 0;

export function updateBaseAttack(view: CombatView, config: GameConfig, dt: number): void {
  baseCooldown -= dt;
  if (baseCooldown > 0) return;

  const closest = findClosestEnemy(view, config.basePos.x, config.basePos.y, config.BASE_ATTACK.range);
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
  view.bullets.set(bullet.id, bullet);
}

export function resetBaseCooldown(): void { baseCooldown = 0; }

/** 弾を追尾移動させ、命中時のヒット情報を返す */
export function updateBullets(view: CombatView, dt: number): BulletHit[] {
  const hits: BulletHit[] = [];
  const toDelete: BulletId[] = [];

  for (const b of view.bullets.values()) {
    const target = view.enemies.get(b.targetId);

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

  for (const id of toDelete) view.bullets.delete(id);
  return hits;
}

/** ヒットのダメージを適用し、HP0の敵にリソース報酬 */
export function applyBulletHits(view: CombatView, hits: BulletHit[]): void {
  for (const hit of hits) {
    const enemy = view.enemies.get(hit.targetId);
    if (!enemy) continue;
    enemy.hp -= hit.damage;
    if (enemy.hp <= 0) {
      view.resources += enemy.reward;
    }
  }
}

/** 敵弾の移動と構造物への命中判定 */
export function updateEnemyBullets(view: CombatView, _config: GameConfig, dt: number): void {
  const toDelete: BulletId[] = [];

  for (const b of view.enemyBullets.values()) {
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);

    if (d < 8) {
      if (b.targetKind === 'edge' && b.edgeId) {
        const edge = view.edges.get(b.edgeId);
        if (edge && edge.status !== 'destroyed') {
          edge.hp -= b.damage;
          if (edge.hp <= 0) {
            edge.status = 'destroyed';
            const em = getEdgeMetrics(view, edge.id);
            for (const [pid, pkt] of view.packets) {
              if (pkt.edgeId === edge.id) {
                em.lost += pkt.charge;
                view.packets.delete(pid);
              }
            }
          }
        }
      } else if (b.targetKind === 'node' && b.nodeId) {
        const node = view.nodes.get(b.nodeId);
        if (node && node.hp > 0) {
          node.hp -= b.damage;
          if (node.hp <= 0) {
            const edges = connectedEdges(view, node.id);
            for (const edge of edges) {
              edge.status = 'destroyed';
              const em = getEdgeMetrics(view, edge.id);
              for (const [pid, pkt] of view.packets) {
                if (pkt.edgeId === edge.id) {
                  em.lost += pkt.charge;
                  view.packets.delete(pid);
                }
              }
            }
            view.metrics.attackTower.delete(node.id);
            view.metrics.queueNode.delete(node.id);
            view.metrics.generator.delete(node.id);
            view.nodes.delete(node.id);
          }
        }
      }
      toDelete.push(b.id);
    } else {
      b.x += (dx / d) * b.speed * dt;
      b.y += (dy / d) * b.speed * dt;
    }
  }

  for (const id of toDelete) view.enemyBullets.delete(id);
}
