import { describe, expect, it } from "vitest";

import { configEntryId, getQbtDevices, resolveDevice, resolveEntities, webUiUrl } from "./discovery";
import { entityBytes, formatBytes, formatEta, formatProgress, formatRatio } from "./format";
import type { DeviceRegistryEntry, HassEntity, HomeAssistant } from "./ha-types";
import {
  CONTROLS,
  FILTERS,
  OVERVIEW_SECTIONS,
  SORTS,
  STATS,
  TORRENT_DETAILS,
  TORRENT_STATES,
  UNKNOWN_STATE,
} from "./const";
import { LOCALES, plural, t } from "./i18n";
import { appendPoint, sparkPaths } from "./sparkline";
import { type Torrent, torrentSummary } from "./torrent";

const device = (id: string, entryId: string, name: string): DeviceRegistryEntry => ({
  id,
  name,
  name_by_user: null,
  identifiers: [["qbt", entryId]],
  config_entries: [entryId],
  configuration_url: "http://qbit.local:8080",
  sw_version: "v5.2.4",
});

const stateObj = (entity_id: string, state: string, unit?: string): HassEntity => ({
  entity_id,
  state,
  attributes: unit ? { unit_of_measurement: unit } : {},
  last_changed: "2026-10-12T10:00:00Z",
  last_updated: "2026-10-12T10:00:00Z",
});

const makeHass = (language = "en"): HomeAssistant =>
  ({
    language,
    locale: { language },
    config: { time_zone: "UTC" },
    themes: { darkMode: false },
    states: {},
    devices: {
      a: device("a", "entry_a", "qBittorrent (seedbox)"),
      b: device("b", "entry_b", "qBittorrent (nas)"),
      other: { ...device("other", "x", "Router"), identifiers: [["unifi", "x"]] },
    },
    entities: {
      "sensor.qbittorrent_predkosc_pobierania": {
        entity_id: "sensor.qbittorrent_predkosc_pobierania",
        device_id: "b",
        platform: "qbt",
        translation_key: "dl_speed",
      },
      "number.qbittorrent_globalny_limit_pobierania": {
        entity_id: "number.qbittorrent_globalny_limit_pobierania",
        device_id: "b",
        platform: "qbt",
        translation_key: "dl_limit",
      },
      "sensor.qbittorrent_limit_predkosci_pobierania": {
        entity_id: "sensor.qbittorrent_limit_predkosci_pobierania",
        device_id: "b",
        platform: "qbt",
        translation_key: "dl_limit",
      },
      "sensor.unrelated": {
        entity_id: "sensor.unrelated",
        device_id: "b",
        platform: "template",
        translation_key: "dl_speed",
      },
    },
    callService: async () => undefined,
    callWS: async () => undefined as never,
  }) as HomeAssistant;

describe("discovery", () => {
  it("finds only qbt devices, sorted by name, and falls back to the first", () => {
    const hass = makeHass();
    expect(getQbtDevices(hass).map((d) => d.id)).toEqual(["b", "a"]);
    expect(resolveDevice(hass)?.id).toBe("b");
    expect(resolveDevice(hass, "a")?.id).toBe("a");
    expect(configEntryId(hass.devices.a)).toBe("entry_a");
  });

  it("keys entities by platform and translation_key, not entity_id", () => {
    expect(resolveEntities(makeHass(), "b")).toEqual({
      "sensor.dl_speed": "sensor.qbittorrent_predkosc_pobierania",
      "sensor.dl_limit": "sensor.qbittorrent_limit_predkosci_pobierania",
      "number.dl_limit": "number.qbittorrent_globalny_limit_pobierania",
    });
  });

  it("only links to http(s) WebUI URLs", () => {
    const d = device("a", "e", "q");
    expect(webUiUrl(d)).toBe("http://qbit.local:8080/");
    expect(webUiUrl({ ...d, configuration_url: "javascript:alert(1)" })).toBeUndefined();
    expect(webUiUrl({ ...d, configuration_url: null })).toBeUndefined();
  });
});

