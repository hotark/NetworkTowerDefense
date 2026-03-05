// Game Layer: 3-axis scoring, cumulative rate metrics, entity scorecards

import type { GameConfig } from '@core/config';
import { getTowerLevelStats } from '@core/config';
import type { GameState } from '@core/state';

// ── 定数 ──

const METRICS_UPDATE_INTERVAL = 2.5; // 表示更新間隔（秒）

// ── 公開型 ──

export interface AxisScore { value: number; }

export interface ThreeAxisScores {
  buildSpeed: AxisScore;
  availability: AxisScore;
  reliability: AxisScore;
  overall: number;
  rank: string;
}

export interface EntityScorecard {
  entityId: string;
  entityType: string;
  label: string;
  throughput: string;
  rateIn: string;
  rateOut: string;
  lossRate: string;
  isBottleneck: boolean;
}

export interface ScoreResult {
  axes: ThreeAxisScores;
  entityScorecards: EntityScorecard[];
}

// ── 3軸スコア算出 ──

function toAxis(pct: number): AxisScore {
  return { value: Math.max(0, pct) };
}

function computeRank(overall: number): string {
  if (overall >= 95) return 'S+';
  if (overall >= 85) return 'S';
  if (overall >= 70) return 'A';
  if (overall >= 55) return 'B';
  if (overall >= 40) return 'C';
  return 'D';
}

export function calculateScores(state: GameState, _config: GameConfig): ThreeAxisScores {
  // 構築力: Σ(waveSkips.remainingSec) / totalCountdownTime × 100
  const totalSkip = state.metrics.waveSkips.reduce((s, w) => s + w.remainingSec, 0);
  const buildPct = state.metrics.totalCountdownTime > 0
    ? (totalSkip / state.metrics.totalCountdownTime) * 100
    : 0;

  // 可用性: (1 - 加重平均弾切れ率) × 100
  let totalDemand = 0;
  let totalStarvation = 0;
  for (const m of state.metrics.attackTower.values()) {
    totalDemand += m.demandTime;
    totalStarvation += m.starvationTime;
  }
  const starvationRate = totalDemand > 0 ? totalStarvation / totalDemand : 0;
  const availPct = (1 - starvationRate) * 100;

  // 信頼性: (1 - 全体ロス率) × 100
  let totalSent = 0;
  let totalLost = 0;
  for (const m of state.metrics.edge.values()) {
    totalSent += m.sent;
    totalLost += m.lost;
  }
  for (const m of state.metrics.queueNode.values()) {
    totalSent += m.received + m.dropped;
    totalLost += m.dropped;
  }
  for (const m of state.metrics.generator.values()) {
    totalSent += m.generated + m.blocked;
    totalLost += m.blocked;
  }
  const lossRate = totalSent > 0 ? totalLost / totalSent : 0;
  const reliPct = (1 - lossRate) * 100;

  const buildSpeed = toAxis(buildPct);
  const availability = toAxis(availPct);
  const reliability = toAxis(reliPct);
  const overall = buildSpeed.value * 0.2 + availability.value * 0.5 + reliability.value * 0.3;
  const rank = computeRank(overall);

  return { buildSpeed, availability, reliability, overall, rank };
}

// ── メトリクス経過時間更新 ──

export function updateMetricsElapsed(state: GameState, dt: number): void {
  state.metrics.elapsedTime += dt;
}

// ── 表示更新間隔チェック ──

/** 前回更新からの経過を返す。閾値を超えたらtrueを返しリセット */
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
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

/** 累積レート: count / elapsedTime */
function cumulativeRate(count: number, elapsed: number): number {
  return elapsed > 0 ? count / elapsed : 0;
}

