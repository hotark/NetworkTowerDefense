// enemy.js — Enemy エンティティ

import { ENEMY_TYPES, ENEMY_LEVELS, BOSS_LEVELS } from './config.js';

let _nextId = 1;

export class Enemy {
  /**
   * @param {string} type - normal/fast/tank/saboteur/raider
   * @param {number} lv - 1,2,3
   * @param {boolean} boss
   */
  constructor(type, lv = 1, boss = false) {
    this.id = _nextId++;
    this.type = type;
    this.lv = lv;
    this.boss = boss;

    // レベル別ステータス取得
    const lvIdx = Math.max(0, Math.min(lv - 1, 2));
    let stats;
    if (boss && BOSS_LEVELS[type]) {
      stats = BOSS_LEVELS[type][lvIdx];
    } else {
      stats = ENEMY_LEVELS[type][lvIdx];
    }

    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.reward = stats.reward;
    this.damage = stats.damage;
    this.dead = false;
    this.reachedBase = false;

    // Path progress
    this.pathSegment = 0;
    this.x = 0;
    this.y = 0;
    this.angle = 0;

    // 攻撃型 (saboteur / raider)
    this.isAttacker = !!(stats.attackRange);
    if (this.isAttacker) {
      this.attackRange = stats.attackRange;
      this.attackRate = stats.attackRate;
      this.attackDamage = stats.attackDamage;
      this.attackCooldown = 0;
    }
  }
}
