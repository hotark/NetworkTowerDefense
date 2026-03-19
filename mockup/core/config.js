// config.js — 定数・バランスパラメータ（ref準拠）

export const CANVAS_W = 900;
export const CANVAS_H = 700;
export const FIXED_DT = 1 / 60;
export const BASE_HP = 20;
export const START_MONEY = 600;
export const SELL_REFUND_RATE = 0.5;
export const PACKET_BASE_SPEED = 120;
export const BULLET_SPEED = 300;
export const SPOT_RADIUS = 18;
export const TOWER_DRAW_SIZE = 40;
export const ENEMY_DRAW_SIZE = 32;
export const WAVE_COUNTDOWN = 60;
export const EARLY_BONUS_PER_SEC = 5;
export const REPAIR_RATE = 40; // タワーHP/秒
export const EDGE_REPAIR_RATE = 20; // エッジHP/秒
export const BASE_HEAL_COST = 100;
export const BASE_HEAL_AMOUNT = 5;
export const BASE_REPAIR_RATE = 5; // 拠点HP回復速度/秒
// ref準拠: 建設2s, エッジ建設1s, アップグレード [3,5,8,12]s
export const TOWER_BUILD_TIME = 2.0;
export const EDGE_BUILD_TIME = 1.0;
export const UPGRADE_TIMES = [3, 5, 8, 12]; // Lv2,3,4,5へのアップグレード時間

