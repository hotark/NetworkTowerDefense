// Core Layer: Game balance parameters migrated from mockup/part003/js/config.js

import type {
  NodeType,
  EnemyType,
  EnemyTypeDef,
  WaveDef,
  Vec2,
} from './types';

// ── タワーレベル別ステータス ──

export interface TowerLevelStats {
  readonly hp: number;
  readonly holdTime: number;
  readonly cooldown?: number;
  readonly damage?: number;
  readonly range?: number;
  readonly ammoPerShot?: number;
  readonly interval?: number;
  readonly maxFanout?: number;
  readonly chargeBoost?: number;
}

export interface EdgeLevelStats {
  readonly capacity: number;
  readonly speedMultiplier: number;
  readonly hp: number;
}

// ── GameConfig ──

export interface GameConfig {
  readonly PACKET_SPEED: number;
  readonly BULLET_SPEED: number;
  readonly ENEMY_BULLET_SPEED: number;
  readonly ENEMY_SPAWN_INTERVAL: number;
  readonly ENEMY_ATTACK_INTERVAL: number;
  readonly MAX_EDGE_LENGTH: number;
  readonly FIXED_DT: number;
  readonly BASE_HP: number;
  readonly INITIAL_RESOURCES: number;
  readonly NODE_RADIUS: number;
  readonly PACKET_RADIUS: number;
  readonly PACKET_RESOURCE_VALUE: number;
  readonly MAX_LEVEL: number;
  readonly EDGE_HP: number;
  readonly BASE_HOLD_TIME: number;
  readonly WAVE_COUNTDOWN: number;
  readonly SKIP_BONUS_PER_SEC: number;
  readonly WAVE_START_DELAY: number;
  readonly BASE_HEAL_AMOUNT: number;
  readonly BASE_HEAL_COST: number;
  readonly REPAIR_COST_PER_HP_TOWER: number;
  readonly REPAIR_COST_PER_HP_EDGE: number;
  readonly REPAIR_RATE_TOWER: number;
  readonly REPAIR_RATE_EDGE: number;
  readonly BASE_ATTACK: { readonly range: number; readonly cooldown: number; readonly damage: number };
  readonly DIST_REP_MAX_QUEUE: number;

  readonly towerLevels: Readonly<Record<NodeType, ReadonlyArray<TowerLevelStats>>>;
  readonly edgeLevels: ReadonlyArray<EdgeLevelStats>;
  readonly towerCosts: Readonly<Record<NodeType, number>>;
  readonly edgeCost: number;
  readonly upgradeCosts: Readonly<Record<NodeType, ReadonlyArray<number>>>;
  readonly edgeUpgradeCosts: ReadonlyArray<number>;
  readonly buildDuration: Readonly<Record<NodeType | 'edge', number>>;
  readonly upgradeDuration: ReadonlyArray<number>;

  readonly enemyTypes: Readonly<Record<EnemyType, EnemyTypeDef>>;
  readonly waveDefs: ReadonlyArray<WaveDef>;
  readonly enemyPath: ReadonlyArray<Vec2>;
  readonly basePos: Vec2;
  readonly nodeSlots: ReadonlyArray<Vec2>;
}

// ── デフォルト設定 ──

