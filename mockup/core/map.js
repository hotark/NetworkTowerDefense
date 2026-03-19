// map.js — ステージデータ（S字パス + スポット + スポーン/拠点）

import { CANVAS_W, CANVAS_H } from './config.js';

// S字パス: 3往路
// 横 y=100, 縦 x=700(下降), 横 y=350, 縦 x=200(下降), 横 y=600
export const PATH = [
  { x: 0,   y: 100 },
  { x: 700, y: 100 },
  { x: 700, y: 350 },
  { x: 200, y: 350 },
  { x: 200, y: 600 },
  { x: 900, y: 600 },
];

export const SPAWN_POS = { x: 0, y: 100 };
export const BASE_POS  = { x: 870, y: 600 };

// パス道幅=28px → 中心から±14px
// スポットはパスから最低50px離す
//
// 縦パス x=700 (y=100-350) → スポットは x≤640 or x≥760
// 縦パス x=200 (y=350-600) → スポットは x≤140 or x≥260
// 横パス y=100 → スポットは y≤45 or y≥155
// 横パス y=350 → スポットは y≤295 or y≥405
// 横パス y=600 → スポットは y≤545 or y≥655

function generateSpots() {
  const spots = [];
  let id = 0;

  // ====== 上段エリア: y=100 の上 ======
  // y=40, x は自由（横パスy=100から60px離れ）
  for (const x of [100, 230, 360, 490, 620]) {
    spots.push({ id: id++, x, y: 40 });
  }

  // ====== 中上段エリア: y=100〜350 の間 ======
  // 安全y: 160〜290
  // 安全x: ≤640（縦パスx=700を避ける）、右端は x≥770
  // 左側メイングリッド
  for (const x of [100, 230, 360, 490, 620]) {
    spots.push({ id: id++, x, y: 165 });
  }
  for (const x of [100, 230, 360, 490, 620]) {
    spots.push({ id: id++, x, y: 225 });
  }
  for (const x of [100, 230, 360, 490, 620]) {
    spots.push({ id: id++, x, y: 285 });
  }
  // 右端（x=700の右側）
  for (const y of [165, 225, 285]) {
    spots.push({ id: id++, x: 790, y });
  }

  // ====== 中下段エリア: y=350〜600 の間 ======
  // 安全y: 410〜540
  // 安全x: ≥260（縦パスx=200を避ける）、左端は x≤130
  // 右側メイングリッド
  for (const x of [280, 400, 520, 640, 770]) {
    spots.push({ id: id++, x, y: 410 });
  }
  for (const x of [280, 400, 520, 640, 770]) {
    spots.push({ id: id++, x, y: 475 });
  }
  for (const x of [280, 400, 520, 640, 770]) {
    spots.push({ id: id++, x, y: 540 });
  }
  // 左端（x=200の左側）
  for (const y of [410, 475, 540]) {
    spots.push({ id: id++, x: 100, y });
  }

  // ====== 下段エリア: y=600 の下 ======
  // y=660, x は ≥260（縦パスx=200を避ける）
  for (const x of [280, 400, 520, 640, 770]) {
    spots.push({ id: id++, x, y: 660 });
  }

  return spots;
}

export const SPOTS = generateSpots();

// バリデーション
function validateSpots() {
  function pointToSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  let warnCount = 0;
  for (const s of SPOTS) {
    let minPathDist = Infinity;
    for (let i = 0; i < PATH.length - 1; i++) {
      const d = pointToSegDist(s.x, s.y, PATH[i].x, PATH[i].y, PATH[i+1].x, PATH[i+1].y);
      minPathDist = Math.min(minPathDist, d);
    }
    if (minPathDist < 45) {
      console.warn(`スポット ${s.id} (${s.x},${s.y}) パスに近すぎ: ${minPathDist.toFixed(1)}px`);
      warnCount++;
    }
  }
  for (let i = 0; i < SPOTS.length; i++) {
    for (let j = i + 1; j < SPOTS.length; j++) {
      const d = Math.hypot(SPOTS[i].x - SPOTS[j].x, SPOTS[i].y - SPOTS[j].y);
      if (d < 55) {
        console.warn(`スポット ${SPOTS[i].id} & ${SPOTS[j].id} 近接: ${d.toFixed(1)}px`);
        warnCount++;
      }
    }
  }
  console.log(`スポット数: ${SPOTS.length}、警告: ${warnCount}`);
}
validateSpots();
