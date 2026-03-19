// tower.js — Tower エンティティ

import { TOWER_TYPES } from './config.js';

let _nextId = 1;

export class Tower {
  constructor(spotId, x, y, type) {
    this.id = _nextId++;
    this.spotId = spotId;
    this.type = type;
    this.x = x;
    this.y = y;
    this.level = 1;
    const def = TOWER_TYPES[type];
    const baseHp = Array.isArray(def.hp) ? def.hp[0] : def.hp;
    this.hp = baseHp;
    this.maxHp = baseHp;
    this.enabled = true;
    this.destroyed = false;
    this.repairing = false;

    // 建設/アップグレード状態 (ref: building→active, upgrading→active)
    this.status = 'building'; // 'building' | 'upgrading' | 'active'
    this.buildTimer = 2.0; // ref: buildDuration=2s

    // Generator state
    this.genTimer = 0;

    // Hold queue (for relay / attack towers receiving packets)
    this.holdQueue = []; // [{ charge }]

    // Attack state
    this.ammo = 0;
    this.fireCooldown = 0;
    this.target = null; // enemy id
    this.facingAngle = 0; // ラジアン（上向き=0）

    // 中継タワーの処理タイマー
    this.processTimer = 0;

    // Round-robin index for output edges
    this.nextOutIdx = 0;
  }

  get def() { return TOWER_TYPES[this.type]; }
  get levelDef() { return this.def.levels[this.level - 1]; }
  get category() { return this.def.category; }
}
