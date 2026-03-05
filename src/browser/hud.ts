// Browser Layer: HUD reactive bindings with Preact Signals

import { signal, computed, effect } from '@preact/signals-core';
import type { Signal, ReadonlySignal } from '@preact/signals-core';
import type { NodeId, EdgeId, NodeType } from '@core/types';
import type { GameConfig } from '@core/config';
import {
  getTowerLevelStats, getEdgeLevelStats,
  getUpgradeCost, getEdgeUpgradeCost, getUpgradeDuration,
} from '@core/config';
import type { GameState } from '@core/state';
import {
  getAttackTowerMetrics, getEdgeMetrics,
  getQueueNodeMetrics, getGeneratorMetrics,
} from '@core/state';
import { chargeOnEdge } from '@core/network/logic';
import { calculateFinalScore } from '@game/scoring';
import type { ThreeAxisScores } from '@game/scoring';

// ── 公開型 ──

export interface HUDSignals {
  baseHp: Signal<number>;
  maxBaseHp: Signal<number>;
  resources: Signal<number>;
  waveIndex: Signal<number>;
  maxWaves: Signal<number>;
  enemyCount: Signal<number>;
  simSpeed: Signal<number>;
  gameResult: Signal<'playing' | 'victory' | 'defeat'>;
  hpPercent: ReadonlySignal<number>;
  waveCountdown: Signal<number>;
  nextWaveDelay: Signal<number>;
  skipBonus: Signal<number>;
  buildScore: Signal<number>;
  availScore: Signal<number>;
  reliScore: Signal<number>;
}

export type HUDCallback =
  | { type: 'start-game' }
  | { type: 'start-wave' }
  | { type: 'select-tool'; tool: NodeType }
  | { type: 'upgrade-tower'; nodeId: NodeId }
  | { type: 'destroy-tower'; nodeId: NodeId }
  | { type: 'toggle-tower'; nodeId: NodeId }
  | { type: 'repair-tower'; nodeId: NodeId }
  | { type: 'upgrade-edge'; edgeId: EdgeId }
  | { type: 'destroy-edge'; edgeId: EdgeId }
  | { type: 'reverse-edge'; edgeId: EdgeId }
  | { type: 'toggle-edge'; edgeId: EdgeId }
  | { type: 'repair-edge'; edgeId: EdgeId }
  | { type: 'base-heal' }
  | { type: 'restart' }
  | { type: 'deselect' };

// ── タワーラベル ──

const TOWER_LABELS: Record<NodeType, string> = {
  generator: 'ジェネレータ',
  sniper: 'スナイパー',
  rapid: 'ラピッド',
  cannon: 'キャノン',
  distributor: '分配器',
  repeater: '増幅器',
};

// ── 内部状態（ボタンイベントから参照） ──

let currentSelectedNode: NodeId | null = null;
let currentSelectedEdge: EdgeId | null = null;

// ── HUD作成 ──

