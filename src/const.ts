// Contract with the integration: the cards find entities by translation_key
// (see the *_DESCRIPTIONS in the Python platforms), never by entity_id, so
// they work regardless of the UI language the entities were named in.

export const DOMAIN = "qbt";

/** Entity keys are `<platform>.<translation_key>`; sensor/number share some keys. */
export const ENTITY = {
  dlSpeed: "sensor.dl_speed",
  upSpeed: "sensor.up_speed",
  dlLimit: "sensor.dl_limit",
  upLimit: "sensor.up_limit",
  dlSession: "sensor.dl_data_session",
  upSession: "sensor.up_data_session",
  freeSpace: "sensor.free_space",
  ratio: "sensor.global_ratio",
  connectionStatus: "sensor.connection_status",
  peers: "sensor.total_peer_connections",
  dhtNodes: "sensor.dht_nodes",
  appVersion: "sensor.app_version",
  torrentsTotal: "sensor.torrents_total",
  torrentsDownloading: "sensor.torrents_downloading",
  torrentsSeeding: "sensor.torrents_seeding",
  torrentsPaused: "sensor.torrents_paused",
  torrentsChecking: "sensor.torrents_checking",
  torrentsError: "sensor.torrents_error",
  connectivity: "binary_sensor.connectivity",
  altSpeed: "switch.alt_speed_limits",
  dht: "switch.dht",
  queueing: "switch.queueing_enabled",
  resumeAll: "button.resume_all",
  pauseAll: "button.pause_all",
  reannounceAll: "button.reannounce_all",
  shutdown: "button.shutdown",
} as const;

/** Mushroom's named palette; values are used as `var(--rgb-<name>)`. */
export type Color =
  | "red"
  | "purple"
  | "blue"
  | "light-blue"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "grey"
  | "disabled";

// --- Overview card -----------------------------------------------------------

export interface StatDef {
  entity: string;
  icon: string;
  color?: Color;
  /** Count stats that only matter when non-zero (alerts). */
  hideZero?: boolean;
}

export const STATS: Record<string, StatDef> = {
  downloading: { entity: ENTITY.torrentsDownloading, icon: "mdi:download", color: "blue" },
  seeding: { entity: ENTITY.torrentsSeeding, icon: "mdi:upload", color: "green" },
  paused: { entity: ENTITY.torrentsPaused, icon: "mdi:pause", color: "grey" },
  checking: { entity: ENTITY.torrentsChecking, icon: "mdi:sync", color: "amber", hideZero: true },
  error: { entity: ENTITY.torrentsError, icon: "mdi:alert-circle", color: "red", hideZero: true },
  total: { entity: ENTITY.torrentsTotal, icon: "mdi:file-multiple" },
  free_space: { entity: ENTITY.freeSpace, icon: "mdi:harddisk" },
  ratio: { entity: ENTITY.ratio, icon: "mdi:scale-balance" },
  peers: { entity: ENTITY.peers, icon: "mdi:account-multiple" },
  dht_nodes: { entity: ENTITY.dhtNodes, icon: "mdi:lan" },
  session_download: { entity: ENTITY.dlSession, icon: "mdi:download-network" },
  session_upload: { entity: ENTITY.upSession, icon: "mdi:upload-network" },
};
export const DEFAULT_STATS = ["downloading", "seeding", "paused", "checking", "error", "free_space", "ratio"];

export interface ControlDef {
  entity: string;
  icon: string;
  /** Switches toggle and show their on state; buttons are pressed. */
  toggle?: boolean;
  /** Disruptive actions go through HA's confirmation dialog. */
  confirm?: boolean;
  color?: Color;
}

export const CONTROLS: Record<string, ControlDef> = {
  alt_speed: { entity: ENTITY.altSpeed, icon: "mdi:speedometer-slow", toggle: true, color: "amber" },
  resume_all: { entity: ENTITY.resumeAll, icon: "mdi:play", confirm: true },
  pause_all: { entity: ENTITY.pauseAll, icon: "mdi:pause", confirm: true },
  reannounce_all: { entity: ENTITY.reannounceAll, icon: "mdi:bullhorn-outline", confirm: true },
  dht: { entity: ENTITY.dht, icon: "mdi:lan", toggle: true, color: "blue" },
  queueing: { entity: ENTITY.queueing, icon: "mdi:sort-numeric-ascending", toggle: true, color: "blue" },
  shutdown: { entity: ENTITY.shutdown, icon: "mdi:power", confirm: true, color: "red" },
};
export const DEFAULT_CONTROLS = ["alt_speed", "resume_all", "pause_all"];

