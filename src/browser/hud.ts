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
import { chargeOnEdge } from '@game/network';

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
  for (const row of ['ti-row-range', 'ti-row-dmg', 'ti-row-cd', 'ti-row-interval', 'ti-row-hold', 'ti-row-rate', 'ti-row-stock', 'ti-row-ammo-cost']) {
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

export function showMainMenu(): void {
  const el = document.getElementById('main-menu');
  if (el) el.style.display = 'flex';
}

export function hideMainMenu(): void {
  const el = document.getElementById('main-menu');
  if (el) el.style.display = 'none';
}