export function createHUD(
  config: GameConfig,
  onAction: (cb: HUDCallback) => void,
): HUDSignals {
  const baseHpSig = signal(config.BASE_HP);
  const maxBaseHpSig = signal(config.BASE_HP);

  const signals: HUDSignals = {
    baseHp: baseHpSig,
    maxBaseHp: maxBaseHpSig,
    resources: signal(config.INITIAL_RESOURCES),
    waveIndex: signal(0),
    maxWaves: signal(config.waveDefs.length),
    enemyCount: signal(0),
    simSpeed: signal(1),
    gameResult: signal('playing' as 'playing' | 'victory' | 'defeat'),
    hpPercent: computed(() => {
      const max = maxBaseHpSig.value;
      return max > 0 ? (baseHpSig.value / max) * 100 : 0;
    }),
    waveCountdown: signal(config.WAVE_COUNTDOWN),
    nextWaveDelay: signal(0),
    skipBonus: signal(0),
    buildScore: signal(0),
    availScore: signal(100),
    reliScore: signal(100),
  };

  const $ = (id: string) => document.getElementById(id);

  // ── タブ切替 ──
  document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      if (!tabName) return;
      document.querySelectorAll<HTMLElement>('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
      });
      document.querySelectorAll<HTMLElement>('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + tabName);
      });
    });
  });

  // ── ツール選択 ──
  document.querySelectorAll<HTMLElement>('#tab-build .tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLElement>('#tab-build .tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onAction({ type: 'select-tool', tool: btn.dataset.tool as NodeType });
    });
  });

  // ── ボタンイベント ──
  $('btn-start')?.addEventListener('click', () => onAction({ type: 'start-game' }));
  $('btn-wave')?.addEventListener('click', () => onAction({ type: 'start-wave' }));
  $('btn-base-heal')?.addEventListener('click', () => onAction({ type: 'base-heal' }));

  $('game-over')?.addEventListener('click', () => onAction({ type: 'restart' }));
  $('game-victory')?.addEventListener('click', () => onAction({ type: 'restart' }));

  // タワー操作ボタン
  $('btn-upgrade')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'upgrade-tower', nodeId: currentSelectedNode });
  });
  $('btn-destroy')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'destroy-tower', nodeId: currentSelectedNode });
  });
  $('btn-toggle-active')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'toggle-tower', nodeId: currentSelectedNode });
  });
  $('btn-repair')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'repair-tower', nodeId: currentSelectedNode });
  });

  // エッジ操作ボタン
  $('btn-edge-upgrade')?.addEventListener('click', () => {
    if (currentSelectedEdge) onAction({ type: 'upgrade-edge', edgeId: currentSelectedEdge });
  });
  $('btn-edge-destroy')?.addEventListener('click', () => {
    if (currentSelectedEdge) onAction({ type: 'destroy-edge', edgeId: currentSelectedEdge });
  });
  $('btn-edge-reverse')?.addEventListener('click', () => {
    if (currentSelectedEdge) onAction({ type: 'reverse-edge', edgeId: currentSelectedEdge });
  });
  $('btn-edge-toggle')?.addEventListener('click', () => {
    if (currentSelectedEdge) onAction({ type: 'toggle-edge', edgeId: currentSelectedEdge });
  });
  $('btn-edge-repair')?.addEventListener('click', () => {
    if (currentSelectedEdge) onAction({ type: 'repair-edge', edgeId: currentSelectedEdge });
  });

  // フルスクリーン
  $('btn-fullscreen')?.addEventListener('click', () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().then(() => {
        if (screen.orientation && 'lock' in screen.orientation) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      }).catch(() => {});
    }
  });

  // ── リアクティブバインド ──
  effect(() => { const el = $('st-hp'); if (el) el.textContent = String(Math.ceil(signals.baseHp.value)); });
  effect(() => { const el = $('st-res'); if (el) el.textContent = String(Math.floor(signals.resources.value)); });
  effect(() => {
    const el = $('st-wave');
    if (el) el.textContent = `${signals.waveIndex.value}/${signals.maxWaves.value}`;
  });
  effect(() => { const el = $('st-enemies'); if (el) el.textContent = String(signals.enemyCount.value); });

  // 拠点回復ボタン
  effect(() => {
    const btn = $('btn-base-heal') as HTMLButtonElement | null;
    if (btn) btn.style.display = signals.baseHp.value < signals.maxBaseHp.value ? '' : 'none';
  });

  // ウェーブボタン
  effect(() => {
    const btn = $('btn-wave') as HTMLButtonElement | null;
    if (!btn) return;
    const result = signals.gameResult.value;
    const wi = signals.waveIndex.value;
    const mw = signals.maxWaves.value;
    if (result !== 'playing' || wi >= mw) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    if (signals.nextWaveDelay.value > 0) {
      btn.disabled = true;
      btn.textContent = `準備中 (${Math.ceil(signals.nextWaveDelay.value)}s)`;
    } else {
      btn.disabled = false;
      const secs = Math.ceil(signals.waveCountdown.value);
      const bonus = signals.skipBonus.value;
      btn.textContent = `スキップ $${bonus} (${secs}s)`;
    }
  });

  // 3軸スコア表示
  const scoreColor = (v: number) => v >= 80 ? '#44ff88' : v >= 50 ? '#ffaa33' : '#ff4466';
  effect(() => {
    const el = $('st-build');
    if (el) { el.textContent = `${Math.round(signals.buildScore.value)}%`; el.style.color = scoreColor(signals.buildScore.value); }
  });
  effect(() => {
    const el = $('st-avail');
    if (el) { el.textContent = `${Math.round(signals.availScore.value)}%`; el.style.color = scoreColor(signals.availScore.value); }
  });
  effect(() => {
    const el = $('st-reli');
    if (el) { el.textContent = `${Math.round(signals.reliScore.value)}%`; el.style.color = scoreColor(signals.reliScore.value); }
  });

  // ゲームオーバー・勝利オーバーレイ
  effect(() => {
    const result = signals.gameResult.value;
    const goEl = $('game-over');
    const gvEl = $('game-victory');
    if (goEl) goEl.style.display = result === 'defeat' ? 'flex' : 'none';
    if (gvEl) gvEl.style.display = result === 'victory' ? 'flex' : 'none';
  });

  return signals;
}

