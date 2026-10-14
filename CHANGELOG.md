# Changelog

## [0.2.0] - 2026-10-14

### Added

- `qbt-top-card`: top-N torrents by upload, share ratio, upload/download speed, leechers, seeding time or size, with bars against the leader; a fixed ranking, or several to switch between with chips (`metrics`); optional filter, category and tag.

### Changed

- The torrents card and the new top card share one `qbt.get_torrents` helper.

### Fixed

- Loading the bundle twice (e.g. a manual resource next to the HACS one) now registers the cards a newer copy adds, instead of skipping everything when an older copy loaded first.

## [0.1.0] - 2026-10-12

### Added

- `qbt-overview-card`: connection status, download/upload speeds with limits and a history graph, torrent count chips and global controls (alternative speed limits, pause/resume/reannounce all, DHT, queueing, shutdown); `default` and one-row `compact` layouts.
- `qbt-torrents-card`: live, paged torrent list from `qbt.get_torrents` with filter chips (with scroll arrows when they don't fit), progress, per-torrent details and actions (pause/resume, force start, reannounce, recheck, copy hash, remove with or without files).
- Sizes and speeds in binary units (KiB, MiB…) like qBittorrent's WebUI, or decimal ones via `units: decimal`.
- Visual editors, English and Polish translations, Mushroom theme variables (`--mush-*`) support.
