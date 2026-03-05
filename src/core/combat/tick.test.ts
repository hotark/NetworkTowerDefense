import { describe, it, expect, beforeEach } from 'vitest';
import { updateBullets, applyBulletHits } from './tick';
import { resetIdCounter } from '@core/state';
import type { CombatView, BulletId, EnemyId } from '@core/types';

const bid = (s: string) => s as BulletId;
const eid = (s: string) => s as EnemyId;

function createView(overrides?: Partial<CombatView>): CombatView {
  return {
    nodes: new Map(), enemies: new Map(), bullets: new Map(),
    enemyBullets: new Map(), edges: new Map(), packets: new Map(),
    effects: [], resources: 0,
    metrics: { attackTower: new Map(), edge: new Map(), queueNode: new Map(), generator: new Map(), waveSkips: [], totalCountdownTime: 0, elapsedTime: 0 },
    ...overrides,
  };
}

describe('updateBullets', () => {
  beforeEach(() => resetIdCounter());

  it('moves bullet toward target', () => {
    const view = createView({
      enemies: new Map([[eid('en1'), { id: eid('en1'), type: 'normal', x: 100, y: 0, hp: 50, maxHp: 50, speed: 50, pathIndex: 0, pathProgress: 0, reward: 10, strength: 1, isBoss: false, attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0, angle: 0, atBase: false }]]),
      bullets: new Map([[bid('b1'), { id: bid('b1'), x: 0, y: 0, prevX: 0, prevY: 0, targetId: eid('en1'), deadPos: null, speed: 300, damage: 10, towerType: 'sniper' as const, level: 1 }]]),
    });
    const hits = updateBullets(view, 0.1);
    const bullet = view.bullets.get(bid('b1'));
    expect(bullet).toBeDefined();
    expect(bullet!.x).toBeGreaterThan(0);
    expect(hits.length).toBe(0);
  });

  it('detects hit when bullet reaches target', () => {
    const view = createView({
      enemies: new Map([[eid('en1'), { id: eid('en1'), type: 'normal', x: 5, y: 0, hp: 50, maxHp: 50, speed: 50, pathIndex: 0, pathProgress: 0, reward: 10, strength: 1, isBoss: false, attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0, angle: 0, atBase: false }]]),
      bullets: new Map([[bid('b1'), { id: bid('b1'), x: 3, y: 0, prevX: 0, prevY: 0, targetId: eid('en1'), deadPos: null, speed: 300, damage: 25, towerType: 'sniper' as const, level: 1 }]]),
    });
    const hits = updateBullets(view, 0.016);
    expect(hits.length).toBe(1);
    expect(hits[0].damage).toBe(25);
    expect(view.bullets.size).toBe(0);
  });
});

describe('applyBulletHits', () => {
  it('applies damage and gives rewards on kill', () => {
    const view = createView({
      enemies: new Map([[eid('en1'), { id: eid('en1'), type: 'normal', x: 0, y: 0, hp: 10, maxHp: 50, speed: 50, pathIndex: 0, pathProgress: 0, reward: 20, strength: 1, isBoss: false, attackTimer: 0, attackRange: 0, attackDamage: 0, attackInterval: 0, angle: 0, atBase: false }]]),
      resources: 100,
    });
    applyBulletHits(view, [{ targetId: eid('en1'), damage: 15, towerType: 'sniper', level: 1, x: 0, y: 0 }]);
    const enemy = view.enemies.get(eid('en1'));
    expect(enemy!.hp).toBe(-5);
    expect(view.resources).toBe(120);
  });
});
