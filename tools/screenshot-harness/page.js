import { makeHass } from "./stubs.js";

const THEMES = {
  light: { "--primary-text-color": "#141414", "--secondary-text-color": "#5e5e5e", "--rgb-primary-text-color": "20, 20, 20",
    "--card-background-color": "#ffffff", "--primary-background-color": "#f5f5f5", "--divider-color": "rgba(0,0,0,.12)",
    "--primary-color": "#009ac7", "--rgb-primary-color": "0, 154, 199", "background": "#f5f5f5", "color": "#141414" },
  dark: { "--primary-text-color": "#e1e1e1", "--secondary-text-color": "#9b9b9b", "--rgb-primary-text-color": "225, 225, 225",
    "--card-background-color": "#1c1c1c", "--primary-background-color": "#111111", "--divider-color": "rgba(225,225,225,.12)",
    "--primary-color": "#009ac7", "--rgb-primary-color": "0, 154, 199", "background": "#111111", "color": "#e1e1e1" },
};

const params = new URLSearchParams(location.search);
const language = params.get("lang") ?? "pl";
const scenario = params.get("scenario") ?? "main";

const SCENARIOS = {
  main: [
    ["qbt-overview-card", {}, {}, 420],
    ["qbt-overview-card", { layout: "compact" }, {}, 300],
    ["qbt-overview-card", { visible_sections: ["speeds", "graph", "stats", "controls"], controls: ["alt_speed", "resume_all", "pause_all", "reannounce_all"] }, { "switch.alt_speed_limits": "on", "sensor.dl_limit": "10.0", "sensor.up_limit": "2.5" }, 560],
    ["qbt-torrents-card", { title: language === "pl" ? "Torrenty" : "Torrents", filter: "all", limit: 10 }, {}, 460],
  ],
  "docs-overview": [
    ["qbt-overview-card", {}, { "sensor.torrents_checking": "0", "sensor.torrents_error": "0" }, 460],
  ],
  "docs-compact": [
    ["qbt-overview-card", { layout: "compact" }, {}, 360],
    ["qbt-overview-card", { layout: "compact", controls: ["alt_speed", "pause_all"] }, { "switch.alt_speed_limits": "on", "sensor.up_limit": "2.5" }, 360],
  ],
  "docs-torrents": [
    ["qbt-torrents-card", { title: "Torrents", filter: "downloading", limit: 5 }, {}, 460],
  ],
  states: [
    ["qbt-overview-card", {}, { "binary_sensor.connectivity": "off", "sensor.dl_speed": "unavailable", "sensor.up_speed": "unavailable" }, 420],
    ["qbt-overview-card", { layout: "compact", controls: ["alt_speed", "pause_all"] }, { "switch.alt_speed_limits": "on", "sensor.dl_speed": "0.0", "sensor.up_speed": "0.85" }, 300],
    ["qbt-overview-card", { visible_sections: ["stats", "controls"], stats: ["total", "downloading", "seeding", "error", "peers", "session_download", "session_upload"], controls: ["alt_speed", "dht", "queueing", "shutdown"] }, { "sensor.connection_status": "firewalled" }, 420],
  ],
};

document.body.style.cssText = "margin:0;display:flex;width:fit-content;font-family:Roboto,'Noto Sans',system-ui,sans-serif;font-size:14px";
for (const [theme, vars] of Object.entries(THEMES)) {
  const col = document.createElement("div");
  col.style.cssText = "padding:16px;display:flex;flex-direction:column;gap:16px;align-items:flex-start";
  for (const [k, v] of Object.entries(vars)) col.style.setProperty(k, v);
  document.body.append(col);
  const hassFor = (overrides) => makeHass({ language, dark: theme === "dark", overrides });
  for (const [tag, config, overrides, width] of SCENARIOS[scenario]) {
    const wrap = document.createElement("div");
    wrap.style.width = `${width}px`;
    const card = document.createElement(tag);
    card.setConfig({ type: `custom:${tag}`, device_id: "dev1", ...config });
    card.hass = hassFor(overrides);
    wrap.append(card);
    col.append(wrap);
  }
}
