import { css, html, nothing, type PropertyValues } from "lit";
import { state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import { loadHaForm, onActivate, QbtBaseCard, type QbtCardConfig } from "./base-card";
import {
  DEFAULT_FILTERS,
  DOMAIN,
  ENTITY,
  type StateDef,
  TORRENT_DETAILS,
} from "./const";
import { getQbtDevices } from "./discovery";
import { type ByteUnits, formatBytes, formatDate, formatNumber, formatRatio } from "./format";
import type { HomeAssistant } from "./ha-types";
import { type StringKey, t } from "./i18n";
import { baseStyles } from "./styles";
import { type Torrent, torrentState, torrentSummary } from "./torrent";

export interface TorrentsCardConfig extends QbtCardConfig {
  title?: string;
  filter?: string;
  filters?: string[];
  sort?: string;
  reverse?: boolean;
  limit?: number;
  refresh_interval?: number;
  category?: string;
  tag?: string;
  details?: string[];
  show_actions?: boolean;
  units?: ByteUnits;
}

export const TORRENTS_DEFAULTS = {
  filter: "active",
  filters: DEFAULT_FILTERS,
  sort: "added_on",
  reverse: true,
  limit: 10,
  refresh_interval: 10,
  details: [...TORRENT_DETAILS],
  show_actions: true,
  units: "binary",
} as const;

export class QbtTorrentsCard extends QbtBaseCard<TorrentsCardConfig> {
  @state() private _torrents?: Torrent[];

  @state() private _hasMore = false;

  @state() private _loading = false;

  @state() private _error?: string;

  @state() private _filter?: string;

  @state() private _pageSize = 0;

  @state() private _open?: string;

  /** Whether the filter chips overflow, and which way they can still scroll. */
  @state() private _scroll = { overflow: false, back: false, forward: false };

  private _resizeObserver?: ResizeObserver;

  private _observedRow?: HTMLElement;

  private _timer?: number;

  private _requestId = 0;

  private _queryKey?: string;

  static getStubConfig(hass: HomeAssistant): Partial<TorrentsCardConfig> {
    const device = getQbtDevices(hass)[0];
    return device ? { device_id: device.id } : {};
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await loadHaForm();
    return document.createElement("qbt-torrents-card-editor");
  }

  private get _cfg() {
    return { ...TORRENTS_DEFAULTS, ...this._config };
  }

  getCardSize(): number {
    return 2 + Math.min(this._torrents?.length ?? 3, Number(this._cfg.limit));
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  override setConfig(config: TorrentsCardConfig): void {
    super.setConfig(config);
    this._filter = undefined;
    this._pageSize = 0;
    this._refresh();
  }

  // The list only depends on the error count chip; torrents come from polling.
  protected override _watchedEntityIds(): string[] {
    const errors = this._entities[ENTITY.torrentsError];
    return errors ? [errors] : [];
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
    this._resizeObserver?.disconnect();
    this._observedRow = undefined;
  }

  private _onVisibility = (): void => {
    if (!document.hidden) this._fetch();
  };

  private get _activeFilter(): string {
    return this._filter ?? String(this._cfg.filter);
  }

  private get _limit(): number {
    return this._pageSize || Number(this._cfg.limit);
  }

  /** Fetch now if what we'd ask for changed since the last request. */
  private _refresh(): void {
    const key = JSON.stringify([
      this._entryId,
      this._activeFilter,
      this._cfg.sort,
      this._cfg.reverse,
      this._cfg.category,
      this._cfg.tag,
      this._limit,
    ]);
    if (key === this._queryKey) return;
    this._queryKey = key;
    this._fetch();
  }

  private async _fetch(): Promise<void> {
    const hass = this._hass;
    const entryId = this._entryId;
    window.clearTimeout(this._timer);
    if (!hass || !entryId || !this.isConnected) return;

    const requestId = ++this._requestId;
    const limit = this._limit;
    this._loading = true;
    try {
      const result = await hass.callWS<{ response: { torrents: Torrent[] } }>({
        type: "call_service",
        domain: DOMAIN,
        service: "get_torrents",
        service_data: {
          config_entry_id: entryId,
          status_filter: this._activeFilter,
          sort: this._cfg.sort,
          reverse: this._cfg.reverse,
          // One extra tells us whether there's another page.
          limit: limit + 1,
          ...(this._cfg.category ? { category: this._cfg.category } : {}),
          ...(this._cfg.tag ? { tag: this._cfg.tag } : {}),
        },
        return_response: true,
      });
      if (requestId !== this._requestId) return;
      const torrents = result.response?.torrents ?? [];
      this._hasMore = torrents.length > limit;
      this._torrents = torrents.slice(0, limit);
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
    const seconds = Math.max(2, Number(this._cfg.refresh_interval) || 10);
    this._timer = window.setTimeout(() => {
      // Don't poll qBittorrent for a tab nobody is looking at.
      if (document.hidden) this._schedule();
      else this._fetch();
    }, seconds * 1000);
  }

  /** Give qBittorrent a moment to apply an action before re-reading. */
  private _refetchSoon(): void {
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => this._fetch(), 1200);
  }

  private _selectFilter(filter: string): void {
    if (filter === this._activeFilter) return;
    this._filter = filter;
    this._pageSize = 0;
    this._open = undefined;
    this._torrents = undefined;
    this._refresh();
  }

  private _showMore(): void {
    this._pageSize = this._limit + Number(this._cfg.limit);
    this._refresh();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const row = this.renderRoot.querySelector<HTMLElement>(".filters");
    if (!row) return;
    // The card's width decides whether the chips fit, so re-measure on resize.
    if (row !== this._observedRow) {
      this._resizeObserver ??= new ResizeObserver(() => this._measureFilters());
      this._resizeObserver.disconnect();
      this._resizeObserver.observe(row);
      this._observedRow = row;
    }
    // Keep the selected filter chip in view (clear of the edge fades) when it
    // changes, and when the arrows appear or go away, since they narrow the row.
    // Not on every scroll, or it would undo the user's own scrolling.
    const previous = changed.get("_scroll") as { overflow: boolean } | undefined;
    if (
      changed.has("_filter") ||
      changed.has("_config") ||
      (previous && previous.overflow !== this._scroll.overflow)
    ) {
      const chip = row.querySelector<HTMLElement>(".chip.selected");
      const fade = 24;
      if (chip && chip.offsetLeft - fade < row.scrollLeft) {
        row.scrollLeft = chip.offsetLeft - fade;
      } else if (chip && chip.offsetLeft + chip.offsetWidth + fade > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = chip.offsetLeft + chip.offsetWidth + fade - row.clientWidth;
      }
    }
    this._measureFilters();
  }

  private _measureFilters(): void {
    const row = this.renderRoot.querySelector<HTMLElement>(".filters");
    if (!row) return;
    const overflow = row.scrollWidth > row.clientWidth + 1;
    const back = overflow && row.scrollLeft > 1;
    const forward = overflow && row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    const current = this._scroll;
    // Only assign on change: this runs from updated(), so it must settle.
    if (current.overflow !== overflow || current.back !== back || current.forward !== forward) {
      this._scroll = { overflow, back, forward };
    }
  }

  private _scrollFilters(direction: -1 | 1): void {
    const row = this.renderRoot.querySelector<HTMLElement>(".filters");
    row?.scrollBy({ left: direction * row.clientWidth * 0.75, behavior: "smooth" });
  }

  private _renderArrow(direction: -1 | 1) {
    const back = direction < 0;
    const label = t(this._hass, back ? "filters_back" : "filters_forward");
    return html`<button
      class="icon-button scroll-arrow"
      title=${label}
      aria-label=${label}
      ?disabled=${back ? !this._scroll.back : !this._scroll.forward}
      @click=${() => this._scrollFilters(direction)}
    >
      <ha-icon icon=${back ? "mdi:chevron-left" : "mdi:chevron-right"}></ha-icon>
    </button>`;
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
    // A failed poll keeps the last list on screen; flag it on the refresh button.
    const stale = Boolean(this._error && this._torrents);
    const refreshLabel = stale
      ? t(hass, "load_error", { error: this._error! })
      : t(hass, "refresh");
    return html`<ha-card>
      ${this._config.title ? html`<div class="title">${this._config.title}</div>` : nothing}
      <div class="toolbar">
        ${this._scroll.overflow ? this._renderArrow(-1) : nothing}
        <div
          class="chips filters ${this._scroll.back ? "fade-start" : ""} ${this._scroll.forward
            ? "fade-end"
            : ""}"
          @scroll=${() => this._measureFilters()}
        >
          ${this._renderFilters()}
        </div>
        ${this._scroll.overflow ? this._renderArrow(1) : nothing}
        <button
          class="icon-button refresh ${this._loading ? "busy" : ""} ${stale ? "failed" : ""}"
          title=${refreshLabel}
          aria-label=${refreshLabel}
          @click=${() => this._fetch()}
        >
          <ha-icon icon=${stale ? "mdi:alert-circle-outline" : "mdi:refresh"}></ha-icon>
        </button>
      </div>
      ${this._renderBody()}
    </ha-card>`;
  }

  private _renderFilters() {
    const hass = this._hass!;
    const errors = Number(this._stateObj(ENTITY.torrentsError)?.state) || 0;
    return (this._cfg.filters as readonly string[]).map((filter) => {
      const selected = filter === this._activeFilter;
      const alert = filter === "errored" && errors > 0;
      return html`<button
        class="chip ${selected ? "selected" : ""}"
        style=${alert ? "--c: var(--rgb-red)" : ""}
        aria-pressed=${String(selected)}
        @click=${() => this._selectFilter(filter)}
      >
        <span>${t(hass, `filter_${filter}` as StringKey)}</span>${alert
          ? html`<span class="count">${formatNumber(hass, errors)}</span>`
          : nothing}
      </button>`;
    });
  }

  private _renderBody() {
    const hass = this._hass!;
    if (this._error && !this._torrents) {
      // Integration versions before the `limit` option reject it in the schema.
      const outdated = /extra keys not allowed.*limit/i.test(this._error);
      return html`<div class="message error">
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <span class="grow"
          >${outdated ? t(hass, "needs_update") : t(hass, "load_error", { error: this._error })}</span
        >
        <button class="chip" @click=${() => this._fetch()}><span>${t(hass, "retry")}</span></button>
      </div>`;
    }
    if (!this._torrents) {
      return html`<div class="list">
        ${[0, 1, 2].map(() => html`<div class="skeleton"><i></i><b></b></div>`)}
      </div>`;
    }
    if (!this._torrents.length) {
      const filter = t(hass, `filter_${this._activeFilter}` as StringKey);
      return html`<div class="message empty">
        <ha-icon icon="mdi:tray-remove"></ha-icon>${t(hass, "empty", { filter })}
      </div>`;
    }
    return html`<div class="list">
        ${repeat(
          this._torrents,
          (torrent) => torrent.hash,
          (torrent) => this._renderTorrent(torrent),
        )}
      </div>
      ${this._hasMore
        ? html`<div class="actions">
            <button class="button" @click=${() => this._showMore()}>
              <ha-icon icon="mdi:chevron-down"></ha-icon><span>${t(hass, "show_more")}</span>
            </button>
          </div>`
        : nothing}`;
  }

  private _renderTorrent(torrent: Torrent) {
    const hass = this._hass!;
    const def = torrentState(torrent);
    const open = this._open === torrent.hash;
    const toggle = () => {
      this._open = open ? undefined : torrent.hash;
    };
    return html`<div class="torrent ${open ? "open" : ""}" style="--c: var(--rgb-${def.color})">
      <div
        class="state-item clickable"
        role="button"
        tabindex="0"
        aria-expanded=${String(open)}
        @click=${toggle}
        @keydown=${onActivate(toggle)}
      >
        <div class="shape ${def.spin ? "spin" : ""}" title=${t(hass, `state_${def.group}` as StringKey)}>
          <ha-icon .icon=${def.icon}></ha-icon>${torrent.force_start
            ? html`<div class="badge" style="--badge-c: var(--rgb-orange)">
                <ha-icon icon="mdi:flash"></ha-icon>
              </div>`
            : nothing}
        </div>
        <div class="info">
          <span class="primary" title=${torrent.name}>${torrent.name}</span>
          <span class="secondary">${torrentSummary(hass, torrent, this._cfg.units)}</span>
          ${torrent.progress < 1
            ? html`<div class="bar" style="--value: ${Math.max(0, torrent.progress)}"></div>`
            : nothing}
        </div>
      </div>
      ${open ? this._renderDetails(torrent, def) : nothing}
    </div>`;
  }

  private _renderDetails(torrent: Torrent, def: StateDef) {
    const hass = this._hass!;
    const show = new Set(this._cfg.details as readonly string[]);
    const units = { units: this._cfg.units };
    const rows: [StringKey, unknown][] = [];
    if (show.has("size")) {
      const done = torrent.completed ?? torrent.size * torrent.progress;
      rows.push([
        "detail_size",
        torrent.progress < 1
          ? `${formatBytes(hass, done, units)} / ${formatBytes(hass, torrent.size, units)}`
          : formatBytes(hass, torrent.size, units),
      ]);
    }
    if (show.has("ratio")) rows.push(["detail_ratio", formatRatio(hass, torrent.ratio)]);
    if (show.has("peers")) {
      rows.push([
        "detail_peers",
        `${torrent.num_seeds ?? 0} (${torrent.num_complete ?? 0}) / ${torrent.num_leechs ?? 0} (${torrent.num_incomplete ?? 0})`,
      ]);
    }
    if (show.has("category") && torrent.category) rows.push(["detail_category", torrent.category]);
    if (show.has("tags") && torrent.tags) {
      rows.push([
        "detail_tags",
        html`<span class="tags">${torrent.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => html`<span class="tag">${tag}</span>`)}</span>`,
      ]);
    }
    if (show.has("added") && torrent.added_on) rows.push(["detail_added", formatDate(hass, torrent.added_on)]);
    if (show.has("path") && torrent.save_path) {
      rows.push(["detail_path", html`<span class="path">${torrent.save_path}</span>`]);
    }
    return html`<div class="details">
      ${rows.length
        ? html`<dl>
            ${rows.map(([key, value]) => html`<dt>${t(hass, key)}</dt><dd>${value}</dd>`)}
          </dl>`
        : nothing}
      ${this._cfg.show_actions ? this._renderActions(torrent, def) : nothing}
    </div>`;
  }

  private _renderActions(torrent: Torrent, def: StateDef) {
    const hass = this._hass!;
    const hashes = [torrent.hash];
    const name = torrent.name;
    const action = (icon: string, key: StringKey, run: () => void, extra = "") =>
      html`<button
        class="button ${extra}"
        title=${t(hass, key)}
        aria-label=${t(hass, key)}
        @click=${(ev: Event) => {
          ev.stopPropagation();
          run();
        }}
      >
        <ha-icon .icon=${icon}></ha-icon><span class="label">${t(hass, key)}</span>
      </button>`;
    return html`<div class="actions">
      ${def.stopped
        ? action("mdi:play", "action_resume", () => this._run("resume_torrents", { hashes }))
        : action("mdi:pause", "action_pause", () => this._run("pause_torrents", { hashes }))}
      ${torrent.force_start
        ? action("mdi:flash-off", "action_force_stop", () =>
            this._run("force_start", { hashes, enable: false }),
          )
        : action("mdi:flash", "action_force_start", () =>
            this._run("force_start", { hashes, enable: true }),
          )}
      ${action("mdi:bullhorn-outline", "action_reannounce", () =>
        this._run("reannounce_torrents", { hashes }),
      )}
      ${action("mdi:file-search-outline", "action_recheck", () =>
        this._confirm("recheck_torrents", { hashes }, t(hass, "confirm_recheck", { name })),
      )}
      ${action("mdi:content-copy", "action_copy_hash", () => this._copyHash(torrent.hash))}
      ${action(
        "mdi:delete-outline",
        "action_delete",
        () => this._confirm("delete_torrents", { hashes, delete_files: false }, t(hass, "confirm_delete", { name })),
        "danger",
      )}
      ${action(
        "mdi:delete-forever",
        "action_delete_files",
        () =>
          this._confirm(
            "delete_torrents",
            { hashes, delete_files: true },
            t(hass, "confirm_delete_files", { name }),
          ),
        "danger",
      )}
    </div>`;
  }

  private async _run(service: string, data: Record<string, unknown>): Promise<void> {
    await this._callService(DOMAIN, service, { config_entry_id: this._entryId, ...data });
    this._refetchSoon();
  }

  private _confirm(service: string, data: Record<string, unknown>, text: string): void {
    this._confirmAction(`${DOMAIN}.${service}`, { config_entry_id: this._entryId, ...data }, text);
    // The dialog doesn't report back; the next poll picks up whatever happened.
  }

  private async _copyHash(hash: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash);
      this._toast(t(this._hass, "copied"));
    } catch {
      this._toast(hash);
    }
  }

  static override styles = [
    baseStyles,
    css`
      .title {
        padding: var(--spacing) var(--spacing) 0;
        font-size: 16px;
        font-weight: 500;
        line-height: 24px;
        color: var(--primary-text-color);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: var(--spacing);
        padding-bottom: 0;
      }
      .filters {
        --chip-height: var(--mush-chip-height, 32px);
        flex: 1;
        min-width: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
      }
      /* Fade the edges the row can still scroll towards. */
      .filters.fade-end {
        mask-image: linear-gradient(to right, black calc(100% - 24px), transparent);
      }
      .filters.fade-start {
        mask-image: linear-gradient(to right, transparent, black 24px);
      }
      .filters.fade-start.fade-end {
        mask-image: linear-gradient(
          to right,
          transparent,
          black 24px,
          black calc(100% - 24px),
          transparent
        );
      }
      .scroll-arrow {
        width: 28px;
        height: 28px;
      }
      .scroll-arrow:disabled {
        opacity: 0.3;
        cursor: default;
        background: none;
      }
      .refresh {
        margin-inline-start: 6px;
      }
      .filters::-webkit-scrollbar {
        display: none;
      }
      .filters .chip {
        padding-inline: 0.45em;
      }
      .filters .chip span {
        font-size: var(--card-secondary-font-size);
        font-weight: var(--card-primary-font-weight);
      }
      .icon-button.failed {
        color: rgb(var(--rgb-red));
      }
      .chip .count {
        margin-inline-start: 0.2em;
        padding: 0.12em 0.4em;
        border-radius: 1em;
        color: white;
        background-color: rgb(var(--rgb-red));
      }
      .list {
        display: flex;
        flex-direction: column;
        padding: calc(var(--spacing) / 2) 0;
      }
      .torrent {
        border-radius: var(--control-border-radius);
        margin: 0 calc(var(--spacing) / 2);
        transition: background-color 180ms ease-in-out;
      }
      .torrent > .state-item {
        border-radius: var(--control-border-radius);
        padding: calc(var(--spacing) / 2 + 2px) calc(var(--spacing) / 2);
      }
      .torrent > .state-item:hover,
      .torrent.open {
        background-color: var(--tint);
      }
      .torrent .bar {
        margin-top: 6px;
        height: 4px;
      }
      .details {
        padding: 0 calc(var(--spacing) / 2) calc(var(--spacing) / 2);
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 12px;
        margin: 0;
        padding: 4px 0 var(--spacing) calc(var(--icon-size) + var(--spacing));
        font-size: var(--card-secondary-font-size);
        line-height: var(--card-secondary-line-height);
      }
      dt {
        color: var(--secondary-text-color);
      }
      dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .path {
        font-family: var(--code-font-family, ui-monospace, monospace);
        font-size: 11px;
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .tag {
        padding: 0 6px;
        border-radius: 8px;
        background-color: rgba(var(--c), 0.15);
      }
      .details .actions {
        padding: 0;
        gap: calc(var(--spacing) / 2);
        flex-wrap: wrap;
      }
      .details .button {
        --control-height: 36px;
        flex: 1 1 0;
        min-width: 36px;
      }
      .details .button.danger {
        color: rgb(var(--rgb-red));
      }
      /* Seven actions only fit with labels on wide cards. */
      .details .button .label {
        display: none;
      }
      @container qbt (min-width: 640px) {
        .details .button .label {
          display: inline;
        }
      }
      .list + .actions {
        padding-top: 0;
      }
      .message.empty {
        justify-content: center;
        padding: calc(var(--spacing) * 2) var(--spacing);
      }
      .message .grow {
        flex: 1;
      }
      .skeleton {
        display: flex;
        align-items: center;
        gap: var(--spacing);
        padding: calc(var(--spacing) / 2 + 2px) var(--spacing);
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
