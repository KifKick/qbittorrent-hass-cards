// Device-based discovery: a card is configured with (at most) a device_id and
// finds that qBittorrent instance's entities through the frontend registries.

import { DOMAIN } from "./const";
import type { DeviceRegistryEntry, HomeAssistant } from "./ha-types";

export const isQbtDevice = (device: DeviceRegistryEntry): boolean =>
  (device.identifiers ?? []).some(([domain]) => domain === DOMAIN);

export const getQbtDevices = (hass: HomeAssistant): DeviceRegistryEntry[] =>
  Object.values(hass.devices ?? {})
    .filter(isQbtDevice)
    .sort((a, b) => deviceName(a).localeCompare(deviceName(b)));

/** The configured device, or the first qBittorrent device when none is set. */
export const resolveDevice = (
  hass: HomeAssistant,
  deviceId?: string,
): DeviceRegistryEntry | undefined =>
  deviceId ? hass.devices?.[deviceId] : getQbtDevices(hass)[0];

/** Services take a config_entry_id; the device identifier *is* the entry id. */
export const configEntryId = (device: DeviceRegistryEntry): string | undefined =>
  device.identifiers.find(([domain]) => domain === DOMAIN)?.[1] ?? device.config_entries[0];

export const deviceName = (device: DeviceRegistryEntry): string =>
  device.name_by_user || device.name || "qBittorrent";

export const webUiUrl = (device: DeviceRegistryEntry): string | undefined => {
  try {
    const url = new URL(device.configuration_url ?? "");
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

/** `<platform>.<translation_key>` -> entity_id for every entity on the device. */
export type EntityMap = Record<string, string>;

// hass.entities is replaced (not mutated) on registry changes, so it's a
// reliable cache key; set hass() runs on every state change in the system.
const cache = new WeakMap<object, Map<string, EntityMap>>();

export const resolveEntities = (hass: HomeAssistant, deviceId: string): EntityMap => {
  let perDevice = cache.get(hass.entities);
  if (!perDevice) {
    perDevice = new Map();
    cache.set(hass.entities, perDevice);
  }
  let map = perDevice.get(deviceId);
  if (!map) {
    map = {};
    for (const entry of Object.values(hass.entities ?? {})) {
      if (entry.device_id !== deviceId || entry.platform !== DOMAIN || !entry.translation_key) {
        continue;
      }
      map[`${entry.entity_id.split(".", 1)[0]}.${entry.translation_key}`] = entry.entity_id;
    }
    perDevice.set(deviceId, map);
  }
  return map;
};