describe("format", () => {
  const hass = makeHass();

  it("converts sensor units to bytes", () => {
    expect(entityBytes(stateObj("sensor.x", "1.5", "MB/s"))).toBe(1.5e6);
    expect(entityBytes(stateObj("sensor.x", "2", "GiB"))).toBe(2 * 1024 ** 3);
    expect(entityBytes(stateObj("sensor.x", "8", "Mbit/s"))).toBe(1e6);
    expect(entityBytes(stateObj("sensor.x", "unavailable", "MB/s"))).toBeUndefined();
    expect(entityBytes(stateObj("sensor.x", "4.69"))).toBeUndefined();
  });

  it("auto-scales bytes in binary units like qBittorrent by default", () => {
    expect(formatBytes(hass, 0, { perSecond: true })).toBe("0 B/s");
    expect(formatBytes(hass, 51_200, { perSecond: true })).toBe("50.0 KiB/s");
    expect(formatBytes(hass, 1.5 * 1024 ** 2, { perSecond: true })).toBe("1.50 MiB/s");
    // The free space qBittorrent's WebUI shows as 18.590 TiB.
    expect(formatBytes(hass, 20_440_567_250_944)).toBe("18.6 TiB");
    expect(formatBytes(hass, 1023 * 1024)).toBe("1.00 MiB");
    expect(formatBytes(hass, undefined)).toBe("—");
  });

  it("can use decimal units like Home Assistant's sensors", () => {
    const decimal = { units: "decimal" } as const;
    expect(formatBytes(hass, 50_000, { ...decimal, perSecond: true })).toBe("50.0 kB/s");
    expect(formatBytes(hass, 1_234_567, { ...decimal, perSecond: true })).toBe("1.23 MB/s");
    expect(formatBytes(hass, 20_440_567_250_944, decimal)).toBe("20.4 TB");
    expect(formatBytes(hass, 999_999, decimal)).toBe("1.00 MB");
  });

  it("uses the user's number format", () => {
    expect(formatBytes(makeHass("pl"), 1.5 * 1024 ** 2, { perSecond: true })).toBe("1,50 MiB/s");
  });

  it("never shows 100% before a torrent completes", () => {
    expect(formatProgress(hass, 0.9995)).toBe("99.9%");
    expect(formatProgress(hass, 1)).toBe("100%");
    expect(formatProgress(hass, 0.5225)).toBe("52.2%");
  });

  it("formats ETA and ratio, with qBittorrent's infinity markers", () => {
    expect(formatEta(8640000)).toBe("∞");
    expect(formatEta(-1)).toBe("∞");
    expect(formatEta(42)).toBe("42 s");
    expect(formatEta(3 * 3600 + 5 * 60)).toBe("3 h 5 min");
    expect(formatEta(2 * 86400 + 3600)).toBe("2 d 1 h");
    expect(formatRatio(hass, 3.0453)).toBe("3.05");
    expect(formatRatio(hass, -1)).toBe("∞");
  });
});

