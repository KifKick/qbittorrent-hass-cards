// A leaderboard: the top N torrents by one metric (uploaded, ratio, upload
// speed…), each with a bar against the leader. qBittorrent does the sorting,
// so only N torrents are transferred however many there are.

import { css, html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import { loadHaForm, QbtBaseCard, type QbtCardConfig } from "./base-card";
import { TOP_METRICS } from "./const";
import { getQbtDevices } from "./discovery";
import type { ByteUnits } from "./format";
import type { HomeAssistant } from "./ha-types";
import { type StringKey, t } from "./i18n";
import { baseStyles } from "./styles";
import {
  fetchTorrents,
  formatMetric,
  loadErrorText,
  type RankedTorrent,
  rankTorrents,
  torrentState,
  torrentSummary,
} from "./torrent";

export interface TopCardConfig extends QbtCardConfig {
  title?: string;
  icon?: string;
  metric?: string;
  /** Metrics to switch between on the card; empty keeps `metric` fixed. */
  metrics?: string[];
  count?: number;
  filter?: string;
  category?: string;
  tag?: string;
  show_bars?: boolean;
  refresh_interval?: number;
  units?: ByteUnits;
}

export const TOP_DEFAULTS = {
  metric: "uploaded",
  metrics: [] as string[],
  count: 5,
  filter: "all",
  show_bars: true,
  refresh_interval: 30,
  units: "binary",
} as const;

export class QbtTopCard extends QbtBaseCard<TopCardConfig> {
  @state() private _ranked?: RankedTorrent[];

  @state() private _loading = false;

  @state() private _error?: string;

  /** Metric picked on the card, when switching is enabled. */
  @state() private _picked?: string;

  private _timer?: number;

  private _requestId = 0;

  private _queryKey?: string;

  static getStubConfig(hass: HomeAssistant): Partial<TopCardConfig> {
    const device = getQbtDevices(hass)[0];
    return device ? { device_id: device.id } : {};
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await loadHaForm();
    return document.createElement("qbt-top-card-editor");
  }

  private get _cfg() {
    return { ...TOP_DEFAULTS, ...this._config };
  }

  /** The switchable metrics, or none when the ranking is fixed. */
  private get _choices(): string[] {
    return (this._cfg.metrics ?? []).filter((metric) => metric in TOP_METRICS);
  }

  private get _metric(): string {
    if (this._picked && this._choices.includes(this._picked)) return this._picked;
    return this._cfg.metric in TOP_METRICS ? this._cfg.metric : TOP_DEFAULTS.metric;
  }

  private get _count(): number {
    return Math.max(1, Math.round(Number(this._cfg.count)) || TOP_DEFAULTS.count);
  }

  getCardSize(): number {
    return 1 + Math.min(this._ranked?.length ?? this._count, this._count);
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  override setConfig(config: TopCardConfig): void {
    super.setConfig(config);
    this._picked = undefined;
    this._refresh();
  }

  // Nothing on the card comes from entity states; the list is polled.
  protected override _watchedEntityIds(): string[] {
    return [];
  }

  protected override _hassChanged(previous?: HomeAssistant): void {
    if (!previous || previous.devices !== this._hass?.devices) this._refresh();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._onVisibility);
    this._queryKey = undefined;
    this._refresh();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._onVisibility);
    window.clearTimeout(this._timer);
  }

  private _onVisibility = (): void => {
    if (!document.hidden) this._fetch();
  };

  /** Fetch now if what we'd ask for changed since the last request. */
  private _refresh(): void {
    const cfg = this._cfg;
    const key = JSON.stringify([this._entryId, this._metric, this._count, cfg.filter, cfg.category, cfg.tag]);
    if (key === this._queryKey) return;
    if (this._queryKey !== undefined) this._ranked = undefined;
    this._queryKey = key;
    this._fetch();
  }

  private async _fetch(): Promise<void> {
    const hass = this._hass;
    const entryId = this._entryId;
    window.clearTimeout(this._timer);
    if (!hass || !entryId || !this.isConnected) return;

    const requestId = ++this._requestId;
    const metric = this._metric;
    const count = this._count;
    this._loading = true;
    try {
      const torrents = await fetchTorrents(hass, entryId, {
        status_filter: String(this._cfg.filter),
        sort: metric,
        reverse: true,
        limit: count,
        category: this._cfg.category,
        tag: this._cfg.tag,
      });
      if (requestId !== this._requestId) return;
      this._ranked = rankTorrents(torrents, metric, count);
      this._error = undefined;
    } catch (err: any) {
      if (requestId !== this._requestId) return;
      this._error = err?.message ?? String(err);
    } finally {
      if (requestId === this._requestId) {
        this._loading = false;
        this._schedule();
      }
    }
  }

  private _schedule(): void {
    window.clearTimeout(this._timer);
    const seconds = Math.max(5, Number(this._cfg.refresh_interval) || TOP_DEFAULTS.refresh_interval);
    this._timer = window.setTimeout(() => {
      // Don't poll qBittorrent for a tab nobody is looking at.
      if (document.hidden) this._schedule();
      else this._fetch();
    }, seconds * 1000);
  }

  private _pick(metric: string): void {
    if (metric === this._metric) return;
    this._picked = metric;
    this._refresh();
  }

  private _renderMetrics() {
    const hass = this._hass!;
    const choices = this._choices;
    if (choices.length < 2) return nothing;
    return html`<div class="chips metrics">
      ${choices.map((metric) => {
        const selected = metric === this._metric;
        const label = t(hass, `metric_${metric}` as StringKey);
        return html`<button
          class="chip ${selected ? "selected" : ""}"
          style="--c: var(--rgb-${TOP_METRICS[metric].color})"
          title=${label}
          aria-pressed=${String(selected)}
          @click=${() => this._pick(metric)}
        >
          <ha-icon .icon=${TOP_METRICS[metric].icon}></ha-icon
          ><span>${t(hass, `metric_${metric}_short` as StringKey)}</span>
        </button>`;
      })}
    </div>`;
  }

  protected override render() {
    if (!this._config || !this._hass) return nothing;
    const hass = this._hass;
    if (!this._device) {
      return html`<ha-card>
        <div class="message">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>${t(hass, "no_device")}
        </div>
      </ha-card>`;
    }
    const metric = this._metric;
    const def = TOP_METRICS[metric];
    const metricLabel = t(hass, `metric_${metric}` as StringKey);
    const title = this._cfg.title || t(hass, "top_title", { n: this._count, metric: metricLabel });
    const secondary = [
      this._deviceName,
      t(hass, `filter_${this._cfg.filter}` as StringKey),
      this._cfg.category,
      this._cfg.tag ? `#${this._cfg.tag}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    // A failed poll keeps the last list on screen; flag it on the refresh button.
    const stale = Boolean(this._error && this._ranked);
    const refreshLabel = stale ? loadErrorText(hass, this._error!) : t(hass, "refresh");
    return html`<ha-card style="--c: var(--rgb-${def.color})">
      <div class="state-item header">
        <div class="shape"><ha-icon .icon=${this._cfg.icon || def.icon}></ha-icon></div>
        <div class="info">
          <span class="primary">${title}</span>
          <span class="secondary">${secondary}</span>
        </div>
        <button
          class="icon-button ${this._loading ? "busy" : ""} ${stale ? "failed" : ""}"
          title=${refreshLabel}
          aria-label=${refreshLabel}
          @click=${() => this._fetch()}
        >
          <ha-icon icon=${stale ? "mdi:alert-circle-outline" : "mdi:refresh"}></ha-icon>
        </button>
      </div>
      ${this._renderMetrics()}
      ${this._renderBody()}
    </ha-card>`;
  }

  private _renderBody() {
    const hass = this._hass!;
    if (this._error && !this._ranked) {
      return html`<div class="message error">
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <span class="grow">${loadErrorText(hass, this._error)}</span>
        <button class="chip" @click=${() => this._fetch()}><span>${t(hass, "retry")}</span></button>
      </div>`;
    }
    if (!this._ranked) {
      return html`<ol class="list">
        ${Array.from(
          { length: Math.min(this._count, 3) },
          () => html`<li class="skeleton"><i></i><b></b></li>`,
        )}
      </ol>`;
    }
    if (!this._ranked.length) {
      return html`<div class="message empty">
        <ha-icon icon="mdi:tray-remove"></ha-icon>${t(hass, "top_empty")}
      </div>`;
    }
    return html`<ol class="list">
      ${repeat(
        this._ranked,
        ({ torrent }) => torrent.hash,
        (entry, index) => this._renderRow(entry, index + 1),
      )}
    </ol>`;
  }

  private _renderRow({ torrent, value, fraction }: RankedTorrent, rank: number) {
    const hass = this._hass!;
    const state = torrentState(torrent);
    return html`<li class="row">
      <div class="rank ${rank <= 3 ? "podium" : ""}">${rank}</div>
      <div class="info">
        <div class="line">
          <span class="primary" title=${torrent.name}>${torrent.name}</span>
          <span class="value">${formatMetric(hass, this._metric, value, this._cfg.units)}</span>
        </div>
        ${this._cfg.show_bars
          ? html`<div class="bar" style="--value: ${fraction}"></div>`
          : nothing}
        <span class="secondary">
          <ha-icon
            .icon=${state.icon}
            style="--state-c: var(--rgb-${state.color})"
            title=${t(hass, `state_${state.group}` as StringKey)}
          ></ha-icon
          ><span class="summary">${torrentSummary(hass, torrent, this._cfg.units)}</span>
        </span>
      </div>
    </li>`;
  }

  static override styles = [
    baseStyles,
    css`
      .metrics {
        --chip-height: var(--mush-chip-height, 32px);
        padding: 0 var(--spacing) var(--spacing);
      }
      .metrics .chip {
        padding-inline: 0.45em;
      }
      .metrics .chip:not(.selected) ha-icon {
        color: var(--secondary-text-color);
      }
      .metrics .chip span {
        font-size: var(--card-secondary-font-size);
        font-weight: var(--card-primary-font-weight);
      }
      .icon-button.failed {
        color: rgb(var(--rgb-red));
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: calc(var(--spacing) * 0.8);
        margin: 0;
        padding: 0 var(--spacing) var(--spacing);
        list-style: none;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        min-width: 0;
      }
      .rank {
        flex: none;
        width: var(--icon-size);
        height: var(--icon-size);
        border-radius: var(--icon-border-radius);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--card-primary-font-size);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        background-color: var(--tint);
      }
      .rank.podium {
        color: rgb(var(--c));
        background-color: rgba(var(--c), 0.2);
      }
      .line {
        display: flex;
        align-items: baseline;
        gap: var(--spacing);
        min-width: 0;
      }
      .line .primary {
        flex: 1;
        min-width: 0;
      }
      .value {
        flex: none;
        font-size: var(--card-primary-font-size);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--card-primary-color);
      }
      .row .bar {
        margin: 4px 0;
        height: 4px;
      }
      .secondary {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
      }
      .summary {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .secondary ha-icon {
        --mdc-icon-size: 14px;
        flex: none;
        display: flex;
        color: rgb(var(--state-c));
      }
      .message.empty {
        justify-content: center;
        padding: var(--spacing) var(--spacing) calc(var(--spacing) * 2);
      }
      .message .grow {
        flex: 1;
      }
      .skeleton {
        display: flex;
        align-items: center;
        gap: var(--spacing);
      }
      .skeleton i,
      .skeleton b {
        display: block;
        background-color: var(--tint);
        animation: pulse 1.4s ease-in-out infinite;
      }
      .skeleton i {
        flex: none;
        width: var(--icon-size);
        height: var(--icon-size);
        border-radius: var(--icon-border-radius);
      }
      .skeleton b {
        flex: 1;
        height: 28px;
        border-radius: 6px;
      }
    `,
  ];
}
