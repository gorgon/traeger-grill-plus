CREATE TABLE grill_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  grill_temp INTEGER NOT NULL,
  probe_temp INTEGER NOT NULL,
  setpoint INTEGER NOT NULL,
  system_status INTEGER NOT NULL
);
