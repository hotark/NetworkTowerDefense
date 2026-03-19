// inputHandler.js — 入力 + UIパネル管理

import { TOWER_TYPES, EDGE_DEF, SPOT_RADIUS, TOWER_DRAW_SIZE } from '../core/config.js';
import { SPOTS, BASE_POS } from '../core/map.js';

export class InputHandler {
  constructor(canvas, panelEl, state) {
    this.canvas = canvas;
    this.panel = panelEl;
    this.state = state;

    // Visual state
    this.selectedTower = null;
    this.selectedEdge = null;
    this.selectedBase = false;
    this.selectedTool = null;
    this.dragging = false;
    this.dragFromTower = null;
    this.dragX = 0;
    this.dragY = 0;
    this.activeTab = 'info';
    this.dialogVisible = false;
    this.hoverX = -1;
    this.hoverY = -1;

    // Pointer tracking
    this._pointerDown = false;
    this._pointerStart = null;
    this._pointerMoved = false;

    this.setupCanvasInput();
    this.buildToolbar();
    this.buildTabs();
    this.buildDialog();
    this.buildWaveControls();
  }

  getVisualState() {
    return {
      selectedTower: this.selectedTower,
      selectedEdge: this.selectedEdge,
      dragging: this.dragging,
      dragFromTower: this.dragFromTower,
      dragX: this.dragX,
      dragY: this.dragY,
      upgradePreview: this.upgradePreview || null,
      selectedTool: this.selectedTool,
      hoverX: this.hoverX,
      hoverY: this.hoverY,
    };
  }

  // ===== Canvas Input =====
  setupCanvasInput() {
    this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', e => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', e => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', e => this.onPointerCancel(e));
    this.canvas.addEventListener('mousemove', e => {
      const pos = this.canvasPos(e);
      this.hoverX = pos.x;
      this.hoverY = pos.y;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = -1;
      this.hoverY = -1;
    });
  }

  canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  onPointerDown(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const pos = this.canvasPos(e);
    this._pointerDown = true;
    this._pointerStart = pos;
    this._pointerMoved = false;

    // タワー上をクリック → 即座に選択+詳細表示 & ドラッグ開始候補
    for (const tower of this.state.towers) {
      if (tower.destroyed) continue;
      const d = Math.hypot(tower.x - pos.x, tower.y - pos.y);
      if (d < TOWER_DRAW_SIZE / 2 + 8) {
        this.dragFromTower = tower.id;
        this.selectedTower = tower.id;
        this.selectedEdge = null;
        this.selectedBase = false;
        this.updateInfoPanel();
        break;
      }
    }
  }

  onPointerMove(e) {
    if (!this._pointerDown) return;
    const pos = this.canvasPos(e);

    if (this._pointerStart) {
      const d = Math.hypot(pos.x - this._pointerStart.x, pos.y - this._pointerStart.y);
      if (d > 8) this._pointerMoved = true;
    }

    if (this._pointerMoved && this.dragFromTower) {
      this.dragging = true;
      this.dragX = pos.x;
      this.dragY = pos.y;
    }
  }

  onPointerUp(e) {
    const pos = this.canvasPos(e);

    if (this.dragging && this.dragFromTower) {
      // ドラッグ完了 — ターゲットタワーを探してエッジ作成
      for (const tower of this.state.towers) {
        if (tower.destroyed || tower.id === this.dragFromTower) continue;
        const d = Math.hypot(tower.x - pos.x, tower.y - pos.y);
        if (d < TOWER_DRAW_SIZE / 2 + 12) {
          this.state.addEdge(this.dragFromTower, tower.id);
          break;
        }
      }
    } else if (!this._pointerMoved) {
      this.handleTap(pos);
    }

    this._pointerDown = false;
    this._pointerStart = null;
    this._pointerMoved = false;
    this.dragging = false;
    this.dragFromTower = null;
  }

  onPointerCancel(e) {
    this._pointerDown = false;
    this._pointerStart = null;
    this._pointerMoved = false;
    this.dragging = false;
    this.dragFromTower = null;
  }

