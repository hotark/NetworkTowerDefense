// Core Layer: Camera system — zoom/pan state, screen↔world coordinate transform

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  viewportWidth: number;
  viewportHeight: number;
}

export class Camera {
  state: CameraState;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.state = {
      x: 0,
      y: 0,
      zoom: 1,
      minZoom: 0.25,
      maxZoom: 4,
      viewportWidth,
      viewportHeight,
    };
  }

  /** スクリーン座標 → ワールド座標 */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.state.x) / this.state.zoom,
      y: (sy - this.state.y) / this.state.zoom,
    };
  }

  /** ワールド座標 → スクリーン座標 */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.state.zoom + this.state.x,
      y: wy * this.state.zoom + this.state.y,
    };
  }

  /** Canvas 2DコンテキストにカメラのsetTransformを適用 */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.state.zoom, 0,
      0, this.state.zoom,
      this.state.x, this.state.y,
    );
  }

  /** Canvas 2Dコンテキストの変換をリセット */
  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** 指定スクリーン座標を中心にズーム（マウスホイール / ピンチ） */
  zoomAt(screenX: number, screenY: number, delta: number): void {
    const oldZoom = this.state.zoom;
    const newZoom = Math.max(
      this.state.minZoom,
      Math.min(this.state.maxZoom, oldZoom * (1 + delta)),
    );
    // ズーム中心点のワールド座標を保持するようにオフセットを調整
    this.state.x = screenX - (screenX - this.state.x) * (newZoom / oldZoom);
    this.state.y = screenY - (screenY - this.state.y) * (newZoom / oldZoom);
    this.state.zoom = newZoom;
  }

  /** カメラをパン（スクリーン座標のdx, dy） */
  pan(dx: number, dy: number): void {
    this.state.x += dx;
    this.state.y += dy;
  }

  /** ビューポートリサイズ対応 */
  resize(width: number, height: number): void {
    this.state.viewportWidth = width;
    this.state.viewportHeight = height;
  }
}