// ref: generator=50, rapid=60, cannon=70, sniper=80, distributor=30, repeater=40
// ours: generator_burst=50, generator_broadcast=80(マルチは高め),
//        relay_distribute=30, relay_amplify=40,
//        attack_rapid=60, attack_heavy=70, attack_sniper=80
export const TOWER_TYPES = {
  generator_burst: {
    category: 'generator',
    label: 'ユニキャスト',
    desc: '大量パケット・順次送信',
    buildCost: 50,
    hp: [100, 140, 200, 300, 450],
    repairCost: 25,
    connectRange: 300,
    color: '#00ff88',
    // パケット量がどんどん増える
    levels: [
      { genRate: 0.5,  genAmount: 3, upgradeCost: 0 },
      { genRate: 0.8,  genAmount: 5, upgradeCost: 15 },
      { genRate: 1.0,  genAmount: 8, upgradeCost: 70 },
      { genRate: 1.5,  genAmount: 12, upgradeCost: 300 },
      { genRate: 2.0,  genAmount: 18, upgradeCost: 900 },
    ]
  },
  generator_broadcast: {
    category: 'generator',
    label: 'ブロードキャスト',
    desc: '全出力に同時送信',
    buildCost: 80,
    hp: [80, 110, 160, 240, 360],
    repairCost: 40,
    connectRange: 300,
    color: '#88ff44',
    // 速度が上がる、Lv4-5でパケット量も増える
    levels: [
      { genRate: 0.5,  genAmount: 1, upgradeCost: 0 },
      { genRate: 0.8,  genAmount: 1, upgradeCost: 25 },
      { genRate: 1.25, genAmount: 1, upgradeCost: 90 },
      { genRate: 2.0,  genAmount: 2, upgradeCost: 400 },
      { genRate: 3.0,  genAmount: 3, upgradeCost: 1200 },
    ]
  },
  relay_amplify: {
    category: 'relay',
    label: '増幅',
    desc: 'パケットを増幅転送',
    buildCost: 40,
    hp: [60, 85, 120, 180, 280],
    repairCost: 20,
    connectRange: 300,
    color: '#44bbff',
    // リピーター: 整数倍増幅(最大3倍)、処理遅め
    levels: [
      { amplifyRate: 2, holdTime: 2.0,  upgradeCost: 0 },
      { amplifyRate: 2, holdTime: 1.5,  upgradeCost: 15 },
      { amplifyRate: 2, holdTime: 1.0,  upgradeCost: 70 },
      { amplifyRate: 3, holdTime: 0.8,  upgradeCost: 300 },
      { amplifyRate: 3, holdTime: 0.5,  upgradeCost: 900 },
    ]
  },
  relay_distribute: {
    category: 'relay',
    label: '分配',
    desc: '複数出力に均等分配',
    buildCost: 30,
    hp: [50, 70, 100, 160, 250],
    repairCost: 15,
    connectRange: 300,
    color: '#ffaa00',
    // ディストリビューター: パケット増量なし、処理はやめ
    levels: [
      { maxOutputs: 2, holdTime: 0.8,  upgradeCost: 0 },
      { maxOutputs: 3, holdTime: 0.6,  upgradeCost: 10 },
      { maxOutputs: 4, holdTime: 0.4,  upgradeCost: 60 },
      { maxOutputs: 5, holdTime: 0.3,  upgradeCost: 250 },
      { maxOutputs: 6, holdTime: 0.2,  upgradeCost: 800 },
    ]
  },
  attack_rapid: {
    category: 'attack',
    label: '速射',
    desc: '高速・低火力',
    buildCost: 60,
    hp: [60, 85, 120, 180, 350],
    repairCost: 30,
    connectRange: 300,
    color: '#ff8800',
    // ref rapid: cooldown→fireRate変換 (fireRate = 1/cooldown)
    levels: [
      { damage: 15,  fireRate: 2.5,  packetCost: 1, range: 100, upgradeCost: 0 },
      { damage: 24,  fireRate: 2.9,  packetCost: 1, range: 110, upgradeCost: 20 },
      { damage: 40,  fireRate: 3.7,  packetCost: 2, range: 125, upgradeCost: 80 },
      { damage: 65,  fireRate: 5.0,  packetCost: 3, range: 145, upgradeCost: 350 },
      { damage: 120, fireRate: 7.1,  packetCost: 5, range: 180, upgradeCost: 1100 },
    ]
  },
  attack_heavy: {
    category: 'attack',
    label: '重撃',
    desc: '低速・高火力',
    buildCost: 80,
    hp: [80, 110, 160, 240, 360],
    repairCost: 40,
    connectRange: 300,
    color: '#cc44ff',
    // ref sniper: 高火力・低速・狭射程
    levels: [
      { damage: 50,  fireRate: 0.67, packetCost: 1,  range: 80,  upgradeCost: 0 },
      { damage: 80,  fireRate: 0.74, packetCost: 3,  range: 100, upgradeCost: 25 },
      { damage: 140, fireRate: 0.87, packetCost: 8,  range: 130, upgradeCost: 90 },
      { damage: 250, fireRate: 1.05, packetCost: 15, range: 170, upgradeCost: 400 },
      { damage: 500, fireRate: 1.33, packetCost: 30, range: 200, upgradeCost: 1200 },
    ]
  },
  attack_sniper: {
    category: 'attack',
    label: '狙撃',
    desc: '広射程・中火力',
    buildCost: 70,
    hp: [90, 125, 175, 260, 400],
    repairCost: 35,
    connectRange: 300,
    color: '#ff4466',
    // ref cannon: 中火力・中速・広射程
    levels: [
      { damage: 20,  fireRate: 1.25, packetCost: 1,  range: 160, upgradeCost: 0 },
      { damage: 35,  fireRate: 1.43, packetCost: 2,  range: 175, upgradeCost: 20 },
      { damage: 60,  fireRate: 1.82, packetCost: 5,  range: 195, upgradeCost: 85 },
      { damage: 100, fireRate: 2.38, packetCost: 10, range: 220, upgradeCost: 380 },
      { damage: 170, fireRate: 3.33, packetCost: 20, range: 250, upgradeCost: 1150 },
    ]
  },
};

