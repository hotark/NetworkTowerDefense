// main.js — ゲームループ（固定timestep 1/60）

import { FIXED_DT } from './core/config.js';
import { GameState } from './core/state.js';
import { Renderer } from './render/renderer.js';
import { InputHandler } from './input/inputHandler.js';

const canvas = document.getElementById('game-canvas');
const panelEl = document.getElementById('panel');
const state = new GameState();
const renderer = new Renderer(canvas);
const input = new InputHandler(canvas, panelEl, state);

let lastTime = 0;
let accumulator = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // cap to 100ms
  lastTime = timestamp;
  accumulator += dt;

  while (accumulator >= FIXED_DT) {
    state.tick(FIXED_DT);
    state.cleanup();
    accumulator -= FIXED_DT;
  }

  renderer.render(state, input.getVisualState());
  input.updateStatusBar();

  requestAnimationFrame(loop);
}

requestAnimationFrame((ts) => {
  lastTime = ts;
  requestAnimationFrame(loop);
});