// ── GameState → HUDSignals 同期 ──

export function syncHUD(
  signals: HUDSignals,
  state: GameState,
  waveCountdown: number,
  nextWaveDelay: number,
  skipBonus: number,
  scores?: ThreeAxisScores | null,
): void {
  signals.baseHp.value = state.baseHp;
  signals.maxBaseHp.value = state.maxBaseHp;
  signals.resources.value = state.resources;
  signals.waveIndex.value = state.waveIndex;
  signals.enemyCount.value = state.enemies.size;
  signals.gameResult.value = state.gameResult;
  signals.waveCountdown.value = waveCountdown;
  signals.nextWaveDelay.value = nextWaveDelay;
  signals.skipBonus.value = skipBonus;
  if (scores) {
    signals.buildScore.value = scores.buildSpeed.value;
    signals.availScore.value = scores.availability.value;
    signals.reliScore.value = scores.reliability.value;
  }
}

// ── 選択パネル更新 ──

export function updateTowerPanel(
  state: GameState,
  config: GameConfig,
  nodeId: NodeId | null,
): void {
  currentSelectedNode = nodeId;
  const $ = (id: string) => document.getElementById(id);
  const panel = $('tower-info');
  const infoEmpty = $('info-empty');
  const edgePanel = $('edge-info');

  if (!nodeId) {
    if (panel) panel.style.display = 'none';
    if (infoEmpty) infoEmpty.style.display = (edgePanel?.style.display === 'block') ? 'none' : '';
    return;
  }

  const node = state.nodes.get(nodeId);
  if (!node) {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (panel) panel.style.display = 'block';
  if (infoEmpty) infoEmpty.style.display = 'none';

  const setText = (id: string, text: string) => { const el = $(id); if (el) el.textContent = text; };
  const setDisplay = (id: string, show: boolean) => { const el = $(id); if (el) el.style.display = show ? '' : 'none'; };

  setText('ti-type', TOWER_LABELS[node.type] || node.type);
  setText('ti-level', `Lv.${node.level}`);
  setText('ti-hp', `${Math.round(node.hp)}/${node.maxHp}`);

  const stats = getTowerLevelStats(config, node.type, node.level);

  // 全行一旦非表示
  for (const row of ['ti-row-range', 'ti-row-dmg', 'ti-row-cd', 'ti-row-interval', 'ti-row-hold', 'ti-row-rate', 'ti-row-stock', 'ti-row-ammo-cost', 'ti-row-throughput', 'ti-row-queue', 'ti-row-in', 'ti-row-out', 'ti-row-loss']) {
    setDisplay(row, false);
  }

  if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
    setDisplay('ti-row-range', true);
    setDisplay('ti-row-dmg', true);
    setDisplay('ti-row-cd', true);
    setDisplay('ti-row-hold', true);
    setDisplay('ti-row-stock', true);
    setDisplay('ti-row-ammo-cost', true);
    setText('ti-range', String(stats.range ?? '-'));
    setText('ti-dmg', String(stats.damage ?? '-'));
    setText('ti-cd', `${stats.cooldown ?? '-'}s`);
    setText('ti-hold', `${stats.holdTime}s`);
    setText('ti-stock', String(node.ammo));
    setText('ti-ammo-cost', `${stats.ammoPerShot ?? 1}/発`);
  } else if (node.type === 'generator') {
    setDisplay('ti-row-interval', true);
    setDisplay('ti-row-hold', true);
    setText('ti-interval', `${stats.interval ?? 2}s`);
    setText('ti-hold', `${stats.holdTime}s`);
  } else if (node.type === 'distributor') {
    setDisplay('ti-row-rate', true);
    setDisplay('ti-row-hold', true);
    setText('ti-rate', `→ ${stats.maxFanout ?? 2}方向`);
    setText('ti-hold', `${stats.holdTime}s`);
  } else if (node.type === 'repeater') {
    setDisplay('ti-row-rate', true);
    setDisplay('ti-row-hold', true);
    setText('ti-rate', `charge +${stats.chargeBoost ?? 0}`);
    setText('ti-hold', `${stats.holdTime}s`);
  }

  // メトリクス行
  const fmtRate = (v: number) => v < 10 ? v.toFixed(1) : Math.round(v).toString();
  setDisplay('ti-row-throughput', true);

  const t = state.metrics.elapsedTime;
  const cumRate = (count: number) => t > 0 ? count / t : 0;

  if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
    const cooldown = stats.cooldown ?? 1;
    setText('ti-throughput', `${fmtRate(1 / cooldown)} 弾/秒`);
    const atm = getAttackTowerMetrics(state, nodeId);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-loss', true);
    setText('ti-in', `${fmtRate(cumRate(atm.receivedAmmo))} 弾/秒`);
    setText('ti-out', `${fmtRate(cumRate(atm.consumedAmmo))} 弾/秒`);
    const starvRate = atm.demandTime > 0 ? atm.starvationTime / atm.demandTime : 0;
    setText('ti-loss', `${Math.round(starvRate * 100)}%`);
    const lossEl = $('ti-loss');
    if (lossEl) lossEl.style.color = starvRate > 0.3 ? '#ff4466' : starvRate > 0.1 ? '#ffaa33' : '#44ff88';
  } else if (node.type === 'generator') {
    const interval = stats.interval ?? 2.0;
    setText('ti-throughput', `${fmtRate(1 / interval)} パケット/秒`);
    const gm = getGeneratorMetrics(state, nodeId);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-loss', true);
    setText('ti-out', `${fmtRate(cumRate(gm.generated))} パケット/秒`);
    const total = gm.generated + gm.blocked;
    const lr = total > 0 ? gm.blocked / total : 0;
    setText('ti-loss', `${Math.round(lr * 100)}%`);
    const lossEl = $('ti-loss');
    if (lossEl) lossEl.style.color = lr > 0.3 ? '#ff4466' : lr > 0.1 ? '#ffaa33' : '#44ff88';
  } else if (node.type === 'distributor') {
    const holdTime = stats.holdTime || 1;
    const tp = (stats.maxFanout ?? 2) / holdTime;
    setText('ti-throughput', `${fmtRate(tp)} パケット/秒`);
    const qm = getQueueNodeMetrics(state, nodeId);
    setDisplay('ti-row-queue', true);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-loss', true);
    const qLen = node.held.length;
    const qMax = config.DIST_REP_MAX_QUEUE;
    setText('ti-queue', `${qLen}/${qMax}`);
    const queueEl = $('ti-queue');
    if (queueEl) queueEl.style.color = qLen >= qMax ? '#ff4466' : qLen >= qMax * 0.7 ? '#ffaa33' : '';
    setText('ti-in', `${fmtRate(cumRate(qm.received))} パケット/秒`);
    setText('ti-out', `${fmtRate(cumRate(qm.forwarded))} パケット/秒`);
    const total = qm.received + qm.dropped;
    const lr = total > 0 ? qm.dropped / total : 0;
    setText('ti-loss', `${Math.round(lr * 100)}%`);
    const lossEl = $('ti-loss');
    if (lossEl) lossEl.style.color = lr > 0.1 ? '#ff4466' : '#44ff88';
  } else if (node.type === 'repeater') {
    const holdTime = stats.holdTime || 1;
    const tp = (1 + (stats.chargeBoost ?? 0)) / holdTime;
    setText('ti-throughput', `${fmtRate(tp)} パケット/秒`);
    const qm = getQueueNodeMetrics(state, nodeId);
    setDisplay('ti-row-queue', true);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-loss', true);
    const qLen = node.held.length;
    const qMax = config.DIST_REP_MAX_QUEUE;
    setText('ti-queue', `${qLen}/${qMax}`);
    const queueEl = $('ti-queue');
    if (queueEl) queueEl.style.color = qLen >= qMax ? '#ff4466' : qLen >= qMax * 0.7 ? '#ffaa33' : '';
    setText('ti-in', `${fmtRate(cumRate(qm.received))} パケット/秒`);
    setText('ti-out', `${fmtRate(cumRate(qm.forwarded))} パケット/秒`);
    const total = qm.received + qm.dropped;
    const lr = total > 0 ? qm.dropped / total : 0;
    setText('ti-loss', `${Math.round(lr * 100)}%`);
    const lossEl = $('ti-loss');
    if (lossEl) lossEl.style.color = lr > 0.1 ? '#ff4466' : '#44ff88';
  }

  // アップグレードボタン
  const upgBtn = $('btn-upgrade') as HTMLButtonElement | null;
  if (upgBtn) {
    if (node.status === 'building') {
      upgBtn.disabled = true;
      upgBtn.innerHTML = `建築中… ${Math.ceil(node.buildTimer)}s`;
    } else if (node.status === 'upgrading') {
      upgBtn.disabled = true;
      upgBtn.innerHTML = `強化中… ${Math.ceil(node.upgradeTimer)}s`;
    } else if (node.level >= config.MAX_LEVEL) {
      upgBtn.disabled = true;
      upgBtn.innerHTML = '最大レベル';
    } else {
      const cost = getUpgradeCost(config, node.type, node.level);
      const dur = getUpgradeDuration(config, node.level);
      upgBtn.disabled = state.resources < cost;
      upgBtn.innerHTML = `強化 <span class="cost">$${cost}</span> (${dur}s)`;
    }
  }

  // 修理ボタン
  const repairBtn = $('btn-repair') as HTMLButtonElement | null;
  if (repairBtn) {
    repairBtn.style.display = node.hp < node.maxHp ? '' : 'none';
  }

  // Active/Inactiveトグル
  const toggleBtn = $('btn-toggle-active') as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.textContent = node.status === 'active' ? '停止' : '起動';
    toggleBtn.style.borderColor = node.status === 'active' ? '#664400' : '#00cc44';
  }
}

