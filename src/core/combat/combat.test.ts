// Core Layer: 戦闘システムテスト（spatial, logic, tick, effects）

import { describe, it, expect, beforeEach } from 'vitest';
import { findClosestEnemy } from './spatial';
import { lerpAngle } from './logic';
import {
  updateTowerAttacks, updateBaseAttack, resetBaseCooldown,
  updateBullets, applyBulletHits, updateEnemyBullets,
} from './tick';
import { addMuzzleEffect, addImpactEffect, addExplosionParticles, addUpgradeEffect } from './effects';
import { GAME_CONFIG } from '@core/config';
import { resetIdCounter } from '@core/state';
import type {
  CombatView, Enemy, EnemyId, Bullet, BulletId, EnemyBullet,
  TowerNode, NodeId, Edge, EdgeId, Packet, PacketId, Effect, MetricsStore,
} from '@core/types';

const nid = (s: string) => s as NodeId;
const eid = (s: string) => s as EdgeId;
const pid = (s: string) => s as PacketId;
const enid = (s: string) => s as EnemyId;
const bid = (s: string) => s as BulletId;

function makeNode(id: string, type: TowerNode['type'], x: number, y: number = 0, overrides?: Partial<TowerNode>): TowerNode {
  return {
    id: nid(id), type, x, y, level: 1,
    hp: 100, maxHp: 100, status: 'active', ammo: 0,
    nextOut: 0, cooldown: 0, buildTimer: 0, upgradeTimer: 0,
    disableTimer: 0, held: [], facingAngle: null,
    ...overrides,
  };
}

function makeEnemy(id: string, x: number, y: number, overrides?: Partial<Enemy>): Enemy {
  return {
    id: enid(id), type: 'normal', x, y,
    hp: 100, maxHp: 100, speed: 30, pathIndex: 0, pathProgress: 0,
    reward: 10, strength: 1, isBoss: false,
    attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0,
    angle: 0, atBase: false,
    ...overrides,
  };
}

function makeEdge(id: string, from: string, to: string, overrides?: Partial<Edge>): Edge {
  return {
    id: eid(id), from: nid(from), to: nid(to), level: 1,
    hp: 40, maxHp: 40, status: 'active', disableTimer: 0,
    ...overrides,
  };
}

function makeMetrics(): MetricsStore {
  return {
    attackTower: new Map(), edge: new Map(), queueNode: new Map(),
    generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0,
  };
}

function makeCombatView(overrides?: Partial<CombatView>): CombatView {
  return {
    nodes: new Map(),
    enemies: new Map(),
    bullets: new Map(),
    enemyBullets: new Map(),
    edges: new Map(),
    packets: new Map(),
    effects: [],
    resources: 0,
    metrics: makeMetrics(),
    ...overrides,
  };
}

// ── findClosestEnemy ──

describe('findClosestEnemy', () => {
  it('returns closest enemy within range', () => {
    const e1 = makeEnemy('e1', 50, 0);
    const e2 = makeEnemy('e2', 30, 0);
    const view = makeCombatView({
      enemies: new Map([[e1.id, e1], [e2.id, e2]]),
    });
    const result = findClosestEnemy(view, 0, 0, 100);
    expect(result?.id).toBe(enid('e2'));
  });

  it('returns null when no enemy in range', () => {
    const e1 = makeEnemy('e1', 200, 0);
    const view = makeCombatView({
      enemies: new Map([[e1.id, e1]]),
    });
    expect(findClosestEnemy(view, 0, 0, 50)).toBeNull();
  });

  it('ignores dead enemies (hp <= 0)', () => {
    const e1 = makeEnemy('e1', 10, 0, { hp: 0 });
    const view = makeCombatView({
      enemies: new Map([[e1.id, e1]]),
    });
    expect(findClosestEnemy(view, 0, 0, 100)).toBeNull();
  });
});

// ── lerpAngle ──

