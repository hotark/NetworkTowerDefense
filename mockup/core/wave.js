// wave.js — WaveManager: スポーン + カウントダウン

import { ENEMY_WAVES, ENEMY_TYPES, WAVE_COUNTDOWN, EARLY_BONUS_PER_SEC } from './config.js';
import { Enemy } from './enemy.js';
import { SPAWN_POS } from './map.js';

export class WaveManager {
  constructor() {
    this.currentWave = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnComplete = false;
    this.countdown = WAVE_COUNTDOWN; // 最初からカウントダウン開始
    this.countdownActive = true;
    this.allWavesComplete = false;
  }

  startNextWave(state) {
    if (this.allWavesComplete) return 0;
    if (this.waveActive && !this.spawnComplete) return 0;

    let bonus = 0;
    if (this.countdownActive && this.countdown > 0) {
      bonus = Math.floor(this.countdown * EARLY_BONUS_PER_SEC);
    }

    if (this.currentWave >= ENEMY_WAVES.length) {
      this.allWavesComplete = true;
      return bonus;
    }

    const waveDef = ENEMY_WAVES[this.currentWave];
    this.spawnQueue = [];
    for (const group of waveDef.enemies) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          type: group.type,
          lv: group.lv || 1,
          boss: group.boss || false,
          delay: group.spawnInterval,
        });
      }
    }
    this.waveActive = true;
    this.spawnComplete = false;
    this.spawnTimer = 0;
    this.countdownActive = false;
    this.countdown = 0;
    this.currentWave++;
    return bonus;
  }

  tick(dt, state) {
    if (this.allWavesComplete) return;

    // スポーン
    if (this.waveActive && this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const entry = this.spawnQueue.shift();
        try {
          const enemy = new Enemy(entry.type, entry.lv, entry.boss);
          enemy.x = SPAWN_POS.x;
          enemy.y = SPAWN_POS.y;
          state.enemies.push(enemy);
          const def = ENEMY_TYPES[entry.type];
          const bossTag = entry.boss ? ' [BOSS]' : '';
          state.log(`W${this.currentWave}: ${def.label}Lv${entry.lv}${bossTag}`);
        } catch (e) {
          console.error('Enemy spawn error:', entry, e);
        }
        this.spawnTimer = this.spawnQueue.length > 0 ? this.spawnQueue[0].delay : 0;
      }
    }

    // スポーン完了 → カウントダウン
    if (this.waveActive && this.spawnQueue.length === 0 && !this.spawnComplete) {
      this.spawnComplete = true;
      if (this.currentWave < ENEMY_WAVES.length) {
        this.countdownActive = true;
        this.countdown = WAVE_COUNTDOWN;
        state.log(`出撃完了。次ウェーブまで${WAVE_COUNTDOWN}秒`);
      } else {
        state.log('最終ウェーブ出撃完了！');
      }
    }

    // カウントダウン → 0で自動スポーン
    if (this.countdownActive) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.countdownActive = false;
        this.startNextWave(state);
        state.log('カウントダウン終了 — 自動開始');
      }
    }
  }

  get waveLabel() {
    return `${this.currentWave}/${ENEMY_WAVES.length}`;
  }
}