export function updateEdgePanel(
  state: GameState,
  config: GameConfig,
  edgeId: EdgeId | null,
): void {
  currentSelectedEdge = edgeId;
  const $ = (id: string) => document.getElementById(id);
  const panel = $('edge-info');
  const infoEmpty = $('info-empty');
  const towerPanel = $('tower-info');

  if (!edgeId) {
    if (panel) panel.style.display = 'none';
    if (infoEmpty) infoEmpty.style.display = (towerPanel?.style.display === 'block') ? 'none' : '';
    return;
  }

  const edge = state.edges.get(edgeId);
  if (!edge) {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (panel) panel.style.display = 'block';
  if (infoEmpty) infoEmpty.style.display = 'none';

  const setText = (id: string, text: string) => { const el = $(id); if (el) el.textContent = text; };

  const edgeLv = edge.level;
  const eLvStats = getEdgeLevelStats(config, edgeLv);
  const statusText = edge.status === 'disabled'
    ? (edge.disableTimer > 0 ? '強化中' : '停止中')
    : edge.status === 'active' ? '稼働中' : '破壊済';
  setText('ei-status', statusText);
  setText('ei-hp', `${Math.round(edge.hp)}/${edge.maxHp}`);
  setText('ei-level', `Lv.${edgeLv}`);
  setText('ei-capacity', `${chargeOnEdge(state, edge.id)}/${eLvStats.capacity}`);
  setText('ei-speed', `×${eLvStats.speedMultiplier}`);

  // メトリクス行
  const fmtR = (v: number) => v < 10 ? v.toFixed(1) : Math.round(v).toString();
  const fromN = state.nodes.get(edge.from);
  const toN = state.nodes.get(edge.to);
  if (fromN && toN) {
    const len = Math.hypot(fromN.x - toN.x, fromN.y - toN.y);
    const tp = len > 0 ? (eLvStats.capacity * config.PACKET_SPEED * eLvStats.speedMultiplier) / len : 0;
    setText('ei-throughput', `${fmtR(tp)} パケット/秒`);
  }
  const em = getEdgeMetrics(state, edge.id);
  const et = state.metrics.elapsedTime;
  const eCumRate = (count: number) => et > 0 ? count / et : 0;
  setText('ei-in', `${fmtR(eCumRate(em.sent))} パケット/秒`);
  setText('ei-out', `${fmtR(eCumRate(em.sent - em.lost))} パケット/秒`);
  const eLr = em.sent > 0 ? em.lost / em.sent : 0;
  setText('ei-loss', `${Math.round(eLr * 100)}%`);
  const eiLossEl = document.getElementById('ei-loss');
  if (eiLossEl) eiLossEl.style.color = eLr > 0.1 ? '#ff4466' : eLr > 0 ? '#ffaa33' : '#44ff88';

  // エッジアップグレードボタン
  const edgeUpgBtn = $('btn-edge-upgrade') as HTMLButtonElement | null;
  if (edgeUpgBtn) {
    if (edge.status === 'disabled' && edge.disableTimer > 0) {
      edgeUpgBtn.disabled = true;
      edgeUpgBtn.innerHTML = `強化中… ${Math.ceil(edge.disableTimer)}s`;
    } else if (edgeLv >= config.MAX_LEVEL) {
      edgeUpgBtn.disabled = true;
      edgeUpgBtn.innerHTML = '最大レベル';
    } else {
      const eCost = getEdgeUpgradeCost(config, edgeLv);
      const dur = getUpgradeDuration(config, edgeLv);
      edgeUpgBtn.disabled = state.resources < eCost;
      edgeUpgBtn.innerHTML = `強化 <span class="cost">$${eCost}</span> (${dur}s)`;
    }
  }

  // 修理ボタン
  const edgeRepairBtn = $('btn-edge-repair') as HTMLButtonElement | null;
  if (edgeRepairBtn) {
    edgeRepairBtn.style.display = edge.hp < edge.maxHp ? '' : 'none';
  }

  // Active/Inactiveトグル
  const toggleBtn = $('btn-edge-toggle') as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.textContent = edge.status === 'active' ? '停止' : '起動';
    toggleBtn.style.borderColor = edge.status === 'active' ? '#664400' : '#00cc44';
  }
}

