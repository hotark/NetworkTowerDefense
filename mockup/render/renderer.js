// renderer.js — Canvas描画

import {
  CANVAS_W, CANVAS_H, SPOT_RADIUS, TOWER_DRAW_SIZE, ENEMY_DRAW_SIZE,
  TOWER_TYPES, EDGE_DEF, ENEMY_TYPES, UPGRADE_TIMES,
} from '../core/config.js';
import { PATH, SPOTS, BASE_POS, SPAWN_POS } from '../core/map.js';

// SVG画像キャッシュ
const imageCache = {};

function loadSVG(path) {
  if (imageCache[path]) return imageCache[path];
  const img = new Image();
  img.src = path;
  imageCache[path] = img;
  return img;
}

// 全SVGプリロード
const TOWER_SVG_PATHS = {};
for (const type of Object.keys(TOWER_TYPES)) {
  TOWER_SVG_PATHS[type] = `assets/towers/${type}.svg`;
  loadSVG(TOWER_SVG_PATHS[type]);
}
// 拠点SVG
const BASE_SVG = loadSVG('assets/towers/base.svg');

const ENEMY_SVG_PATHS = {
  normal: 'assets/enemies/normal.svg',
  fast: 'assets/enemies/fast.svg',
  tank: 'assets/enemies/tank.svg',
  saboteur: 'assets/enemies/healer.svg',
  raider: 'assets/enemies/raider.svg',
};
for (const path of Object.values(ENEMY_SVG_PATHS)) {
  loadSVG(path);
}

