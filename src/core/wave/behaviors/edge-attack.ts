// Core Layer: EdgeAttackBehavior — 移動+Edge攻撃

import type { EnemyBehavior } from './types';
import { createEnemyShot } from '../logic';

export const edgeAttackBehavior: EnemyBehavior = {
  update(enemy, view, config, _stage, dt) {
    enemy.attackTimer -= dt;
    if (enemy.attackTimer <= 0) {
      const shot = createEnemyShot(enemy, view, config, 'edgeAttack');
      if (shot) {
        view.enemyBullets.set(shot.id, shot);
        enemy.attackTimer = enemy.attackInterval;
      }
    }
  },
};
