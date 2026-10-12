// Visual editors: plain <ha-form> schemas (HA's own selectors), laid out like
// dockhand-cards' editors: the instance picker at the root, everything about
// how the card looks in collapsible sections. Values equal to the defaults are
// dropped so the YAML stays minimal.

import { html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators.js";

import {
  CONTROLS,
  DEFAULT_CONTROLS,
  DOMAIN,
  FILTERS,
  OVERVIEW_SECTIONS,
  SORTS,
  STATS,
  TORRENT_DETAILS,
} from "./const";
import { getQbtDevices } from "./discovery";
import { fireEvent, type HomeAssistant, type LovelaceCardConfig } from "./ha-types";
import { type StringKey, t } from "./i18n";
import { OVERVIEW_DEFAULTS } from "./overview-card";
import { TORRENTS_DEFAULTS } from "./torrents-card";

type Schema = Record<string, unknown>;

const options = (hass: HomeAssistant | undefined, values: readonly string[], prefix: string) =>
  values.map((value) => ({ value, label: t(hass, `${prefix}${value}` as StringKey) }));

/** Ordered multi-select: the order the user picks is the order shown on the card. */
const multiSelect = (hass: HomeAssistant | undefined, values: readonly string[], prefix: string) => ({
  selector: {
    select: { multiple: true, reorder: true, mode: "list", options: options(hass, values, prefix) },
  },
});

const LABEL_KEYS: Record<string, StringKey> = {
  device_id: "ed_device_id",
  name: "ed_name",
  icon: "ed_icon",
  layout: "ed_layout",
  visible_sections: "ed_visible_sections",
  stats: "ed_stats",
  controls: "ed_controls",
  graph_hours: "ed_graph_hours",
  show_webui_link: "ed_show_webui_link",
  title: "ed_title",
  filter: "ed_filter",
  filters: "ed_filters",
  sort: "ed_sort",
  reverse: "ed_reverse",
  limit: "ed_limit",
  refresh_interval: "ed_refresh_interval",
  category: "ed_category",
  tag: "ed_tag",
  details: "ed_details",
  show_actions: "ed_show_actions",
  units: "ed_units",
};

const unitsSchema = (hass: HomeAssistant | undefined): Schema => ({
  name: "units",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "binary", label: t(hass, "ed_units_binary") },
        { value: "decimal", label: t(hass, "ed_units_decimal") },
      ],
    },
  },
});

const HELPER_KEYS: Record<string, StringKey> = {
  filters: "ed_filters_helper",
  category: "ed_category_helper",
};

abstract class QbtEditor<C extends LovelaceCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() protected _config?: C;

  setConfig(config: C): void {
    this._config = config;
  }

  protected abstract _schema(): Schema[];

  protected abstract _defaults(): Record<string, unknown>;

  protected _deviceSchema(): Schema {
    return {
      name: "device_id",
      required: true,
      selector: { device: { filter: { integration: DOMAIN } } },
    };
  }

  protected override render() {
    if (!this.hass || !this._config) return nothing;
    const noDevices = getQbtDevices(this.hass).length === 0;
    return html`<ha-form
      .hass=${this.hass}
      .data=${{ ...this._defaults(), ...this._config }}
      .schema=${this._schema()}
      .computeLabel=${(schema: Schema) =>
        LABEL_KEYS[schema.name as string] ? t(this.hass, LABEL_KEYS[schema.name as string]) : undefined}
      .computeHelper=${(schema: Schema) =>
        schema.name === "device_id" && noDevices
          ? t(this.hass, "ed_no_devices")
          : HELPER_KEYS[schema.name as string]
            ? t(this.hass, HELPER_KEYS[schema.name as string])
            : undefined}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const config: Record<string, unknown> = { ...ev.detail.value };
    const defaults = this._defaults();
    for (const [key, value] of Object.entries(config)) {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (key in defaults && JSON.stringify(value) === JSON.stringify(defaults[key]))
      ) {
        delete config[key];
      }
    }
    fireEvent(this, "config-changed", { config });
  }
}

export class QbtOverviewCardEditor extends QbtEditor<LovelaceCardConfig> {
  protected _defaults() {
    return {
      ...OVERVIEW_DEFAULTS,
      controls: this._config?.layout === "compact" ? ["alt_speed"] : DEFAULT_CONTROLS,
    };
  }

  protected _schema(): Schema[] {
    const hass = this.hass;
    const compact = this._config?.layout === "compact";
    return [
      this._deviceSchema(),
      {
        name: "",
        type: "expandable",
        flatten: true,
        icon: "mdi:text-short",
        title: t(hass, "ed_content"),
        schema: [
          {
            type: "grid",
            name: "",
            schema: [
              { name: "name", selector: { text: {} } },
              { name: "icon", selector: { icon: {} } },
            ],
          },
          {
            name: "layout",
            selector: {
              select: {
                mode: "box",
                options: [
                  { value: "default", label: t(hass, "ed_layout_default") },
                  { value: "compact", label: t(hass, "ed_layout_compact") },
                ],
              },
            },
          },
          ...(compact
            ? []
            : [
                { name: "visible_sections", ...multiSelect(hass, OVERVIEW_SECTIONS, "ed_section_") },
                { name: "stats", ...multiSelect(hass, Object.keys(STATS), "stat_") },
                { name: "graph_hours", selector: { number: { min: 1, max: 24, mode: "slider" } } },
                { name: "show_webui_link", selector: { boolean: {} } },
              ]),
          { name: "controls", ...multiSelect(hass, Object.keys(CONTROLS), "control_") },
          unitsSchema(hass),
        ],
      },
    ];
  }
}

export class QbtTorrentsCardEditor extends QbtEditor<LovelaceCardConfig> {
  protected _defaults() {
    return { ...TORRENTS_DEFAULTS };
  }

  protected _schema(): Schema[] {
    const hass = this.hass;
    return [
      this._deviceSchema(),
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "filter",
            selector: { select: { mode: "dropdown", options: options(hass, FILTERS, "filter_") } },
          },
          {
            name: "sort",
            selector: { select: { mode: "dropdown", options: options(hass, SORTS, "sort_") } },
          },
          { name: "limit", selector: { number: { min: 1, max: 100, mode: "box" } } },
          { name: "reverse", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        flatten: true,
        icon: "mdi:text-short",
        title: t(hass, "ed_content"),
        schema: [
          { name: "title", selector: { text: {} } },
          { name: "filters", ...multiSelect(hass, FILTERS, "filter_") },
          { name: "details", ...multiSelect(hass, TORRENT_DETAILS, "detail_") },
          { name: "show_actions", selector: { boolean: {} } },
          unitsSchema(hass),
        ],
      },
      {
        name: "",
        type: "expandable",
        flatten: true,
        icon: "mdi:tune-variant",
        title: t(hass, "ed_advanced"),
        schema: [
          { name: "category", selector: { text: {} } },
          { name: "tag", selector: { text: {} } },
          {
            name: "refresh_interval",
            selector: { number: { min: 5, max: 300, mode: "box", unit_of_measurement: "s" } },
          },
        ],
      },
    ];
  }
}
