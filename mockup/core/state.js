// state.js — GameState: 全状態管理 + tick

import {
  TOWER_TYPES, EDGE_DEF, ENEMY_TYPES,
  START_MONEY, BASE_HP, PACKET_BASE_SPEED, BULLET_SPEED,
  SELL_REFUND_RATE, SPOT_RADIUS, REPAIR_RATE, EDGE_REPAIR_RATE, BASE_REPAIR_RATE,
  UPGRADE_TIMES, ENEMY_WAVES,
} from './config.js';
import { PATH, SPOTS, BASE_POS } from './map.js';
import { Tower } from './tower.js';
import { Edge } from './edge.js';
import { Packet } from './packet.js';
import { WaveManager } from './wave.js';

/** 角度の線形補間（最短経路） */
function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * Math.min(t, 1);
}

export class GameState {
  constructor() {
    this.towers = [];
    this.edges = [];
    this.packets = [];
    this.enemies = [];
    this.bullets = []; // { x, y, dx, dy, damage, targetId }
    this.effects = []; // { x, y, type, timer }
    this.money = START_MONEY;
    this.baseLevel = 1;
    this.baseHp = BASE_HP;
    this.maxBaseHp = BASE_HP;
    this.baseRepairing = false;
    this.baseRepairCost = 50;
    this.baseUpgrading = false;
    this.baseBuildTimer = 0;
    // 拠点レベル別: [maxHp, attackDamage, attackRange, attackCooldown, upgradeCost]
    this.baseLevels = [
      { maxHp: 50,  damage: 10,  range: 120, cooldown: 2.0, upgradeCost: 0 },
      { maxHp: 80,  damage: 20,  range: 140, cooldown: 1.8, upgradeCost: 200 },
      { maxHp: 120, damage: 35,  range: 160, cooldown: 1.5, upgradeCost: 500 },
      { maxHp: 180, damage: 60,  range: 180, cooldown: 1.2, upgradeCost: 1200 },
      { maxHp: 250, damage: 100, range: 200, cooldown: 1.0, upgradeCost: 3000 },
    ];
    this.baseAttackCooldown = 0;
    this.waveManager = new WaveManager();
    this.gameResult = 'playing'; // 'playing' | 'victory' | 'defeat'
    this.logs = [];
    this.maxLogs = 50;
  }

  log(msg) {
    this.logs.push(msg);
    if (this.logs.length > this.maxLogs) this.logs.shift();
  }

  // ===== Queries =====
  getTower(id) { return this.towers.find(t => t.id === id); }
  getEdge(id) { return this.edges.find(e => e.id === id); }
  getEnemy(id) { return this.enemies.find(e => e.id === id); }
  getSpot(spotId) { return SPOTS.find(s => s.id === spotId); }
  getTowerAtSpot(spotId) { return this.towers.find(t => t.spotId === spotId && !t.destroyed); }

  outEdges(towerId) {
    return this.edges.filter(e => e.fromTowerId === towerId && !e.destroyed && e.enabled && e.status === 'active');
  }
  inEdges(towerId) {
    return this.edges.filter(e => e.toTowerId === towerId && !e.destroyed && e.enabled && e.status === 'active');
  }
  allEdgesOf(towerId) {
    return this.edges.filter(e => (e.fromTowerId === towerId || e.toTowerId === towerId) && !e.destroyed);
  }

  // ===== Actions =====
  buildTower(spotId, type) {
    const spot = this.getSpot(spotId);
    if (!spot) return null;
    if (this.getTowerAtSpot(spotId)) return null;
    const def = TOWER_TYPES[type];
    if (this.money < def.buildCost) return null;
    this.money -= def.buildCost;
    const tower = new Tower(spotId, spot.x, spot.y, type);
    this.towers.push(tower);
    this.log(`${def.label} を建設 (-$${def.buildCost})`);
    return tower;
  }

