// Game Layer: 経済システム — Core層からの再エクスポート

export { canAfford, purchase, refund } from '@core/economy/logic';
export type { EconomyAction } from '@core/economy/logic';
export { updateBuildTimers } from '@core/economy/tick';
