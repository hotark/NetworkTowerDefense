// Game Layer: Score calculation and max-score validation

import type { GameConfig } from '@core/config';
import type { GameState } from '@core/state';

// ── 公開型 ──

export interface ScoreResult {
  total: number;
  breakdown: {
    waveBonus: number;
    hpBonus: number;
    resourceBonus: number;
    timeBonus: number;
  };
  maxPossible: number;
}

// ── スコア計算 ──

const WAVE_POINTS = 100;
const HP_POINTS = 50;
const RESOURCE_FACTOR = 0.1;
const TIME_BONUS_BASE = 3000;
const TIME_PENALTY_PER_SEC = 0.5;

/** ゲーム終了時のスコアを算出（純粋関数） */
export function calculateScore(state: GameState, config: GameConfig): ScoreResult {
  const waveBonus = state.waveIndex * WAVE_POINTS;
  const hpBonus = Math.max(0, state.baseHp) * HP_POINTS;
  const resourceBonus = Math.round(state.resources * RESOURCE_FACTOR);
  const timeBonus = Math.max(0, Math.round(TIME_BONUS_BASE - state.simTime * TIME_PENALTY_PER_SEC));

  const total = waveBonus + hpBonus + resourceBonus + timeBonus;
  const maxPossible = calculateMaxScore(state.waveIndex, state.simTime, config);

  return {
    total,
    breakdown: { waveBonus, hpBonus, resourceBonus, timeBonus },
    maxPossible,
  };
}

/** スコアの理論上限（ウェーブ数と経過時間から算出） */
export function calculateMaxScore(
  waveIndex: number, elapsedTime: number, config: GameConfig,
): number {
  const maxWaveBonus = waveIndex * WAVE_POINTS;
  const maxHpBonus = config.BASE_HP * HP_POINTS;
  // リソース上限は全報酬合計の見積もり
  const maxResourceBonus = estimateMaxResources(waveIndex, config);
  const maxTimeBonus = Math.max(0, Math.round(TIME_BONUS_BASE - elapsedTime * TIME_PENALTY_PER_SEC));

  return maxWaveBonus + maxHpBonus + maxResourceBonus + maxTimeBonus;
}

/** 指定ウェーブまでの全報酬合計を見積もる */
function estimateMaxResources(waveIndex: number, config: GameConfig): number {
  let totalReward = config.INITIAL_RESOURCES;
  for (let w = 0; w < Math.min(waveIndex, config.waveDefs.length); w++) {
    const wave = config.waveDefs[w];
    for (const entry of wave.enemies) {
      const typeDef = config.enemyTypes[entry.type];
      const levels = (entry.boss && typeDef.bossLevels) ? typeDef.bossLevels : typeDef.levels;
      const lvl = levels[Math.min(entry.str, levels.length) - 1];
      totalReward += lvl.reward * entry.count;
    }
  }
  return Math.round(totalReward * RESOURCE_FACTOR);
}
