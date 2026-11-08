import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const grillState = sqliteTable("grill_state", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  firmware: text("firmware").notNull(),
  connected: integer("connected").notNull(),
  lastReportAt: text("last_report_at").notNull(),
  lastVerifiedAt: text("last_verified_at").notNull(),
  grillTemp: integer("grill_temp").notNull(),
  ambientTemp: integer("ambient_temp").notNull(),
  probeTemp: integer("probe_temp").notNull(),
  probeConnected: integer("probe_connected").notNull(),
  setpoint: integer("setpoint").notNull(),
  superSmoke: integer("super_smoke").notNull(),
  keepWarm: integer("keep_warm").notNull(),
  wifiNetwork: text("wifi_network").notNull(),
  wifiSignal: integer("wifi_signal").notNull(),
  pelletSensorConnected: integer("pellet_sensor_connected").notNull(),
  cookCycles: integer("cook_cycles").notNull(),
  customCookName: text("custom_cook_name").notNull(),
  customCookGrillTemp: integer("custom_cook_grill_temp").notNull(),
  customCookProbeTemp: integer("custom_cook_probe_temp").notNull(),
  lastSelectedMeatId: text("last_selected_meat_id"),
  systemStatus: integer("system_status").notNull().default(99),
  systemStateLabel: text("system_state_label").notNull().default("Offline"),
  cookIdPresent: integer("cook_id_present").notNull().default(0),
});

export const cookSessions = sqliteTable("cook_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  meatId: text("meat_id").notNull(),
  meatName: text("meat_name").notNull(),
  status: text("status", { enum: ["active", "completed", "shutdown_requested", "cancelled"] }).notNull(),
  currentStageIndex: integer("current_stage_index").notNull(),
  stageStartedAt: integer("stage_started_at", { mode: "timestamp_ms" }).notNull(),
  stageStartProbe: integer("stage_start_probe"),
  alarmAckedKeys: text("alarm_acked_keys").notNull().default(""),
  holdStartedAt: integer("hold_started_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const cookMessages = sqliteTable("cook_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id"),
  kind: text("kind", { enum: ["system", "Muse", "owner", "alarm", "shutdown"] }).notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const grillSnapshots = sqliteTable("grill_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
  grillTemp: integer("grill_temp").notNull(),
  probeTemp: integer("probe_temp").notNull(),
  setpoint: integer("setpoint").notNull(),
  systemStatus: integer("system_status").notNull(),
  // 1 = carry-forward row appended by the history feeder (feedSnapshotHistory)
  // from the last known snapshot during an active cook; 0 = a real snapshot
  // pushed after an actual grill check. Carry-forward rows keep trend
  // history continuous WITHOUT ever changing grill_state.lastVerifiedAt.
  carriedForward: integer("carried_forward").notNull().default(0),
});

// Traeger sign-in for the self-service live refresh — stored SERVER-SIDE
// ONLY, at the owner's explicit instruction (Nov 7, 2026: "store my
// password and login forever… I don't want to enter it again and again").
// Holds the owner's Traeger email + password plus the cached 24h idToken.
// The password is visible only to server actions: it is never returned to
// the client by any action, never in the page/bundle/localStorage, and
// never logged. It is used solely to re-authenticate with Traeger's auth
// endpoint over HTTPS when the cached token expires (guarded by T36).
export const traegerAuth = sqliteTable("traeger_auth", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  idToken: text("id_token"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

export const testRuns = sqliteTable("test_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  suite: text("suite").notNull(),
  scenario: text("scenario").notNull(),
  rule: text("rule").notNull(),
  passed: integer("passed").notNull(),
  detail: text("detail").notNull(),
  runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
  buildId: text("build_id").notNull(),
});

export const setpointCorrections = sqliteTable("setpoint_corrections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  stageIndex: integer("stage_index").notNull(),
  fromTemp: integer("from_temp").notNull(),
  toTemp: integer("to_temp").notNull(),
  status: text("status", { enum: ["requested", "confirmed"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
});
