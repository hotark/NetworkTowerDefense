// Core Layer: Entity type definitions and branded IDs

// ── ブランド型ID ──
export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };
export type PacketId = string & { readonly __brand: 'PacketId' };
export type EnemyId = string & { readonly __brand: 'EnemyId' };
export type BulletId = string & { readonly __brand: 'BulletId' };

// ── ノード種別 ──
export type NodeType = 'generator' | 'sniper' | 'rapid' | 'cannon' | 'distributor' | 'repeater';
export type AttackNodeType = 'sniper' | 'rapid' | 'cannon';

// ── 敵種別 ──
export type EnemyType = 'normal' | 'fast' | 'tank' | 'edgeAttacker' | 'towerAttacker' | 'disabler';

// ── ノード状態 ──
export type NodeStatus = 'building' | 'active' | 'upgrading' | 'disabled';

// ── エッジ状態 ──
export type EdgeStatus = 'active' | 'upgrading' | 'disabled' | 'destroyed';

// ── エンティティ定義 ──
export interface HeldPacket {
  timer: number;
  fromEdgeId: EdgeId;
  charge: number;
}

export interface TowerNode {
  readonly id: NodeId;
  type: NodeType;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  status: NodeStatus;
  ammo: number;
  nextOut: number;
  cooldown: number;
  buildTimer: number;
  upgradeTimer: number;
  disableTimer: number;
  held: HeldPacket[];
  facingAngle: number | null;
}

export interface Edge {
  readonly id: EdgeId;
  from: NodeId;
  to: NodeId;
  level: number;
  hp: number;
  maxHp: number;
  status: EdgeStatus;
  disableTimer: number;
}

export interface Packet {
  readonly id: PacketId;
  edgeId: EdgeId;
  progress: number;
  charge: number;
  speed: number;
}

export interface Enemy {
  readonly id: EnemyId;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  pathIndex: number;
  pathProgress: number;
  reward: number;
  strength: number;
  isBoss: boolean;
  attackTimer: number;
  attackRange: number;
  attackDamage: number;
  attackInterval: number;
  angle: number;
  atBase: boolean;
}

export interface Bullet {
  readonly id: BulletId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetId: EnemyId;
  deadPos: { x: number; y: number } | null;
  speed: number;
  damage: number;
  towerType: NodeType;
  level: number;
}

export interface EnemyBullet {
  readonly id: BulletId;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  targetKind: 'edge' | 'node';
  edgeId: EdgeId | null;
  nodeId: NodeId | null;
}

export interface Effect {
  type: 'muzzle' | 'impact' | 'explosion' | 'upgrade';
  x: number;
  y: number;
  timer: number;
  duration: number;
  color: string;
  params: Record<string, number>;
}

// ── 敵定義データ ──
export interface EnemyLevelStats {
  readonly hp: number;
  readonly speed: number;
  readonly reward: number;
  readonly attackRange?: number;
  readonly attackDamage?: number;
  readonly attackInterval?: number;
}

export type EnemyBehavior = 'path' | 'edgeAttack' | 'towerAttack';

export interface EnemyTypeDef {
  readonly label: string;
  readonly color: string;
  readonly stroke: string;
  readonly radius: number;
  readonly behavior: EnemyBehavior;
  readonly levels: ReadonlyArray<EnemyLevelStats>;
  readonly bossLevels?: ReadonlyArray<EnemyLevelStats>;
}

// ── ウェーブ定義 ──
export interface WaveEnemyEntry {
  readonly type: EnemyType;
  readonly count: number;
  readonly str: number;
  readonly boss?: boolean;
}

export interface WaveDef {
  readonly enemies: ReadonlyArray<WaveEnemyEntry>;
}

// ── マップデータ ──
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}
