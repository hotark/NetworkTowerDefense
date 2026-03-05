// Browser Layer: Game loop integration (Presenter)

import type { NodeId, EdgeId } from '@core/types';
import type { GameConfig } from '@core/config';
import { stage1 } from '@core/stages';
import { createGameState, resetIdCounter } from '@core/state';
import type { GameState } from '@core/state';
import { Camera } from '@core/camera';
import { InputManager } from './input';
import { resetBaseCooldown } from '@game/combat';
import { createWaveRuntime, startWave, checkGameEnd } from '@game/wave';
import type { WaveRuntime } from '@game/wave';
import { purchase, refund, canAfford } from '@game/economy';
import { createSimulationFlow } from '@game/domain-ticks';
import type { GameFlow } from '@game/game-flow';
import {
  render, loadAllAssets,
  hitTestNode, hitTestEmptySlot, hitTestEdge,
} from './renderer';
import type { UIState, AssetMap } from './renderer';

import {
  createHUD, syncHUD,
  updateTowerPanel, updateEdgePanel,
  selectNodeUI, selectEdgeUI, deselectUI,
  showMainMenu, hideMainMenu,
  showVictoryScorecard,
} from '@browser/hud';
import type { HUDSignals, HUDCallback } from '@browser/hud';
import {
  calculateScores,
  shouldUpdateDisplay, resetDisplayTimer,
} from '@game/scoring';
import type { TwoAxisScores } from '@game/scoring';

// ── GameApp ──

