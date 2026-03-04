// Entry point: Bootstrap GameApp

import { GAME_CONFIG } from '@core/config';
import { GameApp } from '@browser/game-app';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const app = new GameApp(canvas, GAME_CONFIG);
app.start().catch(console.error);
