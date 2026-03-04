# Technology Stack

## アーキテクチャ

**3層オニオン構造（Core / Game / Browser）**

依存ルール: `Browser → Game → Core`（内側は外側を知らない）

- **Core**: 型定義、設定データ、エンジン基盤（Camera, Input）
- **Game**: ゲームロジック（純粋関数）、ゲーム描画
- **Browser**: DOM操作、UIバインド、エントリポイント

設計パターン: **MVP**（Model-View-Presenter）
- Model = GameState（純粋データ）
- View = Canvas描画 + HTML UI
- Presenter = GameApp（Modelを更新し、Viewに渡す）

## コア技術

- **言語**: TypeScript（strict mode）
- **ビルド**: Vite（HMR + esbuildによる高速ビルド）
- **描画**: Canvas 2D API
- **UIリアクティブ**: Preact Signals (`@preact/signals-core`, ~2KB)
- **入力**: Pointer Events API（マウス＋タッチ統合）

## 主要な技術判断

### 状態管理: Map<ID, Entity>
エンティティは一意IDで管理し、配列インデックス参照を避ける。
削除時にインデックスがずれてバグになるmockupの教訓から。

### ゲームループ: 固定タイムステップ
```typescript
// 物理更新は固定間隔、描画は可変フレームレート
while (accumulator >= FIXED_DT) {
  update(FIXED_DT)
  accumulator -= FIXED_DT
}
render()
```

### インフラはクラス、ゲームロジックは関数
- Camera, InputManager, Renderer → クラス（状態を持つ）
- updatePackets, updateEnemies, updateBullets → 純粋関数（GameStateを受け取って変更）

### カメラシステム
モバイル対応の必須要件。screen↔world座標変換を全描画・全入力に適用。
- PC: マウスホイールでズーム
- モバイル: ピンチズーム + 2本指パン
- CSS `touch-action: none` でブラウザデフォルト無効化

### UIバインド: Preact Signals
HP/資源/ウェーブ等のHUD値をsignal化し、effect()でDOM自動更新。
Canvas描画は毎フレーム手動（signalは使わない）。

## 開発環境

### コマンド
```bash
npm run dev     # Vite dev server (HMR)
npm run build   # プロダクションビルド
npm run preview # ビルド結果プレビュー
```

### デプロイ先
- **GitHub Pages** — 唯一のデプロイ先。Viteビルド → 静的ファイルをpush

## mockup（検証済みリファレンス）

本番コードはmockup/part003の検証済み実装を移植する。
- `mockup/part003/` — ゲーム本体（MS0〜MS5完了）
- `mockup/tool001/` — バランスシミュレーター（待ち行列理論）
- `mockup/tool002/` — 待ち行列検証ツール

---
_標準とパターンを記述。全依存関係のリストではない_
