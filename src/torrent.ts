// What a torrent row shows, derived from qBittorrent's torrent info. Kept free
// of Lit so it can be unit-tested in Node.

import { DOMAIN, type StateDef, TOP_METRICS, TORRENT_STATES, UNKNOWN_STATE } from "./const";
import {
  type ByteUnits,
  formatBytes,
  formatDuration,
  formatEta,
  formatNumber,
  formatProgress,
  formatRatio,
} from "./format";
import type { HomeAssistant } from "./ha-types";
import { type StringKey, t } from "./i18n";

/** The subset of qBittorrent's torrent info the card reads. */
export interface Torrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  completed?: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number;
  category?: string;
  tags?: string;
  save_path?: string;
  added_on?: number;
  num_seeds?: number;
  num_complete?: number;
  num_leechs?: number;
  num_incomplete?: number;
  force_start?: boolean;
  uploaded?: number;
  downloaded?: number;
  seeding_time?: number;
}

/** Options of qbt.get_torrents the cards use. */
export interface TorrentQuery {
  status_filter: string;
  sort: string;
  reverse: boolean;
  limit: number;
  category?: string;
  tag?: string;
}

export const fetchTorrents = async (
  hass: HomeAssistant,
  entryId: string,
  { category, tag, ...query }: TorrentQuery,
): Promise<Torrent[]> => {
  const result = await hass.callWS<{ response: { torrents: Torrent[] } }>({
    type: "call_service",
    domain: DOMAIN,
    service: "get_torrents",
    service_data: {
      config_entry_id: entryId,
      ...query,
      ...(category ? { category } : {}),
      ...(tag ? { tag } : {}),
    },
    return_response: true,
  });
  return result.response?.torrents ?? [];
};

/** A failed qbt.get_torrents call, explained. */
export const loadErrorText = (hass: HomeAssistant | undefined, error: string): string =>
  // Integration versions before the `limit` option reject it in the schema.
  /extra keys not allowed.*limit/i.test(error)
    ? t(hass, "needs_update")
    : t(hass, "load_error", { error });

export const torrentState = (torrent: Torrent): StateDef =>
  TORRENT_STATES[torrent.state] ?? UNKNOWN_STATE;

/** The one-line summary under a torrent's name, depending on what it's doing. */
export const torrentSummary = (
  hass: HomeAssistant | undefined,
  torrent: Torrent,
  units: ByteUnits = "binary",
): string => {
  const def = torrentState(torrent);
  const progress = formatProgress(hass, torrent.progress);
  const size = formatBytes(hass, torrent.size, { units });
  const ratio = t(hass, "ratio", { value: formatRatio(hass, torrent.ratio) });
  const label = t(hass, `state_${def.group}` as StringKey);
  const speeds = [
    torrent.dlspeed > 0 ? `↓ ${formatBytes(hass, torrent.dlspeed, { perSecond: true, units })}` : "",
    torrent.upspeed > 0 ? `↑ ${formatBytes(hass, torrent.upspeed, { perSecond: true, units })}` : "",
  ].filter(Boolean);
  let parts: string[];
  switch (def.group) {
    case "downloading":
      parts = [progress, ...speeds, t(hass, "left", { value: formatEta(torrent.eta) })];
      break;
    case "uploading":
      parts = [...speeds, ratio, size];
      break;
    case "seeding":
    case "completed":
      parts = [label, ratio, size];
      break;
    case "checking":
      parts = [label, progress];
      break;
    case "metadata":
    case "moving":
    case "error":
    case "missing":
    case "unknown":
      parts = [label];
      break;
    default:
      // stalled, queued and stopped downloads: how far along they are matters most.
      parts = [label, progress, size];
  }
  return parts.join(" · ");
};

// --- Top card ----------------------------------------------------------------

export interface RankedTorrent {
  torrent: Torrent;
  value: number;
  /** Bar length relative to the leader, 0..1. */
  fraction: number;
}

/** qBittorrent reports an infinite ratio (nothing downloaded) as -1 or >= 9999. */
const isInfiniteRatio = (ratio: number): boolean => ratio < 0 || ratio >= 9999;

export const metricValue = (torrent: Torrent, metric: string): number => {
  const value = Number((torrent as unknown as Record<string, unknown>)[metric]);
  if (metric === "ratio" && isInfiniteRatio(value)) return Infinity;
  return Number.isFinite(value) ? value : 0;
};

/** The top `count` torrents by `metric`, skipping ones with nothing to show. */
export const rankTorrents = (torrents: Torrent[], metric: string, count: number): RankedTorrent[] => {
  const ranked = torrents
    .map((torrent) => ({ torrent, value: metricValue(torrent, metric) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
  // Scale against the biggest finite value, so one ∞ ratio doesn't flatten the rest.
  const max = Math.max(0, ...ranked.map(({ value }) => value).filter(Number.isFinite));
  return ranked.map(({ torrent, value }) => ({
    torrent,
    value,
    fraction: !Number.isFinite(value) ? 1 : max > 0 ? value / max : 0,
  }));
};

export const formatMetric = (
  hass: HomeAssistant | undefined,
  metric: string,
  value: number,
  units: ByteUnits = "binary",
): string => {
  switch (TOP_METRICS[metric]?.kind) {
    case "bytes":
      return formatBytes(hass, value, { units });
    case "speed":
      return formatBytes(hass, value, { units, perSecond: true });
    case "ratio":
      return formatRatio(hass, Number.isFinite(value) ? value : -1);
    case "duration":
      return formatDuration(value);
    default:
      return formatNumber(hass, value);
  }
};
