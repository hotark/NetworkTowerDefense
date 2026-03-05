// Game Layer: 戦闘システム — Core層からの再エクスポート

export {
  updateTowerAttacks,
  updateBaseAttack,
  updateBullets,
  applyBulletHits,
  updateEnemyBullets,
  resetBaseCooldown,
} from '@core/combat/tick';
export type { BulletHit } from '@core/combat/tick';
