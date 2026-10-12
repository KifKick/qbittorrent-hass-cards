// Stand-ins for HA's ha-card / ha-icon (rendering real MDI paths) and a fake
// `hass` with realistic qBittorrent data, so the built bundle renders as in HA.
import * as mdi from "@mdi/js";

const toKey = (icon) =>
  "mdi" + String(icon || "").replace(/^mdi:/, "").split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");

customElements.define(
  "ha-icon",
  class extends HTMLElement {
    static observedAttributes = ["icon"];
    set icon(v) { this._icon = v; this._render(); }
    get icon() { return this._icon; }
    attributeChangedCallback(_n, _o, v) { this.icon = v; }
    connectedCallback() { this._render(); }
    _render() {
      const path = mdi[toKey(this._icon)] ?? "";
      if (!path && this._icon) console.warn("missing icon", this._icon);
      (this.shadowRoot ?? this.attachShadow({ mode: "open" })).innerHTML = `<svg viewBox="0 0 24 24" style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);fill:currentColor;display:block"><path d="${path}"/></svg>`;
    }
  },
);

customElements.define(
  "ha-card",
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = `<style>:host{display:block;position:relative;background:var(--card-background-color);border-radius:var(--ha-card-border-radius,12px);border:1px solid var(--divider-color);color:var(--primary-text-color)}</style><slot></slot>`;
    }
  },
);

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const ENTITIES = {
  "sensor.dl_speed": ["sensor.qbt_predkosc_pobierania", "12.43", "MB/s"],
  "sensor.up_speed": ["sensor.qbt_predkosc_wysylania", "1.18", "MB/s"],
  "sensor.dl_limit": ["sensor.qbt_limit_predkosci_pobierania", "0.0", "MB/s"],
  "sensor.up_limit": ["sensor.qbt_limit_predkosci_wysylania", "5.0", "MB/s"],
  "sensor.dl_data_session": ["sensor.qbt_pobrano", "25.86", "GB"],
  "sensor.up_data_session": ["sensor.qbt_wyslano", "355.94", "GB"],
  "sensor.free_space": ["sensor.qbt_wolne_miejsce", "20440.567250944", "GB"],
  "sensor.global_ratio": ["sensor.qbt_ratio", "4.69"],
  "sensor.connection_status": ["sensor.qbt_status", "connected"],
  "sensor.total_peer_connections": ["sensor.qbt_peery", "37"],
  "sensor.dht_nodes": ["sensor.qbt_dht", "0"],
  "sensor.app_version": ["sensor.qbt_wersja", "v5.2.4"],
  "sensor.torrents_total": ["sensor.qbt_torrenty", "2886"],
  "sensor.torrents_downloading": ["sensor.qbt_pobierane", "2"],
  "sensor.torrents_seeding": ["sensor.qbt_wysylane", "2884"],
  "sensor.torrents_paused": ["sensor.qbt_wstrzymane", "0"],
  "sensor.torrents_checking": ["sensor.qbt_sprawdzane", "1"],
  "sensor.torrents_error": ["sensor.qbt_bledy", "1"],
  "binary_sensor.connectivity": ["binary_sensor.qbt_lacznosc", "on"],
  "switch.alt_speed_limits": ["switch.qbt_alt", "off"],
  "switch.dht": ["switch.qbt_dht", "off"],
  "switch.queueing_enabled": ["switch.qbt_kolejka", "on"],
  "button.resume_all": ["button.qbt_wznow", "unknown"],
  "button.pause_all": ["button.qbt_wstrzymaj", "unknown"],
  "button.reannounce_all": ["button.qbt_reannounce", "unknown"],
  "button.shutdown": ["button.qbt_zamknij", "unknown"],
};

const CONNECTION = { en: { connected: "Connected" }, pl: { connected: "Połączono" } };