// ── UI操作ヘルパー ──

export function selectNodeUI(): void {
  const tabInfo = document.querySelector<HTMLElement>('[data-tab="info"]');
  tabInfo?.click();
}

export function selectEdgeUI(): void {
  const tabInfo = document.querySelector<HTMLElement>('[data-tab="info"]');
  tabInfo?.click();
}

export function deselectUI(): void {
  currentSelectedNode = null;
  currentSelectedEdge = null;
  const tabBuild = document.querySelector<HTMLElement>('[data-tab="build"]');
  tabBuild?.click();
  const towerPanel = document.getElementById('tower-info');
  const edgePanel = document.getElementById('edge-info');
  const infoEmpty = document.getElementById('info-empty');
  if (towerPanel) towerPanel.style.display = 'none';
  if (edgePanel) edgePanel.style.display = 'none';
  if (infoEmpty) infoEmpty.style.display = '';
}

export function showVictoryScorecard(state: GameState, config: GameConfig): void {
  const result = calculateFinalScore(state, config);
  const axes = result.axes;

  // 3軸スコア
  const scoresEl = document.getElementById('victory-scores');
  if (scoresEl) {
    const color = (v: number) => v >= 80 ? '#44ff88' : v >= 50 ? '#ffaa33' : '#ff4466';
    scoresEl.innerHTML = [
      { label: '構築力', val: axes.buildSpeed.value },
      { label: '可用性', val: axes.availability.value },
      { label: '信頼性', val: axes.reliability.value },
    ].map(a => `<div class="victory-axis"><div class="axis-label">${a.label}</div><div class="axis-val" style="color:${color(a.val)}">${Math.round(a.val)}%</div></div>`).join('');
  }

  // ランク
  const rankEl = document.getElementById('victory-rank');
  if (rankEl) {
    rankEl.textContent = axes.rank;
    rankEl.title = `総合: ${Math.round(axes.overall)}%`;
  }

  // エンティティ一覧
  const cardsEl = document.getElementById('victory-cards');
  if (cardsEl) {
    if (result.entityScorecards.length === 0) {
      cardsEl.innerHTML = '<div style="color:#556;text-align:center;padding:8px">エンティティなし</div>';
    } else {
      cardsEl.innerHTML = result.entityScorecards.map(c => {
        const bn = c.isBottleneck ? ' bottleneck' : '';
        const inPart = c.rateIn !== '-' ? `IN ${c.rateIn} / ` : '';
        return `<div class="victory-card${bn}"><span class="vc-label">${c.label}</span><span class="vc-stats">${c.throughput} | ${inPart}OUT ${c.rateOut}</span><span class="vc-loss">${c.lossRate}</span></div>`;
      }).join('');
    }
  }
}

export function showMainMenu(): void {
  const el = document.getElementById('main-menu');
  if (el) el.style.display = 'flex';
}

export function hideMainMenu(): void {
  const el = document.getElementById('main-menu');
  if (el) el.style.display = 'none';
}
