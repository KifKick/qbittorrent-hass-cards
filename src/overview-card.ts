import { css, html, nothing, svg, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";

import { loadHaForm, onActivate, QbtBaseCard, type QbtCardConfig } from "./base-card";
import {
  type Color,
  CONTROLS,
  DEFAULT_CONTROLS,
  DEFAULT_STATS,
  ENTITY,
  OVERVIEW_SECTIONS,
  type OverviewSection,
  STATS,
} from "./const";
import { getQbtDevices, webUiUrl } from "./discovery";
import {
  type ByteUnits,
  entityBytes,
  formatBytes,
  formatNumber,
  formatState,
  isUnavailable,
  splitBytes,
} from "./format";
import type { HomeAssistant } from "./ha-types";
import { plural, type StringKey, t } from "./i18n";
import { appendPoint, fetchSeries, type Series, seriesMax, sparkPaths } from "./sparkline";
import { baseStyles } from "./styles";

export interface OverviewCardConfig extends QbtCardConfig {
  name?: string;
  icon?: string;
  layout?: "default" | "compact";
  visible_sections?: OverviewSection[];
  stats?: string[];
  controls?: string[];
  graph_hours?: number;
  show_webui_link?: boolean;
  units?: ByteUnits;
}

export const OVERVIEW_DEFAULTS = {
  layout: "default",
  visible_sections: [...OVERVIEW_SECTIONS],
  stats: DEFAULT_STATS,
  graph_hours: 1,
  show_webui_link: true,
  units: "binary",
} as const;
// The compact layout only has room for a toggle or two.
const COMPACT_CONTROLS = ["alt_speed"];

const rgb = (color: Color) => `var(--rgb-${color})`;

type Direction = "dl" | "up";
const SPEEDS: Record<
  Direction,
  { speed: string; limit: string; icon: string; color: Color; label: StringKey }
> = {
  dl: {
    speed: ENTITY.dlSpeed,
    limit: ENTITY.dlLimit,
    icon: "mdi:arrow-down",
    color: "blue",
    label: "download",
  },
  up: {
    speed: ENTITY.upSpeed,
    limit: ENTITY.upLimit,
    icon: "mdi:arrow-up",
    color: "green",
    label: "upload",
  },
};

interface Status {
  color: Color;
  label: string;
  icon: string;
  offline: boolean;
}

export class QbtOverviewCard extends QbtBaseCard<OverviewCardConfig> {
  @state() private _series: Record<Direction, Series> = { dl: [], up: [] };

  private _historyKey?: string;

  private _tick?: number;

  static getStubConfig(hass: HomeAssistant): Partial<OverviewCardConfig> {
    const device = getQbtDevices(hass)[0];
    return device ? { device_id: device.id } : {};
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await loadHaForm();
    return document.createElement("qbt-overview-card-editor");
  }

  private get _cfg() {
    return { ...OVERVIEW_DEFAULTS, ...this._config };
  }

  private _shows(section: OverviewSection): boolean {
    return (this._cfg.visible_sections as readonly string[]).includes(section);
  }

  private get _graphVisible(): boolean {
    return this._cfg.layout !== "compact" && this._shows("speeds") && this._shows("graph");
  }

  getCardSize(): number {
    if (this._cfg.layout === "compact") return 1;
    return (
      1 + (this._shows("speeds") ? 2 : 0) + (this._shows("stats") ? 1 : 0) + (this._shows("controls") ? 1 : 0)
    );
  }

  getGridOptions() {
    return this._cfg.layout === "compact"
      ? { columns: 6, rows: 1, min_columns: 4, min_rows: 1 }
      : { columns: 12, rows: "auto", min_columns: 6 };
  }

  override setConfig(config: OverviewCardConfig): void {
    super.setConfig(config);
    this._loadHistory();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Slide the graph window even when the speed doesn't change.
    this._tick = window.setInterval(() => this._graphVisible && this.requestUpdate(), 60_000);
    this._loadHistory();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._tick);
    this._historyKey = undefined;
  }

  private get _windowStart(): number {
    return Date.now() - Number(this._cfg.graph_hours) * 3600_000;
  }

  protected override _hassChanged(previous?: HomeAssistant): void {
    this._loadHistory();
    if (!previous || !this._graphVisible) return;
    for (const dir of ["dl", "up"] as Direction[]) {
      const entityId = this._entities[SPEEDS[dir].speed];
      const stateObj = entityId ? this._hass!.states[entityId] : undefined;
      if (stateObj && previous.states[entityId] !== stateObj) {
        this._series = {
          ...this._series,
          [dir]: appendPoint(this._series[dir], stateObj, entityBytes(stateObj), this._windowStart),
        };
      }
    }
  }

  private async _loadHistory(): Promise<void> {
    const hass = this._hass;
    if (!hass || !this._config || !this.isConnected || !this._graphVisible) return;
    const dl = this._entities[ENTITY.dlSpeed];
    const up = this._entities[ENTITY.upSpeed];
    if (!dl || !up) return;
    const hours = Number(this._cfg.graph_hours);
    const key = `${dl}|${up}|${hours}`;
    if (key === this._historyKey) return;
    this._historyKey = key;
    try {
      const fetched = await fetchSeries(hass, [dl, up], hours, (value, entityId) => {
        const stateObj = hass.states[entityId];
        return stateObj ? entityBytes({ ...stateObj, state: value }) : undefined;
      });
      if (key !== this._historyKey) return;
      // Keep live points that arrived while the history request was in flight.
      const merge = (history: Series, live: Series): Series => {
        const last = history[history.length - 1]?.[0] ?? 0;
        return [...history, ...live.filter(([ts]) => ts > last)];
      };
      this._series = { dl: merge(fetched[dl], this._series.dl), up: merge(fetched[up], this._series.up) };
    } catch (err) {
      // e.g. the sensors are excluded from the recorder; live points still accumulate.
      console.debug("qbt-overview-card: speed history unavailable", err);
    }
  }

  private _status(): Status {
    const hass = this._hass!;
    const connectivity = this._stateObj(ENTITY.connectivity);
    const connection = this._stateObj(ENTITY.connectionStatus);
    if (connectivity?.state === "off" || (connectivity === undefined && isUnavailable(connection))) {
      return { color: "red", label: t(hass, "offline"), icon: "mdi:server-network-off", offline: true };
    }
    const label = formatState(hass, connection);
    const color: Color =
      connection?.state === "connected"
        ? "green"
        : connection?.state === "firewalled"
          ? "amber"
          : connection?.state === "disconnected"
            ? "red"
            : "grey";
    return { color, label, icon: "mdi:download-network", offline: false };
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    if (!this._device) {
      return html`<ha-card>
        <div class="message">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>${t(this._hass, "no_device")}
        </div>
      </ha-card>`;
    }
    const status = this._status();
    if (this._cfg.layout === "compact") return this._renderCompact(status);
    return html`<ha-card>
      ${this._renderHeader(status)}
      ${this._shows("speeds") ? this._renderSpeeds(status) : nothing}
      ${this._shows("stats") ? this._renderStats() : nothing}
      ${this._shows("controls") ? this._renderControls(false) : nothing}
    </ha-card>`;
  }

  private _altBadge(): TemplateResult | typeof nothing {
    if (this._stateObj(ENTITY.altSpeed)?.state !== "on") return nothing;
    return html`<div class="badge" style="--badge-c: var(--rgb-amber)">
      <ha-icon icon="mdi:speedometer-slow"></ha-icon>
    </div>`;
  }

  private _renderHeader(status: Status) {
    const hass = this._hass!;
    const version = this._stateObj(ENTITY.appVersion);
    const total = this._stateObj(ENTITY.torrentsTotal);
    const count = Number(total?.state);
    const secondary = [
      status.label,
      isUnavailable(version) ? undefined : version!.state,
      isUnavailable(total) ? undefined : plural(hass, "torrents", count, formatNumber(hass, count)),
    ]
      .filter(Boolean)
      .join(" · ");
    const url = this._cfg.show_webui_link ? webUiUrl(this._device!) : undefined;
    const moreInfo = () => this._moreInfo(this._entities[ENTITY.connectionStatus]);
    return html`<div class="state-item">
      <div class="shape" style="--c: ${rgb(status.color)}">
        <ha-icon .icon=${this._cfg.icon ?? status.icon}></ha-icon>${this._altBadge()}
      </div>
      <div
        class="info clickable"
        role="button"
        tabindex="0"
        @click=${moreInfo}
        @keydown=${onActivate(moreInfo)}
      >
        <span class="primary">${this._cfg.name || this._deviceName}</span>
        <span class="secondary">${secondary}</span>
      </div>
      ${url
        ? html`<a
            class="icon-button"
            href=${url}
            target="_blank"
            rel="noopener noreferrer"
            title=${t(hass, "open_webui")}
            aria-label=${t(hass, "open_webui")}
            ><ha-icon icon="mdi:open-in-new"></ha-icon
          ></a>`
        : nothing}
    </div>`;
  }

  private _renderSpeeds(status: Status) {
    const now = Date.now();
    const start = this._windowStart;
    return html`<div class="speeds ${status.offline ? "offline" : ""}">
      ${(["dl", "up"] as Direction[]).map((dir) => this._renderSpeed(dir, start, now))}
    </div>`;
  }

  private _renderSpeed(dir: Direction, start: number, now: number) {
    const hass = this._hass!;
    const def = SPEEDS[dir];
    const bytes = entityBytes(this._stateObj(def.speed));
    const speed = { perSecond: true, units: this._cfg.units };
    const value = bytes === undefined ? { value: "—", unit: "" } : splitBytes(hass, bytes, speed);
    const limit = entityBytes(this._stateObj(def.limit));
    const alt = this._stateObj(ENTITY.altSpeed)?.state === "on";
    const limitText =
      limit === undefined
        ? ""
        : limit > 0
          ? t(hass, "limit", { value: formatBytes(hass, limit, speed) })
          : t(hass, "unlimited");
    const paths = this._graphVisible
      ? sparkPaths(this._series[dir], start, now, seriesMax(this._series[dir]))
      : undefined;
    const moreInfo = () => this._moreInfo(this._entities[def.speed]);
    return html`<div
      class="speed clickable ${bytes ? "active" : ""} ${this._graphVisible ? "with-graph" : ""}"
      style="--c: ${rgb(def.color)}"
      role="button"
      tabindex="0"
      @click=${moreInfo}
      @keydown=${onActivate(moreInfo)}
    >
      <div class="speed-head">
        <ha-icon .icon=${def.icon}></ha-icon><span>${t(hass, def.label)}</span>
      </div>
      <div class="speed-value">
        <span class="num">${value.value}</span><span class="unit">${value.unit}</span>
      </div>
      <div class="speed-sub ${alt ? "alt" : ""}">
        ${alt ? html`<ha-icon icon="mdi:speedometer-slow"></ha-icon>` : nothing}<span>${limitText}</span>
      </div>
      ${this._graphVisible
        ? html`<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            ${paths
              ? svg`<path class="area" d=${paths.area}></path><path class="line" d=${paths.line}></path>`
              : nothing}
          </svg>`
        : nothing}
    </div>`;
  }

  private _renderStats() {
    const chips = (this._cfg.stats as readonly string[])
      .map((key) => this._renderStat(key))
      .filter((chip) => chip !== nothing);
    return chips.length ? html`<div class="chips stats">${chips}</div>` : nothing;
  }

  private _renderStat(key: string): TemplateResult | typeof nothing {
    const hass = this._hass!;
    const def = STATS[key];
    const stateObj = def && this._stateObj(def.entity);
    if (!stateObj) return nothing;
    const unavailable = isUnavailable(stateObj);
    const isCount = def.entity.startsWith("sensor.torrents_");
    const count = Number(stateObj.state);
    if (def.hideZero && (unavailable || count === 0)) return nothing;
    const bytes = entityBytes(stateObj);
    const text =
      bytes !== undefined
        ? formatBytes(hass, bytes, { units: this._cfg.units })
        : isCount && !unavailable
          ? formatNumber(hass, count)
          : formatState(hass, stateObj);
    // Count chips only take their colour while there's something to count.
    const color = def.color && (!isCount || count > 0) ? `--c: ${rgb(def.color)}` : "";
    const label = `${t(hass, `stat_${key}` as StringKey)}: ${text}`;
    return html`<button
      class="chip"
      style=${color}
      title=${label}
      aria-label=${label}
      @click=${() => this._moreInfo(stateObj.entity_id)}
    >
      <ha-icon .icon=${def.icon}></ha-icon><span>${text}</span>
    </button>`;
  }

  private _renderControls(compact: boolean) {
    const keys = this._config?.controls ?? (compact ? COMPACT_CONTROLS : DEFAULT_CONTROLS);
    const buttons = keys.map((key) => this._renderControl(key, compact)).filter((b) => b !== nothing);
    if (!buttons.length) return nothing;
    return html`<div class=${compact ? "compact-actions" : "actions"}>${buttons}</div>`;
  }

  private _renderControl(key: string, compact: boolean): TemplateResult | typeof nothing {
    const hass = this._hass!;
    const def = CONTROLS[key];
    const stateObj = def && this._stateObj(def.entity);
    if (!stateObj) return nothing;
    const on = Boolean(def.toggle) && stateObj.state === "on";
    const title = t(hass, `control_${key}` as StringKey);
    return html`<button
      class="button ${on ? "active" : ""} ${key === "shutdown" ? "danger" : ""}"
      style=${def.color ? `--c: ${rgb(def.color)}` : ""}
      title=${title}
      aria-label=${title}
      aria-pressed=${def.toggle ? String(on) : nothing}
      ?disabled=${stateObj.state === "unavailable"}
      @click=${(ev: Event) => {
        ev.stopPropagation();
        this._pressControl(key);
      }}
    >
      <ha-icon .icon=${def.icon}></ha-icon>${compact
        ? nothing
        : html`<span class="label">${t(hass, `control_${key}_short` as StringKey)}</span>`}
    </button>`;
  }

  private _pressControl(key: string): void {
    const def = CONTROLS[key];
    const entityId = this._entities[def.entity];
    if (def.toggle) {
      void this._callService("switch", "toggle", { entity_id: entityId });
    } else if (def.confirm) {
      this._confirmAction(
        "button.press",
        { entity_id: entityId },
        t(this._hass, `confirm_${key}` as StringKey),
      );
    } else {
      void this._callService("button", "press", { entity_id: entityId });
    }
  }

  private _renderCompact(status: Status) {
    const hass = this._hass!;
    const dl = entityBytes(this._stateObj(ENTITY.dlSpeed));
    const up = entityBytes(this._stateObj(ENTITY.upSpeed));
    const color: Color = status.offline ? "red" : dl ? "blue" : up ? "green" : "disabled";
    const speed = { perSecond: true, units: this._cfg.units };
    const secondary = status.offline
      ? status.label
      : `↓ ${formatBytes(hass, dl, speed)} · ↑ ${formatBytes(hass, up, speed)}`;
    const moreInfo = () => this._moreInfo(this._entities[ENTITY.dlSpeed]);
    return html`<ha-card class="compact">
      <div class="state-item">
        <div class="shape" style="--c: ${rgb(color)}">
          <ha-icon .icon=${this._cfg.icon ?? status.icon}></ha-icon>${this._altBadge()}
        </div>
        <div
          class="info clickable"
          role="button"
          tabindex="0"
          @click=${moreInfo}
          @keydown=${onActivate(moreInfo)}
        >
          <span class="primary">${this._cfg.name || this._deviceName}</span>
          <span class="secondary">${secondary}</span>
        </div>
        ${this._renderControls(true)}
      </div>
    </ha-card>`;
  }

  static override styles = [
    baseStyles,
    css`
      .speeds {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing);
        padding: 0 var(--spacing) var(--spacing);
      }
      .speeds.offline {
        opacity: 0.5;
      }
      .speed {
        overflow: hidden;
        min-width: 0;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: var(--control-border-radius);
        background-color: var(--tint);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .speed.with-graph {
        padding-bottom: 0;
      }
      /* Bleeds to the tile's edges, under the text rather than behind it. */
      .spark {
        display: block;
        width: calc(100% + 24px);
        height: 36px;
        margin: 4px -12px 0;
      }
      .spark .area {
        fill: rgba(var(--c), 0.16);
      }
      .spark .line {
        fill: none;
        stroke: rgba(var(--c), 0.75);
        stroke-width: 1.5;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }
      .speed-head {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--card-secondary-font-size);
        line-height: var(--card-secondary-line-height);
        color: var(--secondary-text-color);
      }
      .speed-head ha-icon {
        --mdc-icon-size: 16px;
        display: flex;
        color: rgb(var(--c));
      }
      .speed-value {
        display: flex;
        align-items: baseline;
        gap: 4px;
        white-space: nowrap;
      }
      .speed-value .num {
        font-size: 24px;
        font-weight: 600;
        line-height: 30px;
        letter-spacing: -0.3px;
        font-variant-numeric: tabular-nums;
      }
      .speed:not(.active) .num {
        color: var(--secondary-text-color);
      }
      .speed-value .unit {
        font-size: var(--card-secondary-font-size);
        font-weight: 500;
        color: var(--secondary-text-color);
      }
      .speed-sub {
        position: relative;
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 16px;
        font-size: 11px;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .speed-sub ha-icon {
        --mdc-icon-size: 14px;
        display: flex;
        color: rgb(var(--rgb-amber));
      }
      .stats {
        padding: 0 var(--spacing) var(--spacing);
      }
      .compact-actions {
        display: flex;
        gap: var(--spacing);
      }
      .compact-actions .button {
        --control-height: var(--icon-size);
        flex: none;
        width: var(--control-height);
        padding: 0;
      }
      .compact .state-item {
        height: 100%;
        box-sizing: border-box;
      }
    `,
  ];
}
