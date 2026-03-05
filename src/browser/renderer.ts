// Browser Layer: Canvas 2D rendering — all game entities, hit tests, effect system

import type {
  NodeId, EdgeId,
  NodeType, EnemyType, AttackNodeType,
  TowerNode, Enemy, Vec2,
} from '@core/types';
import type { GameConfig } from '@core/config';
import { getTowerLevelStats, getEdgeLevelStats, getUpgradeDuration } from '@core/config';
import type { GameState } from '@core/state';
import type { Camera } from '@core/camera';
import { applyTransform, resetTransform } from './camera-binding';
import { chargeOnEdge } from '@core/network/logic';
import { packetPosition } from '@core/network/spatial';

// ── 定数 ──

const COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  base:        { fill: '#1a3366', stroke: '#4488ff', label: 'BASE' },
  generator:   { fill: '#0a3322', stroke: '#00ff88', label: 'GEN' },
  sniper:      { fill: '#331122', stroke: '#ff4466', label: 'SNP' },
  rapid:       { fill: '#332200', stroke: '#ff8800', label: 'RPD' },
  cannon:      { fill: '#2a1133', stroke: '#cc44ff', label: 'CNN' },
  distributor: { fill: '#332a00', stroke: '#ffaa00', label: 'DST' },
  repeater:    { fill: '#0a2233', stroke: '#44bbff', label: 'REP' },
};

const INACTIVE_COLORS = {
  fill: '#1a1a22',
  stroke: '#445',
  label: '#556',
};

// ── 公開型 ──

export interface UIState {
  selectedNodeId: NodeId | null;
  selectedEdgeId: EdgeId | null;
  selectedTool: NodeType;
  hoveredNodeId: NodeId | null;
  dragPreview: { fromId: NodeId; toX: number; toY: number } | null;
  rangePreview?: { nodeId: NodeId; range: number } | null;
}

export type AssetMap = Map<string, HTMLImageElement>;

// ── アセットローダー ──

const TOWER_ASSET_NAMES = [
  'base',
  'generator', 'generator_lv2', 'generator_lv3', 'generator_lv4', 'generator_lv5',
  'sniper', 'sniper_lv2', 'sniper_lv3', 'sniper_lv4', 'sniper_lv5',
  'rapid', 'rapid_lv2', 'rapid_lv3', 'rapid_lv4', 'rapid_lv5',
  'cannon', 'cannon_lv2', 'cannon_lv3', 'cannon_lv4', 'cannon_lv5',
  'distributor', 'distributor_lv2', 'distributor_lv3', 'distributor_lv4', 'distributor_lv5',
  'repeater', 'repeater_lv2', 'repeater_lv3', 'repeater_lv4', 'repeater_lv5',
];

const ENEMY_ASSET_NAMES = ['normal', 'fast', 'tank', 'edgeAttacker', 'towerAttacker'];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export async function loadAllAssets(): Promise<AssetMap> {
  const assets: AssetMap = new Map();
  const base = import.meta.env.BASE_URL ?? '/';
  const promises: Promise<void>[] = [];

  for (const name of TOWER_ASSET_NAMES) {
    promises.push(
      loadImage(`${base}assets/towers/${name}.svg`)
        .then(img => { assets.set(`tower/${name}`, img); })
        .catch(() => { /* フォールバック描画 */ }),
    );
  }
  for (const name of ENEMY_ASSET_NAMES) {
    promises.push(
      loadImage(`${base}assets/enemies/${name}.svg`)
        .then(img => { assets.set(`enemy/${name}`, img); })
        .catch(() => { /* フォールバック描画 */ }),
    );
  }
  await Promise.all(promises);
  return assets;
}

function getTowerImage(assets: AssetMap, type: NodeType, level: number): HTMLImageElement | null {
  let suffix = '';
  if (level >= 5) suffix = '_lv5';
  else if (level >= 4) suffix = '_lv4';
  else if (level >= 3) suffix = '_lv3';
  else if (level >= 2) suffix = '_lv2';
  return assets.get(`tower/${type}${suffix}`) ?? assets.get(`tower/${type}`) ?? null;
}

function getEnemyImage(assets: AssetMap, type: EnemyType): HTMLImageElement | null {
  return assets.get(`enemy/${type}`) ?? null;
}

// ── 描画ヘルパー ──

function drawRotated(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  cx: number, cy: number, size: number, angle: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ── 敵形状ヘルパー ──

function drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x - r * 0.7, y - r * 0.7);
  ctx.lineTo(x - r * 0.7, y + r * 0.7);
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawRoundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const s = r * 0.85;
  const cr = 3;
  ctx.moveTo(x - s + cr, y - s);
  ctx.lineTo(x + s - cr, y - s);
  ctx.arcTo(x + s, y - s, x + s, y - s + cr, cr);
  ctx.lineTo(x + s, y + s - cr);
  ctx.arcTo(x + s, y + s, x + s - cr, y + s, cr);
  ctx.lineTo(x - s + cr, y + s);
  ctx.arcTo(x - s, y + s, x - s, y + s - cr, cr);
  ctx.lineTo(x - s, y - s + cr);
  ctx.arcTo(x - s, y - s, x - s + cr, y - s, cr);
  ctx.closePath();
}

