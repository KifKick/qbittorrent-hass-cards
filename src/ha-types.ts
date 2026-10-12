// Minimal typings for the parts of the Home Assistant frontend the cards use.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface EntityRegistryDisplayEntry {
  entity_id: string;
  device_id?: string;
  platform?: string;
  translation_key?: string;
  hidden?: boolean;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  identifiers: [string, string][];
  config_entries: string[];
  configuration_url: string | null;
  sw_version: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities: Record<string, EntityRegistryDisplayEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  language: string;
  locale: { language: string; time_zone?: string };
  config: { time_zone: string };
  themes: { darkMode: boolean };
  formatEntityState?(stateObj: HassEntity, state?: string): string;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export const fireEvent = (node: HTMLElement, type: string, detail?: unknown): void => {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
};
