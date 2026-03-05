// Core Layer: ウェーブシステム — Tickオーケストレーション

import type {
  EnemyId,
  WaveView, StageData,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { createEnemy } from './logic';
import type { WaveRuntime } from './logic';
import { behaviorMap } from './behaviors';

export type { WaveRuntime } from './logic';
export { createWaveRuntime, checkGameEnd } from './logic';

// ── ウェーブ開始 ──

export function startWave(view: WaveView, config: GameConfig, stage: StageData, runtime: WaveRuntime): void {
  if (view.waveIndex >= stage.waveDefs.length) return;

  view.waveIndex++;
  view.wavePhase = 'active';
  const waveDef = stage.waveDefs[view.waveIndex - 1];

  const normals: typeof runtime.spawnQueue = [];
  const bosses: typeof runtime.spawnQueue = [];
  for (const g of waveDef.enemies) {
    for (let i = 0; i < g.count; i++) {
      const entry = { type: g.type, str: g.str, boss: !!g.boss };
      if (entry.boss) bosses.push(entry);
      else normals.push(entry);
    }
  }
  for (let i = normals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normals[i], normals[j]] = [normals[j], normals[i]];
  }
  runtime.spawnQueue.push(...normals, ...bosses);
  runtime.nextWaveDelay = config.WAVE_START_DELAY;
  runtime.waveCountdown = config.WAVE_COUNTDOWN;
  if (runtime.spawnTimer <= 0) runtime.spawnTimer = 0.3;
}

// ── ウェーブカウントダウン＋スポーン ──

export function updateWaveSpawning(
  view: WaveView, config: GameConfig, stage: StageData, runtime: WaveRuntime, dt: number,
): boolean {
  let autoStarted = false;
  if (runtime.nextWaveDelay > 0) {
    runtime.nextWaveDelay -= dt;
    if (runtime.nextWaveDelay < 0) runtime.nextWaveDelay = 0;
  } else if (view.waveIndex < stage.waveDefs.length) {
    runtime.waveCountdown -= dt;
    if (runtime.waveCountdown <= 0) {
      runtime.waveCountdown = 0;
      startWave(view, config, stage, runtime);
      autoStarted = true;
    }
  }

  if (runtime.spawnQueue.length > 0) {
    runtime.spawnTimer -= dt;
    if (runtime.spawnTimer <= 0) {
      runtime.spawnTimer = config.ENEMY_SPAWN_INTERVAL;
      const desc = runtime.spawnQueue.shift()!;
      const enemy = createEnemy(config, stage, desc.type, desc.str, desc.boss);
      view.enemies.set(enemy.id, enemy);
    }
  }
  return autoStarted;
}

// ── 敵移動・攻撃 ──

const ENEMY_TURN_SPEED = 8;

function lerpAngle(current: number, target: number, speed: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = speed * dt;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}

/** 全敵を移動させ、構造物射撃・拠点ダメージを処理 */
export function updateEnemies(view: WaveView, config: GameConfig, stage: StageData, dt: number): void {
  const path = stage.enemyPath;
  const toRemove: EnemyId[] = [];

  for (const [id, e] of view.enemies) {
    if (e.hp <= 0) toRemove.push(id);
  }
  for (const id of toRemove) view.enemies.delete(id);

  for (const e of view.enemies.values()) {
    const typeDef = config.enemyTypes[e.type];

    // 拠点到達済み → 攻撃
    if (e.atBase) {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) {
        e.attackTimer = config.ENEMY_ATTACK_INTERVAL;
        view.baseHp -= 1;
        view.metrics.defenseHp -= 1;
      }
      continue;
    }

    // Strategy-based behavior dispatch
    const behavior = behaviorMap[typeDef.behavior];
    if (behavior) {
      behavior.update(e, view, config, stage, dt);
    }

    // 経路移動
    const target = path[e.pathIndex + 1];
    if (!target) {
      e.atBase = true;
      e.attackTimer = config.ENEMY_ATTACK_INTERVAL;
      view.baseHp -= 1;
      view.metrics.defenseHp -= 1;
      continue;
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.hypot(dx, dy);

    if (d > 0.1) {
      e.angle = lerpAngle(e.angle, Math.atan2(dy, dx), ENEMY_TURN_SPEED, dt);
    }

    if (d < 5) {
      e.pathIndex++;
    } else {
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    }
  }
}
