// Core Layer: Input system — Pointer Events integration, gesture detection, action queue

import { Camera } from './camera';

// ── アクション型 ──

export type InputAction =
  | { type: 'tap'; worldX: number; worldY: number }
  | { type: 'drag-start'; worldX: number; worldY: number }
  | { type: 'drag-end'; worldX: number; worldY: number }
  | { type: 'zoom'; centerX: number; centerY: number; delta: number }
  | { type: 'pan'; dx: number; dy: number };

// ── ポインタ情報 ──

interface PointerInfo {
  id: number;
  x: number;
  y: number;
}

// ── 入力マネージャ ──

const TAP_THRESHOLD = 10; // タップ判定の移動閾値（px）
const TAP_TIME_LIMIT = 300; // タップ判定の時間閾値（ms）

export class InputManager {
  private pointers: Map<number, PointerInfo> = new Map();
  private actionQueue: InputAction[] = [];
  private camera: Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // 1本指ドラッグ追跡
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTime = 0;
  private isDragging = false;
  private dragStartEmitted = false;

  // 右クリックパン追跡
  private isRightDrag = false;
  private rightDragPrevX = 0;
  private rightDragPrevY = 0;

  // 2本指ピンチ追跡
  private pinchStartDist: number | null = null;
  private pinchStartZoom = 1;
  private pinchPrevCenter: { x: number; y: number } | null = null;

  // イベントハンドラ参照（detach用）
  private onPointerDown: ((e: PointerEvent) => void) | null = null;
  private onPointerMove: ((e: PointerEvent) => void) | null = null;
  private onPointerUp: ((e: PointerEvent) => void) | null = null;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  private onContextMenu: ((e: Event) => void) | null = null;

  /** clientX/clientYをキャンバスローカル座標に変換（表示サイズ→内部解像度） */
  private toLocal(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.canvas) return { x: clientX, y: clientY };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /** Canvasにイベントリスナーをアタッチ */
  attach(canvas: HTMLCanvasElement, camera: Camera): void {
    this.canvas = canvas;
    this.camera = camera;

    // ブラウザデフォルトジェスチャーを無効化
    canvas.style.touchAction = 'none';

    this.onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
    this.onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    this.onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
    this.onWheel = (e: WheelEvent) => this.handleWheel(e);

    this.onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** イベントリスナーを解除 */
  detach(): void {
    if (!this.canvas) return;
    if (this.onPointerDown) this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    if (this.onPointerMove) this.canvas.removeEventListener('pointermove', this.onPointerMove);
    if (this.onPointerUp) {
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    }
    if (this.onWheel) this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.onContextMenu) this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
    this.camera = null;
  }

  /** フレーム開始時に呼び出し、蓄積されたアクションを消費 */
  consumeActions(): InputAction[] {
    const actions = this.actionQueue;
    this.actionQueue = [];
    return actions;
  }

  /** ドラッグ中の現在ポインタ位置（ワールド座標）を返す。ドラッグ中でなければnull */
  getDragWorldPosition(): { worldX: number; worldY: number } | null {
    if (!this.isDragging || !this.camera || this.pointers.size !== 1) return null;
    const ptr = Array.from(this.pointers.values())[0];
    if (!ptr) return null;
    const world = this.camera.screenToWorld(ptr.x, ptr.y);
    return { worldX: world.x, worldY: world.y };
  }

  // ── 内部ハンドラ ──

