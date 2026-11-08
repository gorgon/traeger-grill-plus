DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE grill_state (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  firmware TEXT NOT NULL,
  connected INTEGER NOT NULL,
  last_report_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  grill_temp INTEGER NOT NULL,
  ambient_temp INTEGER NOT NULL,
  probe_temp INTEGER NOT NULL,
  probe_connected INTEGER NOT NULL,
  setpoint INTEGER NOT NULL,
  super_smoke INTEGER NOT NULL,
  keep_warm INTEGER NOT NULL,
  wifi_network TEXT NOT NULL,
  wifi_signal INTEGER NOT NULL,
  pellet_sensor_connected INTEGER NOT NULL,
  cook_cycles INTEGER NOT NULL,
  custom_cook_name TEXT NOT NULL,
  custom_cook_grill_temp INTEGER NOT NULL,
  custom_cook_probe_temp INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE cook_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meat_id TEXT NOT NULL,
  meat_name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage_index INTEGER NOT NULL,
  stage_started_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE cook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