  handleTap(pos) {
    // ツール選択中 → スポットに建設
    if (this.selectedTool) {
      for (const spot of SPOTS) {
        const d = Math.hypot(spot.x - pos.x, spot.y - pos.y);
        if (d < SPOT_RADIUS + 5) {
          this.state.buildTower(spot.id, this.selectedTool);
          this.selectedTool = null;
          this.updateToolbar();
          this.updateInfoPanel();
          return;
        }
      }
      this.selectedTool = null;
      this.updateToolbar();
      return;
    }

    // タワー選択
    for (const tower of this.state.towers) {
      if (tower.destroyed) continue;
      const d = Math.hypot(tower.x - pos.x, tower.y - pos.y);
      if (d < TOWER_DRAW_SIZE / 2 + 8) {
        this.selectedTower = tower.id;
        this.selectedEdge = null;
        this.selectedBase = false;
        this.updateInfoPanel();
        return;
      }
    }

    // 拠点クリック
    const baseDist = Math.hypot(pos.x - BASE_POS.x, pos.y - BASE_POS.y);
    if (baseDist < 30) {
      this.selectedBase = true;
      this.selectedTower = null;
      this.selectedEdge = null;
      this.updateInfoPanel();
      return;
    }

    // エッジ選択
    for (const edge of this.state.edges) {
      if (edge.destroyed) continue;
      const from = this.state.getTower(edge.fromTowerId);
      const to = this.state.getTower(edge.toTowerId);
      if (!from || !to) continue;
      const dist = this.pointToSegDist(pos.x, pos.y, from.x, from.y, to.x, to.y);
      if (dist < 12) {
        this.selectedEdge = edge.id;
        this.selectedTower = null;
        this.selectedBase = false;
        this.updateInfoPanel();
        return;
      }
    }

    // 何もない → 選択解除
    this.selectedTower = null;
    this.selectedEdge = null;
    this.selectedBase = false;
    this.updateInfoPanel();
  }

  pointToSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ===== UI Building =====
  buildToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = '';

    const categories = [
      { key: 'generator', label: '生成' },
      { key: 'relay',     label: '中継' },
      { key: 'attack',    label: '攻撃' },
    ];

