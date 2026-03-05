// Core Layer: EnemyBehavior dispatch map

import type { EnemyBehavior as EnemyBehaviorType } from '@core/types';
import type { EnemyBehavior } from './types';
import { pathBehavior } from './path';
import { edgeAttackBehavior } from './edge-attack';
import { towerAttackBehavior } from './tower-attack';

export const behaviorMap: Record<EnemyBehaviorType, EnemyBehavior> = {
  path: pathBehavior,
  edgeAttack: edgeAttackBehavior,
  towerAttack: towerAttackBehavior,
};

export type { EnemyBehavior } from './types';
