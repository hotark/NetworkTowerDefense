import { describe, it, expect } from 'vitest';
import { Camera } from './camera';

describe('Camera（純粋数学）', () => {
  function createCamera(): Camera {
    return new Camera(800, 600);
  }

  describe('screenToWorld', () => {
    it('zoom=1, offset=0ではスクリーン座標とワールド座標が一致', () => {
      const cam = createCamera();
      const w = cam.screenToWorld(100, 200);
      expect(w.x).toBe(100);
      expect(w.y).toBe(200);
    });

    it('zoom=2ではスクリーン座標が半分のワールド座標になる', () => {
      const cam = createCamera();
      cam.state.zoom = 2;
      const w = cam.screenToWorld(200, 400);
      expect(w.x).toBe(100);
      expect(w.y).toBe(200);
    });

    it('パンオフセットが反映される', () => {
      const cam = createCamera();
      cam.state.x = 50;
      cam.state.y = 100;
      const w = cam.screenToWorld(150, 300);
      expect(w.x).toBe(100);
      expect(w.y).toBe(200);
    });
  });

  describe('worldToScreen', () => {
    it('screenToWorldの逆変換', () => {
      const cam = createCamera();
      cam.state.zoom = 1.5;
      cam.state.x = 30;
      cam.state.y = 60;
      const w = cam.screenToWorld(300, 450);
      const s = cam.worldToScreen(w.x, w.y);
      expect(s.x).toBeCloseTo(300);
      expect(s.y).toBeCloseTo(450);
    });
  });

  describe('zoomAt', () => {
    it('ズーム範囲内で倍率が変わる', () => {
      const cam = createCamera();
      const oldZoom = cam.state.zoom;
      cam.zoomAt(400, 300, 0.1);
      expect(cam.state.zoom).toBeGreaterThan(oldZoom);
    });

    it('最大ズームを超えない', () => {
      const cam = createCamera();
      cam.state.zoom = cam.state.maxZoom;
      cam.zoomAt(400, 300, 1.0);
      expect(cam.state.zoom).toBe(cam.state.maxZoom);
    });

    it('最小ズームを下回らない', () => {
      const cam = createCamera();
      cam.state.zoom = cam.state.minZoom;
      cam.zoomAt(400, 300, -10.0);
      expect(cam.state.zoom).toBe(cam.state.minZoom);
    });
  });

  describe('pan', () => {
    it('オフセットが加算される', () => {
      const cam = createCamera();
      cam.pan(10, 20);
      expect(cam.state.x).toBe(10);
      expect(cam.state.y).toBe(20);
    });
  });

  describe('resize', () => {
    it('ビューポートサイズが更新される', () => {
      const cam = createCamera();
      cam.resize(1920, 1080);
      expect(cam.state.viewportWidth).toBe(1920);
      expect(cam.state.viewportHeight).toBe(1080);
    });
  });

  it('applyTransform/resetTransformはCameraに存在しない', () => {
    const cam = createCamera();
    expect((cam as any).applyTransform).toBeUndefined();
    expect((cam as any).resetTransform).toBeUndefined();
  });
});
