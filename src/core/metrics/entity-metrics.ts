// Core Layer: Per-entity rolling metrics container

import type { NodeId, EdgeId } from '@core/types';
import { RollingWindow } from './rolling-window';

/** Per-entity rolling metrics tracker */
export interface EntityRollingMetrics {
  supply: RollingWindow;
  consumption: RollingWindow;
  idle: RollingWindow;
}

export function createEntityRollingMetrics(): EntityRollingMetrics {
  return {
    supply: new RollingWindow(),
    consumption: new RollingWindow(),
    idle: new RollingWindow(),
  };
}

/** Container for all per-entity rolling metrics */
export interface RollingMetricsStore {
  node: Map<NodeId, EntityRollingMetrics>;
  edge: Map<EdgeId, EntityRollingMetrics>;
}

export function createRollingMetricsStore(): RollingMetricsStore {
  return {
    node: new Map(),
    edge: new Map(),
  };
}

export function getNodeRollingMetrics(
  store: RollingMetricsStore, id: NodeId,
): EntityRollingMetrics {
  let m = store.node.get(id);
  if (!m) {
    m = createEntityRollingMetrics();
    store.node.set(id, m);
  }
  return m;
}

export function getEdgeRollingMetrics(
  store: RollingMetricsStore, id: EdgeId,
): EntityRollingMetrics {
  let m = store.edge.get(id);
  if (!m) {
    m = createEntityRollingMetrics();
    store.edge.set(id, m);
  }
  return m;
}