  upgradeTower(towerId) {
    const tower = this.getTower(towerId);
    if (!tower || tower.destroyed || tower.level >= 5) return false;
    if (tower.status !== 'active') return false;
    const nextLevel = tower.def.levels[tower.level];
    if (!nextLevel) return false;
    if (this.money < nextLevel.upgradeCost) return false;
    this.money -= nextLevel.upgradeCost;
    tower.status = 'upgrading';
    tower.buildTimer = UPGRADE_TIMES[tower.level - 1]; // Lv1→2: 3s, Lv2→3: 5s, etc.
    tower._pendingLevel = tower.level + 1;
    this.log(`${tower.def.label} Lv${tower._pendingLevel} に強化中... (-$${nextLevel.upgradeCost})`);
    return true;
  }

  sellTower(towerId) {
    const tower = this.getTower(towerId);
    if (!tower || tower.destroyed) return false;
    // Calculate refund
    let totalCost = tower.def.buildCost;
    for (let i = 1; i < tower.level; i++) {
      totalCost += tower.def.levels[i].upgradeCost;
    }
    const refund = Math.floor(totalCost * SELL_REFUND_RATE);
    this.money += refund;
    // Remove connected edges
    const connEdges = this.allEdgesOf(towerId);
    for (const e of connEdges) {
      this.removeEdgePackets(e.id);
      e.destroyed = true;
    }
    tower.destroyed = true;
    this.log(`${tower.def.label} を売却 (+$${refund})`);
    return true;
  }

  repairTower(towerId) {
    const tower = this.getTower(towerId);
    if (!tower || tower.destroyed || tower.hp >= tower.maxHp) return false;
    if (tower.repairing) return false;
    if (this.money < tower.def.repairCost) return false;
    this.money -= tower.def.repairCost;
    tower.repairing = true;
    this.log(`${tower.def.label} 修理開始 (-$${tower.def.repairCost})`);
    return true;
  }

  toggleTower(towerId) {
    const tower = this.getTower(towerId);
    if (!tower || tower.destroyed) return;
    tower.enabled = !tower.enabled;
    this.log(`${tower.def.label} ${tower.enabled ? '稼働' : '停止'}`);
  }

  addEdge(fromTowerId, toTowerId) {
    const from = this.getTower(fromTowerId);
    const to = this.getTower(toTowerId);
    if (!from || !to || from.destroyed || to.destroyed) return null;
    if (fromTowerId === toTowerId) return null;
    // Check range
    const dist = Math.hypot(from.x - to.x, from.y - to.y);
    if (dist > from.def.connectRange) return null;
    // Check duplicate (both directions)
    const dup = this.edges.find(e =>
      !e.destroyed && (
        (e.fromTowerId === fromTowerId && e.toTowerId === toTowerId) ||
        (e.fromTowerId === toTowerId && e.toTowerId === fromTowerId)
      )
    );
    if (dup) return null;
    // Cost
    if (this.money < EDGE_DEF.buildCost) return null;
    this.money -= EDGE_DEF.buildCost;
    const edge = new Edge(fromTowerId, toTowerId);
    this.edges.push(edge);
    this.log(`エッジ接続 (-$${EDGE_DEF.buildCost})`);
    return edge;
  }

  upgradeEdge(edgeId) {
    const edge = this.getEdge(edgeId);
    if (!edge || edge.destroyed || edge.level >= 5) return false;
    if (edge.status !== 'active') return false;
    const nextLevel = EDGE_DEF.levels[edge.level];
    if (!nextLevel) return false;
    if (this.money < nextLevel.upgradeCost) return false;
    this.money -= nextLevel.upgradeCost;
    edge.status = 'upgrading';
    edge.buildTimer = UPGRADE_TIMES[edge.level - 1];
    edge._pendingLevel = edge.level + 1;
    this.log(`エッジ Lv${edge._pendingLevel} に強化中... (-$${nextLevel.upgradeCost})`);
    return true;
  }

  removeEdge(edgeId) {
    const edge = this.getEdge(edgeId);
    if (!edge || edge.destroyed) return false;
    this.removeEdgePackets(edgeId);
    edge.destroyed = true;
    // Refund
    let totalCost = EDGE_DEF.buildCost;
    for (let i = 1; i < edge.level; i++) {
      totalCost += EDGE_DEF.levels[i].upgradeCost;
    }
    const refund = Math.floor(totalCost * SELL_REFUND_RATE);
    this.money += refund;
    this.log(`エッジ撤去 (+$${refund})`);
    return true;
  }

