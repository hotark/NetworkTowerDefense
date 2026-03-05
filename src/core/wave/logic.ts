// Core Layer: ウェーブシステム — スポーン規則・経路移動計算

import type {
  Enemy, EnemyBullet, NodeId, EdgeId,
  WaveView, StageData,
} from '@core/types';
import type { GameConfig } from '@core/config';
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

// ── 敵生成 ──

export function createEnemy(
  config: GameConfig, stage: StageData, typeKey: Enemy['type'], str: number, isBoss: boolean,
): Enemy {
  const typeDef = config.enemyTypes[typeKey];
  const levels = (isBoss && typeDef.bossLevels) ? typeDef.bossLevels : typeDef.levels;
  const lvl = levels[Math.min(str, levels.length) - 1];
  const path = stage.enemyPath;

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

// ── 構造物攻撃弾生成 ──

export function createEnemyShot(
  e: Enemy, view: WaveView, config: GameConfig, behavior: string,
): EnemyBullet | null {
  if (behavior === 'edgeAttack') {
    const target = findRandomEdgeInRange(e, view, e.attackRange);
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
    const target = findRandomTowerInRange(e, view, e.attackRange);
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
  e: Enemy, view: WaveView, range: number,
): { edgeId: EdgeId; tx: number; ty: number } | null {
  const candidates: Array<{ edgeId: EdgeId; tx: number; ty: number }> = [];
  for (const edge of view.edges.values()) {
    if (edge.status === 'destroyed' || edge.hp <= 0) continue;
    const from = view.nodes.get(edge.from);
    const to = view.nodes.get(edge.to);
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
  e: Enemy, view: WaveView, range: number,
): { nodeId: NodeId; tx: number; ty: number } | null {
  const candidates: Array<{ nodeId: NodeId; tx: number; ty: number }> = [];
  for (const node of view.nodes.values()) {
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

export function checkGameEnd(view: WaveView, stage: StageData, runtime: WaveRuntime): 'playing' | 'victory' | 'defeat' {
  if (view.baseHp <= 0) return 'defeat';
  if (
    view.waveIndex >= stage.waveDefs.length &&
    runtime.spawnQueue.length === 0 &&
    view.enemies.size === 0
  ) {
    return 'victory';
  }
  return 'playing';
}
