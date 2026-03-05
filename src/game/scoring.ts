// Game Layer: 2-axis scoring (Availability + Defense), rolling metrics, entity scorecards

import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import type { GameState } from '@core/state';
import { getNodeRollingMetrics, getEdgeRollingMetrics } from '@core/metrics';

// ── 定数 ──

const METRICS_UPDATE_INTERVAL = 2.5; // 表示更新間隔（秒）

// ── 公開型 ──

export interface AxisScore { value: number; }

export interface TwoAxisScores {
  availability: AxisScore;
  defense: AxisScore;
  overall: number;
  rank: string;
}

export interface EntityScorecard {
  entityId: string;
  entityType: string;
  label: string;
  theoretical: string;
  supplyRate: string;
  consumptionRate: string;
  utilization: number;
  isBottleneck: boolean;
}

export interface ScoreResult {
  axes: TwoAxisScores;
  entityScorecards: EntityScorecard[];
}

// ── 2軸スコア算出 ──

function toAxis(pct: number): AxisScore {
  return { value: Math.max(0, Math.min(100, pct)) };
}

function computeRank(overall: number): string {
  if (overall >= 95) return 'S+';
  if (overall >= 85) return 'S';
  if (overall >= 70) return 'A';
  if (overall >= 55) return 'B';
  if (overall >= 40) return 'C';
  return 'D';
}

export function calculateScores(state: GameState, config: GameConfig): TwoAxisScores {
  // 可用性: (1 - 加重平均弾切れ率) × 100
  let totalDemand = 0;
  let totalStarvation = 0;
  for (const m of state.metrics.attackTower.values()) {
    totalDemand += m.demandTime;
    totalStarvation += m.starvationTime;
  }
  const starvationRate = totalDemand > 0 ? totalStarvation / totalDemand : 0;
  const availPct = (1 - starvationRate) * 100;

  // 防御力: (defenseHp / MAX_DEFENSE_HP) × 100
  const defensePct = (state.metrics.defenseHp / config.MAX_DEFENSE_HP) * 100;

  const availability = toAxis(availPct);
  const defense = toAxis(defensePct);
  const overall = availability.value * 0.5 + defense.value * 0.5;
  const rank = computeRank(overall);

  return { availability, defense, overall, rank };
}

// ── メトリクス経過時間更新 ──

export function updateMetricsElapsed(state: GameState, dt: number): void {
  state.metrics.elapsedTime += dt;
}

// ── 表示更新間隔チェック ──

let lastDisplayUpdate = 0;

export function shouldUpdateDisplay(simTime: number): boolean {
  if (simTime - lastDisplayUpdate >= METRICS_UPDATE_INTERVAL) {
    lastDisplayUpdate = simTime;
    return true;
  }
  return false;
}

export function resetDisplayTimer(): void {
  lastDisplayUpdate = 0;
}

// ── 勝利画面用スコアカード ──

function fmt(v: number): string {
  return v < 10 ? v.toFixed(2) : v.toFixed(1);
}

export function calculateFinalScore(state: GameState, config: GameConfig): ScoreResult {
  const axes = calculateScores(state, config);
  const entityScorecards: EntityScorecard[] = [];
  const rm = state.rollingMetrics;

  // 攻撃タワー
  for (const [id] of state.metrics.attackTower) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, node.type, node.level);
    const cooldown = stats.cooldown ?? 1;
    const theoretical = 1 / cooldown;
    const nrm = getNodeRollingMetrics(rm, id);
    const util = nrm.idle.utilization();
    entityScorecards.push({
      entityId: id,
      entityType: node.type,
      label: `${node.type} Lv${node.level}`,
      theoretical: `${fmt(theoretical)} pkt/s`,
      supplyRate: `${fmt(nrm.supply.rate())} pkt/s`,
      consumptionRate: `${fmt(nrm.consumption.rate())} pkt/s`,
      utilization: util,
      isBottleneck: util < 0.7,
    });
  }

  // エッジ
  for (const [id] of state.metrics.edge) {
    const edge = state.edges.get(id);
    if (!edge) continue;
    const fromN = state.nodes.get(edge.from);
    const toN = state.nodes.get(edge.to);
    if (!fromN || !toN) continue;
    const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
    const len = Math.hypot(fromN.x - toN.x, fromN.y - toN.y);
    const theoretical = len > 0 ? (edgeLvl.capacity * config.PACKET_SPEED * edgeLvl.speedMultiplier) / len : 0;
    const erm = getEdgeRollingMetrics(rm, id);
    const util = erm.idle.utilization();
    entityScorecards.push({
      entityId: id,
      entityType: 'edge',
      label: `Edge Lv${edge.level}`,
      theoretical: `${fmt(theoretical)} pkt/s`,
      supplyRate: `${fmt(erm.supply.rate())} pkt/s`,
      consumptionRate: `${fmt(erm.consumption.rate())} pkt/s`,
      utilization: util,
      isBottleneck: util < 0.7,
    });
  }

  // キューノード（Dist/Rep）
  for (const [id] of state.metrics.queueNode) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, node.type, node.level);
    const holdTime = stats.holdTime || 1;
    let theoretical: number;
    if (node.type === 'distributor') {
      theoretical = (stats.maxFanout ?? 2) / holdTime;
    } else {
      theoretical = (1 + (stats.chargeBoost ?? 0)) / holdTime;
    }
    const nrm = getNodeRollingMetrics(rm, id);
    const util = nrm.idle.utilization();
    entityScorecards.push({
      entityId: id,
      entityType: node.type,
      label: `${node.type} Lv${node.level}`,
      theoretical: `${fmt(theoretical)} pkt/s`,
      supplyRate: `${fmt(nrm.supply.rate())} pkt/s`,
      consumptionRate: `${fmt(nrm.consumption.rate())} pkt/s`,
      utilization: util,
      isBottleneck: util < 0.7,
    });
  }

  // 生成器
  for (const [id] of state.metrics.generator) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, 'generator', node.level);
    const interval = stats.interval ?? 2.0;
    const theoretical = 1 / interval;
    const nrm = getNodeRollingMetrics(rm, id);
    const util = nrm.idle.utilization();
    entityScorecards.push({
      entityId: id,
      entityType: 'generator',
      label: `generator Lv${node.level}`,
      theoretical: `${fmt(theoretical)} pkt/s`,
      supplyRate: '-',
      consumptionRate: `${fmt(nrm.consumption.rate())} pkt/s`,
      utilization: util,
      isBottleneck: util < 0.7,
    });
  }

  return { axes, entityScorecards };
}