  reverseEdge(edgeId) {
    const edge = this.getEdge(edgeId);
    if (!edge || edge.destroyed) return false;
    // Clear packets on this edge
    this.removeEdgePackets(edgeId);
    // Swap direction
    const tmp = edge.fromTowerId;
    edge.fromTowerId = edge.toTowerId;
    edge.toTowerId = tmp;
    this.log('エッジ反転');
    return true;
  }

  toggleEdge(edgeId) {
    const edge = this.getEdge(edgeId);
    if (!edge || edge.destroyed) return;
    edge.enabled = !edge.enabled;
    this.log(`エッジ ${edge.enabled ? '有効' : '無効'}`);
  }

  repairEdge(edgeId) {
    const edge = this.getEdge(edgeId);
    if (!edge || edge.destroyed || edge.hp >= edge.maxHp) return false;
    if (edge.repairing) return false;
    if (this.money < EDGE_DEF.repairCost) return false;
    this.money -= EDGE_DEF.repairCost;
    edge.repairing = true;
    this.log(`エッジ修理開始 (-$${EDGE_DEF.repairCost})`);
    return true;
  }

  removeEdgePackets(edgeId) {
    this.packets = this.packets.filter(p => p.edgeId !== edgeId);
  }

  repairBase() {
    if (this.baseRepairing || this.baseHp >= this.maxBaseHp) return false;
    if (this.money < this.baseRepairCost) return false;
    this.money -= this.baseRepairCost;
    this.baseRepairing = true;
    this.log(`拠点修理開始 (-$${this.baseRepairCost})`);
    return true;
  }

  get baseLevelDef() { return this.baseLevels[this.baseLevel - 1]; }

  upgradeBase() {
    if (this.baseLevel >= 5) return false;
    if (this.baseUpgrading) return false;
    const nextDef = this.baseLevels[this.baseLevel];
    if (this.money < nextDef.upgradeCost) return false;
    this.money -= nextDef.upgradeCost;
    this.baseUpgrading = true;
    this.baseBuildTimer = UPGRADE_TIMES[this.baseLevel - 1];
    this._pendingBaseLevel = this.baseLevel + 1;
    this.log(`拠点 Lv${this._pendingBaseLevel} に強化中... (-$${nextDef.upgradeCost})`);
    return true;
  }

  startWave() {
    const bonus = this.waveManager.startNextWave(this);
    if (bonus > 0) {
      this.money += bonus;
      this.log(`早期開始ボーナス: +$${bonus}`);
    }
  }

  // ===== Tick =====
  tick(dt) {
    if (this.gameResult !== 'playing') return;

    this.waveManager.tick(dt, this);
    this.tickBuildTimers(dt);
    this.tickGenerators(dt);
    this.tickPackets(dt);
    this.tickHeldPackets(dt);
    this.tickAttacks(dt);
    this.tickBaseAttack(dt);
    this.tickBullets(dt);
    this.tickEnemies(dt);
    this.tickEnemyAttacks(dt);
    this.tickDestructions();
    this.tickRepairs(dt);
    this.tickEffects(dt);
    this.checkGameEnd();
  }

