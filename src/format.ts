// Number/byte/time formatting. Sizes and speeds auto-scale instead of
// following a sensor's fixed unit (0.05 MB/s reads as 50 kB/s), in binary
// units (KiB, MiB…) like qBittorrent's WebUI by default, or decimal ones
// (kB, MB…) like Home Assistant's sensors.

import { ETA_INFINITE } from "./const";
import type { HassEntity, HomeAssistant } from "./ha-types";

const UNIT_BYTES: Record<string, number> = {
  bit: 1 / 8,
  kbit: 125,
  Mbit: 125e3,
  Gbit: 125e6,
  B: 1,
  kB: 1e3,
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  PB: 1e15,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  PiB: 1024 ** 5,
};
export type ByteUnits = "binary" | "decimal";

const BYTE_UNITS: Record<ByteUnits, { base: number; names: string[] }> = {
  binary: { base: 1024, names: ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] },
  decimal: { base: 1000, names: ["B", "kB", "MB", "GB", "TB", "PB"] },
};

export interface ByteFormat {
  perSecond?: boolean;
  units?: ByteUnits;
}

/** Mirrors HA's numberFormat preference so numbers match the rest of the UI. */
export const numberLocale = (hass?: HomeAssistant): string | string[] | undefined => {
  const language = hass?.locale?.language ?? hass?.language;
  switch ((hass?.locale as { number_format?: string } | undefined)?.number_format) {
    case "comma_decimal":
      return ["en-US", "en"];
    case "decimal_comma":
      return ["de", "es", "it"];
    case "space_comma":
      return ["fr", "sv", "cs"];
    case "system":
      return undefined;
    default:
      return language;
  }
};

export const formatNumber = (
  hass: HomeAssistant | undefined,
  value: number,
  digits = 0,
): string =>
  new Intl.NumberFormat(numberLocale(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const isUnavailable = (stateObj?: HassEntity): boolean =>
  !stateObj || stateObj.state === "unavailable" || stateObj.state === "unknown";

/** A data size/rate sensor's value in bytes (per second), whatever its unit. */
export const entityBytes = (stateObj?: HassEntity): number | undefined => {
  if (isUnavailable(stateObj)) return undefined;
  const unit = String(stateObj!.attributes.unit_of_measurement ?? "").replace(/\/s$/, "");
  const factor = UNIT_BYTES[unit];
  const value = Number.parseFloat(stateObj!.state);
  return factor !== undefined && Number.isFinite(value) ? value * factor : undefined;
};

export interface SplitValue {
  value: string;
  unit: string;
}

export const splitBytes = (
  hass: HomeAssistant | undefined,
  bytes: number,
  { perSecond = false, units = "binary" }: ByteFormat = {},
): SplitValue => {
  const { base, names } = BYTE_UNITS[units];
  let value = Math.abs(bytes);
  let index = 0;
  // Step up at 999.5 in both systems, so numbers never get a fourth digit.
  while (value >= 999.5 && index < names.length - 1) {
    value /= base;
    index += 1;
  }
  const digits = index === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return {
    value: formatNumber(hass, value, digits),
    unit: `${names[index]}${perSecond ? "/s" : ""}`,
  };
};

export const formatBytes = (
  hass: HomeAssistant | undefined,
  bytes: number | undefined | null,
  format: ByteFormat = {},
): string => {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return "—";
  const { value, unit } = splitBytes(hass, bytes, format);
  return `${value} ${unit}`;
};

/** Progress as a percentage that never rounds up to 100% before completion. */
export const formatProgress = (hass: HomeAssistant | undefined, progress: number): string => {
  if (progress >= 1) return `${formatNumber(hass, 100)}%`;
  const tenths = Math.floor(Math.max(progress, 0) * 1000) / 10;
  return `${formatNumber(hass, tenths, tenths < 100 ? 1 : 0)}%`;
};

export const formatRatio = (hass: HomeAssistant | undefined, ratio: number): string =>
  ratio < 0 || ratio >= 9999 ? "∞" : formatNumber(hass, ratio, 2);

export const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= ETA_INFINITE) return "∞";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${Math.floor(seconds)} s`;
};

// Like HA's resolveTimeZone(): "local" -> the browser's zone, otherwise the server's.
const BROWSER_TZ = Intl.DateTimeFormat?.().resolvedOptions?.().timeZone;

export const formatDate = (hass: HomeAssistant | undefined, epochSeconds: number): string => {
  if (!epochSeconds || epochSeconds < 0) return "—";
  const timeZone =
    hass?.locale?.time_zone !== "server" && BROWSER_TZ ? BROWSER_TZ : hass?.config?.time_zone;
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  const date = new Date(epochSeconds * 1000);
  try {
    return date.toLocaleString(hass?.locale?.language, { ...options, timeZone });
  } catch {
    return date.toLocaleString(hass?.locale?.language, options);
  }
};

/** HA's own state formatting (units, precision, translated enum states). */
export const formatState = (hass: HomeAssistant, stateObj?: HassEntity): string => {
  if (isUnavailable(stateObj)) return "—";
  return hass.formatEntityState?.(stateObj!) ?? stateObj!.state;
};