export const EDGE_DEF = {
  buildCost: 10,
  hp: [40, 55, 75, 100, 140],
  repairCost: 5,
  // ref: capacity 3→25, speedMultiplier 0.8→10.0
  levels: [
    { bandwidth: 3,  speed: 0.8,  upgradeCost: 0 },
    { bandwidth: 6,  speed: 1.2,  upgradeCost: 15 },
    { bandwidth: 10, speed: 2.0,  upgradeCost: 60 },
    { bandwidth: 15, speed: 5.0,  upgradeCost: 250 },
    { bandwidth: 25, speed: 10.0, upgradeCost: 800 },
  ]
};

// 敵5種 (refの5種をマッピング: normal, fast, tank, edgeAttacker→saboteur, towerAttacker→raider)
export const ENEMY_TYPES = {
  normal:   { label: '通常',     color: '#cc66ff' },
  fast:     { label: '高速',     color: '#66ff66' },
  tank:     { label: '重装',     color: '#4488ff' },
  saboteur: { label: '破壊工作', color: '#ffcc00' },
  raider:   { label: '急襲',     color: '#44ffee' },
};

// ref準拠: 3段階レベル
export const ENEMY_LEVELS = {
  normal: [
    { hp: 80,   speed: 55,  reward: 20,  damage: 1 },
    { hp: 500,  speed: 58,  reward: 55,  damage: 1 },
    { hp: 4000, speed: 80,  reward: 110, damage: 2 },
  ],
  fast: [
    { hp: 45,   speed: 100, reward: 15,  damage: 1 },
    { hp: 300,  speed: 115, reward: 65,  damage: 1 },
    { hp: 5000, speed: 135, reward: 130, damage: 2 },
  ],
  tank: [
    { hp: 350,   speed: 28, reward: 30,   damage: 1 },
    { hp: 5000,  speed: 30, reward: 110,  damage: 2 },
    { hp: 15000, speed: 45, reward: 280,  damage: 3 },
  ],
  saboteur: [ // ref edgeAttacker
    { hp: 120,  speed: 30, reward: 22,  damage: 1, attackRange: 60,  attackRate: 0.5, attackDamage: 5 },
    { hp: 500,  speed: 40, reward: 75,  damage: 1, attackRange: 100, attackRate: 0.67, attackDamage: 5 },
    { hp: 3000, speed: 50, reward: 180, damage: 2, attackRange: 200, attackRate: 1.0,  attackDamage: 8 },
  ],
  raider: [ // ref towerAttacker
    { hp: 200,  speed: 30, reward: 25,  damage: 1, attackRange: 50,  attackRate: 0.5,  attackDamage: 5 },
    { hp: 750,  speed: 35, reward: 85,  damage: 1, attackRange: 150, attackRate: 0.59, attackDamage: 15 },
    { hp: 5000, speed: 40, reward: 200, damage: 2, attackRange: 300, attackRate: 0.83, attackDamage: 30 },
  ],
};

// ref準拠ボス
export const BOSS_LEVELS = {
  tank: [
    { hp: 1800,  speed: 18, reward: 150,  damage: 2 },
    { hp: 10000, speed: 20, reward: 420,  damage: 3 },
    { hp: 50000, speed: 22, reward: 1000, damage: 5 },
  ],
  saboteur: [ // ref edgeAttacker boss
    { hp: 800,   speed: 30, reward: 120, damage: 1, attackRange: 50,  attackRate: 0.67, attackDamage: 5 },
    { hp: 5000,  speed: 30, reward: 220, damage: 2, attackRange: 200, attackRate: 1.0,  attackDamage: 5 },
    { hp: 15000, speed: 30, reward: 380, damage: 3, attackRange: 300, attackRate: 1.25, attackDamage: 8 },
  ],
  raider: [ // ref towerAttacker boss
    { hp: 900,   speed: 20, reward: 130, damage: 1, attackRange: 65,  attackRate: 0.83, attackDamage: 10 },
    { hp: 5000,  speed: 20, reward: 250, damage: 2, attackRange: 300, attackRate: 1.0,  attackDamage: 30 },
    { hp: 20000, speed: 20, reward: 400, damage: 3, attackRange: 500, attackRate: 2.0,  attackDamage: 50 },
  ],
};

