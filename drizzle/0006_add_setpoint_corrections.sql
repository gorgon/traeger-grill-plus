CREATE TABLE setpoint_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  from_temp INTEGER NOT NULL,
  to_temp INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