    for (const cat of categories) {
      const group = document.createElement('div');
      group.className = 'tool-group';

      const header = document.createElement('div');
      header.className = 'tool-group-label';
      header.textContent = cat.label;
      group.appendChild(header);

      const row = document.createElement('div');
      row.className = 'tool-group-row';

      for (const [type, def] of Object.entries(TOWER_TYPES)) {
        if (def.category !== cat.key) continue;
        const btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.dataset.type = type;
        btn.innerHTML = `
          <div class="tool-header">
            <img class="tool-icon" src="assets/towers/${type}.svg" alt="">
            <div class="tool-text">
              <span class="tool-label">${def.label}</span>
              <span class="tool-desc">${def.desc}</span>
            </div>
          </div>
          <span class="tool-cost">$${def.buildCost}</span>`;
        btn.addEventListener('click', () => {
          this.selectedTool = this.selectedTool === type ? null : type;
          this.selectedTower = null;
          this.selectedEdge = null;
          this.updateToolbar();
          this.updateInfoPanel();
        });
        row.appendChild(btn);
      }
      group.appendChild(row);
      toolbar.appendChild(group);
    }
    this.updateToolbar();
  }

  updateToolbar() {
    const btns = document.querySelectorAll('.tool-btn');
    for (const btn of btns) {
      btn.classList.toggle('active', btn.dataset.type === this.selectedTool);
    }
  }

  buildTabs() {
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';
    for (const tab of ['info', 'log']) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.textContent = tab === 'info' ? '情報' : 'ログ';
      btn.dataset.tab = tab;
      btn.addEventListener('click', () => {
        this.activeTab = tab;
        this.updateTabs();
      });
      tabBar.appendChild(btn);
    }
    this.updateTabs();
  }

  updateTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    for (const btn of btns) {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    }
    document.getElementById('info-panel').style.display = this.activeTab === 'info' ? 'block' : 'none';
    document.getElementById('log-panel').style.display = this.activeTab === 'log' ? 'block' : 'none';
  }

  updateInfoPanel() {
    const panel = document.getElementById('info-content');
    const actions = document.getElementById('info-actions');

    // 拠点選択中
    if (this.selectedBase) {
      this.updateInfoBase();
      return;
    }

    // ツール選択中
    if (this.selectedTool) {
      const def = TOWER_TYPES[this.selectedTool];
      const ld = def.levels[0];
      let html = `<div class="info-title" style="color:${def.color}">${def.label}</div>`;
      const hp = Array.isArray(def.hp) ? def.hp[0] : def.hp;
      html += `<div>費用: $${def.buildCost} | HP: ${hp}</div>`;
      html += `<div>接続範囲: ${def.connectRange}px</div>`;
      if (def.category === 'generator') {
        html += `<div>生成速度: ${ld.genRate}/秒 | 量: ${ld.genAmount}</div>`;
      } else if (def.category === 'relay') {
        if (ld.amplifyRate) html += `<div>増幅率: x${ld.amplifyRate} | 処理間隔: ${ld.holdTime}秒</div>`;
        if (ld.maxOutputs) html += `<div>最大出力: ${ld.maxOutputs} | 処理間隔: ${ld.holdTime}秒</div>`;
      } else {
        html += `<div>火力: ${ld.damage} | 発射速度: ${ld.fireRate}/秒</div>`;
        html += `<div>弾薬消費: ${ld.packetCost} | 射程: ${ld.range}px</div>`;
      }
      html += `<div class="hint">スポット(点線円)をクリックして建設</div>`;
      panel.innerHTML = html;
      actions.innerHTML = '';
      return;
    }

    // タワー選択中
    if (this.selectedTower) {
      const tower = this.state.getTower(this.selectedTower);
      if (!tower || tower.destroyed) {
        panel.innerHTML = '<div class="info-title">破壊済み</div>';
        actions.innerHTML = '';
        return;
      }
      const def = tower.def;
      const ld = tower.levelDef;
      let html = `<div class="info-title" style="color:${def.color}">${def.label} Lv${tower.level}</div>`;
      if (tower.status === 'building') {
        html += `<div style="color:#4488ff">建設中... ${Math.ceil(tower.buildTimer)}秒</div>`;
      } else if (tower.status === 'upgrading') {
        html += `<div style="color:#4488ff">Lv${tower._pendingLevel}に強化中... ${Math.ceil(tower.buildTimer)}秒</div>`;
      }
      html += `<div id="tower-hp-display">HP: ${Math.floor(tower.hp)}/${tower.maxHp}</div>`;
      if (tower.category === 'generator') {
        html += `<div>生成速度: ${ld.genRate}/秒 | 量: ${ld.genAmount}</div>`;
      } else if (tower.type === 'relay_amplify') {
        html += `<div>増幅率: x${ld.amplifyRate} | 処理間隔: ${ld.holdTime}秒</div>`;
        html += `<div id="tower-queue-display">待ちパケット: ${tower.holdQueue.length}</div>`;
      } else if (tower.type === 'relay_distribute') {
        html += `<div>出力数: ${ld.maxOutputs} | 処理間隔: ${ld.holdTime}秒</div>`;
        html += `<div id="tower-queue-display">待ちパケット: ${tower.holdQueue.length}</div>`;
      } else {
        html += `<div>火力: ${ld.damage} | 発射: ${ld.fireRate}/秒</div>`;
        html += `<div>弾薬消費: ${ld.packetCost} | 射程: ${ld.range}px</div>`;
        html += `<div id="tower-ammo-display">弾薬: ${tower.ammo}</div>`;
      }
      html += `<div>状態: ${tower.enabled ? '稼働中' : '停止中'}</div>`;
      panel.innerHTML = html;

      let actHtml = '';
      if (tower.status === 'active' && tower.level < 5) {
        const nextLd = def.levels[tower.level];
        actHtml += `<button class="act-btn" id="act-upgrade">強化 Lv${tower.level + 1} ($${nextLd.upgradeCost})</button>`;
      }
      if (tower.hp < tower.maxHp && !tower.repairing) {
        actHtml += `<button class="act-btn" id="act-repair">修理</button>`;
      } else if (tower.repairing) {
        actHtml += `<div class="repairing">修理中... ${Math.floor(tower.hp)}/${tower.maxHp}</div>`;
      }
      actHtml += `<button class="act-btn" id="act-toggle">${tower.enabled ? '停止' : '稼働'}</button>`;
      actHtml += `<button class="act-btn danger" id="act-sell">売却</button>`;
      actions.innerHTML = actHtml;

      this.bindAction('act-upgrade', () => this.showUpgradeDialog(tower));
      this.bindAction('act-repair', () => { this.state.repairTower(tower.id); this.updateInfoPanel(); });
      this.bindAction('act-toggle', () => { this.state.toggleTower(tower.id); this.updateInfoPanel(); });
      this.bindAction('act-sell', () => this.showSellDialog(tower));
      return;
    }

    // エッジ選択中
    if (this.selectedEdge) {
      const edge = this.state.getEdge(this.selectedEdge);
      if (!edge || edge.destroyed) {
        panel.innerHTML = '<div class="info-title">破壊済み</div>';
        actions.innerHTML = '';
        return;
      }
      const ld = edge.levelDef;
      let html = `<div class="info-title">エッジ Lv${edge.level}</div>`;
      if (edge.status === 'building') {
        html += `<div style="color:#4488ff">建設中... ${Math.ceil(edge.buildTimer)}秒</div>`;
      } else if (edge.status === 'upgrading') {
        html += `<div style="color:#4488ff">Lv${edge._pendingLevel}に強化中... ${Math.ceil(edge.buildTimer)}秒</div>`;
      }
      html += `<div>HP: ${Math.floor(edge.hp)}/${edge.maxHp}</div>`;
      html += `<div>帯域: ${ld.bandwidth} | 速度: x${ld.speed}</div>`;
      html += `<div>使用量: ${edge.chargeOnEdge(this.state.packets)}/${ld.bandwidth}</div>`;
      html += `<div>状態: ${edge.enabled ? '有効' : '無効'}</div>`;
      panel.innerHTML = html;

      let actHtml = '';
      if (edge.status === 'active' && edge.level < 5) {
        const nextLd = EDGE_DEF.levels[edge.level];
        actHtml += `<button class="act-btn" id="act-upgrade">強化 Lv${edge.level + 1} ($${nextLd.upgradeCost})</button>`;
      }
      if (edge.hp < edge.maxHp && !edge.repairing) {
        actHtml += `<button class="act-btn" id="act-repair">修理</button>`;
      } else if (edge.repairing) {
        actHtml += `<div class="repairing">修理中... ${Math.floor(edge.hp)}/${edge.maxHp}</div>`;
      }
      actHtml += `<button class="act-btn" id="act-reverse">反転</button>`;
      actHtml += `<button class="act-btn" id="act-toggle">${edge.enabled ? '無効化' : '有効化'}</button>`;
      actHtml += `<button class="act-btn danger" id="act-remove">撤去</button>`;
      actions.innerHTML = actHtml;

      this.bindAction('act-upgrade', () => this.showEdgeUpgradeDialog(edge));
      this.bindAction('act-repair', () => { this.state.repairEdge(edge.id); this.updateInfoPanel(); });
      this.bindAction('act-reverse', () => { this.state.reverseEdge(edge.id); this.updateInfoPanel(); });
      this.bindAction('act-toggle', () => { this.state.toggleEdge(edge.id); this.updateInfoPanel(); });
      this.bindAction('act-remove', () => {
        this.state.removeEdge(edge.id);
        this.selectedEdge = null;
        this.updateInfoPanel();
      });
      return;
    }

    panel.innerHTML = `<div class="hint">タワーやエッジを選択、または上のツールで建設<br><br>
      <strong>操作方法:</strong><br>
      ・ツールバー → スポットクリックで建設<br>
      ・タワーからタワーへドラッグでエッジ接続<br>
      ・エッジクリックで選択・操作</div>`;
    actions.innerHTML = '';
  }

  bindAction(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  updateLogPanel() {
    const logEl = document.getElementById('log-content');
    const recent = this.state.logs.slice(-20).reverse();
    logEl.textContent = recent.join('\n');
  }

  buildDialog() {
    this.dialogEl = document.getElementById('dialog');
  }

  showUpgradeDialog(tower) {
    const def = tower.def;
    const curLd = tower.levelDef;
    const nextLd = def.levels[tower.level];
    if (!nextLd) return;

    let html = `<div class="dialog-title">${def.label} を Lv${tower.level + 1} に強化？</div>`;
    html += `<div class="dialog-cost">費用: $${nextLd.upgradeCost}</div>`;
    html += `<table class="stat-diff">`;

    if (tower.category === 'generator') {
      html += this.diffRow('生成速度', curLd.genRate, nextLd.genRate, '/秒');
      html += this.diffRow('生成量', curLd.genAmount, nextLd.genAmount);
    } else if (tower.type === 'relay_amplify') {
      html += this.diffRow('増幅率', curLd.amplifyRate, nextLd.amplifyRate, 'x');
    } else if (tower.type === 'relay_distribute') {
      html += this.diffRow('出力数', curLd.maxOutputs, nextLd.maxOutputs);
      html += this.diffRow('処理量', curLd.throughput, nextLd.throughput);
    } else {
      html += this.diffRow('火力', curLd.damage, nextLd.damage);
      html += this.diffRow('発射速度', curLd.fireRate, nextLd.fireRate, '/秒');
      html += this.diffRow('弾薬消費', curLd.packetCost, nextLd.packetCost);
      html += this.diffRow('射程', curLd.range, nextLd.range, 'px');
    }
    html += `</table>`;
    html += `<div class="dialog-btns">
      <button id="dialog-confirm" class="act-btn">強化する</button>
      <button id="dialog-cancel" class="act-btn">キャンセル</button>
    </div>`;

    this.dialogEl.innerHTML = html;
    this.dialogEl.classList.add('show');
    this.dialogVisible = true;

    // 攻撃タワーの場合、射程プレビューを表示
    if (tower.category === 'attack') {
      this.upgradePreview = {
        towerId: tower.id,
        currentRange: curLd.range,
        nextRange: nextLd.range,
      };
    }

    document.getElementById('dialog-confirm').addEventListener('click', () => {
      this.state.upgradeTower(tower.id);
      this.upgradePreview = null;
      this.closeDialog();
      this.updateInfoPanel();
    });
    document.getElementById('dialog-cancel').addEventListener('click', () => {
      this.upgradePreview = null;
      this.closeDialog();
    });
  }

  showEdgeUpgradeDialog(edge) {
    const curLd = edge.levelDef;
    const nextLd = EDGE_DEF.levels[edge.level];
    if (!nextLd) return;

    let html = `<div class="dialog-title">エッジ Lv${edge.level + 1} に強化？</div>`;
    html += `<div class="dialog-cost">費用: $${nextLd.upgradeCost}</div>`;
    html += `<table class="stat-diff">`;
    html += this.diffRow('帯域', curLd.bandwidth, nextLd.bandwidth);
    html += this.diffRow('速度', curLd.speed, nextLd.speed, 'x');
    html += `</table>`;
    html += `<div class="dialog-btns">
      <button id="dialog-confirm" class="act-btn">強化する</button>
      <button id="dialog-cancel" class="act-btn">キャンセル</button>
    </div>`;

    this.dialogEl.innerHTML = html;
    this.dialogEl.classList.add('show');
    this.dialogVisible = true;

    document.getElementById('dialog-confirm').addEventListener('click', () => {
      this.state.upgradeEdge(edge.id);
      this.closeDialog();
      this.updateInfoPanel();
    });
    document.getElementById('dialog-cancel').addEventListener('click', () => this.closeDialog());
  }

  showBaseUpgradeDialog() {
    const s = this.state;
    if (s.baseLevel >= 5 || s.baseUpgrading) return;
    const curDef = s.baseLevelDef;
    const nextDef = s.baseLevels[s.baseLevel];

    let html = `<div class="dialog-title">拠点を Lv${s.baseLevel + 1} に強化？</div>`;
    html += `<div class="dialog-cost">費用: $${nextDef.upgradeCost}</div>`;
    html += `<table class="stat-diff">`;
    html += this.diffRow('最大HP', curDef.maxHp, nextDef.maxHp);
    html += this.diffRow('攻撃力', curDef.damage, nextDef.damage);
    html += this.diffRow('射程', curDef.range, nextDef.range, 'px');
    html += this.diffRow('攻撃間隔', curDef.cooldown, nextDef.cooldown, '秒');
    html += `</table>`;
    html += `<div class="dialog-btns">
      <button id="dialog-confirm" class="act-btn">強化する</button>
      <button id="dialog-cancel" class="act-btn">キャンセル</button>
    </div>`;

    this.dialogEl.innerHTML = html;
    this.dialogEl.classList.add('show');
    this.dialogVisible = true;

    document.getElementById('dialog-confirm').addEventListener('click', () => {
      this.state.upgradeBase();
      this.closeDialog();
      this.updateInfoPanel();
    });
    document.getElementById('dialog-cancel').addEventListener('click', () => this.closeDialog());
  }

  showSellDialog(tower) {
    const def = tower.def;
    let totalCost = def.buildCost;
    for (let i = 1; i < tower.level; i++) totalCost += def.levels[i].upgradeCost;
    const refund = Math.floor(totalCost * 0.5);

    let html = `<div class="dialog-title">${def.label} Lv${tower.level} を売却？</div>`;
    html += `<div>返金額: +$${refund}</div>`;
    html += `<div class="warning">接続されたエッジも全て撤去されます</div>`;
    html += `<div class="dialog-btns">
      <button id="dialog-confirm" class="act-btn danger">売却する</button>
      <button id="dialog-cancel" class="act-btn">キャンセル</button>
    </div>`;

    this.dialogEl.innerHTML = html;
    this.dialogEl.classList.add('show');
    this.dialogVisible = true;

    document.getElementById('dialog-confirm').addEventListener('click', () => {
      this.state.sellTower(tower.id);
      this.selectedTower = null;
      this.closeDialog();
      this.updateInfoPanel();
    });
    document.getElementById('dialog-cancel').addEventListener('click', () => this.closeDialog());
  }

  diffRow(label, cur, next, unit = '') {
    const diff = next - cur;
    const color = diff > 0 ? '#44ff44' : diff < 0 ? '#ff4444' : '#888';
    const sign = diff > 0 ? '+' : '';
    const diffVal = Number.isInteger(diff) ? diff : diff.toFixed(1);
    return `<tr>
      <td>${label}</td>
      <td>${cur}${unit}</td>
      <td style="color:${color}">${next}${unit} (${sign}${diffVal})</td>
    </tr>`;
  }

  closeDialog() {
    this.dialogEl.classList.remove('show');
    this.dialogVisible = false;
  }

  buildWaveControls() {
    document.getElementById('wave-btn').addEventListener('click', () => {
      this.state.startWave();
      this.updateInfoPanel();
    });
    document.getElementById('base-detail-btn').addEventListener('click', () => {
      this.selectedTower = null;
      this.selectedEdge = null;
      this.selectedBase = true;
      this.updateInfoPanel();
    });
  }

  updateInfoBase() {
    const panel = document.getElementById('info-content');
    const actions = document.getElementById('info-actions');
    const s = this.state;
    const def = s.baseLevelDef;

    let html = `<div class="info-title" style="color:#4488ff">拠点 Lv${s.baseLevel}</div>`;
    if (s.baseUpgrading) {
      html += `<div style="color:#4488ff">Lv${s._pendingBaseLevel}に強化中... ${Math.ceil(s.baseBuildTimer)}秒</div>`;
    }
    html += `<div id="base-hp-display">HP: ${Math.floor(s.baseHp)}/${s.maxBaseHp}${s.baseRepairing ? ' 修理中' : ''}</div>`;
    html += `<div>攻撃力: ${def.damage} | 射程: ${def.range}px</div>`;
    html += `<div>攻撃間隔: ${def.cooldown}秒</div>`;
    panel.innerHTML = html;

    let actHtml = '';
    if (!s.baseUpgrading && s.baseLevel < 5) {
      const nextDef = s.baseLevels[s.baseLevel];
      actHtml += `<button class="act-btn" id="act-base-upgrade">強化 Lv${s.baseLevel + 1} ($${nextDef.upgradeCost})</button>`;
    }
    if (s.baseHp < s.maxBaseHp && !s.baseRepairing) {
      actHtml += `<button class="act-btn" id="act-base-repair">修理 ($${s.baseRepairCost})</button>`;
    }
    actions.innerHTML = actHtml;

    this.bindAction('act-base-upgrade', () => this.showBaseUpgradeDialog());
    this.bindAction('act-base-repair', () => {
      this.state.repairBase();
      this.updateInfoPanel();
    });
  }

  /** 毎フレーム呼ばれる — textContent更新のみ */
  updateStatusBar() {
    const s = this.state;
    document.getElementById('stat-money').textContent = `$${s.money}`;
    const hpText = s.baseRepairing
      ? `Lv${s.baseLevel} ${Math.floor(s.baseHp)}/${s.maxBaseHp} 修理中`
      : `Lv${s.baseLevel} ${Math.floor(s.baseHp)}/${s.maxBaseHp}`;
    document.getElementById('stat-hp').textContent = hpText;
    document.getElementById('stat-wave').textContent = s.waveManager.waveLabel;

    const wm = s.waveManager;
    const waveBtn = document.getElementById('wave-btn');
    if (s.gameResult !== 'playing') {
      waveBtn.textContent = s.gameResult === 'victory' ? '勝利！' : '敗北…';
      waveBtn.disabled = true;
    } else if (wm.allWavesComplete) {
      waveBtn.textContent = '全ウェーブ完了';
      waveBtn.disabled = true;
    } else if (wm.countdownActive) {
      const label = wm.currentWave === 0 ? 'W1開始' : '次ウェーブ';
      waveBtn.textContent = `${label} (${Math.ceil(wm.countdown)}秒) +$${Math.floor(wm.countdown * 5)}`;
      waveBtn.disabled = false;
    } else if (wm.waveActive && !wm.spawnComplete) {
      waveBtn.textContent = '出撃中...';
      waveBtn.disabled = true;
    } else {
      waveBtn.textContent = wm.currentWave === 0 ? 'ウェーブ1 開始' : '次のウェーブ開始';
      waveBtn.disabled = false;
    }

    // 選択中の要素のリアルタイム更新（DOM再構築せずtextContentのみ）
    if (this.selectedBase) {
      const hpEl = document.getElementById('base-hp-display');
      if (hpEl) hpEl.textContent = `HP: ${Math.floor(s.baseHp)}/${s.maxBaseHp}${s.baseRepairing ? ' 修理中' : ''}`;
    }
    if (this.selectedTower) {
      const tower = s.getTower(this.selectedTower);
      if (tower) {
        const hpEl = document.getElementById('tower-hp-display');
        if (hpEl) hpEl.textContent = `HP: ${Math.floor(tower.hp)}/${tower.maxHp}${tower.repairing ? ' 修理中' : ''}`;
        const qEl = document.getElementById('tower-queue-display');
        if (qEl) qEl.textContent = `待ちパケット: ${tower.holdQueue.length}`;
        const ammoEl = document.getElementById('tower-ammo-display');
        if (ammoEl) ammoEl.textContent = `弾薬: ${tower.ammo}`;
      }
    }

    if (this.activeTab === 'log') {
      this.updateLogPanel();
    }
  }
}
