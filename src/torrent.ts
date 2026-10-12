// What a torrent row shows, derived from qBittorrent's torrent info. Kept free
// of Lit so it can be unit-tested in Node.

import { type StateDef, TORRENT_STATES, UNKNOWN_STATE } from "./const";
import { type ByteUnits, formatBytes, formatEta, formatProgress, formatRatio } from "./format";
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
}

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