export const makeHass = ({ language = "pl", dark = false, overrides = {} } = {}) => {
  const states = {};
  const entities = {};
  for (const [key, [entityId, state, unit]] of Object.entries(ENTITIES)) {
    const [, tk] = key.split(".");
    entities[entityId] = { entity_id: entityId, device_id: "dev1", platform: "qbt", translation_key: tk };
    states[entityId] = {
      entity_id: entityId,
      state: overrides[key] ?? state,
      attributes: unit ? { unit_of_measurement: unit } : {},
      last_changed: iso(now),
      last_updated: iso(now),
    };
  }
  return {
    language,
    locale: { language, number_format: "language", time_zone: "local" },
    config: { time_zone: "Europe/Warsaw" },
    themes: { darkMode: dark },
    devices: {
      dev1: {
        id: "dev1",
        name: "qBittorrent (seedbox.local)",
        name_by_user: null,
        identifiers: [["qbt", "entry1"]],
        config_entries: ["entry1"],
        configuration_url: "http://seedbox.local:8080",
        sw_version: "v5.2.4",
      },
    },
    entities,
    states,
    formatEntityState(st) {
      if (st.entity_id.endsWith("_status")) return CONNECTION[language]?.[st.state] ?? st.state;
      const unit = st.attributes.unit_of_measurement;
      return unit ? `${st.state} ${unit}` : st.state;
    },
    async callService(domain, service, data) {
      console.log("callService", domain, service, JSON.stringify(data));
    },
    async callWS(msg) {
      if (msg.type === "history/history_during_period") {
        const out = {};
        for (const id of msg.entity_ids) {
          const up = id.includes("wysylania");
          const pts = [];
          let v = up ? 1.0 : 6;
          for (let ts = now - 3600_000; ts < now; ts += 30_000) {
            const t = (ts - (now - 3600_000)) / 3600_000;
            v = up
              ? Math.max(0, 1 + Math.sin(t * 9) * 0.6 + Math.random() * 0.3)
              : Math.max(0, (t < 0.25 ? 0.2 : t < 0.55 ? 14 + Math.sin(t * 30) * 3 : t < 0.7 ? 4 : 11 + Math.cos(t * 20) * 2) + Math.random());
            pts.push({ s: v.toFixed(2), lu: ts / 1000 });
          }
          out[id] = pts;
        }
        return out;
      }
      if (msg.type === "call_service" && msg.service === "get_torrents") {
        // Roughly qBittorrent's own filters, so documented views look plausible.
        const filters = {
          downloading: (t) => t.progress < 1,
          seeding: (t) => t.progress >= 1 && !t.state.startsWith("stopped"),
          active: (t) => t.dlspeed > 0 || t.upspeed > 0,
        };
        const match = filters[msg.service_data.status_filter] ?? (() => true);
        return { context: {}, response: { torrents: TORRENTS.filter(match).slice(0, msg.service_data.limit) } };
      }
      throw new Error("unexpected " + msg.type);
    },
  };
};

const T = (name, state, progress, extra = {}) => ({
  hash: Math.random().toString(16).slice(2).padEnd(40, "0"),
  name,
  state,
  progress,
  size: 4.2e9,
  completed: 4.2e9 * progress,
  dlspeed: 0,
  upspeed: 0,
  eta: 8640000,
  ratio: 0,
  category: "",
  tags: "",
  save_path: "/storage/downloads/qbittorrent/completed",
  added_on: now / 1000 - 86400 * 3,
  num_seeds: 0,
  num_complete: 12,
  num_leechs: 0,
  num_incomplete: 3,
  force_start: false,
  ...extra,
});

const TORRENTS = [
  T("debian-13.1.0-amd64-DVD-1.iso", "downloading", 0.6342, { dlspeed: 9_800_000, upspeed: 420_000, eta: 1260, size: 3.9e9, num_seeds: 48, category: "linux", tags: "iso, debian" }),
  T("Big Buck Bunny (2008) [2160p HDR]", "forcedDL", 0.2251, { dlspeed: 2_630_000, eta: 5400, size: 13.7e9, force_start: true, category: "movies", tags: "2160p, HDR" }),
  T("ubuntu-26.04-desktop-amd64.iso", "stalledDL", 0.9995, { size: 6.1e9, category: "linux" }),
  T("Sintel.2010.1080p.mkv", "uploading", 1, { upspeed: 760_000, ratio: 3.0453, size: 2.2e9, category: "movies" }),
  T("archlinux-2026.10.01-x86_64.iso", "stalledUP", 1, { ratio: 12.31, size: 1.4e9, category: "linux" }),
  T("Tears of Steel [4K remux]", "checkingUP", 0.4120, { size: 38.5e9 }),
  T("fedora-workstation-43.iso", "queuedDL", 0, { size: 2.3e9 }),
  T("Elephants Dream (2006)", "missingFiles", 1, { size: 0.8e9, ratio: 1.02 }),
  T("LibreOffice_26.2_Linux_x86-64_deb.tar.gz", "stoppedUP", 1, { ratio: 0.48, size: 0.33e9 }),
  T("openSUSE-Tumbleweed-DVD-x86_64-Current.iso", "stoppedDL", 0.31, { size: 4.6e9 }),
  T("extra", "stalledUP", 1),
];
