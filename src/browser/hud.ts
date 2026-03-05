// Browser Layer: HUD reactive bindings with Preact Signals

import { signal, computed, effect } from '@preact/signals-core';
import type { Signal, ReadonlySignal } from '@preact/signals-core';
import type { NodeId, EdgeId, NodeType } from '@core/types';
import type { GameConfig } from '@core/config';
import {
  getTowerLevelStats, getEdgeLevelStats,
  getUpgradeCost, getEdgeUpgradeCost, getUpgradeDuration,
  getTowerCost,
} from '@core/config';
import type { GameState } from '@core/state';
import { chargeOnEdge } from '@core/network/logic';
import { getNodeRollingMetrics, getEdgeRollingMetrics } from '@core/metrics';
import { calculateFinalScore } from '@game/scoring';
import type { TwoAxisScores } from '@game/scoring';

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
  availScore: Signal<number>;
  defenseScore: Signal<number>;
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
  | { type: 'deselect' }
  | { type: 'show-range-preview'; nodeId: NodeId; range: number }
  | { type: 'hide-range-preview' };

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
let currentState: GameState | null = null;

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
    availScore: signal(100),
    defenseScore: signal(100),
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

  // ── インライン確認UI制御 ──

  let towerConfirmFn: (() => void) | null = null;
  let towerConfirmCloseFn: (() => void) | null = null;
  let edgeConfirmFn: (() => void) | null = null;

  function showTowerConfirm(title: string, bodyHTML: string, onExec: () => void, onCloseExtra?: () => void): void {
    const btns = $('tower-buttons');
    const confirm = $('tower-confirm');
    const titleEl = $('tower-confirm-title');
    const bodyEl = $('tower-confirm-body');
    if (!btns || !confirm || !titleEl || !bodyEl) return;
    btns.style.display = 'none';
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    towerConfirmFn = onExec;
    towerConfirmCloseFn = onCloseExtra ?? null;
    confirm.style.display = '';
  }

  function hideTowerConfirm(): void {
    const btns = $('tower-buttons');
    const confirm = $('tower-confirm');
    if (btns) btns.style.display = '';
    if (confirm) confirm.style.display = 'none';
    if (towerConfirmCloseFn) towerConfirmCloseFn();
    towerConfirmFn = null;
    towerConfirmCloseFn = null;
  }

  $('tower-confirm-ok')?.addEventListener('click', () => {
    const fn = towerConfirmFn;
    hideTowerConfirm();
    if (fn) fn();
  });
  $('tower-confirm-cancel')?.addEventListener('click', () => hideTowerConfirm());

  function showEdgeConfirm(title: string, bodyHTML: string, onExec: () => void): void {
    const btns = $('edge-buttons');
    const confirm = $('edge-confirm');
    const titleEl = $('edge-confirm-title');
    const bodyEl = $('edge-confirm-body');
    if (!btns || !confirm || !titleEl || !bodyEl) return;
    btns.style.display = 'none';
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    edgeConfirmFn = onExec;
    confirm.style.display = '';
  }

  function hideEdgeConfirm(): void {
    const btns = $('edge-buttons');
    const confirm = $('edge-confirm');
    if (btns) btns.style.display = '';
    if (confirm) confirm.style.display = 'none';
    edgeConfirmFn = null;
  }

  $('edge-confirm-ok')?.addEventListener('click', () => {
    const fn = edgeConfirmFn;
    hideEdgeConfirm();
    if (fn) fn();
  });
  $('edge-confirm-cancel')?.addEventListener('click', () => hideEdgeConfirm());

  // ── ステータス差分表示ヘルパー ──

  function diffLine(label: string, cur: number, next: number, unit: string, inverse?: boolean): string {
    const diff = next - cur;
    if (diff === 0) return `<div style="color:#667">${label}: ${cur}${unit}</div>`;
    const isGood = inverse ? diff < 0 : diff > 0;
    const color = isGood ? '#44ff88' : '#ff4466';
    const sign = diff > 0 ? '+' : '';
    return `<div>${label}: ${cur}${unit} → <span style="color:${color}">${next}${unit}</span> <span style="color:${color};font-size:10px">(${sign}${Math.round(diff * 100) / 100}${unit})</span></div>`;
  }

  function buildTowerUpgradeBody(
    state: GameState, cfg: GameConfig, nodeId: NodeId,
  ): { title: string; body: string; nextRange?: number } | null {
    const node = state.nodes.get(nodeId);
    if (!node || node.level >= cfg.MAX_LEVEL) return null;
    const cur = getTowerLevelStats(cfg, node.type, node.level);
    const nxt = getTowerLevelStats(cfg, node.type, node.level + 1);
    const cost = getUpgradeCost(cfg, node.type, node.level);
    const dur = getUpgradeDuration(cfg, node.level);
    const label = TOWER_LABELS[node.type] || node.type;

    const title = `${label} Lv.${node.level} → Lv.${node.level + 1}`;
    const lines: string[] = [];
    lines.push(`<div style="color:#888;margin-bottom:4px">コスト: <span style="color:#ffcc00">$${cost}</span> / 所要: ${dur}s</div>`);
    lines.push(diffLine('HP', cur.hp, nxt.hp, ''));

    if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
      lines.push(diffLine('射程', cur.range ?? 0, nxt.range ?? 0, ''));
      lines.push(diffLine('攻撃力', cur.damage ?? 0, nxt.damage ?? 0, ''));
      lines.push(diffLine('装填', cur.cooldown ?? 0, nxt.cooldown ?? 0, 's', true));
      lines.push(diffLine('消費弾薬', cur.ammoPerShot ?? 0, nxt.ammoPerShot ?? 0, ''));
    } else if (node.type === 'generator') {
      lines.push(diffLine('生成間隔', cur.interval ?? 0, nxt.interval ?? 0, 's', true));
      lines.push(diffLine('保持', cur.holdTime, nxt.holdTime, 's', true));
    } else if (node.type === 'distributor') {
      lines.push(diffLine('分配数', cur.maxFanout ?? 0, nxt.maxFanout ?? 0, '方向'));
      lines.push(diffLine('保持', cur.holdTime, nxt.holdTime, 's', true));
    } else if (node.type === 'repeater') {
      lines.push(diffLine('ブースト', cur.chargeBoost ?? 0, nxt.chargeBoost ?? 0, ''));
      lines.push(diffLine('保持', cur.holdTime, nxt.holdTime, 's', true));
    }

    const nextRange = (nxt.range != null && cur.range != null && nxt.range !== cur.range) ? nxt.range : undefined;
    return { title, body: lines.join(''), nextRange };
  }

  function buildEdgeUpgradeBody(
    state: GameState, cfg: GameConfig, edgeId: EdgeId,
  ): { title: string; body: string } | null {
    const edge = state.edges.get(edgeId);
    if (!edge || edge.level >= cfg.MAX_LEVEL) return null;
    const cur = getEdgeLevelStats(cfg, edge.level);
    const nxt = getEdgeLevelStats(cfg, edge.level + 1);
    const cost = getEdgeUpgradeCost(cfg, edge.level);
    const dur = getUpgradeDuration(cfg, edge.level);

    const title = `接続 Lv.${edge.level} → Lv.${edge.level + 1}`;
    const lines: string[] = [];
    lines.push(`<div style="color:#888;margin-bottom:4px">コスト: <span style="color:#ffcc00">$${cost}</span> / 所要: ${dur}s</div>`);
    lines.push(diffLine('HP', cur.hp, nxt.hp, ''));
    lines.push(diffLine('容量', cur.capacity, nxt.capacity, ''));
    lines.push(diffLine('速度', cur.speedMultiplier, nxt.speedMultiplier, '×'));
    return { title, body: lines.join('') };
  }

  // ── タワー操作ボタン（インライン確認付き） ──

  $('btn-upgrade')?.addEventListener('click', () => {
    if (!currentSelectedNode || !currentState) return;
    const info = buildTowerUpgradeBody(currentState, config, currentSelectedNode);
    if (!info) return;
    const nodeId = currentSelectedNode;
    if (info.nextRange != null) {
      onAction({ type: 'show-range-preview', nodeId, range: info.nextRange });
    }
    showTowerConfirm(info.title, info.body, () => {
      onAction({ type: 'upgrade-tower', nodeId });
    }, () => {
      onAction({ type: 'hide-range-preview' });
    });
  });
  $('btn-destroy')?.addEventListener('click', () => {
    if (!currentSelectedNode || !currentState) return;
    const node = currentState.nodes.get(currentSelectedNode);
    if (!node) return;
    const nodeId = currentSelectedNode;
    const label = TOWER_LABELS[node.type] || node.type;
    const refundAmt = Math.round(getTowerCost(config, node.type) * 0.5);
    showTowerConfirm(
      `${label} を撤去`,
      `<div>返却: <span style="color:#ffcc00">$${refundAmt}</span></div><div style="color:#ff6666;margin-top:4px">接続エッジも削除されます</div>`,
      () => onAction({ type: 'destroy-tower', nodeId }),
    );
  });
  $('btn-toggle-active')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'toggle-tower', nodeId: currentSelectedNode });
  });
  $('btn-repair')?.addEventListener('click', () => {
    if (currentSelectedNode) onAction({ type: 'repair-tower', nodeId: currentSelectedNode });
  });

  // ── エッジ操作ボタン（インライン確認付き） ──

  $('btn-edge-upgrade')?.addEventListener('click', () => {
    if (!currentSelectedEdge || !currentState) return;
    const info = buildEdgeUpgradeBody(currentState, config, currentSelectedEdge);
    if (!info) return;
    const edgeId = currentSelectedEdge;
    showEdgeConfirm(info.title, info.body, () => {
      onAction({ type: 'upgrade-edge', edgeId });
    });
  });
  $('btn-edge-destroy')?.addEventListener('click', () => {
    if (!currentSelectedEdge) return;
    const edgeId = currentSelectedEdge;
    const refundAmt = Math.round(config.edgeCost * 0.5);
    showEdgeConfirm(
      '接続を撤去',
      `<div>返却: <span style="color:#ffcc00">$${refundAmt}</span></div>`,
      () => onAction({ type: 'destroy-edge', edgeId }),
    );
  });
  $('btn-edge-reverse')?.addEventListener('click', () => {
    if (!currentSelectedEdge) return;
    const edgeId = currentSelectedEdge;
    showEdgeConfirm(
      '接続の方向を反転',
      '<div style="color:#ffaa33">輸送中のパケットは消失します</div>',
      () => onAction({ type: 'reverse-edge', edgeId }),
    );
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

  // 2軸スコア表示
  const scoreColor = (v: number) => v >= 80 ? '#44ff88' : v >= 50 ? '#ffaa33' : '#ff4466';
  effect(() => {
    const el = $('st-avail');
    if (el) { el.textContent = `${Math.round(signals.availScore.value)}%`; el.style.color = scoreColor(signals.availScore.value); }
  });
  effect(() => {
    const el = $('st-defense');
    if (el) { el.textContent = `${Math.round(signals.defenseScore.value)}%`; el.style.color = scoreColor(signals.defenseScore.value); }
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
  scores?: TwoAxisScores | null,
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
    signals.availScore.value = scores.availability.value;
    signals.defenseScore.value = scores.defense.value;
  }
}

// ── 選択パネル更新 ──

export function updateTowerPanel(
  state: GameState,
  config: GameConfig,
  nodeId: NodeId | null,
): void {
  currentState = state;
  const $ = (id: string) => document.getElementById(id);

  // 選択が変わったら確認表示をリセット
  if (nodeId !== currentSelectedNode) {
    const tBtns = $('tower-buttons');
    const tConf = $('tower-confirm');
    if (tBtns) tBtns.style.display = '';
    if (tConf) tConf.style.display = 'none';
  }
  currentSelectedNode = nodeId;

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
  for (const row of ['ti-row-range', 'ti-row-dmg', 'ti-row-cd', 'ti-row-interval', 'ti-row-hold', 'ti-row-rate', 'ti-row-stock', 'ti-row-ammo-cost', 'ti-row-throughput', 'ti-row-queue', 'ti-row-in', 'ti-row-out', 'ti-row-util']) {
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

  // メトリクス行（60秒ローリングウィンドウ）
  const fmtRate = (v: number) => v < 10 ? v.toFixed(1) : Math.round(v).toString();
  const utilColor = (u: number) => u >= 0.8 ? '#44ff88' : u >= 0.5 ? '#ffaa33' : '#ff4466';
  setDisplay('ti-row-throughput', true);

  const nrm = getNodeRollingMetrics(state.rollingMetrics, nodeId);

  if (node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon') {
    const cooldown = stats.cooldown ?? 1;
    setText('ti-throughput', `${fmtRate(1 / cooldown)} 弾/秒`);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-util', true);
    setText('ti-in', `${fmtRate(nrm.supply.rate())} 弾/秒`);
    setText('ti-out', `${fmtRate(nrm.consumption.rate())} 弾/秒`);
    const util = nrm.idle.utilization();
    setText('ti-util', `${Math.round(util * 100)}%`);
    const utilEl = $('ti-util');
    if (utilEl) utilEl.style.color = utilColor(util);
  } else if (node.type === 'generator') {
    const interval = stats.interval ?? 2.0;
    setText('ti-throughput', `${fmtRate(1 / interval)} パケット/秒`);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-util', true);
    setText('ti-out', `${fmtRate(nrm.consumption.rate())} パケット/秒`);
    const util = nrm.idle.utilization();
    setText('ti-util', `${Math.round(util * 100)}%`);
    const utilEl = $('ti-util');
    if (utilEl) utilEl.style.color = utilColor(util);
  } else if (node.type === 'distributor') {
    const holdTime = stats.holdTime || 1;
    const tp = (stats.maxFanout ?? 2) / holdTime;
    setText('ti-throughput', `${fmtRate(tp)} パケット/秒`);
    setDisplay('ti-row-queue', true);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-util', true);
    const qLen = node.held.length;
    const qMax = config.DIST_REP_MAX_QUEUE;
    setText('ti-queue', `${qLen}/${qMax}`);
    const queueEl = $('ti-queue');
    if (queueEl) queueEl.style.color = qLen >= qMax ? '#ff4466' : qLen >= qMax * 0.7 ? '#ffaa33' : '';
    setText('ti-in', `${fmtRate(nrm.supply.rate())} パケット/秒`);
    setText('ti-out', `${fmtRate(nrm.consumption.rate())} パケット/秒`);
    const util = nrm.idle.utilization();
    setText('ti-util', `${Math.round(util * 100)}%`);
    const utilEl = $('ti-util');
    if (utilEl) utilEl.style.color = utilColor(util);
  } else if (node.type === 'repeater') {
    const holdTime = stats.holdTime || 1;
    const tp = (1 + (stats.chargeBoost ?? 0)) / holdTime;
    setText('ti-throughput', `${fmtRate(tp)} パケット/秒`);
    setDisplay('ti-row-queue', true);
    setDisplay('ti-row-in', true);
    setDisplay('ti-row-out', true);
    setDisplay('ti-row-util', true);
    const qLen = node.held.length;
    const qMax = config.DIST_REP_MAX_QUEUE;
    setText('ti-queue', `${qLen}/${qMax}`);
    const queueEl = $('ti-queue');
    if (queueEl) queueEl.style.color = qLen >= qMax ? '#ff4466' : qLen >= qMax * 0.7 ? '#ffaa33' : '';
    setText('ti-in', `${fmtRate(nrm.supply.rate())} パケット/秒`);
    setText('ti-out', `${fmtRate(nrm.consumption.rate())} パケット/秒`);
    const util = nrm.idle.utilization();
    setText('ti-util', `${Math.round(util * 100)}%`);
    const utilEl = $('ti-util');
    if (utilEl) utilEl.style.color = utilColor(util);
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
  currentState = state;
  const $ = (id: string) => document.getElementById(id);

  // 選択が変わったら確認表示をリセット
  if (edgeId !== currentSelectedEdge) {
    const eBtns = $('edge-buttons');
    const eConf = $('edge-confirm');
    if (eBtns) eBtns.style.display = '';
    if (eConf) eConf.style.display = 'none';
  }
  currentSelectedEdge = edgeId;

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
  const erm = getEdgeRollingMetrics(state.rollingMetrics, edge.id);
  setText('ei-in', `${fmtR(erm.supply.rate())} パケット/秒`);
  setText('ei-out', `${fmtR(erm.consumption.rate())} パケット/秒`);
  const eUtil = erm.idle.utilization();
  setText('ei-util', `${Math.round(eUtil * 100)}%`);
  const eiUtilEl = document.getElementById('ei-util');
  if (eiUtilEl) eiUtilEl.style.color = eUtil >= 0.8 ? '#44ff88' : eUtil >= 0.5 ? '#ffaa33' : '#ff4466';

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

  // 2軸スコア
  const scoresEl = document.getElementById('victory-scores');
  if (scoresEl) {
    const color = (v: number) => v >= 80 ? '#44ff88' : v >= 50 ? '#ffaa33' : '#ff4466';
    scoresEl.innerHTML = [
      { label: '可用性', val: axes.availability.value },
      { label: '防御力', val: axes.defense.value },
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
      const utilColor = (u: number) => u >= 0.8 ? '#44ff88' : u >= 0.5 ? '#ffaa33' : '#ff4466';
      cardsEl.innerHTML = result.entityScorecards.map(c => {
        const bg = c.isBottleneck ? 'background:#2a1515;' : '';
        const supPart = c.supplyRate !== '-' ? `供給 ${c.supplyRate} / ` : '';
        const conPart = c.consumptionRate !== '-' ? `消費 ${c.consumptionRate}` : '';
        const uPct = Math.round(c.utilization * 100);
        return `<div class="victory-card" style="${bg}"><span class="vc-label">${c.label}</span><span class="vc-stats">${c.theoretical} | ${supPart}${conPart}</span><span class="vc-loss" style="color:${utilColor(c.utilization)}">稼働 ${uPct}%</span></div>`;
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