export function calculateFinalScore(state: GameState, config: GameConfig): ScoreResult {
  const axes = calculateScores(state, config);
  const entityScorecards: EntityScorecard[] = [];
  const t = state.metrics.elapsedTime;

  // 攻撃タワー
  for (const [id, m] of state.metrics.attackTower) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, node.type, node.level);
    const cooldown = stats.cooldown ?? 1;
    const throughput = 1 / cooldown;
    const starvRate = m.demandTime > 0 ? m.starvationTime / m.demandTime : 0;
    entityScorecards.push({
      entityId: id,
      entityType: node.type,
      label: `${node.type} Lv${node.level}`,
      throughput: `${fmt(throughput)} 弾/秒`,
      rateIn: `${fmt(cumulativeRate(m.receivedAmmo, t))} 弾/秒`,
      rateOut: `${fmt(cumulativeRate(m.consumedAmmo, t))} 弾/秒`,
      lossRate: `${Math.round(starvRate * 100)}%`,
      isBottleneck: starvRate > 0.3,
    });
  }

  // エッジ
  for (const [id, m] of state.metrics.edge) {
    const edge = state.edges.get(id);
    if (!edge) continue;
    const fromN = state.nodes.get(edge.from);
    const toN = state.nodes.get(edge.to);
    if (!fromN || !toN) continue;
    const edgeLvl = config.edgeLevels[Math.min(edge.level, config.MAX_LEVEL) - 1];
    const len = Math.hypot(fromN.x - toN.x, fromN.y - toN.y);
    const throughput = len > 0 ? (edgeLvl.capacity * config.PACKET_SPEED * edgeLvl.speedMultiplier) / len : 0;
    const lr = m.sent > 0 ? m.lost / m.sent : 0;
    entityScorecards.push({
      entityId: id,
      entityType: 'edge',
      label: `Edge Lv${edge.level}`,
      throughput: `${fmt(throughput)} パケット/秒`,
      rateIn: `${fmt(cumulativeRate(m.sent, t))} パケット/秒`,
      rateOut: `${fmt(cumulativeRate(m.sent - m.lost, t))} パケット/秒`,
      lossRate: `${Math.round(lr * 100)}%`,
      isBottleneck: lr > 0.1,
    });
  }

  // キューノード（Dist/Rep）
  for (const [id, m] of state.metrics.queueNode) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, node.type, node.level);
    const holdTime = stats.holdTime || 1;
    let throughput: number;
    if (node.type === 'distributor') {
      throughput = (stats.maxFanout ?? 2) / holdTime;
    } else {
      throughput = (1 + (stats.chargeBoost ?? 0)) / holdTime;
    }
    const total = m.received + m.dropped;
    const lr = total > 0 ? m.dropped / total : 0;
    entityScorecards.push({
      entityId: id,
      entityType: node.type,
      label: `${node.type} Lv${node.level}`,
      throughput: `${fmt(throughput)} パケット/秒`,
      rateIn: `${fmt(cumulativeRate(m.received, t))} パケット/秒`,
      rateOut: `${fmt(cumulativeRate(m.forwarded, t))} パケット/秒`,
      lossRate: `${Math.round(lr * 100)}%`,
      isBottleneck: lr > 0.1,
    });
  }

  // 生成器
  for (const [id, m] of state.metrics.generator) {
    const node = state.nodes.get(id);
    if (!node) continue;
    const stats = getTowerLevelStats(config, 'generator', node.level);
    const interval = stats.interval ?? 2.0;
    const throughput = 1 / interval;
    const total = m.generated + m.blocked;
    const lr = total > 0 ? m.blocked / total : 0;
    entityScorecards.push({
      entityId: id,
      entityType: 'generator',
      label: `generator Lv${node.level}`,
      throughput: `${fmt(throughput)} パケット/秒`,
      rateIn: '-',
      rateOut: `${fmt(cumulativeRate(m.generated, t))} パケット/秒`,
      lossRate: `${Math.round(lr * 100)}%`,
      isBottleneck: lr > 0.3,
    });
  }

  return { axes, entityScorecards };
}
