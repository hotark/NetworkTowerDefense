// Core Layer: PathBehavior — 経路移動のみ、弾を撃たない

import type { EnemyBehavior } from './types';

export const pathBehavior: EnemyBehavior = {
  update(_enemy, _view, _config, _stage, _dt) {
    // 経路移動はtick.tsのupdateEnemies内で全敵に共通処理されるため
    // PathBehaviorは追加行動なし
  },
};