  private handlePointerDown(e: PointerEvent): void {
    this.canvas?.setPointerCapture(e.pointerId);
    const local = this.toLocal(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, { id: e.pointerId, x: local.x, y: local.y });

    // 右クリック → カメラパン開始
    if (e.button === 2) {
      this.isRightDrag = true;
      this.rightDragPrevX = local.x;
      this.rightDragPrevY = local.y;
      return;
    }

    if (this.pointers.size === 1) {
      // 1本指: ドラッグ追跡開始
      this.dragStartX = local.x;
      this.dragStartY = local.y;
      this.dragStartTime = Date.now();
      this.isDragging = false;
      this.dragStartEmitted = false;
    } else if (this.pointers.size === 2) {
      // 2本指: ピンチ追跡開始
      this.initPinch();
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    const local = this.toLocal(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, { id: e.pointerId, x: local.x, y: local.y });

    // 右クリックパン
    if (this.isRightDrag) {
      const dx = local.x - this.rightDragPrevX;
      const dy = local.y - this.rightDragPrevY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.actionQueue.push({ type: 'pan', dx, dy });
      }
      this.rightDragPrevX = local.x;
      this.rightDragPrevY = local.y;
      return;
    }

    if (this.pointers.size === 1) {
      // 1本指移動 → ドラッグ判定
      const dx = local.x - this.dragStartX;
      const dy = local.y - this.dragStartY;
      if (!this.isDragging && (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD)) {
        this.isDragging = true;
        // ドラッグ開始 — 押し始め位置をワールド座標で通知
        if (!this.dragStartEmitted && this.camera) {
          this.dragStartEmitted = true;
          const startWorld = this.camera.screenToWorld(this.dragStartX, this.dragStartY);
          this.actionQueue.push({ type: 'drag-start', worldX: startWorld.x, worldY: startWorld.y });
        }
      }
    } else if (this.pointers.size === 2 && this.camera) {
      // 2本指 → ピンチズーム + パン
      this.handlePinchMove();
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    this.canvas?.releasePointerCapture(e.pointerId);

    // 右クリックパン終了
    if (this.isRightDrag && e.button === 2) {
      this.isRightDrag = false;
      this.pointers.delete(e.pointerId);
      return;
    }

    if (this.pointers.size === 1 && this.pointers.has(e.pointerId)) {
      // 1本指リリース
      const local = this.toLocal(e.clientX, e.clientY);
      if (this.isDragging && this.camera) {
        // ドラッグ終了 — リリース位置をワールド座標で通知
        const world = this.camera.screenToWorld(local.x, local.y);
        this.actionQueue.push({ type: 'drag-end', worldX: world.x, worldY: world.y });
      } else {
        const elapsed = Date.now() - this.dragStartTime;
        if (elapsed < TAP_TIME_LIMIT && this.camera) {
          // タップ — キャンバスローカル座標からワールド座標へ
          const world = this.camera.screenToWorld(local.x, local.y);
          this.actionQueue.push({ type: 'tap', worldX: world.x, worldY: world.y });
        }
      }
    }

    this.pointers.delete(e.pointerId);

    // ピンチ状態リセット
    if (this.pointers.size < 2) {
      this.pinchStartDist = null;
      this.pinchPrevCenter = null;
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const local = this.toLocal(e.clientX, e.clientY);
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.actionQueue.push({
      type: 'zoom',
      centerX: local.x,
      centerY: local.y,
      delta,
    });
  }

  // ── ピンチヘルパー ──

  private initPinch(): void {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return;
    this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    this.pinchStartZoom = this.camera?.state.zoom ?? 1;
    this.pinchPrevCenter = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  private handlePinchMove(): void {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2 || this.pinchStartDist === null || !this.camera) return;

    const currentDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const center = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };

    // ズーム
    const scale = currentDist / this.pinchStartDist;
    const targetZoom = this.pinchStartZoom * scale;
    const delta = (targetZoom - this.camera.state.zoom) / this.camera.state.zoom;
    if (Math.abs(delta) > 0.001) {
      this.actionQueue.push({
        type: 'zoom',
        centerX: center.x,
        centerY: center.y,
        delta,
      });
    }

    // パン
    if (this.pinchPrevCenter) {
      const dx = center.x - this.pinchPrevCenter.x;
      const dy = center.y - this.pinchPrevCenter.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.actionQueue.push({ type: 'pan', dx, dy });
      }
    }

    this.pinchPrevCenter = center;
  }
}
