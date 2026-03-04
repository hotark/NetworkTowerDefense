// Game Layer: Wave management, enemy spawning, enemy movement, enemy attacks

import type {
  NodeId, EdgeId, EnemyId,
  Enemy, EnemyBullet,
} from '@core/types';
import type { GameConfig } from '@core/config';
import type { GameState } from '@core/state';
import { generateEnemyId, generateBulletId } from '@core/state';

// ── ウェーブ内部状態 ──

export interface WaveRuntime {
  spawnQueue: Array<{ type: Enemy['type']; str: number; boss: boolean }>;
  spawnTimer: number;
  waveCountdown: number;
  nextWaveDelay: number;
}

export function createWaveRuntime(config: GameConfig): WaveRuntime {
  return {
    spawnQueue: [],
    spawnTimer: 0,
    waveCountdown: config.WAVE_COUNTDOWN,
    nextWaveDelay: 0,
  };
}

// ── ウェーブ開始 ──

export function startWave(state: GameState, config: GameConfig, runtime: WaveRuntime): void {
  if (state.gameResult !== 'playing') return;
  if (state.waveIndex >= config.waveDefs.length) return;

  state.waveIndex++;
  state.wavePhase = 'active';
  const waveDef = config.waveDefs[state.waveIndex - 1];

  const normals: typeof runtime.spawnQueue = [];
  const bosses: typeof runtime.spawnQueue = [];
  for (const g of waveDef.enemies) {
    for (let i = 0; i < g.count; i++) {
      const entry = { type: g.type, str: g.str, boss: !!g.boss };
      if (entry.boss) bosses.push(entry);
      else normals.push(entry);
    }
  }
  // ノーマルをシャッフル
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
  state: GameState, config: GameConfig, runtime: WaveRuntime, dt: number,
): void {
  // ディレイ消化
  if (runtime.nextWaveDelay > 0) {
    runtime.nextWaveDelay -= dt;
    if (runtime.nextWaveDelay < 0) runtime.nextWaveDelay = 0;
  } else if (state.waveIndex < config.waveDefs.length) {
    // カウントダウン自動開始
    runtime.waveCountdown -= dt;
    if (runtime.waveCountdown <= 0) {
      runtime.waveCountdown = 0;
      startWave(state, config, runtime);
    }
  }

  // スポーン
  if (runtime.spawnQueue.length > 0) {
    runtime.spawnTimer -= dt;
    if (runtime.spawnTimer <= 0) {
      runtime.spawnTimer = config.ENEMY_SPAWN_INTERVAL;
      const desc = runtime.spawnQueue.shift()!;
      const enemy = createEnemy(config, desc.type, desc.str, desc.boss);
      state.enemies.set(enemy.id, enemy);
    }
  }
}

// ── 敵生成 ──