export class GameApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private stage = stage1;
  private camera: Camera;
  private input: InputManager;
  private assets: AssetMap = new Map();
  private state!: GameState;
  private waveRuntime!: WaveRuntime;
  private signals!: HUDSignals;

  private ui: UIState = {
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedTool: 'generator',
    hoveredNodeId: null,
    dragPreview: null,
  };

  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private inMenu = true;
  private rafId = 0;

  // ドラッグ（エッジ作成）トラッキング
  private dragFromNodeId: NodeId | null = null;

  // 修理トラッキング
  private repairingNodes = new Set<NodeId>();
  private repairingEdges = new Set<EdgeId>();
  private baseRepairing = false;

  // スコア
  private latestScores: TwoAxisScores | null = null;

  // シミュレーションフロー
  private gameFlow!: GameFlow;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    this.camera = new Camera(800, 600);
    this.input = new InputManager();

    // 初回リサイズ（DOMレイアウト確定後に実行）
    requestAnimationFrame(() => this.resize());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.handleDeselect();
    });

    // VisibilityChange → ポーズ
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.running = false;
      } else if (!this.inMenu && this.state?.gameResult === 'playing') {
        this.running = true;
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.scheduleLoop();
      }
    });
  }

  async start(): Promise<void> {
    this.assets = await loadAllAssets();
    this.initState();

    this.signals = createHUD(this.config, (cb) => this.handleHUD(cb));

    this.input.attach(this.canvas, this.camera);

    showMainMenu();
    this.inMenu = true;
    this.running = false;

    // メニュー画面もレンダリング
    this.scheduleLoop();
  }

  // ── 状態初期化 ──

  private initState(): void {
    resetIdCounter();
    resetBaseCooldown();
    this.state = createGameState(this.config);
    this.waveRuntime = createWaveRuntime(this.config);
    this.gameFlow = createSimulationFlow(this.stage, this.waveRuntime);
    this.ui.selectedNodeId = null;
    this.ui.selectedEdgeId = null;
    this.ui.dragPreview = null;
    this.repairingNodes.clear();
    this.repairingEdges.clear();
    this.baseRepairing = false;
    this.latestScores = null;
    resetDisplayTimer();
  }

  // ── リサイズ ──

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width) || 800;
    const h = Math.round(rect.height) || 600;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.resize(w, h);
  }

  /** カメラをマップ中心に配置（マップ全体が見えるようにズーム調整） */
  private centerCamera(): void {
    // マップ範囲: x=0..800, y=-30..600
    const mapW = 800;
    const mapH = 630;
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    const zoom = Math.min(vw / mapW, vh / mapH) * 0.9;
    this.camera.state.zoom = Math.max(this.camera.state.minZoom, Math.min(this.camera.state.maxZoom, zoom));
    this.camera.state.x = (vw - mapW * this.camera.state.zoom) / 2;
    this.camera.state.y = (vh - mapH * this.camera.state.zoom) / 2 + 30 * this.camera.state.zoom;
  }

  // ── HUDコールバック処理 ──

  private handleHUD(cb: HUDCallback): void {
    switch (cb.type) {
      case 'start-game':
        hideMainMenu();
        this.initState();
        this.centerCamera();
        this.inMenu = false;
        this.running = true;
        this.lastTime = performance.now();
        this.accumulator = 0;
        break;

      case 'restart':
        this.initState();
        deselectUI();
        showMainMenu();
        this.inMenu = true;
        this.running = false;
        break;

      case 'start-wave':
        this.handleStartWave();
        break;

      case 'select-tool':
        this.ui.selectedTool = cb.tool;
        break;

      case 'upgrade-tower':
        this.handleUpgradeTower(cb.nodeId);
        break;

      case 'destroy-tower':
        this.handleDestroyTower(cb.nodeId);
        break;

      case 'toggle-tower':
        this.handleToggleTower(cb.nodeId);
        break;

      case 'repair-tower':
        this.handleRepairTower(cb.nodeId);
        break;

      case 'upgrade-edge':
        this.handleUpgradeEdge(cb.edgeId);
        break;

      case 'destroy-edge':
        this.handleDestroyEdge(cb.edgeId);
        break;

      case 'reverse-edge':
        this.handleReverseEdge(cb.edgeId);
        break;

      case 'toggle-edge':
        this.handleToggleEdge(cb.edgeId);
        break;

      case 'repair-edge':
        this.handleRepairEdge(cb.edgeId);
        break;

      case 'base-heal':
        this.baseRepairing = !this.baseRepairing;
        break;

      case 'deselect':
        this.handleDeselect();
        break;
    }
  }

  // ── プレイヤーアクション ──

  private handleStartWave(): void {
    if (this.state.gameResult !== 'playing') return;
    if (this.waveRuntime.nextWaveDelay > 0) return;
    if (this.state.waveIndex >= this.config.waveDefs.length) return;

    const bonus = Math.floor(this.waveRuntime.waveCountdown * this.config.SKIP_BONUS_PER_SEC);
    this.state.resources += bonus;
    this.waveRuntime.waveCountdown = 0;
    startWave(this.state, this.config, this.stage, this.waveRuntime);
  }

  private handleUpgradeTower(nodeId: NodeId): void {
    const node = this.state.nodes.get(nodeId);
    if (!node || node.status !== 'active' || node.level >= this.config.MAX_LEVEL) return;
    purchase(this.state, this.config, { type: 'upgrade-tower', nodeId });
    this.refreshTowerPanel();
  }

  private handleDestroyTower(nodeId: NodeId): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;
    refund(this.state, this.config, nodeId);
    this.repairingNodes.delete(nodeId);
    this.handleDeselect();
  }

  private handleToggleTower(nodeId: NodeId): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;
    if (node.status === 'active') {
      node.status = 'disabled';
      node.disableTimer = 0;
    } else if (node.status === 'disabled' && node.disableTimer <= 0) {
      node.status = 'active';
    }
    this.refreshTowerPanel();
  }

  private handleRepairTower(nodeId: NodeId): void {
    if (this.repairingNodes.has(nodeId)) {
      this.repairingNodes.delete(nodeId);
    } else {
      this.repairingNodes.add(nodeId);
    }
    this.refreshTowerPanel();
  }

  private handleUpgradeEdge(edgeId: EdgeId): void {
    const edge = this.state.edges.get(edgeId);
    if (!edge || edge.status !== 'active' || edge.level >= this.config.MAX_LEVEL) return;
    // エッジ上のパケット消去
    for (const [pid, pkt] of this.state.packets) {
      if (pkt.edgeId === edgeId) this.state.packets.delete(pid);
    }
    purchase(this.state, this.config, { type: 'upgrade-edge', edgeId });
    this.refreshEdgePanel();
  }

  private handleDestroyEdge(edgeId: EdgeId): void {
    const edge = this.state.edges.get(edgeId);
    if (!edge) return;
    const refundAmount = Math.round(this.config.edgeCost * 0.5);
    // パケット消去
    for (const [pid, pkt] of this.state.packets) {
      if (pkt.edgeId === edgeId) this.state.packets.delete(pid);
    }
    this.state.edges.delete(edgeId);
    this.state.resources += refundAmount;
    this.repairingEdges.delete(edgeId);
    this.handleDeselect();
  }

  private handleReverseEdge(edgeId: EdgeId): void {
    const edge = this.state.edges.get(edgeId);
    if (!edge) return;
    // パケット消去
    for (const [pid, pkt] of this.state.packets) {
      if (pkt.edgeId === edgeId) this.state.packets.delete(pid);
    }
    const tmp = edge.from;
    edge.from = edge.to;
    edge.to = tmp;
    this.refreshEdgePanel();
  }

  private handleToggleEdge(edgeId: EdgeId): void {
    const edge = this.state.edges.get(edgeId);
    if (!edge) return;
    if (edge.status === 'active') {
      edge.status = 'disabled';
      edge.disableTimer = 0;
    } else if (edge.status === 'disabled' && edge.disableTimer <= 0) {
      edge.status = 'active';
    }
    this.refreshEdgePanel();
  }

  private handleRepairEdge(edgeId: EdgeId): void {
    if (this.repairingEdges.has(edgeId)) {
      this.repairingEdges.delete(edgeId);
    } else {
      this.repairingEdges.add(edgeId);
    }
    this.refreshEdgePanel();
  }

  private handleDeselect(): void {
    this.ui.selectedNodeId = null;
    this.ui.selectedEdgeId = null;
    deselectUI();
  }

  private refreshTowerPanel(): void {
    updateTowerPanel(this.state, this.config, this.ui.selectedNodeId);
  }

  private refreshEdgePanel(): void {
    updateEdgePanel(this.state, this.config, this.ui.selectedEdgeId);
  }

  // ── 入力処理 ──

  private processInput(): void {
    const actions = this.input.consumeActions();
    for (const action of actions) {
      switch (action.type) {
        case 'zoom':
          this.camera.zoomAt(action.centerX, action.centerY, action.delta);
          break;

        case 'pan':
          this.camera.pan(action.dx, action.dy);
          break;

        case 'tap':
          this.handleTap(action.worldX, action.worldY);
          break;

        case 'drag-start':
          this.handleDragStart(action.worldX, action.worldY);
          break;

        case 'drag-end':
          this.handleDragEnd(action.worldX, action.worldY);
          break;
      }
    }

    // ドラッグ中のプレビュー更新
    if (this.dragFromNodeId) {
      const dragPos = this.input.getDragWorldPosition();
      if (dragPos) {
        this.ui.dragPreview = { fromId: this.dragFromNodeId, toX: dragPos.worldX, toY: dragPos.worldY };
      }
    }
  }

  private handleTap(worldX: number, worldY: number): void {
    if (this.state.gameResult !== 'playing') return;

    // ノードヒットテスト
    const nodeHit = hitTestNode(this.state, this.config, worldX, worldY);
    if (nodeHit) {
      this.selectNode(nodeHit);
      return;
    }

    // 空きスロットヒットテスト
    const slotHit = hitTestEmptySlot(this.state, this.config, worldX, worldY);
    if (slotHit) {
      this.placeTower(slotHit.x, slotHit.y);
      return;
    }

    // エッジヒットテスト
    const edgeHit = hitTestEdge(this.state, worldX, worldY);
    if (edgeHit) {
      this.selectEdge(edgeHit);
      return;
    }

    // 何もヒットしなかった
    this.handleDeselect();
  }

  private selectNode(nodeId: NodeId): void {
    if (this.ui.selectedNodeId === nodeId) {
      this.handleDeselect();
      return;
    }
    this.ui.selectedNodeId = nodeId;
    this.ui.selectedEdgeId = null;
    updateTowerPanel(this.state, this.config, nodeId);
    updateEdgePanel(this.state, this.config, null);
    selectNodeUI();
  }

  private selectEdge(edgeId: EdgeId): void {
    if (this.ui.selectedEdgeId === edgeId) {
      this.handleDeselect();
      return;
    }
    this.ui.selectedEdgeId = edgeId;
    this.ui.selectedNodeId = null;
    updateEdgePanel(this.state, this.config, edgeId);
    updateTowerPanel(this.state, this.config, null);
    selectEdgeUI();
  }

  private handleDragStart(worldX: number, worldY: number): void {
    if (this.state.gameResult !== 'playing') return;
    const nodeHit = hitTestNode(this.state, this.config, worldX, worldY);
    if (nodeHit) {
      this.dragFromNodeId = nodeHit;
    }
  }

  private handleDragEnd(worldX: number, worldY: number): void {
    const fromId = this.dragFromNodeId;
    this.dragFromNodeId = null;
    this.ui.dragPreview = null;

    if (!fromId || this.state.gameResult !== 'playing') return;

    const targetNode = hitTestNode(this.state, this.config, worldX, worldY);
    if (targetNode && targetNode !== fromId) {
      purchase(this.state, this.config, { type: 'create-edge', from: fromId, to: targetNode });
    }
  }

  private placeTower(x: number, y: number): void {
    const tool = this.ui.selectedTool;
    const action = { type: 'place-tower' as const, nodeType: tool, x, y };
    if (!canAfford(this.state, this.config, action)) return;
    purchase(this.state, this.config, action);
  }

  // ── ゲーム更新 ──

  private update(dt: number): void {
    if (this.state.gameResult !== 'playing') return;

    // シミュレーション（GameFlow経由でCoreサービスを順次実行）
    this.gameFlow.tick(this.state, this.config, dt);

    // 修理処理（Browser層固有状態を使用）
    this.processRepairs(dt);

    // 終了判定（UI副作用あり）
    const result = checkGameEnd(this.state, this.stage, this.waveRuntime);
    if (result !== 'playing') {
      this.state.gameResult = result;
      if (result === 'victory') {
        showVictoryScorecard(this.state, this.config);
      }
    }

    // スコア表示更新
    if (shouldUpdateDisplay(this.state.simTime)) {
      this.latestScores = calculateScores(this.state, this.config);
    }
  }

  private processRepairs(dt: number): void {
    const healTower = this.config.REPAIR_RATE_TOWER * dt;
    const healEdge = this.config.REPAIR_RATE_EDGE * dt;

    for (const nodeId of this.repairingNodes) {
      const node = this.state.nodes.get(nodeId);
      if (!node || node.hp >= node.maxHp) {
        this.repairingNodes.delete(nodeId);
        continue;
      }
      const canHeal = Math.min(healTower, node.maxHp - node.hp);
      const cost = canHeal * this.config.REPAIR_COST_PER_HP_TOWER;
      if (this.state.resources < cost) continue;
      this.state.resources -= cost;
      node.hp = Math.min(node.maxHp, node.hp + canHeal);
      if (node.hp >= node.maxHp) this.repairingNodes.delete(nodeId);
    }

    for (const edgeId of this.repairingEdges) {
      const edge = this.state.edges.get(edgeId);
      if (!edge || edge.hp >= edge.maxHp) {
        this.repairingEdges.delete(edgeId);
        continue;
      }
      const canHeal = Math.min(healEdge, edge.maxHp - edge.hp);
      const cost = canHeal * this.config.REPAIR_COST_PER_HP_EDGE;
      if (this.state.resources < cost) continue;
      this.state.resources -= cost;
      edge.hp = Math.min(edge.maxHp, edge.hp + canHeal);
      if (edge.hp >= edge.maxHp) this.repairingEdges.delete(edgeId);
    }

    if (this.baseRepairing && this.state.baseHp < this.config.BASE_HP) {
      const canHeal = Math.min(healTower, this.config.BASE_HP - this.state.baseHp);
      const cost = canHeal * this.config.BASE_HEAL_COST / this.config.BASE_HEAL_AMOUNT;
      if (this.state.resources >= cost) {
        this.state.resources -= cost;
        this.state.baseHp = Math.min(this.config.BASE_HP, this.state.baseHp + canHeal);
        if (this.state.baseHp >= this.config.BASE_HP) this.baseRepairing = false;
      }
    }
  }

  // ── ゲームループ ──

  private scheduleLoop(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private loop(now: number): void {
    this.rafId = 0;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.running && !this.inMenu) {
      // 入力処理
      this.processInput();

      // 固定タイムステップ
      this.accumulator += dt;
      const fixedDt = this.config.FIXED_DT;
      while (this.accumulator >= fixedDt) {
        this.update(fixedDt);
        this.accumulator -= fixedDt;
      }

      // HUD同期
      const skipBonus = Math.floor(this.waveRuntime.waveCountdown * this.config.SKIP_BONUS_PER_SEC);
      syncHUD(
        this.signals, this.state,
        this.waveRuntime.waveCountdown,
        this.waveRuntime.nextWaveDelay,
        skipBonus,
        this.latestScores,
      );

      // 選択パネルリアルタイム更新
      if (this.ui.selectedNodeId) {
        updateTowerPanel(this.state, this.config, this.ui.selectedNodeId);
      }
      if (this.ui.selectedEdgeId) {
        updateEdgePanel(this.state, this.config, this.ui.selectedEdgeId);
      }
    } else {
      // メニュー画面でも入力を消費（蓄積防止）
      this.input.consumeActions();
    }

    // 描画（常時）
    render(this.ctx, this.state, this.config, this.camera, this.ui, this.assets);

    // 次フレーム
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }
}