export const GAME_CONFIG: GameConfig = {
  PACKET_SPEED: 120,
  BULLET_SPEED: 300,
  ENEMY_BULLET_SPEED: 200,
  ENEMY_SPAWN_INTERVAL: 0.8,
  ENEMY_ATTACK_INTERVAL: 1.0,
  MAX_EDGE_LENGTH: 300,
  FIXED_DT: 1 / 60,
  BASE_HP: 20,
  INITIAL_RESOURCES: 600,
  NODE_RADIUS: 22,
  PACKET_RADIUS: 5,
  PACKET_RESOURCE_VALUE: 2,
  MAX_LEVEL: 5,
  EDGE_HP: 40,
  BASE_HOLD_TIME: 1.5,
  WAVE_COUNTDOWN: 60,
  SKIP_BONUS_PER_SEC: 5,
  WAVE_START_DELAY: 5,
  BASE_HEAL_AMOUNT: 5,
  BASE_HEAL_COST: 100,
  REPAIR_COST_PER_HP_TOWER: 0.3,
  REPAIR_COST_PER_HP_EDGE: 0.125,
  REPAIR_RATE_TOWER: 40,
  REPAIR_RATE_EDGE: 20,
  BASE_ATTACK: { range: 120, cooldown: 2.0, damage: 10 },
  DIST_REP_MAX_QUEUE: 50,

  // ── タワーレベル別ステータステーブル ──
  towerLevels: {
    generator: [
      { hp: 100, interval: 2.0,  holdTime: 1.0 },
      { hp: 140, interval: 1.5,  holdTime: 0.7 },
      { hp: 200, interval: 0.8,  holdTime: 0.4 },
      { hp: 300, interval: 0.4,  holdTime: 0.2 },
      { hp: 450, interval: 0.2,  holdTime: 0.1 },
    ],
    sniper: [
      { hp:  80, range:  80, cooldown: 1.5,  damage:  50, holdTime: 0.05, ammoPerShot:  1 },
      { hp: 110, range: 100, cooldown: 1.35, damage:  80, holdTime: 0.05, ammoPerShot:  3 },
      { hp: 160, range: 130, cooldown: 1.15, damage: 140, holdTime: 0.05, ammoPerShot:  8 },
      { hp: 240, range: 170, cooldown: 0.95, damage: 250, holdTime: 0.05, ammoPerShot: 15 },
      { hp: 360, range: 200, cooldown: 0.75, damage: 500, holdTime: 0.05, ammoPerShot: 30 },
    ],
    rapid: [
      { hp:  60, range: 100, cooldown: 0.4,  damage:  15, holdTime: 0.05, ammoPerShot: 1 },
      { hp:  85, range: 110, cooldown: 0.34, damage:  24, holdTime: 0.05, ammoPerShot: 1 },
      { hp: 120, range: 125, cooldown: 0.27, damage:  40, holdTime: 0.05, ammoPerShot: 2 },
      { hp: 180, range: 145, cooldown: 0.2,  damage:  65, holdTime: 0.05, ammoPerShot: 3 },
      { hp: 350, range: 180, cooldown: 0.14, damage: 120, holdTime: 0.05, ammoPerShot: 5 },
    ],
    cannon: [
      { hp:  90, range: 160, cooldown: 0.8,  damage:  20, holdTime: 0.05, ammoPerShot:  1 },
      { hp: 125, range: 175, cooldown: 0.7,  damage:  35, holdTime: 0.05, ammoPerShot:  2 },
      { hp: 175, range: 195, cooldown: 0.55, damage:  60, holdTime: 0.05, ammoPerShot:  5 },
      { hp: 260, range: 220, cooldown: 0.42, damage: 100, holdTime: 0.05, ammoPerShot: 10 },
      { hp: 400, range: 250, cooldown: 0.3,  damage: 170, holdTime: 0.05, ammoPerShot: 20 },
    ],
    distributor: [
      { hp:  50, maxFanout: 2, holdTime: 1.5 },
      { hp:  70, maxFanout: 3, holdTime: 1.0 },
      { hp: 100, maxFanout: 4, holdTime: 0.7 },
      { hp: 160, maxFanout: 5, holdTime: 0.45 },
      { hp: 250, maxFanout: 6, holdTime: 0.25 },
    ],
    repeater: [
      { hp:  60, chargeBoost: 1, holdTime: 1.5 },
      { hp:  85, chargeBoost: 2, holdTime: 1.0 },
      { hp: 120, chargeBoost: 3, holdTime: 0.7 },
      { hp: 180, chargeBoost: 4, holdTime: 0.45 },
      { hp: 280, chargeBoost: 5, holdTime: 0.25 },
    ],
  },

  // ── エッジレベル別ステータステーブル ──
  edgeLevels: [
    { capacity:  3, speedMultiplier:  0.8, hp:  40 },
    { capacity:  6, speedMultiplier:  1.2, hp:  55 },
    { capacity: 10, speedMultiplier:  2.0, hp:  75 },
    { capacity: 15, speedMultiplier:  5.0, hp: 100 },
    { capacity: 25, speedMultiplier: 10.0, hp: 140 },
  ],

  // ── コスト ──
  towerCosts: {
    generator: 50,
    sniper: 80,
    rapid: 60,
    cannon: 70,
    distributor: 30,
    repeater: 40,
  },
  edgeCost: 10,

  upgradeCosts: {
    generator:   [15,   70,  300,  900],
    sniper:      [25,   90,  400, 1200],
    rapid:       [20,   80,  350, 1100],
    cannon:      [20,   85,  380, 1150],
    distributor: [10,   60,  250,  800],
    repeater:    [15,   70,  300,  900],
  },
  edgeUpgradeCosts: [15, 60, 250, 800],

  // ── 建築/アップグレード所要時間 ──
  buildDuration: {
    generator: 2, sniper: 2, rapid: 2, cannon: 2,
    distributor: 1.5, repeater: 1.5, edge: 1,
  },
  upgradeDuration: [3, 5, 8, 12],

  // ── 敵タイプ定義 ──
  enemyTypes: {
    normal: {
      label: 'ノーマル', color: '#9933cc', stroke: '#cc66ff', radius: 12, behavior: 'path',
      levels: [
        { hp: 80,    speed: 55, reward: 20 },
        { hp: 500,   speed: 58, reward: 55 },
        { hp: 4000,  speed: 80, reward: 110 },
      ],
    },
    fast: {
      label: 'ファスト', color: '#33cc33', stroke: '#66ff66', radius: 9, behavior: 'path',
      levels: [
        { hp: 45,    speed: 100, reward: 15 },
        { hp: 300,   speed: 115, reward: 65 },
        { hp: 5000,  speed: 135, reward: 130 },
      ],
    },
    tank: {
      label: 'タンク', color: '#cc8833', stroke: '#ffaa44', radius: 16, behavior: 'path',
      levels: [
        { hp: 350,   speed: 28, reward: 30 },
        { hp: 5000,  speed: 30, reward: 110 },
        { hp: 15000, speed: 45, reward: 280 },
      ],
      bossLevels: [
        { hp: 1800,  speed: 18, reward: 150 },
        { hp: 10000, speed: 20, reward: 420 },
        { hp: 50000, speed: 22, reward: 1000 },
      ],
    },
    edgeAttacker: {
      label: 'エッジ攻撃', color: '#3399cc', stroke: '#44bbff', radius: 11, behavior: 'edgeAttack',
      levels: [
        { hp: 120,   speed: 30, reward: 22,  attackRange: 60,  attackDamage: 5, attackInterval: 2.0 },
        { hp: 500,   speed: 40, reward: 75,  attackRange: 100, attackDamage: 5, attackInterval: 1.5 },
        { hp: 3000,  speed: 50, reward: 180, attackRange: 200, attackDamage: 8, attackInterval: 1.0 },
      ],
      bossLevels: [
        { hp: 800,   speed: 30, reward: 120, attackRange: 50,  attackDamage: 5,  attackInterval: 1.5 },
        { hp: 5000,  speed: 30, reward: 220, attackRange: 200, attackDamage: 5,  attackInterval: 1.0 },
        { hp: 15000, speed: 30, reward: 380, attackRange: 300, attackDamage: 8,  attackInterval: 0.8 },
      ],
    },
    towerAttacker: {
      label: 'タワー攻撃', color: '#cc3399', stroke: '#ff44bb', radius: 13, behavior: 'towerAttack',
      levels: [
        { hp: 200,   speed: 30, reward: 25,  attackRange: 50,  attackDamage: 5,  attackInterval: 2.0 },
        { hp: 750,   speed: 35, reward: 85,  attackRange: 150, attackDamage: 15, attackInterval: 1.7 },
        { hp: 5000,  speed: 40, reward: 200, attackRange: 300, attackDamage: 30, attackInterval: 1.2 },
      ],
      bossLevels: [
        { hp: 900,   speed: 20, reward: 130, attackRange: 65,  attackDamage: 10, attackInterval: 1.2 },
        { hp: 5000,  speed: 20, reward: 250, attackRange: 300, attackDamage: 30, attackInterval: 1.0 },
        { hp: 20000, speed: 20, reward: 400, attackRange: 500, attackDamage: 50, attackInterval: 0.5 },
      ],
    },
    disabler: {
      label: 'ディスエーブラー', color: '#cccc33', stroke: '#ffff66', radius: 10, behavior: 'path',
      levels: [
        { hp: 100, speed: 45, reward: 25 },
        { hp: 400, speed: 50, reward: 80 },
        { hp: 2500, speed: 60, reward: 170 },
      ],
    },
  },

  // ── 30ウェーブ定義 ──
  waveDefs: [
    // Wave 1-3: ノーマルのみ（チュートリアル）
    { enemies: [{ type: 'normal', count: 3, str: 1 }] },
    { enemies: [{ type: 'normal', count: 5, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 1 }] },
    // Wave 4-5: ファスト初登場
    { enemies: [{ type: 'fast', count: 6, str: 1 }] },
    { enemies: [{ type: 'normal', count: 6, str: 1 }, { type: 'fast', count: 4, str: 1 }] },
    // Wave 6-7: タンク初登場
    { enemies: [{ type: 'tank', count: 3, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 1 }, { type: 'tank', count: 3, str: 1 }] },
    // Wave 8-9: 2種組み合わせ
    { enemies: [{ type: 'fast', count: 8, str: 1 }, { type: 'tank', count: 2, str: 1 }] },
    { enemies: [{ type: 'normal', count: 10, str: 1 }, { type: 'fast', count: 5, str: 1 }] },
    // Wave 10: 序盤ボス
    { enemies: [{ type: 'normal', count: 6, str: 1 }, { type: 'tank', count: 1, str: 1, boss: true }] },
    // Wave 11-12: エッジ攻撃初登場
    { enemies: [{ type: 'edgeAttacker', count: 5, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 2 }, { type: 'edgeAttacker', count: 4, str: 1 }] },
    // Wave 13-14: タワー攻撃初登場
    { enemies: [{ type: 'towerAttacker', count: 5, str: 1 }] },
    { enemies: [{ type: 'fast', count: 8, str: 2 }, { type: 'towerAttacker', count: 4, str: 1 }] },
    // Wave 15-16: str2本格化
    { enemies: [{ type: 'normal', count: 10, str: 2 }, { type: 'tank', count: 1, str: 2 }] },
    { enemies: [{ type: 'edgeAttacker', count: 5, str: 2 }, { type: 'towerAttacker', count: 4, str: 1 }] },
    // Wave 17-19: 2-3種の組み合わせ
    { enemies: [{ type: 'fast', count: 8, str: 2 }, { type: 'edgeAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'tank', count: 4, str: 2 }, { type: 'towerAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'normal', count: 8, str: 2 }, { type: 'fast', count: 5, str: 2 }, { type: 'tank', count: 2, str: 2 }] },
    // Wave 20: 中盤ボス
    { enemies: [{ type: 'tank', count: 1, str: 2, boss: true }, { type: 'edgeAttacker', count: 1, str: 2, boss: true }, { type: 'towerAttacker', count: 1, str: 2, boss: true }] },
    // Wave 21-23: str3開始
    { enemies: [{ type: 'normal', count: 6, str: 3 }] },
    { enemies: [{ type: 'normal', count: 6, str: 3 }, { type: 'edgeAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'normal', count: 6, str: 3 }, { type: 'towerAttacker', count: 4, str: 2 }] },
    // Wave 24-26: 高難度
    { enemies: [{ type: 'fast', count: 8, str: 3 }] },
    { enemies: [{ type: 'fast', count: 8, str: 3 }, { type: 'towerAttacker', count: 4, str: 3 }] },
    { enemies: [{ type: 'normal', count: 8, str: 3 }, { type: 'edgeAttacker', count: 4, str: 3 }] },
    // Wave 27-29: 最終エリア
    { enemies: [{ type: 'normal', count: 8, str: 3 }, { type: 'tank', count: 2, str: 3 }] },
    { enemies: [{ type: 'fast', count: 8, str: 3 }, { type: 'edgeAttacker', count: 4, str: 3 }, { type: 'towerAttacker', count: 4, str: 3 }] },
    { enemies: [{ type: 'tank', count: 4, str: 3 }, { type: 'edgeAttacker', count: 5, str: 3 }, { type: 'towerAttacker', count: 5, str: 3 }] },
    // Wave 30: 最終ボス
    { enemies: [{ type: 'tank', count: 1, str: 3, boss: true }, { type: 'edgeAttacker', count: 2, str: 3, boss: true }, { type: 'towerAttacker', count: 2, str: 3, boss: true }] },
  ],

  // ── 敵経路 ──
  enemyPath: [
    { x: 680, y: -30 },
    { x: 680, y: 80 },
    { x: 120, y: 80 },
    { x: 120, y: 300 },
    { x: 680, y: 300 },
    { x: 680, y: 500 },
    { x: 400, y: 555 },
  ],

  basePos: { x: 400, y: 555 },

  // ── ノードスロット ──
  nodeSlots: [
    // Row 1 (y≈40)
    { x: 55, y: 38 }, { x: 198, y: 44 }, { x: 338, y: 36 }, { x: 478, y: 42 }, { x: 618, y: 38 }, { x: 745, y: 44 },
    // Row 2 (y≈150)
    { x: 165, y: 148 }, { x: 280, y: 155 }, { x: 408, y: 148 }, { x: 545, y: 152 }, { x: 678, y: 148 },
    // Row 3 (y≈220)
    { x: 62, y: 225 }, { x: 205, y: 218 }, { x: 342, y: 222 }, { x: 482, y: 216 }, { x: 612, y: 224 }, { x: 742, y: 218 },
    // Row 4 (y≈360)
    { x: 128, y: 362 }, { x: 268, y: 356 }, { x: 408, y: 365 }, { x: 545, y: 358 }, { x: 622, y: 365 },
    // Row 5 (y≈430)
    { x: 58, y: 435 }, { x: 202, y: 428 }, { x: 338, y: 432 }, { x: 478, y: 428 }, { x: 615, y: 435 }, { x: 745, y: 430 },
    // Row 6 (y≈490)
    { x: 132, y: 492 }, { x: 272, y: 488 }, { x: 408, y: 495 }, { x: 538, y: 490 },
  ],
};

// ── ヘルパー関数 ──

export function getTowerLevelStats(config: GameConfig, type: NodeType, level: number): TowerLevelStats {
  const table = config.towerLevels[type];
  const idx = Math.min(level, config.MAX_LEVEL) - 1;
  return table[Math.max(0, idx)];
}

export function getEdgeLevelStats(config: GameConfig, level: number): EdgeLevelStats {
  const idx = Math.min(Math.max(level, 1), config.MAX_LEVEL) - 1;
  return config.edgeLevels[idx];
}

export function getTowerCost(config: GameConfig, type: NodeType): number {
  return config.towerCosts[type];
}

export function getUpgradeCost(config: GameConfig, type: NodeType, currentLevel: number): number {
  if (currentLevel >= config.MAX_LEVEL) return Infinity;
  const costs = config.upgradeCosts[type];
  return costs[currentLevel - 1] ?? Infinity;
}

export function getEdgeUpgradeCost(config: GameConfig, currentLevel: number): number {
  if (currentLevel >= config.MAX_LEVEL) return Infinity;
  return config.edgeUpgradeCosts[currentLevel - 1] ?? Infinity;
}

export function getBuildDuration(config: GameConfig, type: NodeType | 'edge'): number {
  return config.buildDuration[type] ?? 2;
}

export function getUpgradeDuration(config: GameConfig, currentLevel: number): number {
  if (currentLevel >= config.MAX_LEVEL) return Infinity;
  return config.upgradeDuration[currentLevel - 1] ?? 5;
}

export function getTowerHp(config: GameConfig, type: NodeType, level: number): number {
  return getTowerLevelStats(config, type, level).hp;
}
