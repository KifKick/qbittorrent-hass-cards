import { LitElement } from "lit";
import { state } from "lit/decorators.js";

import {
  configEntryId,
  deviceName,
  type EntityMap,
  resolveDevice,
  resolveEntities,
} from "./discovery";
import {
  type DeviceRegistryEntry,
  fireEvent,
  type HassEntity,
  type HomeAssistant,
  type LovelaceCardConfig,
} from "./ha-types";

export interface QbtCardConfig extends LovelaceCardConfig {
  device_id?: string;
}

/** Keyboard activation for non-button elements with role="button". */
export const onActivate =
  (handler: () => void) =>
  (ev: KeyboardEvent): void => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      handler();
    }
  };

/** HA's form elements load lazily; borrow a built-in card editor to load them. */
export const loadHaForm = async (): Promise<void> => {
  if (customElements.get("ha-form")) return;
  const helpers = await (window as any).loadCardHelpers?.();
  const card = await helpers?.createCardElement({ type: "tile", entity: "sun.sun" });
  await card?.constructor?.getConfigElement?.();
};

/**
 * Shared plumbing: device/entity resolution and re-rendering only when this
 * card's own entities change. HA sets `hass` on every state change in the
 * whole system, so a plain reactive property would re-render constantly.
 */
export abstract class QbtBaseCard<C extends QbtCardConfig> extends LitElement {
  @state() protected _config?: C;

  protected _hass?: HomeAssistant;

  set hass(hass: HomeAssistant) {
    const previous = this._hass;
    this._hass = hass;
    this.toggleAttribute("dark-mode", Boolean(hass.themes?.darkMode));
    if (
      !previous ||
      previous.entities !== hass.entities ||
      previous.devices !== hass.devices ||
      previous.locale !== hass.locale ||
      this._watchedEntityIds().some((id) => previous.states[id] !== hass.states[id])
    ) {
      this.requestUpdate();
    }
    this._hassChanged(previous);
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  setConfig(config: C): void {
    this._config = config;
  }

  /** Entity ids whose state changes should re-render the card. */
  protected _watchedEntityIds(): string[] {
    return Object.values(this._entities);
  }

  /** Hook for cards that track state over time (e.g. the speed graph). */
  protected _hassChanged(_previous?: HomeAssistant): void {}

  protected get _device(): DeviceRegistryEntry | undefined {
    return this._hass ? resolveDevice(this._hass, this._config?.device_id) : undefined;
  }

  protected get _entryId(): string | undefined {
    const device = this._device;
    return device ? configEntryId(device) : undefined;
  }

  protected get _deviceName(): string {
    const device = this._device;
    return device ? deviceName(device) : "qBittorrent";
  }

  protected get _entities(): EntityMap {
    const device = this._device;
    return device && this._hass ? resolveEntities(this._hass, device.id) : {};
  }

  protected _stateObj(key: string): HassEntity | undefined {
    const entityId = this._entities[key];
    return entityId ? this._hass?.states[entityId] : undefined;
  }

  protected _moreInfo(entityId?: string): void {
    if (entityId) fireEvent(this, "hass-more-info", { entityId });
  }

  protected _toast(message: string): void {
    fireEvent(this, "hass-notification", { message });
  }

  /**
   * Run a service through HA's action handler, which shows its native
   * confirmation dialog first (and reports failures as a toast).
   */
  protected _confirmAction(service: string, data: Record<string, unknown>, text: string): void {
    fireEvent(this, "hass-action", {
      config: {
        tap_action: {
          action: "perform-action",
          perform_action: service,
          data,
          confirmation: { text },
        },
      },
      action: "tap",
    });
  }

  /** callService already reports failures as a toast; just don't leak the rejection. */
  protected async _callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this._hass?.callService(domain, service, data);
      return true;
    } catch {
      return false;
    }
  }
}
