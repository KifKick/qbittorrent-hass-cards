# Changelog

## [0.1.0] - 2026-10-12

### Added

- `qbt-overview-card`: connection status, download/upload speeds with limits and a history graph, torrent count chips and global controls (alternative speed limits, pause/resume/reannounce all, DHT, queueing, shutdown); `default` and one-row `compact` layouts.
- `qbt-torrents-card`: live, paged torrent list from `qbt.get_torrents` with filter chips (with scroll arrows when they don't fit), progress, per-torrent details and actions (pause/resume, force start, reannounce, recheck, copy hash, remove with or without files).
- Sizes and speeds in binary units (KiB, MiB…) like qBittorrent's WebUI, or decimal ones via `units: decimal`.
- Visual editors, English and Polish translations, Mushroom theme variables (`--mush-*`) support.