// ref準拠 30ウェーブ (spawnInterval=0.8固定)
const SI = 0.8;
export const ENEMY_WAVES = [
  // --- Lv1 序盤 (1-10) ---
  { enemies: [{ type:'normal', lv:1, count:3, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:5, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:8, spawnInterval:SI }] },
  { enemies: [{ type:'fast',   lv:1, count:6, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:6, spawnInterval:SI }, { type:'fast', lv:1, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'tank',   lv:1, count:3, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:8, spawnInterval:SI }, { type:'tank', lv:1, count:3, spawnInterval:SI }] },
  { enemies: [{ type:'fast',   lv:1, count:8, spawnInterval:SI }, { type:'tank', lv:1, count:2, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:10, spawnInterval:SI }, { type:'fast', lv:1, count:5, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:1, count:6, spawnInterval:SI }, { type:'tank', lv:1, count:1, spawnInterval:SI, boss:true }] },

  // --- Lv1-2 中盤 (11-20) ---
  { enemies: [{ type:'saboteur', lv:1, count:5, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:2, count:8, spawnInterval:SI }, { type:'saboteur', lv:1, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'raider', lv:1, count:5, spawnInterval:SI }] },
  { enemies: [{ type:'fast', lv:2, count:8, spawnInterval:SI }, { type:'raider', lv:1, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:2, count:10, spawnInterval:SI }, { type:'tank', lv:2, count:1, spawnInterval:SI }] },
  { enemies: [{ type:'saboteur', lv:2, count:5, spawnInterval:SI }, { type:'raider', lv:1, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'fast', lv:2, count:8, spawnInterval:SI }, { type:'saboteur', lv:2, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'tank', lv:2, count:4, spawnInterval:SI }, { type:'raider', lv:2, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:2, count:8, spawnInterval:SI }, { type:'fast', lv:2, count:5, spawnInterval:SI }, { type:'tank', lv:2, count:2, spawnInterval:SI }] },
  { enemies: [{ type:'tank', lv:2, count:1, spawnInterval:SI, boss:true }, { type:'saboteur', lv:2, count:1, spawnInterval:SI, boss:true }, { type:'raider', lv:2, count:1, spawnInterval:SI, boss:true }] },

  // --- Lv2-3 終盤 (21-30) ---
  { enemies: [{ type:'normal', lv:3, count:6, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:3, count:6, spawnInterval:SI }, { type:'saboteur', lv:2, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:3, count:6, spawnInterval:SI }, { type:'raider', lv:2, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'fast', lv:3, count:8, spawnInterval:SI }] },
  { enemies: [{ type:'fast', lv:3, count:8, spawnInterval:SI }, { type:'raider', lv:3, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:3, count:8, spawnInterval:SI }, { type:'saboteur', lv:3, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'normal', lv:3, count:8, spawnInterval:SI }, { type:'tank', lv:3, count:2, spawnInterval:SI }] },
  { enemies: [{ type:'fast', lv:3, count:8, spawnInterval:SI }, { type:'saboteur', lv:3, count:4, spawnInterval:SI }, { type:'raider', lv:3, count:4, spawnInterval:SI }] },
  { enemies: [{ type:'tank', lv:3, count:4, spawnInterval:SI }, { type:'saboteur', lv:3, count:5, spawnInterval:SI }, { type:'raider', lv:3, count:5, spawnInterval:SI }] },
  { enemies: [{ type:'tank', lv:3, count:1, spawnInterval:SI, boss:true }, { type:'saboteur', lv:3, count:2, spawnInterval:SI, boss:true }, { type:'raider', lv:3, count:2, spawnInterval:SI, boss:true }] },
];