  tickBuildTimers(dt) {
    for (const tower of this.towers) {
      if (tower.destroyed) continue;
      if (tower.status === 'building' || tower.status === 'upgrading') {
        tower.buildTimer -= dt;
        if (tower.buildTimer <= 0) {
          if (tower.status === 'upgrading') {
            tower.level = tower._pendingLevel;
            const hpArr = tower.def.hp;
            tower.maxHp = Array.isArray(hpArr) ? hpArr[tower.level - 1] : hpArr + (tower.level - 1) * 20;
            tower.hp = tower.maxHp;
            this.log(`${tower.def.label} Lv${tower.level} 強化完了`);
          } else {
            this.log(`${tower.def.label} 建設完了`);
          }
          tower.status = 'active';
          tower.buildTimer = 0;
        }
      }
    }
    for (const edge of this.edges) {
      if (edge.destroyed) continue;
      if (edge.status === 'building' || edge.status === 'upgrading') {
        edge.buildTimer -= dt;
        if (edge.buildTimer <= 0) {
          if (edge.status === 'upgrading') {
            edge.level = edge._pendingLevel;
            const ehp = EDGE_DEF.hp;
            edge.maxHp = Array.isArray(ehp) ? ehp[edge.level - 1] : ehp + (edge.level - 1) * 10;
            edge.hp = edge.maxHp;
            this.log(`エッジ Lv${edge.level} 強化完了`);
          } else {
            this.log('エッジ建設完了');
          }
          edge.status = 'active';
          edge.buildTimer = 0;
        }
      }
    }
    // 拠点アップグレードタイマー
    if (this.baseUpgrading) {
      this.baseBuildTimer -= dt;
      if (this.baseBuildTimer <= 0) {
        this.baseLevel = this._pendingBaseLevel;
        const def = this.baseLevelDef;
        this.maxBaseHp = def.maxHp;
        this.baseHp = this.maxBaseHp;
        this.baseUpgrading = false;
        this.baseBuildTimer = 0;
        this.log(`拠点 Lv${this.baseLevel} 強化完了`);
      }
    }
  }

  tickGenerators(dt) {
    for (const tower of this.towers) {
      if (tower.destroyed || !tower.enabled || tower.status !== 'active') continue;
      if (tower.category !== 'generator') continue;

      const ld = tower.levelDef;
      tower.genTimer += dt;
      if (tower.genTimer < 1 / ld.genRate) continue;
      tower.genTimer = 0;

      const outEdges = this.outEdges(tower.id);
      if (outEdges.length === 0) continue;

      if (tower.type === 'generator_burst') {
        // charge=genAmountの1パケットをラウンドロビンで1エッジに送信
        tower.nextOutIdx = tower.nextOutIdx % outEdges.length;
        const edge = outEdges[tower.nextOutIdx];
        tower.nextOutIdx = (tower.nextOutIdx + 1) % outEdges.length;
        if (edge.canAccept(this.packets, ld.genAmount)) {
          this.packets.push(new Packet(edge.id, ld.genAmount));
        }
      } else if (tower.type === 'generator_broadcast') {
        // Broadcast: copy to all output edges
        for (const edge of outEdges) {
          for (let i = 0; i < ld.genAmount; i++) {
            if (edge.canAccept(this.packets, 1)) {
              this.packets.push(new Packet(edge.id, 1));
            }
          }
        }
      }
    }
  }

  tickPackets(dt) {
    const arrived = [];
    for (const pkt of this.packets) {
      const edge = this.getEdge(pkt.edgeId);
      if (!edge || edge.destroyed) { arrived.push(pkt); continue; }
      const from = this.getTower(edge.fromTowerId);
      const to = this.getTower(edge.toTowerId);
      if (!from || !to) { arrived.push(pkt); continue; }
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (dist === 0) { arrived.push(pkt); continue; }
      const speed = PACKET_BASE_SPEED * edge.levelDef.speed;
      pkt.progress += (speed / dist) * dt;
      if (pkt.progress >= 1) {
        arrived.push(pkt);
        // Deliver to destination tower's holdQueue
        if (!to.destroyed) {
          to.holdQueue.push({ charge: pkt.charge });
        }
      }
    }
    this.packets = this.packets.filter(p => !arrived.includes(p));
  }