describe('lerpAngle', () => {
  it('interpolates towards target', () => {
    const result = lerpAngle(0, 1, 2, 0.25);
    // step = 2*0.25 = 0.5, diff=1 → current + 0.5 = 0.5
    expect(result).toBeCloseTo(0.5);
  });

  it('snaps to target when step >= diff', () => {
    const result = lerpAngle(0, 0.1, 10, 1);
    // step = 10, diff = 0.1 → snaps to target
    expect(result).toBeCloseTo(0.1);
  });

  it('wraps around via shortest path', () => {
    // From near π to near -π, should go the short way
    const result = lerpAngle(Math.PI - 0.1, -(Math.PI - 0.1), 100, 1);
    // diff = -2*(PI-0.1) ≈ -6.08, wrapped → +0.2, step=100 → snaps to target
    expect(result).toBeCloseTo(-(Math.PI - 0.1));
  });
});

// ── updateTowerAttacks ──

describe('updateTowerAttacks', () => {
  beforeEach(() => {
    resetIdCounter();
    resetBaseCooldown();
  });

  it('fires bullet when tower has ammo and enemy in range', () => {
    const tower = makeNode('t1', 'sniper', 0, 0, { ammo: 5, cooldown: 0 });
    const enemy = makeEnemy('e1', 30, 0); // within sniper Lv1 range=80
    const view = makeCombatView({
      nodes: new Map([[tower.id, tower]]),
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateTowerAttacks(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(1);
    expect(tower.ammo).toBe(4); // sniper Lv1 ammoPerShot=1
    expect(tower.cooldown).toBeGreaterThan(0);
  });

  it('does not fire when ammo insufficient', () => {
    const tower = makeNode('t1', 'sniper', 0, 0, { ammo: 0 });
    const enemy = makeEnemy('e1', 30, 0);
    const view = makeCombatView({
      nodes: new Map([[tower.id, tower]]),
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateTowerAttacks(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(0);
  });

  it('does not fire when on cooldown', () => {
    const tower = makeNode('t1', 'sniper', 0, 0, { ammo: 5, cooldown: 1.0 });
    const enemy = makeEnemy('e1', 30, 0);
    const view = makeCombatView({
      nodes: new Map([[tower.id, tower]]),
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateTowerAttacks(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(0);
    expect(tower.cooldown).toBeCloseTo(0.9);
  });

  it('skips inactive towers', () => {
    const tower = makeNode('t1', 'sniper', 0, 0, { ammo: 5, status: 'building' });
    const enemy = makeEnemy('e1', 30, 0);
    const view = makeCombatView({
      nodes: new Map([[tower.id, tower]]),
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateTowerAttacks(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(0);
  });

  it('tracks starvation metrics when ammo empty and enemy in range', () => {
    const tower = makeNode('t1', 'sniper', 0, 0, { ammo: 0, cooldown: 0 });
    const enemy = makeEnemy('e1', 30, 0);
    const view = makeCombatView({
      nodes: new Map([[tower.id, tower]]),
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateTowerAttacks(view, GAME_CONFIG, 0.5);
    const atm = view.metrics.attackTower.get(nid('t1'));
    expect(atm).toBeDefined();
    expect(atm!.demandTime).toBeCloseTo(0.5);
    expect(atm!.starvationTime).toBeCloseTo(0.5);
  });
});

// ── updateBaseAttack ──

describe('updateBaseAttack', () => {
  beforeEach(() => {
    resetIdCounter();
    resetBaseCooldown();
  });

  it('fires at closest enemy in range', () => {
    const enemy = makeEnemy('e1', GAME_CONFIG.basePos.x + 50, GAME_CONFIG.basePos.y);
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateBaseAttack(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(1);
  });

  it('respects cooldown', () => {
    const enemy = makeEnemy('e1', GAME_CONFIG.basePos.x + 50, GAME_CONFIG.basePos.y);
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
    });
    updateBaseAttack(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(1);
    // Second call immediately should not fire (cooldown=2.0)
    updateBaseAttack(view, GAME_CONFIG, 0.1);
    expect(view.bullets.size).toBe(1);
  });
});

// ── updateBullets ──

describe('updateBullets', () => {
  beforeEach(() => resetIdCounter());

  it('moves bullet toward target', () => {
    const enemy = makeEnemy('e1', 100, 0);
    const bullet: Bullet = {
      id: bid('b1'), x: 0, y: 0, prevX: 0, prevY: 0,
      targetId: enid('e1'), deadPos: null,
      speed: 200, damage: 10, towerType: 'sniper', level: 1,
    };
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
      bullets: new Map([[bullet.id, bullet]]),
    });
    updateBullets(view, 0.1);
    expect(bullet.x).toBeGreaterThan(0);
    expect(view.bullets.has(bid('b1'))).toBe(true);
  });

  it('returns hit and removes bullet when close enough', () => {
    const enemy = makeEnemy('e1', 5, 0);
    const bullet: Bullet = {
      id: bid('b1'), x: 0, y: 0, prevX: 0, prevY: 0,
      targetId: enid('e1'), deadPos: null,
      speed: 200, damage: 25, towerType: 'sniper', level: 1,
    };
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
      bullets: new Map([[bullet.id, bullet]]),
    });
    const hits = updateBullets(view, 0.1);
    expect(hits.length).toBe(1);
    expect(hits[0].damage).toBe(25);
    expect(view.bullets.has(bid('b1'))).toBe(false);
  });

  it('sets deadPos when target dies mid-flight', () => {
    const enemy = makeEnemy('e1', 200, 0, { hp: 0 });
    const bullet: Bullet = {
      id: bid('b1'), x: 0, y: 0, prevX: 0, prevY: 0,
      targetId: enid('e1'), deadPos: null,
      speed: 200, damage: 10, towerType: 'sniper', level: 1,
    };
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
      bullets: new Map([[bullet.id, bullet]]),
    });
    updateBullets(view, 0.1);
    expect(bullet.deadPos).not.toBeNull();
  });
});

// ── applyBulletHits ──

describe('applyBulletHits', () => {
  it('applies damage and gives reward on kill', () => {
    const enemy = makeEnemy('e1', 0, 0, { hp: 20, reward: 15 });
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
      resources: 100,
    });
    applyBulletHits(view, [
      { targetId: enid('e1'), damage: 20, towerType: 'sniper', level: 1, x: 0, y: 0 },
    ]);
    expect(enemy.hp).toBe(0);
    expect(view.resources).toBe(115);
  });

  it('does not give reward when enemy survives', () => {
    const enemy = makeEnemy('e1', 0, 0, { hp: 100, reward: 15 });
    const view = makeCombatView({
      enemies: new Map([[enemy.id, enemy]]),
      resources: 100,
    });
    applyBulletHits(view, [
      { targetId: enid('e1'), damage: 30, towerType: 'sniper', level: 1, x: 0, y: 0 },
    ]);
    expect(enemy.hp).toBe(70);
    expect(view.resources).toBe(100);
  });
});

// ── updateEnemyBullets ──

describe('updateEnemyBullets', () => {
  it('moves enemy bullet toward target', () => {
    const eb: EnemyBullet = {
      id: bid('eb1'), x: 0, y: 0, tx: 100, ty: 0,
      speed: 200, damage: 5, targetKind: 'edge', edgeId: eid('e1'), nodeId: null,
    };
    const view = makeCombatView({
      enemyBullets: new Map([[eb.id, eb]]),
    });
    updateEnemyBullets(view, GAME_CONFIG, 0.1);
    expect(eb.x).toBeGreaterThan(0);
  });

  it('damages edge on hit and removes bullet', () => {
    const edge = makeEdge('e1', 'n1', 'n2', { hp: 20, maxHp: 40 });
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 100);
    const eb: EnemyBullet = {
      id: bid('eb1'), x: 99, y: 0, tx: 100, ty: 0,
      speed: 200, damage: 5, targetKind: 'edge', edgeId: eid('e1'), nodeId: null,
    };
    const view = makeCombatView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      enemyBullets: new Map([[eb.id, eb]]),
    });
    updateEnemyBullets(view, GAME_CONFIG, 0.1);
    expect(edge.hp).toBe(15);
    expect(view.enemyBullets.size).toBe(0);
  });

  it('destroys edge when hp <= 0 and removes packets', () => {
    const edge = makeEdge('e1', 'n1', 'n2', { hp: 3, maxHp: 40 });
    const n1 = makeNode('n1', 'generator', 0);
    const n2 = makeNode('n2', 'sniper', 100);
    const pkt: Packet = { id: pid('p1'), edgeId: eid('e1'), progress: 0.5, charge: 1, speed: 100 };
    const eb: EnemyBullet = {
      id: bid('eb1'), x: 99, y: 0, tx: 100, ty: 0,
      speed: 200, damage: 5, targetKind: 'edge', edgeId: eid('e1'), nodeId: null,
    };
    const view = makeCombatView({
      nodes: new Map([[n1.id, n1], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      packets: new Map([[pkt.id, pkt]]),
      enemyBullets: new Map([[eb.id, eb]]),
    });
    updateEnemyBullets(view, GAME_CONFIG, 0.1);
    expect(edge.status).toBe('destroyed');
    expect(view.packets.has(pid('p1'))).toBe(false);
    // メトリクスにlostが記録される
    const em = view.metrics.edge.get(eid('e1'));
    expect(em?.lost).toBe(1);
  });

  it('damages node on hit and destroys node when hp <= 0', () => {
    const node = makeNode('n1', 'sniper', 50, 0, { hp: 3 });
    const edge = makeEdge('e1', 'n1', 'n2');
    const n2 = makeNode('n2', 'generator', 100);
    const eb: EnemyBullet = {
      id: bid('eb1'), x: 49, y: 0, tx: 50, ty: 0,
      speed: 200, damage: 5, targetKind: 'node', edgeId: null, nodeId: nid('n1'),
    };
    const view = makeCombatView({
      nodes: new Map([[node.id, node], [n2.id, n2]]),
      edges: new Map([[edge.id, edge]]),
      enemyBullets: new Map([[eb.id, eb]]),
    });
    updateEnemyBullets(view, GAME_CONFIG, 0.1);
    // Node destroyed → removed from nodes
    expect(view.nodes.has(nid('n1'))).toBe(false);
    // Connected edge destroyed
    expect(edge.status).toBe('destroyed');
  });
});

// ── effects ──

describe('combat effects', () => {
  it('addMuzzleEffect creates muzzle effect with correct variant', () => {
    const effects: Effect[] = [];
    addMuzzleEffect(effects, 10, 20, 'sniper');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe('muzzle');
    expect(effects[0].params.variant).toBe(1);
  });

  it('addImpactEffect creates impact effect', () => {
    const effects: Effect[] = [];
    addImpactEffect(effects, 10, 20, 'rapid', 2);
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe('impact');
    expect(effects[0].params.variant).toBe(2);
    expect(effects[0].params.level).toBe(2);
  });

  it('addExplosionParticles creates specified count', () => {
    const effects: Effect[] = [];
    addExplosionParticles(effects, 0, 0, '#ff0000', 5);
    expect(effects.length).toBe(5);
    for (const e of effects) {
      expect(e.type).toBe('explosion');
      expect(e.color).toBe('#ff0000');
    }
  });

  it('addUpgradeEffect creates 2 effects', () => {
    const effects: Effect[] = [];
    addUpgradeEffect(effects, 10, 20);
    expect(effects.length).toBe(2);
    expect(effects[0].type).toBe('upgrade');
    expect(effects[1].type).toBe('upgrade');
    expect(effects[0].timer).toBeLessThan(effects[1].timer);
  });
});
