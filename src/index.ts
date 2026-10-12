// Entry point: registers the cards and their editors, and lists the cards in
// the dashboard card picker (with suggestions when adding a card from a qbt
// entity or device).

import { DOMAIN } from "./const";
import { QbtOverviewCardEditor, QbtTorrentsCardEditor } from "./editors";
import type { HomeAssistant } from "./ha-types";
import { QbtOverviewCard } from "./overview-card";
import { QbtTorrentsCard } from "./torrents-card";

declare const __CARD_VERSION__: string; // injected by build.mjs from package.json

const DOCS_URL = "https://github.com/KifKick/qbittorrent-hass-cards";

const ELEMENTS: [string, CustomElementConstructor][] = [
  ["qbt-overview-card", QbtOverviewCard],
  ["qbt-overview-card-editor", QbtOverviewCardEditor],
  ["qbt-torrents-card", QbtTorrentsCard],
  ["qbt-torrents-card-editor", QbtTorrentsCardEditor],
];

// Guarded, so loading the file twice (e.g. a leftover manual resource next to
// the HACS one) doesn't throw on a duplicate define().
if (!customElements.get("qbt-overview-card")) {
  for (const [tag, element] of ELEMENTS) customElements.define(tag, element);

  const deviceIdFor = (hass: HomeAssistant, entityId: string): string | undefined => {
    const entry = hass.entities?.[entityId];
    return entry?.platform === DOMAIN ? entry.device_id : undefined;
  };

  const cards = (window as any).customCards ?? ((window as any).customCards = []);
  cards.push(
    {
      type: "qbt-overview-card",
      name: "qBittorrent Overview",
      description: "Speeds with a history graph, torrent counts and global controls.",
      preview: true,
      documentationURL: DOCS_URL,
      getEntitySuggestion(hass: HomeAssistant, entityId: string) {
        const deviceId = deviceIdFor(hass, entityId);
        return deviceId
          ? [{ config: { type: "custom:qbt-overview-card", device_id: deviceId } }]
          : undefined;
      },
    },
    {
      type: "qbt-torrents-card",
      name: "qBittorrent Torrents",
      description: "Live, filterable torrent list with pause/resume/remove actions.",
      preview: true,
      documentationURL: DOCS_URL,
      getEntitySuggestion(hass: HomeAssistant, entityId: string) {
        const deviceId = deviceIdFor(hass, entityId);
        return deviceId
          ? [{ config: { type: "custom:qbt-torrents-card", device_id: deviceId } }]
          : undefined;
      },
    },
  );

  console.info(
    `%c QBITTORRENT-HASS-CARDS %c ${__CARD_VERSION__} `,
    "color: white; background: #2f67ba; font-weight: 700;",
    "color: #2f67ba; background: white; font-weight: 700;",
  );
}