  tickHeldPackets(dt) {
    for (const tower of this.towers) {
      if (tower.destroyed || !tower.enabled || tower.status !== 'active') continue;

      // 攻撃タワー: パケット→弾薬変換（即座）
      if (tower.category === 'attack') {
        while (tower.holdQueue.length > 0) {
          const pkt = tower.holdQueue.shift();
          tower.ammo += pkt.charge;
        }
        continue;
      }

        // 中継タワー: holdTimeに従って処理
      if (tower.category !== 'relay') continue;
      if (tower.holdQueue.length === 0) continue;

      const ld = tower.levelDef;
      const holdTime = ld.holdTime || 1.0;
      tower.processTimer -= dt;
      if (tower.processTimer > 0) continue;
      tower.processTimer = holdTime;

      const outEdges = this.outEdges(tower.id);
      if (outEdges.length === 0) continue;

      if (tower.type === 'relay_amplify') {
        // リピーター: パケットサイズに定数加算して1パケットとして転送
        const pkt = tower.holdQueue.shift();
        const newCharge = pkt.charge + tower.levelDef.amplifyAdd;
        tower.nextOutIdx = tower.nextOutIdx % outEdges.length;
        const edge = outEdges[tower.nextOutIdx];
        tower.nextOutIdx = (tower.nextOutIdx + 1) % outEdges.length;
        const remaining = edge.levelDef.bandwidth - edge.chargeOnEdge(this.packets);
        const sendCharge = Math.min(newCharge, Math.max(0, remaining));
        if (sendCharge > 0) {
          this.packets.push(new Packet(edge.id, sendCharge));
        }
      } else if (tower.type === 'relay_distribute') {
        // ディストリビューター: ラウンドロビンで1ずつ割り当て→集計して同時送信
        const pkt = tower.holdQueue.shift();
        const n = outEdges.length;
        if (n === 0) continue;
        tower.nextOutIdx = tower.nextOutIdx % n;
        // ラウンドロビンで各エッジへの割り当て数を決定（全エッジ対象）
        const sendMap = new Map();
        for (let i = 0; i < pkt.charge; i++) {
          const edge = outEdges[(tower.nextOutIdx + i) % n];
          sendMap.set(edge.id, (sendMap.get(edge.id) || 0) + 1);
        }
        tower.nextOutIdx = (tower.nextOutIdx + pkt.charge) % n;
        // 割り当て分を同時送信
        for (const [edgeId, sz] of sendMap) {
          const edge = this.getEdge(edgeId);
          if (edge && edge.canAccept(this.packets, sz)) {
            this.packets.push(new Packet(edge.id, sz));
          }
        }
      }
    }
  }

