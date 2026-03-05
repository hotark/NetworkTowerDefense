// Browser Layer: Core Camera状態をCanvas2D contextに適用するバインディング

import type { CameraState } from '@core/camera';

export function applyTransform(ctx: CanvasRenderingContext2D, cam: CameraState): void {
  ctx.setTransform(
    cam.zoom, 0,
    0, cam.zoom,
    cam.x, cam.y,
  );
}

export function resetTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