function createEnemy(
  config: GameConfig, typeKey: Enemy['type'], str: number, isBoss: boolean,
): Enemy {
  const typeDef = config.enemyTypes[typeKey];
  const levels = (isBoss && typeDef.bossLevels) ? typeDef.bossLevels : typeDef.levels;
  const lvl = levels[Math.min(str, levels.length) - 1];
  const path = config.enemyPath;

  return {
    id: generateEnemyId(),
    type: typeKey,
    x: path[0].x,
    y: path[0].y,
    hp: lvl.hp,
    maxHp: lvl.hp,
    speed: lvl.speed,
    pathIndex: 0,
    pathProgress: 0,
    reward: lvl.reward,
    strength: str,
    isBoss,
    attackTimer: lvl.attackInterval ? Math.random() * lvl.attackInterval : 0,
    attackRange: lvl.attackRange ?? 0,
    attackDamage: lvl.attackDamage ?? 0,
    attackInterval: lvl.attackInterval ?? 0,
    angle: path.length > 1
      ? Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x)
      : Math.PI / 2,
    atBase: false,
  };
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
export function updateEnemies(state: GameState, config: GameConfig, dt: number): void {
  const path = config.enemyPath;
  const toRemove: EnemyId[] = [];

  // HP0の敵を除去
  for (const [id, e] of state.enemies) {
    if (e.hp <= 0) toRemove.push(id);
  }
  for (const id of toRemove) state.enemies.delete(id);

  for (const e of state.enemies.values()) {
    const typeDef = config.enemyTypes[e.type];

    // 拠点到達済み → 攻撃
    if (e.atBase) {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) {
        e.attackTimer = config.ENEMY_ATTACK_INTERVAL;
        state.baseHp -= 1;
      }
      continue;
    }

    // 構造物攻撃（edgeAttack / towerAttack）
    if (typeDef.behavior === 'edgeAttack' || typeDef.behavior === 'towerAttack') {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) {
        const shot = createEnemyShot(e, state, config, typeDef.behavior);
        if (shot) {
          state.enemyBullets.set(shot.id, shot);
          e.attackTimer = e.attackInterval;
        }
      }
    }

    // 経路移動
    const target = path[e.pathIndex + 1];
    if (!target) {
      e.atBase = true;
      e.attackTimer = config.ENEMY_ATTACK_INTERVAL;
      state.baseHp -= 1;
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

/** 敵の構造物攻撃弾を生成 */
function createEnemyShot(
  e: Enemy, state: GameState, config: GameConfig, behavior: string,
): EnemyBullet | null {
  if (behavior === 'edgeAttack') {
    const target = findRandomEdgeInRange(e, state, e.attackRange);
    if (!target) return null;
    return {
      id: generateBulletId(),
      x: e.x, y: e.y,
      tx: target.tx, ty: target.ty,
      speed: config.ENEMY_BULLET_SPEED,
      damage: e.attackDamage,
      targetKind: 'edge',
      edgeId: target.edgeId,
      nodeId: null,
    };
  } else {
    const target = findRandomTowerInRange(e, state, e.attackRange);
    if (!target) return null;
    return {
      id: generateBulletId(),
      x: e.x, y: e.y,
      tx: target.tx, ty: target.ty,
      speed: config.ENEMY_BULLET_SPEED,
      damage: e.attackDamage,
      targetKind: 'node',
      edgeId: null,
      nodeId: target.nodeId,
    };
  }
}

function findRandomEdgeInRange(
  e: Enemy, state: GameState, range: number,
): { edgeId: EdgeId; tx: number; ty: number } | null {
  const candidates: Array<{ edgeId: EdgeId; tx: number; ty: number }> = [];
  for (const edge of state.edges.values()) {
    if (edge.status === 'destroyed' || edge.hp <= 0) continue;
    const from = state.nodes.get(edge.from);
    const to = state.nodes.get(edge.to);
    if (!from || !to) continue;
    const cp = closestPointOnSegment(e.x, e.y, from.x, from.y, to.x, to.y);
    if (cp.dist < range) {
      candidates.push({ edgeId: edge.id, tx: cp.x, ty: cp.y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function findRandomTowerInRange(
  e: Enemy, state: GameState, range: number,
): { nodeId: NodeId; tx: number; ty: number } | null {
  const candidates: Array<{ nodeId: NodeId; tx: number; ty: number }> = [];
  for (const node of state.nodes.values()) {
    if (node.hp <= 0) continue;
    const d = Math.hypot(e.x - node.x, e.y - node.y);
    if (d < range) {
      candidates.push({ nodeId: node.id, tx: node.x, ty: node.y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function closestPointOnSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { x: number; y: number; dist: number } {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay, dist: Math.hypot(px - ax, py - ay) };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { x: cx, y: cy, dist: Math.hypot(px - cx, py - cy) };
}

// ── ゲーム終了判定 ──

export function checkGameEnd(state: GameState, config: GameConfig, runtime: WaveRuntime): 'playing' | 'victory' | 'defeat' {
  if (state.baseHp <= 0) return 'defeat';
  if (
    state.waveIndex >= config.waveDefs.length &&
    runtime.spawnQueue.length === 0 &&
    state.enemies.size === 0
  ) {
    return 'victory';
  }
  return 'playing';
}
