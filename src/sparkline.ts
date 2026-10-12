// Speed history for the overview card: seeded from the recorder once, then
// extended live from state changes, and drawn as a small SVG area chart.

import type { HassEntity, HomeAssistant } from "./ha-types";

/** [timestamp ms, value] pairs, oldest first. */
export type Series = [number, number][];

interface CompressedState {
  s: string;
  lu?: number;
  lc?: number;
}

export const fetchSeries = async (
  hass: HomeAssistant,
  entityIds: string[],
  hours: number,
  toValue: (state: string, entityId: string) => number | undefined,
): Promise<Record<string, Series>> => {
  const result = await hass.callWS<Record<string, CompressedState[]>>({
    type: "history/history_during_period",
    start_time: new Date(Date.now() - hours * 3600_000).toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  const out: Record<string, Series> = {};
  for (const entityId of entityIds) {
    out[entityId] = [];
    for (const point of result[entityId] ?? []) {
      const value = toValue(point.s, entityId);
      const ts = (point.lu ?? point.lc ?? 0) * 1000;
      if (value !== undefined && ts) out[entityId].push([ts, value]);
    }
  }
  return out;
};

/** Append a live state, dropping points that fell out of the window (keeping one anchor). */
export const appendPoint = (
  series: Series,
  stateObj: HassEntity,
  value: number | undefined,
  windowStart: number,
): Series => {
  const ts = Date.parse(stateObj.last_updated);
  if (value === undefined || !Number.isFinite(ts)) return series;
  const last = series[series.length - 1];
  if (last && last[0] >= ts) return series;
  const next = [...series, [ts, value] as [number, number]];
  const firstInWindow = next.findIndex(([t]) => t >= windowStart);
  return firstInWindow > 1 ? next.slice(firstInWindow - 1) : next;
};

export interface SparkPaths {
  line: string;
  area: string;
}

/**
 * Paths in a 100×32 viewBox. Values are held until the next sample (sensors
 * only report changes), with a short ramp so steps don't look like spikes.
 */
export const sparkPaths = (
  series: Series,
  windowStart: number,
  now: number,
  max: number,
): SparkPaths | undefined => {
  if (!series.length || now <= windowStart) return undefined;
  const width = 100;
  const height = 32;
  const span = now - windowStart;
  const ramp = Math.min(30_000, span / 60);
  const x = (ts: number) => Math.min(width, Math.max(0, ((ts - windowStart) / span) * width));
  const y = (value: number) => height - 1 - (max > 0 ? (value / max) * (height - 4) : 0);
  const f = (n: number) => n.toFixed(2);

  let startX = x(series[0][0]);
  let line = `M${f(startX)},${f(y(series[0][1]))}`;
  let previous = series[0][1];
  for (const [ts, value] of series.slice(1)) {
    if (ts <= windowStart) {
      startX = 0;
      line = `M0,${f(y(value))}`;
    } else {
      line += `L${f(Math.max(startX, x(ts - ramp)))},${f(y(previous))}L${f(x(ts))},${f(y(value))}`;
    }
    previous = value;
  }
  line += `L${width},${f(y(previous))}`;
  return { line, area: `${line}L${width},${height}L${f(startX)},${height}Z` };
};

export const seriesMax = (...all: Series[]): number =>
  Math.max(0, ...all.flatMap((series) => series.map(([, value]) => value))) * 1.1;
