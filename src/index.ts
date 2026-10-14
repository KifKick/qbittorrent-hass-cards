// Entry point: registers the cards and their editors, and lists the cards in
// the dashboard card picker (with suggestions when adding a card from a qbt
// entity or device).

import { DOMAIN } from "./const";
import { QbtOverviewCardEditor, QbtTopCardEditor, QbtTorrentsCardEditor } from "./editors";
import type { HomeAssistant } from "./ha-types";
import { QbtOverviewCard } from "./overview-card";
import { QbtTopCard } from "./top-card";
import { QbtTorrentsCard } from "./torrents-card";

declare const __CARD_VERSION__: string; // injected by build.mjs from package.json

const DOCS_URL = "https://github.com/KifKick/qbittorrent-hass-cards";

const ELEMENTS: [string, CustomElementConstructor][] = [
  ["qbt-overview-card", QbtOverviewCard],
  ["qbt-overview-card-editor", QbtOverviewCardEditor],
  ["qbt-torrents-card", QbtTorrentsCard],
  ["qbt-torrents-card-editor", QbtTorrentsCardEditor],
  ["qbt-top-card", QbtTopCard],
  ["qbt-top-card-editor", QbtTopCardEditor],
];

// Guarded per element, so loading the file twice (e.g. a leftover manual
// resource next to the HACS one) doesn't throw on a duplicate define(), and a
// newer copy still adds cards an older one loaded first doesn't have.
const missing = ELEMENTS.filter(([tag]) => !customElements.get(tag));
if (missing.length) {
  for (const [tag, element] of missing) customElements.define(tag, element);

  const deviceIdFor = (hass: HomeAssistant, entityId: string): string | undefined => {
    const entry = hass.entities?.[entityId];
    return entry?.platform === DOMAIN ? entry.device_id : undefined;
  };

  const cards: { type: string }[] = (window as any).customCards ?? ((window as any).customCards = []);
  const listed = new Set(cards.map((card) => card.type));
  const ours = [
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
    {
      type: "qbt-top-card",
      name: "qBittorrent Top Torrents",
      description: "Top torrents by upload, ratio, speed, leechers or seeding time.",
      preview: true,
      documentationURL: DOCS_URL,
      getEntitySuggestion(hass: HomeAssistant, entityId: string) {
        const deviceId = deviceIdFor(hass, entityId);
        return deviceId
          ? [{ config: { type: "custom:qbt-top-card", device_id: deviceId } }]
          : undefined;
      },
    },
  ];
  cards.push(...ours.filter((card) => !listed.has(card.type)));

  console.info(
    `%c QBITTORRENT-HASS-CARDS %c ${__CARD_VERSION__} `,
    "color: white; background: #2f67ba; font-weight: 700;",
    "color: #2f67ba; background: white; font-weight: 700;",
  );
}
