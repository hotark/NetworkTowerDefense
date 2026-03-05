// Core Layer: ステージ1データ — 敵経路・ウェーブ定義・拠点位置・ノードスロット

import type { StageData } from '@core/types';

export const stage1: StageData = {
  id: 'stage1',

  enemyPath: [
    { x: 680, y: -30 },
    { x: 680, y: 80 },
    { x: 120, y: 80 },
    { x: 120, y: 300 },
    { x: 680, y: 300 },
    { x: 680, y: 500 },
    { x: 400, y: 555 },
  ],

  basePos: { x: 400, y: 555 },

  nodeSlots: [
    // Row 1 (y≈40)
    { x: 55, y: 38 }, { x: 198, y: 44 }, { x: 338, y: 36 }, { x: 478, y: 42 }, { x: 618, y: 38 }, { x: 745, y: 44 },
    // Row 2 (y≈150)
    { x: 165, y: 148 }, { x: 280, y: 155 }, { x: 408, y: 148 }, { x: 545, y: 152 }, { x: 678, y: 148 },
    // Row 3 (y≈220)
    { x: 62, y: 225 }, { x: 205, y: 218 }, { x: 342, y: 222 }, { x: 482, y: 216 }, { x: 612, y: 224 }, { x: 742, y: 218 },
    // Row 4 (y≈360)
    { x: 128, y: 362 }, { x: 268, y: 356 }, { x: 408, y: 365 }, { x: 545, y: 358 }, { x: 622, y: 365 },
    // Row 5 (y≈430)
    { x: 58, y: 435 }, { x: 202, y: 428 }, { x: 338, y: 432 }, { x: 478, y: 428 }, { x: 615, y: 435 }, { x: 745, y: 430 },
    // Row 6 (y≈490)
    { x: 132, y: 492 }, { x: 272, y: 488 }, { x: 408, y: 495 }, { x: 538, y: 490 },
  ],

  waveDefs: [
    // Wave 1-3: ノーマルのみ（チュートリアル）
    { enemies: [{ type: 'normal', count: 3, str: 1 }] },
    { enemies: [{ type: 'normal', count: 5, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 1 }] },
    // Wave 4-5: ファスト初登場
    { enemies: [{ type: 'fast', count: 6, str: 1 }] },
    { enemies: [{ type: 'normal', count: 6, str: 1 }, { type: 'fast', count: 4, str: 1 }] },
    // Wave 6-7: タンク初登場
    { enemies: [{ type: 'tank', count: 3, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 1 }, { type: 'tank', count: 3, str: 1 }] },
    // Wave 8-9: 2種組み合わせ
    { enemies: [{ type: 'fast', count: 8, str: 1 }, { type: 'tank', count: 2, str: 1 }] },
    { enemies: [{ type: 'normal', count: 10, str: 1 }, { type: 'fast', count: 5, str: 1 }] },
    // Wave 10: 序盤ボス
    { enemies: [{ type: 'normal', count: 6, str: 1 }, { type: 'tank', count: 1, str: 1, boss: true }] },
    // Wave 11-12: エッジ攻撃初登場
    { enemies: [{ type: 'edgeAttacker', count: 5, str: 1 }] },
    { enemies: [{ type: 'normal', count: 8, str: 2 }, { type: 'edgeAttacker', count: 4, str: 1 }] },
    // Wave 13-14: タワー攻撃初登場
    { enemies: [{ type: 'towerAttacker', count: 5, str: 1 }] },
    { enemies: [{ type: 'fast', count: 8, str: 2 }, { type: 'towerAttacker', count: 4, str: 1 }] },
    // Wave 15-16: str2本格化
    { enemies: [{ type: 'normal', count: 10, str: 2 }, { type: 'tank', count: 1, str: 2 }] },
    { enemies: [{ type: 'edgeAttacker', count: 5, str: 2 }, { type: 'towerAttacker', count: 4, str: 1 }] },
    // Wave 17-19: 2-3種の組み合わせ
    { enemies: [{ type: 'fast', count: 8, str: 2 }, { type: 'edgeAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'tank', count: 4, str: 2 }, { type: 'towerAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'normal', count: 8, str: 2 }, { type: 'fast', count: 5, str: 2 }, { type: 'tank', count: 2, str: 2 }] },
    // Wave 20: 中盤ボス
    { enemies: [{ type: 'tank', count: 1, str: 2, boss: true }, { type: 'edgeAttacker', count: 1, str: 2, boss: true }, { type: 'towerAttacker', count: 1, str: 2, boss: true }] },
    // Wave 21-23: str3開始
    { enemies: [{ type: 'normal', count: 6, str: 3 }] },
    { enemies: [{ type: 'normal', count: 6, str: 3 }, { type: 'edgeAttacker', count: 4, str: 2 }] },
    { enemies: [{ type: 'normal', count: 6, str: 3 }, { type: 'towerAttacker', count: 4, str: 2 }] },
    // Wave 24-26: 高難度
    { enemies: [{ type: 'fast', count: 8, str: 3 }] },
    { enemies: [{ type: 'fast', count: 8, str: 3 }, { type: 'towerAttacker', count: 4, str: 3 }] },
    { enemies: [{ type: 'normal', count: 8, str: 3 }, { type: 'edgeAttacker', count: 4, str: 3 }] },
    // Wave 27-29: 最終エリア
    { enemies: [{ type: 'normal', count: 8, str: 3 }, { type: 'tank', count: 2, str: 3 }] },
    { enemies: [{ type: 'fast', count: 8, str: 3 }, { type: 'edgeAttacker', count: 4, str: 3 }, { type: 'towerAttacker', count: 4, str: 3 }] },
    { enemies: [{ type: 'tank', count: 4, str: 3 }, { type: 'edgeAttacker', count: 5, str: 3 }, { type: 'towerAttacker', count: 5, str: 3 }] },
    // Wave 30: 最終ボス
    { enemies: [{ type: 'tank', count: 1, str: 3, boss: true }, { type: 'edgeAttacker', count: 2, str: 3, boss: true }, { type: 'towerAttacker', count: 2, str: 3, boss: true }] },
  ],
};