function drawEnemyShape(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
  ctx.beginPath();
  switch (e.type) {
    case 'fast': drawTriangle(ctx, e.x, e.y, r); break;
    case 'tank': drawRoundedSquare(ctx, e.x, e.y, r); break;
    case 'edgeAttacker': drawDiamond(ctx, e.x, e.y, r); break;
    case 'towerAttacker': drawHexagon(ctx, e.x, e.y, r); break;
    default: ctx.arc(e.x, e.y, r, 0, Math.PI * 2); break;
  }
}

function isAttackType(type: NodeType): type is AttackNodeType {
  return type === 'sniper' || type === 'rapid' || type === 'cannon';
}

// ── ノードスロットの占有チェック ──

function findNodeAtSlot(state: GameState, sx: number, sy: number): TowerNode | null {
  for (const node of state.nodes.values()) {
    if (Math.abs(node.x - sx) < 2 && Math.abs(node.y - sy) < 2) {
      return node;
    }
  }
  return null;
}

// ── 個別描画関数 ──

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = '#0e1320';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawEnemyPath(ctx: CanvasRenderingContext2D, path: ReadonlyArray<Vec2>): void {
  if (path.length < 2) return;
  ctx.strokeStyle = '#1a1e2a';
  ctx.lineWidth = 30;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  ctx.strokeStyle = '#252a3a';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEdges(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig, ui: UIState,
): void {
  for (const edge of state.edges.values()) {
    const fromNode = state.nodes.get(edge.from);
    const toNode = state.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const ax = fromNode.x, ay = fromNode.y;
    const bx = toNode.x, by = toNode.y;
    const isSelected = ui.selectedEdgeId === edge.id;
    const edgeLv = edge.level;
    const lineW = 2 + edgeLv;

    // destroyed → skip
    if (edge.status === 'destroyed') continue;

    // upgrading
    if (edge.status === 'upgrading') {
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);

      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      // プログレスバー
      const totalDur = getUpgradeDuration(config, edge.level);
      const progress = 1 - (edge.disableTimer / totalDur);
      const barW = 30;
      ctx.fillStyle = '#222';
      ctx.fillRect(mx - barW / 2, my - 8, barW, 4);
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(mx - barW / 2, my - 8, barW * Math.max(0, progress), 4);
      // ラベル
      ctx.font = 'bold 7px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(mx - 12, my - 2, 24, 10);
      ctx.fillStyle = '#4488ff';
      ctx.fillText('UP', mx, my + 3);

      if (isSelected) {
        ctx.strokeStyle = 'rgba(255,204,0,0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
      }
      continue;
    }

    // disabled
    if (edge.status === 'disabled') {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);

      if (edge.disableTimer > 0) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        ctx.font = 'bold 7px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mx - 9, my - 5, 18, 9);
        ctx.fillStyle = '#665500';
        ctx.fillText('OFF', mx, my);
      }

      if (isSelected) {
        ctx.strokeStyle = 'rgba(255,204,0,0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
      }
      continue;
    }

    // active edge — 輻輳色
    const elvl = getEdgeLevelStats(config, edgeLv);
    const cap = elvl.capacity;
    const totalCharge = chargeOnEdge(state, edge.id);
    const congestion = totalCharge / cap;

    if (edge.hp < edge.maxHp) {
      // ダメージ優先
      const ratio = edge.hp / edge.maxHp;
      const r = Math.round(200 * (1 - ratio));
      const g = Math.round(102 * ratio);
      ctx.strokeStyle = `rgb(${r},${g},${g})`;
    } else if (congestion >= 1.0) {
      ctx.strokeStyle = '#cc2200';
    } else if (congestion >= 0.8) {
      ctx.strokeStyle = '#cc6600';
    } else if (congestion >= 0.5) {
      ctx.strokeStyle = '#aaaa00';
    } else {
      ctx.strokeStyle = '#006666';
    }

    // Lv4+: ネオン風shadowBlur
    if (edgeLv >= 4) {
      ctx.save();
      ctx.shadowColor = congestion >= 0.8 ? '#cc6600' : '#00cccc';
      ctx.shadowBlur = edgeLv >= 5 ? 12 : 6;
    }
    ctx.lineWidth = lineW;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    if (edgeLv >= 4) ctx.restore();

    // Lv3+: 二重線（細い明るい内線）
    if (edgeLv >= 3) {
      const innerColor = congestion >= 0.8 ? 'rgba(255,180,100,0.4)' : 'rgba(100,255,255,0.4)';
      ctx.strokeStyle = innerColor;
      ctx.lineWidth = Math.max(1, lineW - 3);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // グロー（Lv連動）
    const glowBase = congestion >= 0.8 ? 0.2 : 0.15;
    const glowBonus = (edgeLv - 1) * 0.03;
    const glowAlpha = Math.min(glowBase + glowBonus, 0.35);
    const glowColor = congestion >= 0.8
      ? `rgba(204,102,0,${glowAlpha})`
      : `rgba(0,204,204,${glowAlpha})`;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineW + 5 + (edgeLv >= 3 ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();

    // Lv5: パルスアニメーション
    if (edgeLv >= 5) {
      const pulse = 0.1 + 0.1 * Math.sin(Date.now() / 300);
      const pulseColor = congestion >= 0.8
        ? `rgba(255,150,50,${pulse})`
        : `rgba(0,255,255,${pulse})`;
      ctx.strokeStyle = pulseColor;
      ctx.lineWidth = lineW + 10;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // 選択ハイライト
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,204,0,0.6)';
      ctx.lineWidth = lineW + 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // DAG方向マーカー + Lvバッジ
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const angle = Math.atan2(by - ay, bx - ax);
    const sz = 8;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.fillStyle = isSelected ? 'rgba(255,204,0,0.2)' : 'rgba(0,204,204,0.15)';
    ctx.beginPath(); ctx.arc(0, 0, sz + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isSelected ? 'rgba(255,204,0,0.9)' : 'rgba(0,255,255,0.8)';
    ctx.strokeStyle = isSelected ? '#ffcc00' : '#00cccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sz, 0);
    ctx.lineTo(-sz * 0.6, -sz * 0.55);
    ctx.lineTo(-sz * 0.3, 0);
    ctx.lineTo(-sz * 0.6, sz * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Lvバッジ（Lv2以上）
    if (edgeLv > 1) {
      const bxp = mx + Math.cos(angle + Math.PI / 2) * 14;
      const byp = my + Math.sin(angle + Math.PI / 2) * 14;
      const lvLabel = `Lv${edgeLv}`;
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(lvLabel).width;
      ctx.fillStyle = edgeLv >= 4 ? 'rgba(0,40,40,0.8)' : 'rgba(0,0,0,0.65)';
      ctx.fillRect(bxp - tw / 2 - 3, byp - 6, tw + 6, 12);
      if (edgeLv >= 3) {
        ctx.strokeStyle = edgeLv >= 5 ? '#00ffff' : '#00aaaa';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bxp - tw / 2 - 3, byp - 6, tw + 6, 12);
      }
      ctx.fillStyle = edgeLv >= 5 ? '#00ffff' : edgeLv >= 3 ? '#00dddd' : '#00cccc';
      ctx.fillText(lvLabel, bxp, byp);
    }

    // エッジHPバー
    if (edge.hp < edge.maxHp && edge.hp > 0) {
      const hpRatio = edge.hp / edge.maxHp;
      const barW = 24;
      ctx.fillStyle = '#333';
      ctx.fillRect(mx - barW / 2, my - 5, barW, 4);
      ctx.fillStyle = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ccaa00' : '#cc2200';
      ctx.fillRect(mx - barW / 2, my - 5, barW * hpRatio, 4);
    }
  }
}

function drawEdgePreview(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig, ui: UIState,
): void {
  if (!ui.dragPreview) return;
  const fromNode = state.nodes.get(ui.dragPreview.fromId);
  if (!fromNode) return;

  // 接続可能範囲の円
  ctx.strokeStyle = 'rgba(0,204,204,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(fromNode.x, fromNode.y, config.MAX_EDGE_LENGTH, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 始点→マウスの点線
  ctx.strokeStyle = 'rgba(0,204,204,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(fromNode.x, fromNode.y);
  ctx.lineTo(ui.dragPreview.toX, ui.dragPreview.toY);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPackets(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig,
): void {
  for (const p of state.packets.values()) {
    const pos = packetPosition(p, state);
    if (!pos) continue;

    const charge = p.charge;
    const scale = 1 + (charge - 1) * 0.3;

    // グロー
    ctx.fillStyle = 'rgba(0,255,255,0.18)';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 10 * scale, 0, Math.PI * 2); ctx.fill();

    // 本体
    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, config.PACKET_RADIUS * scale, 0, Math.PI * 2); ctx.fill();

    // charge数表示（2以上のみ）
    if (charge > 1) {
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#003333';
      ctx.fillText(String(charge), pos.x, pos.y);
    }
  }
}