const NODE_RADIUS = 20;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }

  render(state, visual) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 背景（草原系・明るめ）
    ctx.fillStyle = '#2a4a30';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.drawPath(ctx);
    this.drawSpots(ctx, state, visual);
    this.drawBase(ctx, state);
    this.drawEdges(ctx, state, visual);
    this.drawPackets(ctx, state);
    this.drawTowers(ctx, state, visual);
    this.drawEnemies(ctx, state);
    this.drawBullets(ctx, state);
    this.drawEffects(ctx, state);
    this.drawDragPreview(ctx, state, visual);
    this.drawConnectRange(ctx, state, visual);
    this.drawUpgradeRangePreview(ctx, state, visual);
  }

  /** グリッド背景（ref準拠） */
  drawGrid(ctx) {
    ctx.strokeStyle = '#335540';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
  }

  drawPath(ctx) {
    // 道路（明るい土色）
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
      ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();

    // パス中央線（ref準拠: 色 #252a3a, dash [8, 12]）
    ctx.strokeStyle = '#6b5540';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
      ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 拠点描画（ref準拠: SVGスプライト + グロー + HPバー） */
  drawBase(ctx, state) {
    const bx = BASE_POS.x, by = BASE_POS.y;
    const R = NODE_RADIUS;

    // グロー
    ctx.fillStyle = '#4488ff55';
    ctx.beginPath(); ctx.arc(bx, by, R + 8, 0, Math.PI * 2); ctx.fill();

    // SVGスプライト or フォールバック
    if (BASE_SVG && BASE_SVG.complete && BASE_SVG.naturalWidth > 0) {
      const sz = R * 2.2;
      ctx.drawImage(BASE_SVG, bx - sz / 2, by - sz / 2, sz, sz);
    } else {
      ctx.fillStyle = '#1a3366';
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('BASE', bx, by);
      ctx.textBaseline = 'alphabetic';
    }

    // HPバー
    if (state.baseHp < state.maxBaseHp) {
      const hpRatio = state.baseHp / state.maxBaseHp;
      const barW = 30;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx - barW / 2, by + R + 2, barW, 4);
      ctx.fillStyle = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ccaa00' : '#cc2200';
      ctx.fillRect(bx - barW / 2, by + R + 2, barW * hpRatio, 4);
    }
  }

  /** 空きスロット描画（ref準拠: #222840 点線円） */
  drawSpots(ctx, state, visual) {
    const R = NODE_RADIUS;
    const toolSelected = !!visual.selectedTool;
    for (const spot of SPOTS) {
      if (state.getTowerAtSpot(spot.id)) continue;
      if (toolSelected) {
        const hovered = visual.hoverX >= 0 && Math.hypot(spot.x - visual.hoverX, spot.y - visual.hoverY) < R + 5;
        // ツール選択中: 配置可能スポットをハイライト
        ctx.fillStyle = hovered ? 'rgba(68,255,136,0.3)' : 'rgba(68,255,136,0.15)';
        ctx.beginPath(); ctx.arc(spot.x, spot.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hovered ? 'rgba(68,255,136,1.0)' : 'rgba(68,255,136,0.7)';
        ctx.lineWidth = hovered ? 2.5 : 2;
        ctx.stroke();
        // ホバー中の攻撃タワーなら射程範囲を表示
        if (hovered) {
          const toolDef = TOWER_TYPES[visual.selectedTool];
          if (toolDef && toolDef.category === 'attack') {
            const range = toolDef.levels[0].range;
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, range, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,100,80,0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,100,80,0.06)';
            ctx.fill();
          }
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath(); ctx.arc(spot.x, spot.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(200,220,180,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /**
   * エッジの視覚的重なりを検出してオフセットを計算。
   * 実際にパスが重なるエッジ同士だけオフセットする。
   */
  _calcEdgeOffsets(state) {
    const offsets = {};
    const active = state.edges.filter(e => !e.destroyed);

    // 各エッジの始点終点を取得
    const edgeData = [];
    for (const edge of active) {
      const from = state.getTower(edge.fromTowerId);
      const to = state.getTower(edge.toTowerId);
      if (!from || !to) continue;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      edgeData.push({ edge, fx: from.x, fy: from.y, tx: to.x, ty: to.y, angle });
      offsets[edge.id] = 0;
    }

    // 重なりグループを検出
    const visited = new Set();
    for (let i = 0; i < edgeData.length; i++) {
      if (visited.has(i)) continue;
      const group = [i];
      const a = edgeData[i];

      for (let j = i + 1; j < edgeData.length; j++) {
        if (visited.has(j)) continue;
        const b = edgeData[j];

        // 角度が近いか（同方向 or 逆方向）
        let angleDiff = Math.abs(a.angle - b.angle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        const parallel = angleDiff < 0.2 || Math.abs(angleDiff - Math.PI) < 0.2;
        if (!parallel) continue;

        // 線分間の距離が近いか（中点同士の垂直距離）
        const amx = (a.fx + a.tx) / 2, amy = (a.fy + a.ty) / 2;
        const bmx = (b.fx + b.tx) / 2, bmy = (b.fy + b.ty) / 2;
        // aの方向の法線への射影距離
        const dx = a.tx - a.fx, dy = a.ty - a.fy;
        const len = Math.hypot(dx, dy) || 1;
        const perpDist = Math.abs((-dy * (bmx - amx) + dx * (bmy - amy)) / len);
        if (perpDist > 12) continue;

        // 線分の投影が重なるか
        const projA1 = 0, projA2 = len;
        const proj = (px, py) => ((px - a.fx) * dx + (py - a.fy) * dy) / len;
        const projB1 = Math.min(proj(b.fx, b.fy), proj(b.tx, b.ty));
        const projB2 = Math.max(proj(b.fx, b.fy), proj(b.tx, b.ty));
        const overlap = Math.min(projA2, projB2) - Math.max(projA1, projB1);
        if (overlap < 10) continue;

        group.push(j);
      }

      if (group.length > 1) {
        for (let k = 0; k < group.length; k++) {
          visited.add(group[k]);
          offsets[edgeData[group[k]].edge.id] = (k - (group.length - 1) / 2) * 6;
        }
      }
    }

    return offsets;
  }

  drawEdges(ctx, state, visual) {
    const offsets = this._calcEdgeOffsets(state);

    for (const edge of state.edges) {
      if (edge.destroyed) continue;
      const from = state.getTower(edge.fromTowerId);
      const to = state.getTower(edge.toTowerId);
      if (!from || !to) continue;

      const selected = visual.selectedEdge === edge.id;
      const edgeBuilding = edge.status === 'building' || edge.status === 'upgrading';
      const alpha = edgeBuilding ? 0.4 : (edge.enabled ? 1.0 : 0.3);

      // 法線方向のオフセット
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const off = offsets[edge.id] || 0;
      const nx = (-dy / dist) * off;
      const ny = (dx / dist) * off;

      const fx = from.x + nx, fy = from.y + ny;
      const tx = to.x + nx, ty = to.y + ny;

      ctx.globalAlpha = alpha;

      // 帯域使用率
      const charge = edge.chargeOnEdge(state.packets);
      const capacity = edge.levelDef.bandwidth;
      const congestion = capacity > 0 ? charge / capacity : 0;

      // エッジライン（帯域使用率で太さ・色・光彩変化）
      const baseWidth = 2 + edge.level * 0.5;
      if (edgeBuilding) {
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
      } else if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = baseWidth + 1;
      } else {
        // 3段階: <50%=青, 50-99%=黄, 100%=赤
        if (congestion >= 1.0) {
          ctx.strokeStyle = '#ff4444';
        } else if (congestion >= 0.5) {
          ctx.strokeStyle = '#ddcc44';
        } else {
          ctx.strokeStyle = '#4488aa';
        }
        ctx.lineWidth = baseWidth;
      }
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      if (edgeBuilding) ctx.setLineDash([]);

      // 矢印
      const angle = Math.atan2(dy, dx);
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;

      // 建設/アップグレード進捗バー
      if (edgeBuilding) {
        const totalTime = edge.status === 'building' ? 1.0
          : (UPGRADE_TIMES ? UPGRADE_TIMES[(edge._pendingLevel || edge.level + 1) - 2] : 3);
        const progress = 1 - (edge.buildTimer / totalTime);
        const barW = 30;
        ctx.fillStyle = '#222';
        ctx.fillRect(mx - barW / 2, my - 12, barW, 4);
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(mx - barW / 2, my - 12, barW * Math.max(0, progress), 4);
        ctx.fillStyle = '#4488ff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(edge.status === 'building' ? '建設中' : '強化中', mx, my - 15);
      }
      const arrowSize = 8;
      ctx.fillStyle = selected ? '#ffffff' : '#4488aa';
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(angle) * arrowSize, my + Math.sin(angle) * arrowSize);
      ctx.lineTo(mx + Math.cos(angle + 2.5) * arrowSize, my + Math.sin(angle + 2.5) * arrowSize);
      ctx.lineTo(mx + Math.cos(angle - 2.5) * arrowSize, my + Math.sin(angle - 2.5) * arrowSize);
      ctx.closePath();
      ctx.fill();

      // HPバー（ダメージ時）
      if (edge.hp < edge.maxHp) {
        const hpRatio = edge.hp / edge.maxHp;
        const barW = 30;
        ctx.fillStyle = '#333';
        ctx.fillRect(mx - barW / 2, my - 10, barW, 4);
        ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : '#ff4444';
        ctx.fillRect(mx - barW / 2, my - 10, barW * hpRatio, 4);
      }

      // レベル表示
      if (edge.level > 1) {
        ctx.fillStyle = '#88aacc';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Lv${edge.level}`, mx, my + 14);
      }

      ctx.globalAlpha = 1.0;
    }
  }

  drawPackets(ctx, state) {
    const offsets = this._calcEdgeOffsets(state);

    for (const pkt of state.packets) {
      const edge = state.getEdge(pkt.edgeId);
      if (!edge) continue;
      const from = state.getTower(edge.fromTowerId);
      const to = state.getTower(edge.toTowerId);
      if (!from || !to) continue;

      // エッジと同じ法線オフセットを適用
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const off = offsets[edge.id] || 0;
      const nx = (-dy / dist) * off;
      const ny = (dx / dist) * off;

      const x = from.x + nx + (to.x - from.x) * pkt.progress;
      const y = from.y + ny + (to.y - from.y) * pkt.progress;

      // 光彩
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#44ddff33';
      ctx.fill();

      // コア
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#44ddff';
      ctx.fill();

      // charge表示（常に表示）
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pkt.charge, x, y - 7);
    }
  }

  drawTowers(ctx, state, visual) {
    for (const tower of state.towers) {
      if (tower.destroyed) {
        // 残骸
        ctx.globalAlpha = 0.15;
        this.drawTowerSprite(ctx, tower);
        ctx.globalAlpha = 1.0;
        continue;
      }

      const selected = visual.selectedTower === tower.id;
      const isBuilding = tower.status === 'building' || tower.status === 'upgrading';
      const alpha = isBuilding ? 0.5 : (tower.enabled ? 1.0 : 0.3);
      ctx.globalAlpha = alpha;

      // 選択ハイライト + 攻撃範囲
      if (selected) {
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, TOWER_DRAW_SIZE / 2 + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (tower.category === 'attack') {
          const range = tower.levelDef.range;
          ctx.beginPath();
          ctx.arc(tower.x, tower.y, range, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,100,80,0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,100,80,0.05)';
          ctx.fill();
        }
      }

      this.drawTowerSprite(ctx, tower);

      // 建設/アップグレード中プログレスバー
      if (isBuilding) {
        const totalTime = tower.status === 'building' ? 2.0
          : (UPGRADE_TIMES ? UPGRADE_TIMES[(tower._pendingLevel || tower.level + 1) - 2] : 3);
        const progress = 1 - (tower.buildTimer / totalTime);
        const barW = TOWER_DRAW_SIZE;
        const barY = tower.y - TOWER_DRAW_SIZE / 2 - 8;
        ctx.fillStyle = '#222';
        ctx.fillRect(tower.x - barW / 2, barY, barW, 4);
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(tower.x - barW / 2, barY, barW * Math.max(0, progress), 4);
        ctx.fillStyle = '#4488ff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tower.status === 'building' ? '建設中' : '強化中', tower.x, barY - 2);
      }

      // レベル表示
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Lv${tower.level}`, tower.x, tower.y + TOWER_DRAW_SIZE / 2 + 12);

      // HPバー
      if (!isBuilding && tower.hp < tower.maxHp) {
        const hpRatio = tower.hp / tower.maxHp;
        const barW = TOWER_DRAW_SIZE;
        const barY = tower.y + TOWER_DRAW_SIZE / 2 + 2;
        ctx.fillStyle = '#333';
        ctx.fillRect(tower.x - barW / 2, barY, barW, 4);
        ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : '#ff4444';
        ctx.fillRect(tower.x - barW / 2, barY, barW * hpRatio, 4);
      }

      // 弾薬表示（攻撃タワー: 弾数/消費量）
      if (tower.category === 'attack' && tower.status === 'active') {
        const cost = tower.levelDef.packetCost;
        ctx.fillStyle = tower.ammo >= cost ? '#ffaa00' : '#ff4444';
        ctx.font = '9px monospace';
        ctx.fillText(`${tower.ammo}/${cost}`, tower.x, tower.y - TOWER_DRAW_SIZE / 2 - 4);
      }

      // 待ちパケット数（中継タワー: 常に表示）
      if (tower.category === 'relay' && tower.status === 'active') {
        const q = tower.holdQueue.length;
        ctx.fillStyle = q > 5 ? '#ff8844' : q > 0 ? '#44bbff' : '#668899';
        ctx.font = '9px monospace';
        ctx.fillText(q, tower.x, tower.y - TOWER_DRAW_SIZE / 2 - 4);
      }


      ctx.globalAlpha = 1.0;
    }
  }

  drawTowerSprite(ctx, tower) {
    const img = imageCache[TOWER_SVG_PATHS[tower.type]];
    const size = TOWER_DRAW_SIZE;
    // 攻撃タワーは回転描画
    const shouldRotate = tower.category === 'attack';
    if (img && img.complete && img.naturalWidth > 0) {
      if (shouldRotate) {
        ctx.save();
        ctx.translate(tower.x, tower.y);
        ctx.rotate(tower.facingAngle + Math.PI / 2); // SVGは上向き基準
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.drawImage(img, tower.x - size / 2, tower.y - size / 2, size, size);
      }
    } else {
      // フォールバック形状
      const color = tower.def.color;
      ctx.fillStyle = color + '44';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (tower.category === 'generator') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 2;
          const r = size / 2;
          ctx.lineTo(tower.x + r * Math.cos(a), tower.y + r * Math.sin(a));
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (tower.category === 'relay') {
        const r = size / 2;
        ctx.beginPath();
        ctx.moveTo(tower.x, tower.y - r);
        ctx.lineTo(tower.x + r, tower.y);
        ctx.lineTo(tower.x, tower.y + r);
        ctx.lineTo(tower.x - r, tower.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // 攻撃タワー: 回転する三角形
        const r = size / 2;
        if (shouldRotate) {
          ctx.save();
          ctx.translate(tower.x, tower.y);
          ctx.rotate(tower.facingAngle + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r, r * 0.7);
          ctx.lineTo(-r, r * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.moveTo(tower.x, tower.y - r);
          ctx.lineTo(tower.x + r, tower.y + r * 0.7);
          ctx.lineTo(tower.x - r, tower.y + r * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tower.def.label, tower.x, tower.y + 4);
    }
  }

  drawEnemies(ctx, state) {
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;

      const img = imageCache[ENEMY_SVG_PATHS[enemy.type]];
      const baseSize = ENEMY_DRAW_SIZE;
      const size = enemy.boss ? baseSize * 1.4 : baseSize;

      // ボスグロー
      if (enemy.boss) {
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, size / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ff440022';
        ctx.fill();
        ctx.strokeStyle = '#ff880066';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.angle + Math.PI / 2);

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
      } else {
        const typeDef = ENEMY_TYPES[enemy.type];
        const color = typeDef ? typeDef.color : '#cc66ff';
        ctx.beginPath();
        ctx.arc(0, 0, size / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = color + '66';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // HPバー
      const hpRatio = enemy.hp / enemy.maxHp;
      const barW = enemy.boss ? 32 : 24;
      ctx.fillStyle = '#333';
      ctx.fillRect(enemy.x - barW / 2, enemy.y - size / 2 - 6, barW, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ccaa00' : '#ff4444';
      ctx.fillRect(enemy.x - barW / 2, enemy.y - size / 2 - 6, barW * hpRatio, 3);

      // ボスラベル
      if (enemy.boss) {
        ctx.fillStyle = '#ff8844';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', enemy.x, enemy.y - size / 2 - 9);
      }
    }
  }

  drawBullets(ctx, state) {
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffff44';
      ctx.fill();
    }
  }

  drawEffects(ctx, state) {
    for (const eff of state.effects) {
      ctx.globalAlpha = Math.max(0, eff.timer * 3);
      if (eff.type === 'hit') {
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, 8 * (1 - eff.timer * 3), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (eff.type === 'kill') {
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, 15 * (1 - eff.timer * 2), 0, Math.PI * 2);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (eff.type === 'destroy') {
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, 25 * (1 - eff.timer), 0, Math.PI * 2);
        ctx.strokeStyle = '#ff6644';
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (eff.type === 'enemyAttack') {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(eff.fromX, eff.fromY);
        ctx.lineTo(eff.toX, eff.toY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }
  }

  drawDragPreview(ctx, state, visual) {
    if (!visual.dragging) return;
    const from = state.getTower(visual.dragFromTower);
    if (!from) return;

    // ドラッグ線
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(visual.dragX, visual.dragY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 接続可能なタワーをハイライト
    for (const tower of state.towers) {
      if (tower.destroyed || tower.id === from.id) continue;
      const d = Math.hypot(tower.x - from.x, tower.y - from.y);
      if (d <= from.def.connectRange) {
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, TOWER_DRAW_SIZE / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#44ff8888';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  drawConnectRange(ctx, state, visual) {
    if (!visual.dragging || !visual.dragFromTower) return;
    const from = state.getTower(visual.dragFromTower);
    if (!from) return;

    ctx.beginPath();
    ctx.arc(from.x, from.y, from.def.connectRange, 0, Math.PI * 2);
    ctx.strokeStyle = '#44ff8833';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** アップグレード時の射程比較プレビュー */
  drawUpgradeRangePreview(ctx, state, visual) {
    const preview = visual.upgradePreview;
    if (!preview) return;
    const tower = state.getTower(preview.towerId);
    if (!tower) return;

    // 現在の射程（赤い実線）
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, preview.currentRange, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,100,80,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,100,80,0.03)';
    ctx.fill();

    // 強化後の射程（緑の点線）
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, preview.nextRange, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(68,255,136,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(68,255,136,0.04)';
    ctx.fill();

    // ラベル
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,100,80,0.7)';
    ctx.fillText(`現在: ${preview.currentRange}px`, tower.x, tower.y + preview.currentRange + 12);
    ctx.fillStyle = 'rgba(68,255,136,0.8)';
    ctx.fillText(`強化後: ${preview.nextRange}px`, tower.x, tower.y + preview.nextRange + 12);
  }
}