export const OVERVIEW_SECTIONS = ["speeds", "graph", "stats", "controls"] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

// --- Torrents card -----------------------------------------------------------

/** Groups qBittorrent's raw `state` values into what the card displays. */
export interface StateDef {
  group: string;
  icon: string;
  color: Color;
  /** Whether the torrent is stopped, i.e. the primary action is "resume". */
  stopped?: boolean;
  spin?: boolean;
}

export const TORRENT_STATES: Record<string, StateDef> = {
  downloading: { group: "downloading", icon: "mdi:download", color: "blue" },
  forcedDL: { group: "downloading", icon: "mdi:download", color: "blue" },
  metaDL: { group: "metadata", icon: "mdi:magnet", color: "light-blue" },
  forcedMetaDL: { group: "metadata", icon: "mdi:magnet", color: "light-blue" },
  stalledDL: { group: "stalled", icon: "mdi:download-off-outline", color: "orange" },
  queuedDL: { group: "queued", icon: "mdi:timer-sand", color: "purple" },
  uploading: { group: "uploading", icon: "mdi:upload", color: "green" },
  forcedUP: { group: "uploading", icon: "mdi:upload", color: "green" },
  stalledUP: { group: "seeding", icon: "mdi:upload-outline", color: "teal" },
  queuedUP: { group: "queued", icon: "mdi:timer-sand", color: "purple" },
  pausedDL: { group: "stopped", icon: "mdi:pause", color: "grey", stopped: true },
  stoppedDL: { group: "stopped", icon: "mdi:pause", color: "grey", stopped: true },
  pausedUP: { group: "completed", icon: "mdi:check", color: "grey", stopped: true },
  stoppedUP: { group: "completed", icon: "mdi:check", color: "grey", stopped: true },
  checkingDL: { group: "checking", icon: "mdi:sync", color: "amber", spin: true },
  checkingUP: { group: "checking", icon: "mdi:sync", color: "amber", spin: true },
  checkingResumeData: { group: "checking", icon: "mdi:sync", color: "amber", spin: true },
  moving: { group: "moving", icon: "mdi:folder-move-outline", color: "amber" },
  error: { group: "error", icon: "mdi:alert-circle", color: "red", stopped: true },
  missingFiles: { group: "missing", icon: "mdi:file-alert-outline", color: "red", stopped: true },
};
export const UNKNOWN_STATE: StateDef = { group: "unknown", icon: "mdi:help-circle-outline", color: "grey" };

/** `status_filter` values accepted by qbt.get_torrents (see services.yaml). */
export const FILTERS = [
  "active",
  "downloading",
  "seeding",
  "completed",
  "running",
  "stopped",
  "inactive",
  "stalled",
  "stalled_downloading",
  "stalled_uploading",
  "checking",
  "moving",
  "errored",
  "all",
] as const;
export const DEFAULT_FILTERS = ["active", "downloading", "seeding", "stopped", "errored", "all"];

/** Torrent properties worth sorting by (any returned property works). */
export const SORTS = [
  "added_on",
  "name",
  "progress",
  "dlspeed",
  "upspeed",
  "eta",
  "size",
  "ratio",
  "completion_on",
  "last_activity",
  "priority",
] as const;

export const TORRENT_DETAILS = ["size", "ratio", "peers", "category", "tags", "added", "path"] as const;

// --- Top card --------------------------------------------------------------

export interface MetricDef {
  /** How the value is formatted. */
  kind: "bytes" | "speed" | "ratio" | "count" | "duration";
  icon: string;
  color: Color;
}

/** Torrent properties the top card ranks by (all sortable by qbt.get_torrents). */
export const TOP_METRICS: Record<string, MetricDef> = {
  uploaded: { kind: "bytes", icon: "mdi:upload-network", color: "green" },
  upspeed: { kind: "speed", icon: "mdi:upload", color: "green" },
  ratio: { kind: "ratio", icon: "mdi:scale-balance", color: "teal" },
  num_leechs: { kind: "count", icon: "mdi:account-arrow-down", color: "purple" },
  seeding_time: { kind: "duration", icon: "mdi:timer-outline", color: "teal" },
  downloaded: { kind: "bytes", icon: "mdi:download-network", color: "blue" },
  dlspeed: { kind: "speed", icon: "mdi:download", color: "blue" },
  size: { kind: "bytes", icon: "mdi:harddisk", color: "grey" },
};

/** qBittorrent's "infinite" ETA. */
export const ETA_INFINITE = 8640000;