function drawBase(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig, assets: AssetMap,
): void {
  const base = config.basePos;
  const R = config.NODE_RADIUS;
  const c = COLORS.base;

  // グロー
  ctx.fillStyle = c.stroke + '25';
  ctx.beginPath(); ctx.arc(base.x, base.y, R + 8, 0, Math.PI * 2); ctx.fill();

  // ボディ: SVGスプライト or フォールバック円（町なので回転なし）
  const img = assets.get('tower/base');
  if (img) {
    drawRotated(ctx, img, base.x, base.y, R * 2.2, 0);
  } else {
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(base.x, base.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // ラベル
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(c.label, base.x, base.y);
  }

  // HPバー
  if (state.baseHp < state.maxBaseHp) {
    const hpRatio = state.baseHp / state.maxBaseHp;
    const barW = 30;
    ctx.fillStyle = '#333';
    ctx.fillRect(base.x - barW / 2, base.y + R + 2, barW, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ccaa00' : '#cc2200';
    ctx.fillRect(base.x - barW / 2, base.y + R + 2, barW * hpRatio, 4);
  }
}

function drawBaseRange(
  ctx: CanvasRenderingContext2D, config: GameConfig,
): void {
  const base = config.basePos;
  ctx.strokeStyle = 'rgba(68,136,255,0.1)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(base.x, base.y, config.BASE_ATTACK.range, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function drawEmptySlots(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig,
): void {
  const R = config.NODE_RADIUS;
  for (const slot of config.nodeSlots) {
    if (findNodeAtSlot(state, slot.x, slot.y)) continue;

    ctx.strokeStyle = '#222840';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(slot.x, slot.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig,
  ui: UIState, assets: AssetMap,
): void {
  const R = config.NODE_RADIUS;

  for (const node of state.nodes.values()) {
    const isSelected = ui.selectedNodeId === node.id;
    const isHover = ui.hoveredNodeId === node.id;
    const isBuilding = node.status === 'building';
    const isUpgrading = node.status === 'upgrading';
    const inactive = node.status === 'disabled' || isBuilding;

    const c = COLORS[node.type];
    if (!c) continue;

    const lv = node.level;
    const sizeScale = lv <= 4 ? (2.0 + (lv - 1) * 0.1) : 2.5;
    const glowAlphaHex = lv <= 1 ? '18' : lv <= 2 ? '25' : lv <= 3 ? '30' : lv <= 4 ? '3a' : '48';

    // Glow（Lv連動）
    if (inactive) {
      ctx.fillStyle = 'rgba(60,60,80,0.1)';
    } else {
      ctx.fillStyle = c.stroke + glowAlphaHex;
    }
    ctx.beginPath(); ctx.arc(node.x, node.y, R + 8, 0, Math.PI * 2); ctx.fill();

    // Lv3+: タイプ色の薄いリング
    if (lv >= 3 && !inactive) {
      const { r, g, b } = parseHexColor(c.stroke);
      const ringAlpha = lv >= 5 ? 0.25 : 0.15;
      ctx.strokeStyle = `rgba(${r},${g},${b},${ringAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(node.x, node.y, R + 12, 0, Math.PI * 2); ctx.stroke();
      // Lv5: 二重リング
      if (lv >= 5) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${ringAlpha * 0.6})`;
        ctx.beginPath(); ctx.arc(node.x, node.y, R + 16, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Body: Lv別SVGスプライト or フォールバック円
    const img = getTowerImage(assets, node.type, lv);
    if (img) {
      const isAttack = node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon';
      let rotation = 0;
      if (isAttack && node.facingAngle != null) {
        rotation = node.facingAngle + Math.PI / 2;
      }
      if (inactive) ctx.globalAlpha = 0.35;
      drawRotated(ctx, img, node.x, node.y, R * sizeScale, rotation);
      if (inactive) ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle = inactive ? INACTIVE_COLORS.fill : c.fill;
      ctx.strokeStyle = isSelected ? '#ffcc00' : isHover ? '#ffffff' : inactive ? INACTIVE_COLORS.stroke : c.stroke;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath(); ctx.arc(node.x, node.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // 選択リング + 攻撃範囲
    if (isSelected) {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(node.x, node.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,204,0,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.arc(node.x, node.y, R + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // 攻撃範囲（攻撃タワーのみ）
      const isAttackType = node.type === 'sniper' || node.type === 'rapid' || node.type === 'cannon';
      if (isAttackType) {
        const stats = getTowerLevelStats(config, node.type, node.level);
        if (stats.range) {
          ctx.strokeStyle = 'rgba(255,100,100,0.25)';
          ctx.fillStyle = 'rgba(255,100,100,0.05)';
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.arc(node.x, node.y, stats.range, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ホバーリング
    if (isHover && !isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(node.x, node.y, R + 2, 0, Math.PI * 2); ctx.stroke();
    }

    // レベル表示（Lv2以上のみ）
    if (lv > 1) {
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lvStr = String(lv);
      const tw = ctx.measureText(lvStr).width;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(node.x - tw / 2 - 3, node.y - 6, tw + 6, 12);
      ctx.fillStyle = inactive ? INACTIVE_COLORS.label : '#fff';
      ctx.fillText(lvStr, node.x, node.y);
    }

    // 建築中表示
    if (isBuilding) {
      const buildDur = config.buildDuration[node.type];
      const progress = 1 - (node.buildTimer / buildDur);
      const barW = 30;
      ctx.fillStyle = '#222';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW, 4);
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW * Math.max(0, progress), 4);
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(node.x - 14, node.y + R + 7, 28, 10);
      ctx.fillStyle = '#4488ff';
      ctx.fillText('BUILD', node.x, node.y + R + 12);
    } else if (isUpgrading) {
      const upDur = config.upgradeDuration[Math.min(lv - 1, config.upgradeDuration.length - 1)] ?? 5;
      const progress = 1 - (node.upgradeTimer / upDur);
      const barW = 30;
      // 青灰色リング
      ctx.strokeStyle = 'rgba(100,150,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(node.x, node.y, R + 3, 0, Math.PI * 2); ctx.stroke();
      // プログレスバー
      ctx.fillStyle = '#222';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW, 4);
      ctx.fillStyle = '#7799ff';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW * Math.max(0, progress), 4);
      // ラベル
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(node.x - 11, node.y + R + 7, 22, 10);
      ctx.fillStyle = '#7799ff';
      ctx.fillText('UPG', node.x, node.y + R + 12);
    } else if (inactive) {
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const offW = ctx.measureText('OFF').width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(node.x - offW / 2 - 2, node.y + R + 5, offW + 4, 10);
      ctx.fillStyle = '#665500';
      ctx.fillText('OFF', node.x, node.y + R + 10);
    }

    // Lv4+ アイドル脈動グロー
    if (lv >= 4 && node.status === 'active') {
      const idlePulse = 0.06 + 0.04 * Math.sin(Date.now() / 800);
      const { r, g, b } = parseHexColor(c.stroke);
      ctx.fillStyle = `rgba(${r},${g},${b},${idlePulse})`;
      ctx.beginPath(); ctx.arc(node.x, node.y, R + (lv >= 5 ? 18 : 14), 0, Math.PI * 2); ctx.fill();
    }

    // Ammo表示（攻撃タワー）
    if (isAttackType(node.type)) {
      const stats = getTowerLevelStats(config, node.type, lv);
      const needed = stats.ammoPerShot ?? 1;
      const shortage = node.ammo < needed;
      const label = `${node.ammo}/${needed}`;
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = shortage ? '#ffaa44' : (inactive ? INACTIVE_COLORS.label : c.stroke);
      ctx.fillText(label, node.x, node.y - R - 8);
    }

    // 保持中キュー表示（タワー上部にタワー色で表示）
    if ((node.type === 'distributor' || node.type === 'repeater') && node.held.length >= 0) {
      const qLen = node.held.length;
      const qMax = config.DIST_REP_MAX_QUEUE;
      const hStr = `${qLen}/${qMax}`;
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let hColor = inactive ? INACTIVE_COLORS.label : c.stroke;
      if (qLen >= qMax) hColor = '#ff4466';
      else if (qLen >= qMax * 0.7) hColor = '#ffaa33';
      ctx.fillStyle = hColor;
      ctx.fillText(hStr, node.x, node.y - R - 8);
    }

    // タワーHPバー（ダメージ時のみ）
    if (node.hp < node.maxHp && node.hp > 0 && !isBuilding) {
      const hpRatio = node.hp / node.maxHp;
      const barW = 30;
      ctx.fillStyle = '#333';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ccaa00' : '#cc2200';
      ctx.fillRect(node.x - barW / 2, node.y + R + 2, barW * hpRatio, 3);
    }
  }
}

function drawEnemies(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig, assets: AssetMap,
): void {
  for (const e of state.enemies.values()) {
    if (e.hp <= 0) continue;
    const typeDef = config.enemyTypes[e.type];
    if (!typeDef) continue;

    const hpRatio = e.hp / e.maxHp;
    const r = typeDef.radius + (e.isBoss ? 4 : 0);

    // ボスグロー
    if (e.isBoss) {
      ctx.fillStyle = typeDef.color + '33';
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, Math.PI * 2); ctx.fill();
    }

    // Body: SVGスプライト or フォールバック図形
    const img = getEnemyImage(assets, e.type);
    if (img) {
      const rotation = e.angle != null ? e.angle + Math.PI / 2 : 0;
      drawRotated(ctx, img, e.x, e.y, r * 2.5, rotation);
    } else {
      ctx.fillStyle = typeDef.color;
      drawEnemyShape(ctx, e, r);
      ctx.fill();
      ctx.strokeStyle = typeDef.stroke;
      ctx.lineWidth = e.isBoss ? 3 : 2;
      drawEnemyShape(ctx, e, r);
      ctx.stroke();
    }

    // HPバー
    ctx.fillStyle = '#333';
    ctx.fillRect(e.x - 14, e.y - r - 8, 28, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ccaa00' : '#cc2200';
    ctx.fillRect(e.x - 14, e.y - r - 8, 28 * hpRatio, 4);

    // ボスラベル
    if (e.isBoss) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BOSS', e.x, e.y);
    }

    // 強さレベルドット
    if (e.strength > 1) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < e.strength; i++) {
        ctx.beginPath();
        ctx.arc(e.x - 4 + i * 4, e.y + r + 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.bullets.values()) {
    const lv = b.level;
    const lvScale = 0.8 + lv * 0.15;
    const dx = b.x - b.prevX;
    const dy = b.y - b.prevY;
    const angle = Math.atan2(dy, dx);

    if (b.towerType === 'sniper') {
      // スナイパー: 細長いトレーサー（赤系）
      const trailLen = (12 + lv * 4) * lvScale;
      ctx.strokeStyle = `rgba(255,68,102,${0.3 + lv * 0.08})`;
      ctx.lineWidth = 1.5 * lvScale;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(angle) * trailLen, b.y - Math.sin(angle) * trailLen);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,68,102,${0.15 + lv * 0.05})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff4466';
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.5 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffccdd';
      ctx.beginPath(); ctx.arc(b.x, b.y, 1.2 * lvScale, 0, Math.PI * 2); ctx.fill();
    } else if (b.towerType === 'rapid') {
      // ラピッド: 小さい高速弾（オレンジ系）
      const trailLen = (5 + lv * 2) * lvScale;
      ctx.strokeStyle = `rgba(255,136,0,${0.25 + lv * 0.06})`;
      ctx.lineWidth = 1.2 * lvScale;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(angle) * trailLen, b.y - Math.sin(angle) * trailLen);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,136,0,${0.2 + lv * 0.04})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 4 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.arc(b.x, b.y, 2 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath(); ctx.arc(b.x, b.y, 0.8 * lvScale, 0, Math.PI * 2); ctx.fill();
    } else if (b.towerType === 'cannon') {
      // キャノン: 大きい光球（紫系）
      const trailLen = (8 + lv * 3) * lvScale;
      ctx.strokeStyle = `rgba(204,68,255,${0.2 + lv * 0.06})`;
      ctx.lineWidth = 2.5 * lvScale;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(angle) * trailLen, b.y - Math.sin(angle) * trailLen);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(204,68,255,${0.12 + lv * 0.04})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 8 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(204,68,255,${0.3 + lv * 0.06})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cc44ff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3 * lvScale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eeccff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 1.5 * lvScale, 0, Math.PI * 2); ctx.fill();
    } else {
      // base・その他: シンプルな青弾
      ctx.fillStyle = 'rgba(68,136,255,0.3)';
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4488ff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawEnemyBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.enemyBullets.values()) {
    ctx.fillStyle = 'rgba(255,50,50,0.3)';
    ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRangePreview(
  ctx: CanvasRenderingContext2D, state: GameState, config: GameConfig, ui: UIState,
): void {
  if (!ui.hoveredNodeId) return;
  const node = state.nodes.get(ui.hoveredNodeId);
  if (!node) return;

  const stats = getTowerLevelStats(config, node.type, node.level);
  if (stats.range != null) {
    ctx.strokeStyle = 'rgba(255,68,102,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(node.x, node.y, stats.range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // アップグレード後レンジプレビュー（確認ダイアログ表示中）
  if (ui.rangePreview && ui.rangePreview.nodeId === ui.hoveredNodeId) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, ui.rangePreview.range, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(68, 255, 136, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(68, 255, 136, 0.05)';
    ctx.fill();
    ctx.setLineDash([]);
  }
}

/** 選択中タワーのアップグレードレンジプレビュー（hoveredでなくても描画） */
function drawUpgradeRangePreview(
  ctx: CanvasRenderingContext2D, state: GameState, ui: UIState,
): void {
  if (!ui.rangePreview) return;
  const node = state.nodes.get(ui.rangePreview.nodeId);
  if (!node) return;
  // hoveredNodeId と一致する場合は drawRangePreview 内で描画済み
  if (ui.hoveredNodeId === ui.rangePreview.nodeId) return;

  ctx.beginPath();
  ctx.arc(node.x, node.y, ui.rangePreview.range, 0, Math.PI * 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(68, 255, 136, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(68, 255, 136, 0.05)';
  ctx.fill();
  ctx.setLineDash([]);
}

// ── エフェクト描画 ──

function drawEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const fx of state.effects) {
    const t = 1 - fx.timer / fx.duration; // 0→1

    if (fx.type === 'muzzle') {
      const r = 6 + t * 10;
      const alpha = 0.7 * (1 - t);
      const variant = fx.params.variant ?? 0; // 0=base, 1=sniper, 2=rapid, 3=cannon

      let glowColor: string;
      let coreColor: string;
      if (variant === 1) { // sniper
        glowColor = `rgba(255,100,120,${alpha})`;
        coreColor = `rgba(255,220,220,${0.9 * (1 - t)})`;
      } else if (variant === 2) { // rapid
        glowColor = `rgba(255,180,80,${alpha})`;
        coreColor = `rgba(255,240,200,${0.9 * (1 - t)})`;
      } else if (variant === 3) { // cannon
        glowColor = `rgba(200,100,255,${alpha})`;
        coreColor = `rgba(240,220,255,${0.9 * (1 - t)})`;
      } else {
        glowColor = `rgba(255,200,100,${alpha})`;
        coreColor = `rgba(255,255,220,${0.9 * (1 - t)})`;
      }

      ctx.fillStyle = glowColor;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coreColor;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.4, 0, Math.PI * 2); ctx.fill();

    } else if (fx.type === 'impact') {
      const variant = fx.params.variant ?? 0;
      const lv = fx.params.level ?? 1;
      const lvS = 0.8 + lv * 0.15;

      if (variant === 1) {
        // スナイパー着弾: 十字線フラッシュ
        const alpha = 0.9 * (1 - t);
        const len = (12 + lv * 3) * (1 + t * 0.5);
        const w = (1.5 + lv * 0.3) * (1 - t * 0.5);
        const gVal = Math.round(255 * (1 - t * 0.8));
        const bVal = Math.round(255 * (1 - t * 0.9));
        ctx.strokeStyle = `rgba(255,${gVal},${bVal},${alpha})`;
        ctx.lineWidth = w * lvS;
        ctx.beginPath();
        ctx.moveTo(fx.x - len * lvS, fx.y); ctx.lineTo(fx.x + len * lvS, fx.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y - len * lvS); ctx.lineTo(fx.x, fx.y + len * lvS);
        ctx.stroke();
        const cr = (3 + lv * 0.5) * (1 - t * 0.7) * lvS;
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, cr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,68,100,${alpha * 0.5})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, cr * 1.8, 0, Math.PI * 2); ctx.fill();
      } else if (variant === 2) {
        // ラピッド着弾: 4方向スパーク散乱
        const alpha = 0.8 * (1 - t);
        const dist = (6 + lv * 2) * t * lvS;
        const sparkR = (1.5 + lv * 0.2) * (1 - t * 0.6) * lvS;
        ctx.fillStyle = `rgba(255,170,50,${alpha})`;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const sx = fx.x + Math.cos(a) * dist;
          const sy = fx.y + Math.sin(a) * dist;
          ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, Math.PI * 2); ctx.fill();
        }
        const cr = (2.5 + lv * 0.3) * (1 - t) * lvS;
        ctx.fillStyle = `rgba(255,200,100,${alpha * 0.6})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, cr, 0, Math.PI * 2); ctx.fill();
      } else if (variant === 3) {
        // キャノン着弾: 拡大リング波
        const alpha = 0.7 * (1 - t);
        const ringR = (8 + lv * 4) * t * lvS;
        const ringW = (2 + lv * 0.5) * (1 - t * 0.5) * lvS;
        ctx.strokeStyle = `rgba(204,68,255,${alpha})`;
        ctx.lineWidth = ringW;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, ringR, 0, Math.PI * 2); ctx.stroke();
        if (t > 0.15) {
          const t2 = (t - 0.15) / 0.85;
          const r2 = ringR * 0.6;
          const a2 = 0.5 * (1 - t2);
          ctx.strokeStyle = `rgba(220,150,255,${a2})`;
          ctx.lineWidth = ringW * 0.6;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, r2, 0, Math.PI * 2); ctx.stroke();
        }
        const cr = (4 + lv * 0.8) * (1 - t * 0.8) * lvS;
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, cr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(204,68,255,${alpha * 0.4})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, cr * 2, 0, Math.PI * 2); ctx.fill();
      } else {
        // デフォルト着弾スパーク
        const r = 4 + t * 8;
        const alpha = 0.6 * (1 - t);
        ctx.fillStyle = `rgba(255,150,50,${alpha})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      }

    } else if (fx.type === 'explosion') {
      // 撃破パーティクル
      const alpha = 1 - t;
      const r = 2.5 * (1 - t * 0.5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fx.color;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

    } else if (fx.type === 'upgrade') {
      const variant = fx.params.variant ?? 0;
      if (variant === 0) {
        // UPG完了: 白フラッシュ
        const alpha = 0.7 * (1 - t);
        const r = 12 + t * 8;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(200,230,255,${alpha * 0.6})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // UPG完了: リング波
        const alpha = 0.5 * (1 - t);
        const r = 8 + t * 30;
        ctx.strokeStyle = `rgba(200,230,255,${alpha})`;
        ctx.lineWidth = 2 * (1 - t * 0.7);
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

// ── メイン描画 ──

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: GameConfig,
  camera: Camera,
  ui: UIState,
  assets: AssetMap,
): void {
  const w = camera.state.viewportWidth;
  const h = camera.state.viewportHeight;

  // 背景クリア（スクリーン座標で）
  resetTransform(ctx);
  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(0, 0, w, h);

  // カメラ変換を適用してワールド座標で描画
  applyTransform(ctx, camera.state);

  // 描画順: 背景 → エッジ → パケット → ノード → 敵 → 弾 → エフェクト
  drawGrid(ctx, 800, 600);
  drawEnemyPath(ctx, config.enemyPath);
  drawEdges(ctx, state, config, ui);
  drawEdgePreview(ctx, state, config, ui);
  drawPackets(ctx, state, config);
  drawEmptySlots(ctx, state, config);
  drawBase(ctx, state, config, assets);
  drawNodes(ctx, state, config, ui, assets);
  drawBaseRange(ctx, config);
  drawEnemies(ctx, state, config, assets);
  drawBullets(ctx, state);
  drawEnemyBullets(ctx, state);
  drawEffects(ctx, state);
  drawRangePreview(ctx, state, config, ui);
  drawUpgradeRangePreview(ctx, state, ui);

  // カメラ変換をリセット（HUDはスクリーン座標で描画されるため）
  resetTransform(ctx);
}

// ── ヒットテスト ──

export function hitTestNode(
  state: GameState, config: GameConfig, worldX: number, worldY: number,
): NodeId | null {
  const R = config.NODE_RADIUS;
  const R2 = R * R;

  // 配置済みノードのヒットテスト（手前から逆順でチェック）
  const nodes = Array.from(state.nodes.values());
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = worldX - n.x;
    const dy = worldY - n.y;
    if (dx * dx + dy * dy <= R2) {
      return n.id;
    }
  }

  return null;
}

/** 空きスロットのヒットテスト（ノードが存在しないスロットのみ対象） */
export function hitTestEmptySlot(
  state: GameState, config: GameConfig, worldX: number, worldY: number,
): Vec2 | null {
  const R = config.NODE_RADIUS;
  const R2 = R * R;

  for (const slot of config.nodeSlots) {
    if (findNodeAtSlot(state, slot.x, slot.y)) continue;
    const dx = worldX - slot.x;
    const dy = worldY - slot.y;
    if (dx * dx + dy * dy <= R2) {
      return slot;
    }
  }
  return null;
}

export function hitTestEdge(
  state: GameState, worldX: number, worldY: number, threshold: number = 10,
): EdgeId | null {
  let bestDist = threshold;
  let bestId: EdgeId | null = null;

  for (const edge of state.edges.values()) {
    if (edge.status === 'destroyed') continue;
    const fromNode = state.nodes.get(edge.from);
    const toNode = state.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const d = pointToSegmentDist(
      worldX, worldY,
      fromNode.x, fromNode.y,
      toNode.x, toNode.y,
    );
    if (d < bestDist) {
      bestDist = d;
      bestId = edge.id;
    }
  }

  return bestId;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 0.001) return Math.hypot(apx, apy);

  let t = (apx * abx + apy * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

// ── エフェクトシステム ──

export function updateEffects(state: GameState, dt: number): void {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    state.effects[i].timer -= dt;
    if (state.effects[i].timer <= 0) {
      state.effects.splice(i, 1);
    }
  }
}

/** エフェクト追加ヘルパー: マズルフラッシュ */
export function addMuzzleEffect(
  state: GameState, x: number, y: number, towerType: NodeType,
): void {
  const variant = towerType === 'sniper' ? 1 : towerType === 'rapid' ? 2 : towerType === 'cannon' ? 3 : 0;
  state.effects.push({
    type: 'muzzle',
    x, y,
    timer: 0.15,
    duration: 0.15,
    color: '',
    params: { variant },
  });
}

/** エフェクト追加ヘルパー: 着弾エフェクト */
export function addImpactEffect(
  state: GameState, x: number, y: number, towerType: NodeType, level: number,
): void {
  const variant = towerType === 'sniper' ? 1 : towerType === 'rapid' ? 2 : towerType === 'cannon' ? 3 : 0;
  state.effects.push({
    type: 'impact',
    x, y,
    timer: 0.25,
    duration: 0.25,
    color: '',
    params: { variant, level },
  });
}

/** エフェクト追加ヘルパー: 撃破パーティクル（複数生成） */
export function addExplosionParticles(
  state: GameState, x: number, y: number, color: string, count: number = 8,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 30 + Math.random() * 40;
    const dur = 0.3 + Math.random() * 0.2;
    state.effects.push({
      type: 'explosion',
      x: x + Math.cos(angle) * 2,
      y: y + Math.sin(angle) * 2,
      timer: dur,
      duration: dur,
      color,
      params: { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
    });
  }
}

/** エフェクト追加ヘルパー: アップグレード完了 */
export function addUpgradeEffect(state: GameState, x: number, y: number): void {
  state.effects.push({
    type: 'upgrade',
    x, y,
    timer: 0.4,
    duration: 0.4,
    color: '',
    params: { variant: 0 },
  });
  state.effects.push({
    type: 'upgrade',
    x, y,
    timer: 0.6,
    duration: 0.6,
    color: '',
    params: { variant: 1 },
  });
}

/** エフェクトの速度ベース位置更新（explosionパーティクル用） */
export function updateEffectPositions(state: GameState, dt: number): void {
  for (const fx of state.effects) {
    if (fx.type === 'explosion' && fx.params.vx != null) {
      fx.x += fx.params.vx * dt;
      fx.y += fx.params.vy * dt;
      // 減速
      fx.params.vx *= 0.95;
      fx.params.vy *= 0.95;
    }
  }
}
