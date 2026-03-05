// Core Layer: 60-second rolling window for per-entity metrics

const WINDOW_SIZE = 60; // seconds

interface TimedEvent {
  time: number;
  value: number;
}

interface IdleEntry {
  time: number;
  duration: number;
}

export class RollingWindow {
  private events: TimedEvent[] = [];
  private idleEntries: IdleEntry[] = [];

  /** Record a supply or consumption event */
  recordEvent(simTime: number, value: number = 1): void {
    this.events.push({ time: simTime, value });
  }

  /** Record idle time for this frame */
  recordIdle(simTime: number, dt: number): void {
    this.idleEntries.push({ time: simTime, duration: dt });
  }

  /** Prune entries older than 60 seconds */
  prune(simTime: number): void {
    const cutoff = simTime - WINDOW_SIZE;
    let i = 0;
    while (i < this.events.length && this.events[i].time < cutoff) i++;
    if (i > 0) this.events.splice(0, i);

    let j = 0;
    while (j < this.idleEntries.length && this.idleEntries[j].time < cutoff) j++;
    if (j > 0) this.idleEntries.splice(0, j);
  }

  /** Average rate: sum of event values / 60 (pkt/s) */
  rate(): number {
    let sum = 0;
    for (const e of this.events) sum += e.value;
    return sum / WINDOW_SIZE;
  }

  /** Total idle time in window (seconds) */
  totalIdleTime(): number {
    let sum = 0;
    for (const e of this.idleEntries) sum += e.duration;
    return sum;
  }

  /** Utilization = (60 - idleTime) / 60, clamped to [0, 1] */
  utilization(): number {
    const idle = this.totalIdleTime();
    return Math.max(0, Math.min(1, (WINDOW_SIZE - idle) / WINDOW_SIZE));
  }

  /** Reset all data */
  reset(): void {
    this.events.length = 0;
    this.idleEntries.length = 0;
  }
}

export { WINDOW_SIZE };