  tickAttacks(dt) {
    for (const tower of this.towers) {
      if (tower.destroyed || !tower.enabled || tower.status !== 'active') continue;
      if (tower.category !== 'attack') continue;

      const ld = tower.levelDef;

      // Find closest enemy in range (for facing + shooting)
      let closest = null;
      let closestDist = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
        if (d <= ld.range && d < closestDist) {
          closest = enemy;
          closestDist = d;
        }
      }

      // Smoothly rotate towards target
      if (closest) {
        const targetAngle = Math.atan2(closest.y - tower.y, closest.x - tower.x);
        tower.facingAngle = lerpAngle(tower.facingAngle, targetAngle, dt * 8);
        tower.target = closest.id;
      }

      tower.fireCooldown -= dt;
      if (tower.fireCooldown > 0) continue;
      if (tower.ammo < ld.packetCost) continue;
      if (!closest) continue;

      // Fire
      tower.ammo -= ld.packetCost;
      tower.fireCooldown = 1 / ld.fireRate;
      const angle = Math.atan2(closest.y - tower.y, closest.x - tower.x);
      this.bullets.push({
        x: tower.x, y: tower.y,
        dx: Math.cos(angle) * BULLET_SPEED,
        dy: Math.sin(angle) * BULLET_SPEED,
        damage: ld.damage,
        targetId: closest.id,
        towerId: tower.id,
      });
    }
  }

  tickBaseAttack(dt) {
    this.baseAttackCooldown -= dt;
    if (this.baseAttackCooldown > 0) return;
    const def = this.baseLevelDef;
    let closest = null;
    let closestDist = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = Math.hypot(enemy.x - BASE_POS.x, enemy.y - BASE_POS.y);
      if (d <= def.range && d < closestDist) {
        closest = enemy;
        closestDist = d;
      }
    }
    if (!closest) return;
    this.baseAttackCooldown = def.cooldown;
    const angle = Math.atan2(closest.y - BASE_POS.y, closest.x - BASE_POS.x);
    this.bullets.push({
      x: BASE_POS.x, y: BASE_POS.y,
      dx: Math.cos(angle) * BULLET_SPEED,
      dy: Math.sin(angle) * BULLET_SPEED,
      damage: def.damage,
      targetId: closest.id,
      towerId: -1,
    });
  }

  tickBullets(dt) {
    const remove = [];
    for (const b of this.bullets) {
      const target = this.getEnemy(b.targetId);
      if (!target || target.dead) { remove.push(b); continue; }
      // Move toward target
      const angle = Math.atan2(target.y - b.y, target.x - b.x);
      b.dx = Math.cos(angle) * BULLET_SPEED;
      b.dy = Math.sin(angle) * BULLET_SPEED;
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      // Hit check
      const d = Math.hypot(target.x - b.x, target.y - b.y);
      if (d < 12) {
        target.hp -= b.damage;
        this.effects.push({ x: target.x, y: target.y, type: 'hit', timer: 0.2 });
        if (target.hp <= 0) {
          target.dead = true;
          this.money += target.reward;
          this.effects.push({ x: target.x, y: target.y, type: 'kill', timer: 0.4 });
        }
        remove.push(b);
      }
    }
    this.bullets = this.bullets.filter(b => !remove.includes(b));
  }

  tickEnemies(dt) {
    // 拠点手前に待機中の敵を数えてスロット割り当て
    const waitingEnemies = this.enemies.filter(e => !e.dead && e.reachedBase);
    const waitSlotMap = new Map();
    waitingEnemies.forEach((e, i) => waitSlotMap.set(e.id, i));

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;

      // 拠点到達判定: パス最後のセグメントで拠点の50px手前で停止
      if (enemy.pathSegment >= PATH.length - 2) {
        const distToBase = Math.hypot(BASE_POS.x - enemy.x, BASE_POS.y - enemy.y);
        // 待機スロット位置（先着順にパス上で手前にずれる）
        const slot = waitSlotMap.has(enemy.id) ? waitSlotMap.get(enemy.id) : waitingEnemies.length;
        const stopDist = 40 + slot * 22;

        if (distToBase <= stopDist) {
          if (!enemy.reachedBase) {
            enemy.reachedBase = true;
            enemy.baseAttackTimer = 0;
          }
          // 拠点攻撃（1秒ごとにdamage分）
          enemy.baseAttackTimer = (enemy.baseAttackTimer || 0) - dt;
          if (enemy.baseAttackTimer <= 0) {
            enemy.baseAttackTimer = 1.0;
            this.baseHp -= enemy.damage;
            this.effects.push({
              x: BASE_POS.x, y: BASE_POS.y,
              type: 'enemyAttack', timer: 0.3,
              fromX: enemy.x, fromY: enemy.y, toX: BASE_POS.x, toY: BASE_POS.y,
            });
          }
          continue;
        }
      }

      // パス最後に到達してもさらに先のチェック
      if (enemy.pathSegment >= PATH.length - 1) {
        if (!enemy.reachedBase) {
          enemy.reachedBase = true;
          enemy.baseAttackTimer = 0;
        }
        enemy.baseAttackTimer = (enemy.baseAttackTimer || 0) - dt;
        if (enemy.baseAttackTimer <= 0) {
          enemy.baseAttackTimer = 1.0;
          this.baseHp -= enemy.damage;
          this.effects.push({
            x: BASE_POS.x, y: BASE_POS.y,
            type: 'enemyAttack', timer: 0.3,
            fromX: enemy.x, fromY: enemy.y, toX: BASE_POS.x, toY: BASE_POS.y,
          });
        }
        continue;
      }

      const target = PATH[enemy.pathSegment + 1];
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 5) {
        enemy.pathSegment++;
        continue;
      }

      const moveAmount = enemy.speed * dt;
      enemy.x += (dx / dist) * moveAmount;
      enemy.y += (dy / dist) * moveAmount;
      enemy.angle = Math.atan2(dy, dx);
    }
  }

  tickEnemyAttacks(dt) {
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.isAttacker) continue;
      enemy.attackCooldown -= dt;
      if (enemy.attackCooldown > 0) continue;
      enemy.attackCooldown = 1 / enemy.attackRate;

      // Attack nearest tower or edge in range
      let attacked = false;
      for (const tower of this.towers) {
        if (tower.destroyed) continue;
        const d = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
        if (d <= enemy.attackRange) {
          tower.hp -= enemy.attackDamage;
          this.effects.push({
            x: (tower.x + enemy.x) / 2, y: (tower.y + enemy.y) / 2,
            type: 'enemyAttack', timer: 0.3,
            fromX: enemy.x, fromY: enemy.y, toX: tower.x, toY: tower.y,
          });
          attacked = true;
          break;
        }
      }
      if (!attacked) {
        // Attack edges
        for (const edge of this.edges) {
          if (edge.destroyed) continue;
          const from = this.getTower(edge.fromTowerId);
          const to = this.getTower(edge.toTowerId);
          if (!from || !to) continue;
          // Distance from enemy to edge midpoint
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          const d = Math.hypot(mx - enemy.x, my - enemy.y);
          if (d <= enemy.attackRange) {
            edge.hp -= enemy.attackDamage;
            attacked = true;
            break;
          }
        }
      }
    }
  }

  tickDestructions() {
    for (const tower of this.towers) {
      if (tower.destroyed) continue;
      if (tower.hp <= 0) {
        tower.destroyed = true;
        tower.hp = 0;
        this.log(`${tower.def.label} 破壊！`);
        // Destroy connected edges
        for (const edge of this.allEdgesOf(tower.id)) {
          edge.destroyed = true;
          this.removeEdgePackets(edge.id);
        }
        this.effects.push({ x: tower.x, y: tower.y, type: 'destroy', timer: 0.5 });
      }
    }
    for (const edge of this.edges) {
      if (edge.destroyed) continue;
      if (edge.hp <= 0) {
        edge.destroyed = true;
        edge.hp = 0;
        this.removeEdgePackets(edge.id);
        this.log('エッジ破壊！');
      }
    }
  }

  tickRepairs(dt) {
    const towerRate = REPAIR_RATE * dt;
    const edgeRate = EDGE_REPAIR_RATE * dt;
    for (const tower of this.towers) {
      if (!tower.repairing || tower.destroyed) continue;
      tower.hp = Math.min(tower.hp + towerRate, tower.maxHp);
      if (tower.hp >= tower.maxHp) {
        tower.hp = tower.maxHp;
        tower.repairing = false;
      }
    }
    for (const edge of this.edges) {
      if (!edge.repairing || edge.destroyed) continue;
      edge.hp = Math.min(edge.hp + edgeRate, edge.maxHp);
      if (edge.hp >= edge.maxHp) {
        edge.hp = edge.maxHp;
        edge.repairing = false;
      }
    }
    if (this.baseRepairing) {
      this.baseHp = Math.min(this.baseHp + BASE_REPAIR_RATE * dt, this.maxBaseHp);
      if (this.baseHp >= this.maxBaseHp) {
        this.baseHp = this.maxBaseHp;
        this.baseRepairing = false;
      }
    }
  }

  tickEffects(dt) {
    for (const eff of this.effects) {
      eff.timer -= dt;
    }
    this.effects = this.effects.filter(e => e.timer > 0);
  }

  checkGameEnd() {
    if (this.baseHp <= 0) {
      this.gameResult = 'defeat';
      this.log('敗北！拠点が破壊されました');
    }
    const wm = this.waveManager;
    if (wm.currentWave >= ENEMY_WAVES.length && wm.spawnComplete) {
      const alive = this.enemies.some(e => !e.dead);
      if (!alive && wm.spawnQueue.length === 0) {
        this.gameResult = 'victory';
        this.log('勝利！全ウェーブクリア！');
      }
    }
  }

  // Clean up dead/destroyed
  cleanup() {
    this.enemies = this.enemies.filter(e => !e.dead);
    // Keep destroyed towers/edges for rendering (ghost)
  }
}