describe("i18n", () => {
  it("has the same keys in every language", () => {
    const english = Object.keys(LOCALES.en).sort();
    for (const [language, strings] of Object.entries(LOCALES)) {
      expect(Object.keys(strings).sort(), language).toEqual(english);
      for (const [key, value] of Object.entries(strings)) {
        expect(value.trim(), `${language}.${key}`).not.toBe("");
      }
    }
  });

  it("translates every key the cards and editors build at runtime", () => {
    const keys = [
      ...Object.keys(STATS).map((k) => `stat_${k}`),
      ...Object.keys(CONTROLS).flatMap((k) => [`control_${k}`, `control_${k}_short`]),
      ...Object.entries(CONTROLS)
        .filter(([, c]) => c.confirm)
        .map(([k]) => `confirm_${k}`),
      ...FILTERS.map((k) => `filter_${k}`),
      ...SORTS.map((k) => `sort_${k}`),
      ...TORRENT_DETAILS.map((k) => `detail_${k}`),
      ...OVERVIEW_SECTIONS.map((k) => `ed_section_${k}`),
      ...[...Object.values(TORRENT_STATES), UNKNOWN_STATE].map((d) => `state_${d.group}`),
    ];
    for (const strings of Object.values(LOCALES)) {
      for (const key of keys) expect(strings, key).toHaveProperty([key]);
    }
  });

  it("uses Polish plural forms", () => {
    const pl = makeHass("pl");
    expect(plural(pl, "torrents", 1, "1")).toBe("1 torrent");
    expect(plural(pl, "torrents", 3, "3")).toBe("3 torrenty");
    expect(plural(pl, "torrents", 2886, "2886")).toBe("2886 torrentów");
    expect(plural(pl, "torrents", 22, "22")).toBe("22 torrenty");
    expect(plural(makeHass(), "torrents", 2, "2")).toBe("2 torrents");
  });

  it("falls back to English for other languages", () => {
    expect(t(makeHass("de"), "show_more")).toBe("Show more");
    expect(t(makeHass("pl-PL"), "show_more")).toBe("Pokaż więcej");
  });
});

describe("torrent summary", () => {
  const hass = makeHass();
  const base: Torrent = {
    hash: "h",
    name: "Debian ISO",
    state: "downloading",
    progress: 0.5225,
    size: 43_776_783_417,
    dlspeed: 2_100_000,
    upspeed: 0,
    eta: 720,
    ratio: 3.75,
  };

  it("shows progress, speed and ETA while downloading", () => {
    expect(torrentSummary(hass, base)).toBe("52.2% · ↓ 2.00 MiB/s · 12 min left");
    expect(torrentSummary(hass, base, "decimal")).toBe("52.2% · ↓ 2.10 MB/s · 12 min left");
  });

  it("shows ratio for seeding and stopped-complete torrents", () => {
    expect(torrentSummary(hass, { ...base, state: "stalledUP", progress: 1 })).toBe(
      "Seeding · ratio 3.75 · 40.8 GiB",
    );
    expect(torrentSummary(hass, { ...base, state: "stoppedUP", progress: 1 }, "decimal")).toBe(
      "Completed · ratio 3.75 · 43.8 GB",
    );
  });

  it("shows how far along stalled downloads are", () => {
    expect(torrentSummary(hass, { ...base, state: "stalledDL", dlspeed: 0 })).toBe(
      "Stalled · 52.2% · 40.8 GiB",
    );
  });

  it("handles unknown states", () => {
    expect(torrentSummary(hass, { ...base, state: "somethingNew" })).toBe("Unknown");
  });
});

describe("sparkline", () => {
  it("drops points outside the window but keeps one anchor", () => {
    const series: [number, number][] = [
      [1000, 1],
      [2000, 2],
      [3000, 3],
    ];
    const next = appendPoint(
      series,
      { ...stateObj("sensor.x", "4"), last_updated: new Date(4000).toISOString() },
      4,
      2500,
    );
    expect(next).toEqual([
      [2000, 2],
      [3000, 3],
      [4000, 4],
    ]);
  });

  it("ignores out-of-order states", () => {
    const series: [number, number][] = [[5000, 1]];
    const stale = { ...stateObj("sensor.x", "2"), last_updated: new Date(4000).toISOString() };
    expect(appendPoint(series, stale, 2, 0)).toBe(series);
  });

  it("draws a closed area from the first sample to now", () => {
    const paths = sparkPaths(
      [
        [0, 0],
        [50, 10],
      ],
      0,
      100,
      10,
    )!;
    expect(paths.line.startsWith("M0.00,31.00")).toBe(true);
    expect(paths.line.endsWith("L100,3.00")).toBe(true);
    expect(paths.area.endsWith("L100,32L0.00,32Z")).toBe(true);
    expect(sparkPaths([], 0, 100, 10)).toBeUndefined();
  });
});
