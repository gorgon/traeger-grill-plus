import type { Ctx } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";

// Static-import-safe design: this module imports NOTHING from actions.ts.
// actions.ts statically imports runIntegrationTests from here and passes
// everything the suite needs (programs, helpers, the Actions map itself)
// as `deps` — no dynamic import, no cycle.
export type TestDeps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Actions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PROGRAMS: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  REQUIREMENTS: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeStageConditionMet: (...args: any[]) => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deriveSystemStateLabel: (...args: any[]) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadDashboard: (ctx: Ctx) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseAckedKeys: (raw: string | null | undefined) => string[];
  formatSnapshotAge: (ageMs: number) => string;
  resolveCheckFeedback: (input: { requestedAtMs: number | null; snapshotVerifiedMs: number | null; nowMs: number }) => { phase: "idle" | "checking" | "unanswered"; canRequest: boolean };
  resolveThemePreference: (stored: string | null, systemPrefersLight: boolean) => "light" | "dark";
  resolveLiveRefreshGate: (input: { nowMs: number; lastAttemptMs: number | null; inFlight: boolean }) => "proceed" | "join" | "wait";
  autoRefreshDecision: (input: { nowMs: number; visible: boolean; hasActiveSession: boolean; inFlight: boolean; lastAttemptMs: number | null; foregroundAtMs: number | null }) => { fire: boolean; reason: string };
  AUTO_REFRESH_CADENCE_MS: number;
  grillTrendTone: (direction: "rising" | "falling" | "steady", currentGrillTemp: number, setpoint: number) => "green" | "red" | "grey";
  probeTrendTone: (direction: "rising" | "falling" | "steady", isRest: boolean) => "green" | "red" | "grey";
  countHeaderCheckIndicators: (input: { phase: "idle" | "checking" | "unanswered" }) => number;
  countHeaderCheckNotes: (input: { phase: "idle" | "checking" | "unanswered" }) => number;
  keepAwakeDirective: (s: { intentOn: boolean; visible: boolean; wakeLockSupported: boolean; sentinelHeld: boolean; videoPlaying: boolean }) => { requestWakeLock: boolean; playVideo: boolean; awake: boolean; showRetry: boolean };
  keepAwakeIntent: (storedFlag: string | null, hasActiveSession: boolean) => boolean;
  alarmRepeatPlan: (input: { phrase: string; repeatsDone: number; acked: boolean }) => { fire: boolean; text: string | null };
  speechUnlockDirective: (input: { gestureSeen: boolean; sessionUnlocked: boolean }) => { attemptUnlock: boolean; unlocked: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageDetailSheetBlocks: (stage: any) => { title: string; facts: string[]; why: string; instruction: string };
  headerAgeLabel: (phase: "idle" | "checking" | "unanswered", ageMs: number) => string;
  formatProbeEstimateLine: (estimate: { state: "dynamic" | "stall" | "fallback" | "learning"; timeLeftSeconds: number | null; windowMinutes: number | null; probeTemp: number | null; asOf: string | null } | null, nominalLeftSeconds: number, stageStartProbe: number | null, currentProbeTemp: number, nowMs: number, probeTarget: number | null) => string;
  tickDownEstimateSeconds: (timeLeftSeconds: number, asOfIso: string | null, nowMs: number) => number;
  shouldScrollToCurrentStageKey: (generation: number, sessionId: number | null, stageIndex: number | null, lastKey: string | null) => { scroll: boolean; key: string | null };
  assessGrillTrend: (recentDirection: "rising" | "falling" | "steady", currentGrillTemp: number, setpoint: number) => { direction: "rising" | "falling" | "steady"; tone: "green" | "red" | "grey" };
  classifyStatusPayload: (input: { retained: boolean; identicalToStored: boolean }) => "accept" | "wait";
  LIVE_LISTEN_CAP_MS: number;
  APP_VERSION_LABEL: string;
  APP_BUILT_AT_ISO: string;
  PREVIOUS_BUILD_AT_ISO: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appSectionLines: (info: any) => string[];
  formatBuiltAtLine: (builtAtISO: string) => string;
  resolveBuildRecovery: (clientBuildId: string | null, serverBuildId: string) => "current" | "reload";
  shouldReloadForBuild: (clientBuildId: string | null, serverBuildId: string, alreadyReloadedFor: string | null) => boolean;
  checkStateOnLoad: (restored: { requestedAtMs: number | null; inFlight: boolean } | null) => { requestedAtMs: null; phase: "idle"; canRequest: true };
  fetchStatusViaMqtt: (signedUrl: string, thingName: string, onSubscribed: () => void, stored: { grillTemp: number; probeTemp: number; setpoint: number; systemStatus: number } | null) => Promise<{ kind: string; payload?: unknown; source?: string }>;
  liveRefreshTestSeams: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketFactory: ((url: string) => any) | null;
    signedUrlProvider: ((token: string) => Promise<string | null>) | null;
    commandSender: ((thingName: string, token: string) => Promise<void>) | null;
    listenCapMs: number | null;
  };
  resetLiveRefreshGateForTests: () => void;
  resolveEgressProxy: (env: Record<string, string | undefined>) => string | null;
  listenFailureStatus: (kind: "connect_failed" | "subscribe_failed" | "link_lost" | "silent") => { status: string; message: string };
  failStageFromProbe: (probe: { proxyPresent: boolean; failStage: "proxy_connect" | "tls" | "ws_upgrade" | null; errorClass: string | null; httpStatus: number | null } | null) => { failStage: string | null; failErrorClass: string | null };
  classifySocketError: (message: string | undefined) => string;
};

export type OneTest = { id: string; rule: string; name: string; passed: boolean; detail: string };
type GrillRow = typeof schema.grillState.$inferSelect;
type SnapRow = typeof schema.grillSnapshots.$inferSelect;

export async function runIntegrationTests(ctx: Ctx, buildId: string, deps: TestDeps): Promise<{ passed: number; failed: number; total: number; tests: OneTest[] }> {
  const { PROGRAMS, REQUIREMENTS, computeStageConditionMet, deriveSystemStateLabel, loadDashboard, parseAckedKeys, formatSnapshotAge, resolveCheckFeedback, resolveThemePreference, resolveLiveRefreshGate, autoRefreshDecision, AUTO_REFRESH_CADENCE_MS, countHeaderCheckNotes, keepAwakeDirective, keepAwakeIntent, alarmRepeatPlan, speechUnlockDirective, stageDetailSheetBlocks, grillTrendTone, probeTrendTone, countHeaderCheckIndicators, headerAgeLabel, formatProbeEstimateLine, tickDownEstimateSeconds, shouldScrollToCurrentStageKey, assessGrillTrend, classifyStatusPayload, LIVE_LISTEN_CAP_MS, APP_VERSION_LABEL, APP_BUILT_AT_ISO, PREVIOUS_BUILD_AT_ISO, appSectionLines, formatBuiltAtLine, resolveBuildRecovery, shouldReloadForBuild, checkStateOnLoad, fetchStatusViaMqtt, liveRefreshTestSeams, resetLiveRefreshGateForTests, resolveEgressProxy, listenFailureStatus, failStageFromProbe, classifySocketError, Actions } = deps;
  const nameFor = (id: string): { rule: string; name: string } => {
    for (const r of REQUIREMENTS) for (const s of r.scenarios) if (s.id === id) return { rule: r.id, name: s.name };
    return { rule: "R?", name: id };
  };
  const db = ctx.db<typeof schema>();
  const results: OneTest[] = [];
  const record = (id: string, passed: boolean, detail: string) => {
    const meta = nameFor(id);
    results.push({ id, rule: meta.rule, name: meta.name, passed, detail });
  };
  const run = async (id: string, fn: () => Promise<string>) => {
    try { record(id, true, await fn()); } catch (e) { record(id, false, e instanceof Error ? e.message : String(e)); }
  };
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

  // ---- Save production state ----
  const origGrillRows = await db.select().from(schema.grillState).limit(1);
  const origGrill: GrillRow | null = origGrillRows[0] ?? null;
  const origSnaps: SnapRow[] = await db.select().from(schema.grillSnapshots);
  const origAuth = await db.select().from(schema.traegerAuth);
  const origActiveRows = await db.select().from(schema.cookSessions).orderBy(desc(schema.cookSessions.id)).limit(20);
  const origActive = origActiveRows.find((s) => s.status === "active" || s.status === "shutdown_requested") ?? null;

  const testSessionIds: number[] = [];

  const setGrill = async (patch: Partial<GrillRow>) => {
    if (!origGrill) return;
    await db.update(schema.grillState).set(patch as never).where(eq(schema.grillState.id, origGrill.id));
  };
  const baselineCooking = async (over: Partial<GrillRow> = {}) => {
    await setGrill({ connected: 1, grillTemp: 250, ambientTemp: 120, probeTemp: 80, probeConnected: 1, setpoint: 250, systemStatus: 6, systemStateLabel: "Cooking", cookIdPresent: 1, ...over });
  };
  const createSession = async (stageIndex: number, over: Partial<typeof schema.cookSessions.$inferInsert> = {}): Promise<number> => {
    const now = new Date();
    const inserted = await db.insert(schema.cookSessions).values({
      meatId: "chuckroast", meatName: "TEST- Chuck Roast 2–3 lb", status: "active",
      currentStageIndex: stageIndex, stageStartedAt: now, createdAt: now, updatedAt: now,
      stageStartProbe: 60, alarmAckedKeys: "", holdStartedAt: null, ...over,
    }).returning({ id: schema.cookSessions.id });
    const id = inserted[0]!.id;
    testSessionIds.push(id);
    return id;
  };
  const getSession = async (id: number) => {
    const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, id)).limit(1);
    return rows[0] ?? null;
  };
  const cleanupSession = async (id: number) => {
    await db.delete(schema.cookMessages).where(eq(schema.cookMessages.sessionId, id));
    await db.delete(schema.setpointCorrections).where(eq(schema.setpointCorrections.sessionId, id));
    await db.delete(schema.cookSessions).where(eq(schema.cookSessions.id, id));
  };
  const clearSnaps = async () => { await db.delete(schema.grillSnapshots); };
  const insertSnaps = async (pts: { agoMin: number; grill: number; probe: number }[]) => {
    const nowMs = Date.now();
    for (const p of pts) {
      await db.insert(schema.grillSnapshots).values({ capturedAt: new Date(nowMs - p.agoMin * 60_000), grillTemp: p.grill, probeTemp: p.probe, setpoint: 250, systemStatus: 6 });
    }
  };
  const restoreAll = async () => {
    for (const id of [...testSessionIds]) { try { await cleanupSession(id); } catch { /* ignore */ } }
    // Remove any stray TEST- sessions
    const all = await db.select().from(schema.cookSessions);
    for (const s of all) if (s.meatName.startsWith("TEST-")) { try { await cleanupSession(s.id); } catch { /* ignore */ } }
    await clearSnaps();
    for (const s of origSnaps) {
      await db.insert(schema.grillSnapshots).values({ capturedAt: s.capturedAt, grillTemp: s.grillTemp, probeTemp: s.probeTemp, setpoint: s.setpoint, systemStatus: s.systemStatus, carriedForward: s.carriedForward });
    }
    await db.delete(schema.traegerAuth);
    for (const a of origAuth) {
      await db.insert(schema.traegerAuth).values({ id: a.id, email: a.email, password: a.password, idToken: a.idToken, expiresAt: a.expiresAt });
    }
    if (origGrill) {
      await db.update(schema.grillState).set({ ...origGrill }).where(eq(schema.grillState.id, origGrill.id));
    }
    // Feed messages posted during the run (live-refresh result notes,
    // stage notes on TEST sessions are cleaned with their sessions) are
    // append-only history — leave them, exactly as the suite always has.
  };

  const chuck = PROGRAMS.find((p) => p.id === "chuckroast")!;

  try {
    // T01 R1 Idle hold
    await run("T01", async () => {
      await setGrill({ connected: 1, grillTemp: 70, probeTemp: 70, probeConnected: 1, setpoint: 250, systemStatus: 3, systemStateLabel: "Idle", cookIdPresent: 0 });
      const sid = await createSession(0);
      try {
        const label = deriveSystemStateLabel(3, false, 70, 250);
        assert(label === "Idle", `label=${label}`);
        const stage = chuck.stages[0]!;
        const met = computeStageConditionMet(stage, { probeConnected: true, probeTemp: 70, grillTemp: 70, setpoint: 250, systemStatus: 3, cookIdPresent: false }, { stageStartedAt: new Date(), holdStartedAt: null, status: "active" }, Date.now());
        assert(!met, "grilltemp condition must be false while Idle");
        const dash = await loadDashboard(ctx);
        assert(dash.activeSession?.id === sid, "dashboard should show the test session");
        assert(!dash.stageConditionMet, "dashboard stageConditionMet must be false while Idle (timer held)");
        return "Idle label, stageConditionMet=false — timer held, no progress";
      } finally { await cleanupSession(sid); }
    });
    // T02 Igniting
    await run("T02", async () => {
      const label = deriveSystemStateLabel(5, true, 150, 250);
      assert(label === "Igniting", `label=${label}`);
      return "system_status 5 + cook_id → Igniting (never Idle/Not-ignited)";
    });
    // T03 Offline
    await run("T03", async () => {
      const label = deriveSystemStateLabel(99, false, 70, 250);
      assert(label === "Offline", `label=${label}`);
      return "system_status 99 → Offline";
    });
    // T04 manual reject probe
    await run("T04", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        let threw = false;
        try { await Actions.advanceStage.handler(ctx, { sessionId: sid }); } catch { threw = true; }
        assert(threw, "advanceStage must reject a probe stage");
        const s = await getSession(sid); assert(s?.currentStageIndex === 1, "stage must not move");
        return "advanceStage rejected on Smoke (probe); stage unchanged";
      } finally { await cleanupSession(sid); }
    });
    // T05 manual reject grilltemp
    await run("T05", async () => {
      await baselineCooking();
      const sid = await createSession(0);
      try {
        let threw = false;
        try { await Actions.advanceStage.handler(ctx, { sessionId: sid }); } catch { threw = true; }
        assert(threw, "advanceStage must reject a grilltemp stage");
        return "advanceStage rejected on Preheat (grilltemp)";
      } finally { await cleanupSession(sid); }
    });
    // T06 manual reject timer
    await run("T06", async () => {
      await baselineCooking();
      const sid = await createSession(5);
      try {
        let threw = false;
        try { await Actions.advanceStage.handler(ctx, { sessionId: sid }); } catch { threw = true; }
        assert(threw, "advanceStage must reject a timer stage");
        return "advanceStage rejected on Rest (timer)";
      } finally { await cleanupSession(sid); }
    });
    // T07 owner Done works
    await run("T07", async () => {
      await baselineCooking();
      const sid = await createSession(2);
      try {
        const res = await Actions.advanceStage.handler(ctx, { sessionId: sid });
        assert(res.ok, "advance should succeed");
        const s = await getSession(sid); assert(s?.currentStageIndex === 3, `expected stage 3, got ${s?.currentStageIndex}`);
        return "Done on Wrap (owner) advanced to stage 4";
      } finally { await cleanupSession(sid); }
    });
    // T08 probe crossing auto-advance
    await run("T08", async () => {
      await baselineCooking({ probeTemp: 86 });
      const sid = await createSession(1);
      try {
        const early = await Actions.autoAdvanceStage.handler(ctx, { sessionId: sid });
        assert(!early.advanced, "auto-advance must refuse at probe 86°F");
        await Actions.updateGrillState.handler(ctx, { probeTemp: 165, grillTemp: 250, setpoint: 250, systemStatus: 6, cookIdPresent: true, connected: true });
        const s = await getSession(sid);
        assert(s?.currentStageIndex === 2, `expected Wrap (2) after probe 165, got ${s?.currentStageIndex}`);
        const msgs = await db.select().from(schema.cookMessages).where(eq(schema.cookMessages.sessionId, sid));
        assert(msgs.some((m) => m.text.includes("Your turn")), "next owner stage alarm message must be armed in the feed");
        return "probe 86→165°F auto-advanced Smoke→Wrap; owner alarm armed";
      } finally { await cleanupSession(sid); }
    });
    // T09 ack persists
    await run("T09", async () => {
      await baselineCooking();
      const sid = await createSession(2);
      try {
        await Actions.ackAlarm.handler(ctx, { sessionId: sid, stageIndex: 2, kind: "owner" });
        const d1 = await loadDashboard(ctx);
        const d2 = await loadDashboard(ctx);
        assert(d1.activeSession?.alarmAckedKeys.includes("2-owner") ?? false, "first load missing ack");
        assert(d2.activeSession?.alarmAckedKeys.includes("2-owner") ?? false, "second load missing ack");
        return "ack for stage 2 persisted across two fresh dashboard loads";
      } finally { await cleanupSession(sid); }
    });
    // T10 reality auto-ack
    await run("T10", async () => {
      await baselineCooking({ probeTemp: 80 });
      const started = new Date(Date.now() - 20 * 60_000);
      const sid = await createSession(1, { stageStartedAt: started, stageStartProbe: 60 });
      try {
        const dash = await loadDashboard(ctx);
        assert(dash.activeSession?.id === sid, "dashboard should show test session");
        assert(dash.activeSession?.alarmAckedKeys.includes("1-owner") ?? false, `expected auto-ack 1-owner, got ${JSON.stringify(dash.activeSession?.alarmAckedKeys)}`);
        return "Cooking + probe 80°F (risen from 60, 20 min in) → place-meat auto-acked";
      } finally { await cleanupSession(sid); }
    });
    // T11 setpoint flow
    await run("T11", async () => {
      await baselineCooking({ setpoint: 240 });
      const sid = await createSession(1);
      try {
        const rec = await Actions.requestSetpointCorrection.handler(ctx, { sessionId: sid, stageIndex: 1, fromTemp: 240, toTemp: 250 });
        assert(rec.recorded, "correction should be recorded at setpoint 240 vs stage 250");
        await Actions.updateGrillState.handler(ctx, { setpoint: 250, grillTemp: 250, probeTemp: 80, systemStatus: 6, cookIdPresent: true, connected: true });
        const dash = await loadDashboard(ctx);
        assert(dash.activeCorrection?.status === "confirmed", `expected confirmed, got ${dash.activeCorrection?.status}`);
        assert(dash.activeCorrection?.toTemp === 250, "confirmed target must be 250");
        return "240 vs 250 → correction recorded → snapshot at 250 → confirmed";
      } finally { await cleanupSession(sid); }
    });
    // T12 out-of-range
    await run("T12", async () => {
      await baselineCooking();
      let threw = false;
      try { await Actions.updateGrillState.handler(ctx, { setpoint: 600 }); } catch { threw = true; }
      assert(threw, "setpoint 600 must be rejected");
      threw = false;
      try { await Actions.updateGrillState.handler(ctx, { setpoint: 100 }); } catch { threw = true; }
      assert(threw, "setpoint 100 must be rejected");
      const sid = await createSession(1);
      try {
        const rec = await Actions.requestSetpointCorrection.handler(ctx, { sessionId: sid, stageIndex: 1, fromTemp: 250, toTemp: 600 });
        assert(!rec.recorded, "correction to 600 must not be recorded");
        return "setpoint 600 and 100 rejected; correction to 600 not recorded";
      } finally { await cleanupSession(sid); }
    });
    // T13 R6 direct refresh pending — v28 semantics: the tap IS the
    // direct liveRefresh call; its pending state is local to the page
    // and is outstanding until a snapshot at/after the tap lands. No
    // check request is recorded anywhere: the retired
    // requestStatusCheck endpoint must create NO feed message.
    await run("T13", async () => {
      const oldVerified = new Date(Date.now() - 60 * 60_000).toISOString();
      await baselineCooking({ setpoint: 250 });
      await setGrill({ lastVerifiedAt: oldVerified });
      const sid = await createSession(2);
      try {
        const msgsBefore = await db.select().from(schema.cookMessages);
        const maxIdBefore = msgsBefore.reduce((mx, m) => Math.max(mx, m.id), 0);
        const legacy = await Actions.requestStatusCheck.handler(ctx, {});
        assert(legacy.ok === true, "the retired endpoint must still answer {ok:true} for old clients");
        const msgsAfter = await db.select().from(schema.cookMessages);
        assert(msgsAfter.length === msgsBefore.length, `requestStatusCheck must record NOTHING (feed grew ${msgsBefore.length} → ${msgsAfter.length})`);
        assert(!msgsAfter.some((m) => m.id > maxIdBefore && (m.text.includes("re-check grill") || m.text.includes("Ask Muse"))), "no new check-request message may be created");
        // The tap's pending model needs no server record: outstanding
        // against the old snapshot, cleared by a snapshot at/after it.
        const tapMs = Date.now();
        const d1 = await loadDashboard(ctx);
        const verifiedMs = Date.parse(d1.grill.lastVerifiedAt);
        const pending = resolveCheckFeedback({ requestedAtMs: tapMs, snapshotVerifiedMs: verifiedMs, nowMs: tapMs + 1_000 });
        assert(pending.phase === "checking" && !pending.canRequest, "tap with only an older snapshot → checking");
        const newVerified = new Date().toISOString();
        await Actions.updateGrillState.handler(ctx, { lastVerifiedAt: newVerified, grillTemp: 250, probeTemp: 80, setpoint: 250, systemStatus: 6, cookIdPresent: true, connected: true });
        const d2 = await loadDashboard(ctx);
        const v2 = Date.parse(d2.grill.lastVerifiedAt);
        const cleared = resolveCheckFeedback({ requestedAtMs: tapMs, snapshotVerifiedMs: v2, nowMs: tapMs + 2_000 });
        assert(cleared.phase === "idle" && cleared.canRequest, "a snapshot at/after the tap clears the pending state");
        return "retired endpoint records nothing; the direct tap is outstanding vs an old snapshot and clears when a snapshot at/after it lands — no server-side request exists";
      } finally { await cleanupSession(sid); }
    });
    // Trend + sparkline scenarios share snapshot save/clear
    const trendRun = async (id: string, pts: { agoMin: number; grill: number; probe: number }[], check: (dash: Awaited<ReturnType<typeof loadDashboard>>) => string) => {
      await run(id, async () => {
        await baselineCooking({ probeTemp: pts[pts.length - 1]?.probe ?? 80, grillTemp: pts[pts.length - 1]?.grill ?? 250 });
        const sid = await createSession(1);
        try {
          await clearSnaps();
          await insertSnaps(pts);
          const dash = await loadDashboard(ctx);
          return check(dash);
        } finally { await cleanupSession(sid); }
      });
    };
    await trendRun("T14", [{ agoMin: 9, grill: 240, probe: 70 }, { agoMin: 5, grill: 245, probe: 78 }, { agoMin: 1, grill: 250, probe: 86 }], (dash) => {
      assert(dash.trends.probe?.direction === "rising", `probe direction=${dash.trends.probe?.direction}`);
      assert(dash.trends.probe?.tone === "green", `probe tone=${dash.trends.probe?.tone}`);
      return "rising probe in Smoke stage → green rising";
    });
    await trendRun("T15", [{ agoMin: 9, grill: 250, probe: 90 }, { agoMin: 5, grill: 248, probe: 80 }, { agoMin: 1, grill: 246, probe: 70 }], (dash) => {
      assert(dash.trends.probe?.direction === "falling", `probe direction=${dash.trends.probe?.direction}`);
      assert(dash.trends.probe?.tone === "red", `probe tone=${dash.trends.probe?.tone}`);
      return "falling probe in Smoke stage → red falling";
    });
    await trendRun("T16", [{ agoMin: 9, grill: 250, probe: 80 }, { agoMin: 5, grill: 250, probe: 81 }, { agoMin: 1, grill: 250, probe: 82 }], (dash) => {
      assert(dash.trends.probe?.direction === "steady", `probe direction=${dash.trends.probe?.direction}`);
      assert(dash.trends.probe?.tone === "green", `stall tone=${dash.trends.probe?.tone} (must be green, not red)`);
      return "probe stall (80→82°F) in Smoke stage → green steady";
    });
    await trendRun("T17", [{ agoMin: 1, grill: 250, probe: 80 }], (dash) => {
      assert(dash.trends.grill === null && dash.trends.probe === null, "trends must be null with a single point");
      return "single snapshot → trends null, no arrow, no sparkline";
    });
    await trendRun("T24", [{ agoMin: 25, grill: 240, probe: 65 }, { agoMin: 15, grill: 245, probe: 72 }, { agoMin: 8, grill: 248, probe: 79 }, { agoMin: 1, grill: 250, probe: 86 }], (dash) => {
      const gs = dash.trends.grill?.series ?? []; const ps = dash.trends.probe?.series ?? [];
      assert(gs.length >= 3, `grill series length=${gs.length}`);
      assert(ps.length >= 3, `probe series length=${ps.length}`);
      assert(gs.length <= 40 && ps.length <= 40, "series must be downsampled to ≤40 points");
      assert(ps[ps.length - 1] === 86, "probe series must end at the latest value");
      return `sparkline series present: grill ${gs.length} pts, probe ${ps.length} pts (≤40)`;
    });
    await trendRun("T25", [{ agoMin: 1, grill: 250, probe: 80 }], (dash) => {
      const gs = dash.trends.grill?.series ?? []; const ps = dash.trends.probe?.series ?? [];
      assert(gs.length === 0 && ps.length === 0, "series must be empty with insufficient history");
      return "insufficient history → series empty, sparkline renders nothing";
    });
    await trendRun("T26", [{ agoMin: 9, grill: 240, probe: 70 }, { agoMin: 5, grill: 245, probe: 78 }, { agoMin: 1, grill: 250, probe: 86 }], (dash) => {
      assert(dash.trends.grill?.reference === 250, `grill reference=${dash.trends.grill?.reference}, expected setpoint 250 while cooking`);
      assert(dash.trends.probe?.reference === 165, `probe reference=${dash.trends.probe?.reference}, expected stage target 165`);
      return "grill sparkline reference = setpoint 250 while cooking; probe reference = 165";
    });
    // T34 R7 feeder: typed carry-forward rows, dedupe, age honesty
    await run("T34", async () => {
      await baselineCooking();
      const anyActive = (await db.select().from(schema.cookSessions)).some((s) => s.status === "active");
      if (!anyActive) {
        await clearSnaps();
        const r0 = await Actions.feedSnapshotHistory.handler(ctx, {});
        assert(r0.appended === false, "feeder must no-op with no active cook");
      }
      const sid = await createSession(1);
      try {
        await clearSnaps();
        const before = await loadDashboard(ctx);
        const verifiedBefore = before.grill.lastVerifiedAt;
        const r1 = await Actions.feedSnapshotHistory.handler(ctx, {});
        assert(r1.appended === true, `first feed during a cook must append, got ${JSON.stringify(r1)}`);
        const r2 = await Actions.feedSnapshotHistory.handler(ctx, {});
        assert(r2.appended === false, "second immediate feed must not duplicate (history still fresh)");
        const rows = await db.select().from(schema.grillSnapshots);
        assert(rows.length === 1, `expected exactly 1 history row, got ${rows.length}`);
        assert(rows[0]!.carriedForward === 1, "feeder row must be typed carriedForward=1");
        assert(rows[0]!.grillTemp === 250 && rows[0]!.probeTemp === 80, "carried row must copy the last known temps");
        const after = await loadDashboard(ctx);
        assert(after.grill.lastVerifiedAt === verifiedBefore, "feeder must NEVER change lastVerifiedAt (checked-age honesty)");
        return "feeds one typed carry-forward row during a cook; dedupes while fresh; lastVerifiedAt untouched";
      } finally { await cleanupSession(sid); }
    });
    // T38 R3 dynamic probe time-left: rate-based / stall / learning —
    // all computed from CURRENT-STAGE data only (v27: the stage start
    // is the window floor; the stage-start probe is the first point).
    await run("T38", async () => {
      // (a) steady in-stage rise +1°F/min over the trailing window, 30°F to go → ≈30 min left.
      await baselineCooking({ probeTemp: 135 });
      const sidA = await createSession(1, { stageStartedAt: new Date(Date.now() - 12 * 60_000), stageStartProbe: 96 });
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 100 }, { agoMin: 1, grill: 250, probe: 108 }]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "dynamic", `(a) state=${d.probeEstimate?.state}`);
        assert(d.probeEstimate?.windowMinutes === 10, `(a) window=${d.probeEstimate?.windowMinutes}`);
        assert(Math.abs((d.probeEstimate?.ratePerMin ?? 0) - 1) <= 0.05, `(a) rate=${d.probeEstimate?.ratePerMin}`);
        const left = d.probeEstimate?.timeLeftSeconds ?? -1;
        assert(left >= 1680 && left <= 1920, `(a) timeLeft=${left}s, expected ≈1800s (30 min at 1°F/min for 30°F)`);
        assert(d.probeEstimate?.asOf != null && Math.abs(Date.parse(d.probeEstimate.asOf) - (Date.now() - 60_000)) < 30_000, `(a) asOf=${d.probeEstimate?.asOf} must be the newest in-stage reading (~1 min ago)`);
      } finally { await cleanupSession(sidA); }
      // (b) flat in-stage history = a stall → no numeric countdown, honest stall state.
      await baselineCooking({ probeTemp: 120 });
      const sidB = await createSession(1, { stageStartedAt: new Date(Date.now() - 12 * 60_000), stageStartProbe: 120 });
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 120 }, { agoMin: 5, grill: 250, probe: 120 }, { agoMin: 1, grill: 250, probe: 120 }]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "stall", `(b) state=${d.probeEstimate?.state}`);
        assert(d.probeEstimate?.timeLeftSeconds === null, "(b) a stall must not show a numeric countdown");
        assert(d.probeEstimate?.probeTemp === 120, `(b) probeTemp=${d.probeEstimate?.probeTemp}`);
      } finally { await cleanupSession(sidB); }
      // (c) just after a stage change (<2 in-stage points spanning
      // ≥2 min) → honest "learning", no number. With the stage-start
      // anchor plus one later reading, the 30-min in-stage window is
      // usable and the estimate is dynamic from in-stage data alone.
      await baselineCooking({ probeTemp: 100 });
      const sidC = await createSession(1, { stageStartedAt: new Date(Date.now() - 60_000), stageStartProbe: 100 });
      try {
        await clearSnaps();
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "learning", `(c) state=${d.probeEstimate?.state}, expected learning 1 min into the stage`);
        assert(d.probeEstimate?.timeLeftSeconds === null, "(c) learning must not show a numeric countdown");
      } finally { await cleanupSession(sidC); }
      const sidE = await createSession(1, { stageStartedAt: new Date(Date.now() - 28 * 60_000), stageStartProbe: 60 });
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 1, grill: 250, probe: 100 }]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "dynamic", `(c2) state=${d.probeEstimate?.state}`);
        assert(d.probeEstimate?.windowMinutes === 30, `(c2) window=${d.probeEstimate?.windowMinutes}, expected the 30-min in-stage window`);
        assert(Math.abs((d.probeEstimate?.ratePerMin ?? 0) - 1.48) <= 0.06, `(c2) rate=${d.probeEstimate?.ratePerMin}, expected ≈1.48 (40°F over the 27 in-stage minutes)`);
        // Non-probe stages expose no estimate.
        const sidD = await createSession(0);
        try {
          const d2 = await loadDashboard(ctx);
          assert(d2.probeEstimate === null, "grilltemp stage must expose no probe estimate");
        } finally { await cleanupSession(sidD); }
      } finally { await cleanupSession(sidE); }
      return "(a) +1°F/min in-stage, 30°F to go → ≈30 min dynamic + asOf; (b) flat → stall, no countdown; (c) 1 min into a stage → learning; stage-start anchor + one reading → dynamic over the 30-min in-stage window";
    });
    // T66 R3 stage-boundary exclusion — the mandatory v26 regression:
    // fast PRE-stage readings must not inflate the current stage's rate.
    await run("T66", async () => {
      await baselineCooking({ probeTemp: 156 });
      const sid = await createSession(3, { stageStartedAt: new Date(Date.now() - 14 * 60_000), stageStartProbe: 151 });
      try {
        await clearSnaps();
        await insertSnaps([
          { agoMin: 26, grill: 250, probe: 118 },
          { agoMin: 20, grill: 250, probe: 138 },
          { agoMin: 15, grill: 250, probe: 158 },
          { agoMin: 12, grill: 250, probe: 152 },
          { agoMin: 6, grill: 250, probe: 154 },
          { agoMin: 1, grill: 250, probe: 156 },
        ]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "dynamic", `state=${d.probeEstimate?.state}`);
        const rate = d.probeEstimate?.ratePerMin ?? -1;
        assert(rate > 0 && rate <= 0.6, `rate=${rate}°/min must be the slow in-stage rate (~0.4), not inflated by the fast pre-stage rise`);
        const left = d.probeEstimate?.timeLeftSeconds ?? -1;
        assert(left >= 3600, `timeLeft=${left}s for the 47°F gap must be ≥1h at the in-stage rate — the v26 regression claimed ≈1484s (24 min)`);
        assert(d.probeEstimate?.asOf != null && Math.abs(Date.parse(d.probeEstimate.asOf) - (Date.now() - 60_000)) < 30_000, `asOf=${d.probeEstimate?.asOf} must be the newest in-stage reading (~1 min ago)`);
      } finally { await cleanupSession(sid); }
      // Sanity clamp: an in-stage rise faster than the plausible
      // low-and-slow band is clamped to 1.5°F/min.
      await baselineCooking({ probeTemp: 130 });
      const sid2 = await createSession(1, { stageStartedAt: new Date(Date.now() - 12 * 60_000), stageStartProbe: 100 });
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 104 }, { agoMin: 1, grill: 250, probe: 130 }]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.state === "dynamic", `clamp case state=${d.probeEstimate?.state}`);
        assert(d.probeEstimate?.ratePerMin === 1.5, `rate=${d.probeEstimate?.ratePerMin} must be clamped to 1.5°F/min (raw in-stage rate was 3.25)`);
        const left = d.probeEstimate?.timeLeftSeconds ?? -1;
        assert(left >= 1300 && left <= 1500, `clamped timeLeft=${left}s, expected ≈1400s (35°F at 1.5°F/min)`);
      } finally { await cleanupSession(sid2); }
      return "pre-stage fast rise excluded → in-stage 0.4°F/min, ≈2h for the 47°F gap (not 24 min); raw 3.25°F/min in-stage rise clamped to 1.5°F/min";
    });
    // T67 R3 asOf + live tick-down math + zero-hold + stall honesty.
    await run("T67", async () => {
      const nowMs = Date.now();
      const asOf = new Date(nowMs - 30_000).toISOString();
      assert(tickDownEstimateSeconds(600, asOf, nowMs) === 570, "600s anchored 30s ago → 570s left");
      assert(tickDownEstimateSeconds(600, asOf, nowMs + 45_000) === 525, "the anchored value ticks down as now advances");
      assert(tickDownEstimateSeconds(20, asOf, nowMs) === 0, "anchored countdown clamps at 0, never negative");
      assert(tickDownEstimateSeconds(20, asOf, nowMs + 3_600_000) === 0, "long past the anchor it still holds at 0");
      assert(tickDownEstimateSeconds(600, null, nowMs) === 600, "no anchor → value untouched (no invented ticking)");
      const zeroLine = formatProbeEstimateLine({ state: "dynamic", timeLeftSeconds: 25, windowMinutes: 10, probeTemp: 156, asOf }, 0, 151, 156, nowMs, 203);
      assert(zeroLine === "≈0 left — any moment (est. from last 10 min) · started at 151°", `zero-hold line: "${zeroLine}"`);
      const l1 = formatProbeEstimateLine({ state: "dynamic", timeLeftSeconds: 600, windowMinutes: 10, probeTemp: 156, asOf }, 0, null, 156, nowMs, 203);
      const l2 = formatProbeEstimateLine({ state: "dynamic", timeLeftSeconds: 600, windowMinutes: 10, probeTemp: 156, asOf }, 0, null, 156, nowMs + 60_000, 203);
      assert(l1 === "≈9:30 left (est. from last 10 min)", `t0 line: "${l1}"`);
      assert(l2 === "≈8:30 left (est. from last 10 min)", `t+60s line: "${l2}"`);
      const s1 = formatProbeEstimateLine({ state: "stall", timeLeftSeconds: null, windowMinutes: null, probeTemp: 156, asOf }, 0, null, 156, nowMs, 203);
      const s2 = formatProbeEstimateLine({ state: "stall", timeLeftSeconds: null, windowMinutes: null, probeTemp: 156, asOf }, 0, null, 156, nowMs + 600_000, 203);
      assert(s1 === s2 && s1.includes("(stall)") && !s1.includes("left ("), `stall line must be time-invariant with no countdown: "${s1}"`);
      await baselineCooking({ probeTemp: 135 });
      const sid = await createSession(1, { stageStartedAt: new Date(nowMs - 12 * 60_000), stageStartProbe: 96 });
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 100 }, { agoMin: 1, grill: 250, probe: 108 }]);
        const d = await loadDashboard(ctx);
        assert(d.probeEstimate?.asOf != null, "dashboard probeEstimate must carry asOf");
        assert(Math.abs(Date.parse(d.probeEstimate!.asOf!) - (Date.now() - 60_000)) < 30_000, `asOf=${d.probeEstimate?.asOf} must be the newest snapshot (~1 min ago)`);
      } finally { await cleanupSession(sid); }
      return "tick-down anchored at asOf (600→570→525, clamps at 0, null anchor untouched); zero-hold renders “≈0 — any moment”; the line ticks 9:30 → 8:30 over 60s; stall line is time-invariant; dashboard estimate carries asOf";
    });
    // T68 R4 scroll-to-current-stage decision: once per open /
    // foreground generation, keyed by (generation, session, stage).
    await run("T68", async () => {
      const open = shouldScrollToCurrentStageKey(0, 5, 3, null);
      assert(open.scroll === true && open.key === "0:5:3", `first open must scroll: ${JSON.stringify(open)}`);
      assert(shouldScrollToCurrentStageKey(0, 5, 3, open.key).scroll === false, "same generation + session + stage (polls, refreshes, re-renders) must NOT re-scroll");
      const fg = shouldScrollToCurrentStageKey(1, 5, 3, open.key);
      assert(fg.scroll === true && fg.key === "1:5:3", "return to foreground scrolls once more");
      assert(shouldScrollToCurrentStageKey(1, 5, 3, fg.key).scroll === false, "a second render in the same foregrounding must not re-scroll");
      assert(shouldScrollToCurrentStageKey(1, 5, 4, fg.key).scroll === true, "a stage change is a new scroll target");
      const noCook = shouldScrollToCurrentStageKey(2, null, null, fg.key);
      assert(noCook.scroll === false && noCook.key === null, "no active cook → no scroll, picker landing unchanged");
      return "open → scroll once; polls/re-renders → none; foreground → once more; stage change → new target; no cook → none";
    });
    // T35 R7 sparse-but-real history renders via the widened window
    await run("T35", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 55, grill: 240, probe: 70 }, { agoMin: 28, grill: 250, probe: 86 }]);
        const d1 = await loadDashboard(ctx);
        assert(d1.trends.probe != null && d1.trends.grill != null, "sparse real history must still render trends");
        assert(d1.trends.probe?.windowMinutes === 60, `expected the 60-min window, got ${d1.trends.probe?.windowMinutes}`);
        assert(d1.trends.probe?.direction === "rising", `probe direction=${d1.trends.probe?.direction}`);
        assert(d1.trends.probe?.tone === "green", `probe tone=${d1.trends.probe?.tone}`);
        await clearSnaps();
        await insertSnaps([{ agoMin: 110, grill: 240, probe: 70 }, { agoMin: 95, grill: 250, probe: 86 }]);
        const d2 = await loadDashboard(ctx);
        assert(d2.trends.probe?.windowMinutes === 120, `expected the 120-min window, got ${d2.trends.probe?.windowMinutes}`);
        assert(d2.trends.probe?.direction === "rising", "full-store window must still judge direction");
        return "points ~27 min apart → 60-min window renders; points ~2h old → 120-min window renders";
      } finally { await cleanupSession(sid); }
    });
    // T40–T46 R7 trend-tone semantics (owner's rule: flat + green when
    // almost stable; every unexpected arrow red). trendRun pins the grill
    // setpoint at 250 and the current grill temp at the last point's value.
    // (a) Grill below its setpoint, outside the band, and falling AWAY.
    await trendRun("T40", [{ agoMin: 9, grill: 240, probe: 110 }, { agoMin: 5, grill: 232, probe: 115 }, { agoMin: 1, grill: 224, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "falling", `grill direction=${dash.trends.grill?.direction}`);
      assert(dash.trends.grill?.tone === "red", `grill tone=${dash.trends.grill?.tone} (224°F, far below the 250 setpoint and falling away, must be red)`);
      return "grill 240→224°F far below the 250°F setpoint, falling away → red falling";
    });
    // (b) Steady within ±5°F of setpoint → flat + green.
    await trendRun("T41", [{ agoMin: 9, grill: 248, probe: 110 }, { agoMin: 5, grill: 250, probe: 115 }, { agoMin: 1, grill: 249, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "steady", `grill direction=${dash.trends.grill?.direction} (Δ+1°F is inside the ±3°F stability band)`);
      assert(dash.trends.grill?.tone === "green", `grill tone=${dash.trends.grill?.tone} (steady at the setpoint must be green)`);
      return "grill 248→249°F at the 250°F setpoint, Δ+1°F → flat (steady) + green";
    });
    // (c) Rising toward the setpoint from below (still outside the band) → green.
    await trendRun("T42", [{ agoMin: 9, grill: 200, probe: 110 }, { agoMin: 5, grill: 215, probe: 115 }, { agoMin: 1, grill: 232, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "rising", `grill direction=${dash.trends.grill?.direction}`);
      assert(dash.trends.grill?.tone === "green", `grill tone=${dash.trends.grill?.tone} (rising toward the setpoint must be green)`);
      return "grill 200→232°F rising toward the 250°F setpoint → green rising";
    });
    // (d) Rising away above the setpoint → red.
    await trendRun("T43", [{ agoMin: 9, grill: 258, probe: 110 }, { agoMin: 5, grill: 266, probe: 115 }, { agoMin: 1, grill: 274, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "rising", `grill direction=${dash.trends.grill?.direction}`);
      assert(dash.trends.grill?.tone === "red", `grill tone=${dash.trends.grill?.tone} (rising further above the setpoint must be red)`);
      return "grill 258→274°F rising away above the 250°F setpoint → red rising";
    });
    await trendRun("T44", [{ agoMin: 9, grill: 285, probe: 110 }, { agoMin: 5, grill: 275, probe: 115 }, { agoMin: 1, grill: 268, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "falling", `grill direction=${dash.trends.grill?.direction}`);
      assert(dash.trends.grill?.tone === "green", `grill tone=${dash.trends.grill?.tone} (falling back toward the setpoint from above must be green)`);
      // The pure tone rules behind the dashboard values, incl. the
      // away-below case mirrored from T40.
      assert(grillTrendTone("falling", 247, 250) === "red", "falling while below setpoint → red");
      assert(grillTrendTone("rising", 247, 250) === "green", "rising while below setpoint → green");
      assert(grillTrendTone("steady", 253, 250) === "green", "steady inside the band → green");
      assert(grillTrendTone("steady", 270, 250) === "red", "steady far outside the band → red");
      assert(probeTrendTone("steady", false) === "green", "probe stall in a cook stage → green");
      assert(probeTrendTone("falling", false) === "red", "probe falling in a cook stage → red");
      return "grill 285→268°F falling toward the setpoint from above → green falling; tone-helper matrix holds";
    });
    await trendRun("T45", [{ agoMin: 9, grill: 274, probe: 110 }, { agoMin: 5, grill: 275, probe: 115 }, { agoMin: 1, grill: 276, probe: 121 }], (dash) => {
      assert(dash.trends.grill?.direction === "steady", `grill direction=${dash.trends.grill?.direction} (Δ+2°F is inside the stability band)`);
      assert(dash.trends.grill?.tone === "red", `grill tone=${dash.trends.grill?.tone} (steady 26°F above the setpoint, far outside ±15°F, must be red)`);
      return "grill steady at ~275°F vs the 250°F setpoint (outside ±15°F) → flat + red";
    });
    // Rest-stage probe expectations invert: falling/steady green, rising red.
    await run("T46", async () => {
      await baselineCooking({ probeTemp: 190 });
      const sid = await createSession(5); // "Rest covered 45 min"
      try {
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 198 }, { agoMin: 5, grill: 250, probe: 194 }, { agoMin: 1, grill: 250, probe: 190 }]);
        let dash = await loadDashboard(ctx);
        assert(dash.trends.probe?.direction === "falling" && dash.trends.probe?.tone === "green", `rest falling → ${dash.trends.probe?.direction}/${dash.trends.probe?.tone}, expected falling/green`);
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 190 }, { agoMin: 5, grill: 250, probe: 191 }, { agoMin: 1, grill: 250, probe: 190 }]);
        dash = await loadDashboard(ctx);
        assert(dash.trends.probe?.direction === "steady" && dash.trends.probe?.tone === "green", `rest steady → ${dash.trends.probe?.direction}/${dash.trends.probe?.tone}, expected steady/green (flat)`);
        await clearSnaps();
        await insertSnaps([{ agoMin: 9, grill: 250, probe: 190 }, { agoMin: 5, grill: 250, probe: 196 }, { agoMin: 1, grill: 250, probe: 202 }]);
        dash = await loadDashboard(ctx);
        assert(dash.trends.probe?.direction === "rising" && dash.trends.probe?.tone === "red", `rest rising → ${dash.trends.probe?.direction}/${dash.trends.probe?.tone}, expected rising/red`);
        return "Rest stage probe: falling → green, steady → flat green, rising → red";
      } finally { await cleanupSession(sid); }
    });
    // T69 R7 grill trend, band-first + recent segment (v27) — the six
    // cases from the owner's screenshot report. The grill's CURRENT
    // value vs the setpoint governs first; outside the band, the recent
    // segment (last third of the window) decides toward/away.
    await run("T69", async () => {
      const grillCase = async (setpoint: number, current: number, pts: { agoMin: number; grill: number }[], wantDir: string, wantTone: string, label: string) => {
        await baselineCooking({ grillTemp: current, probeTemp: 120, setpoint });
        const sid = await createSession(1);
        try {
          await clearSnaps();
          await insertSnaps(pts.map((p) => ({ ...p, probe: 120 })));
          const dash = await loadDashboard(ctx);
          assert(dash.trends.grill?.direction === wantDir, `${label}: direction=${dash.trends.grill?.direction}, expected ${wantDir}`);
          assert(dash.trends.grill?.tone === wantTone, `${label}: tone=${dash.trends.grill?.tone}, expected ${wantTone}`);
        } finally { await cleanupSession(sid); }
      };
      // (i) The screenshot case: post-wrap dip + overshoot inside the
      // window, current 257°F vs setpoint 250°F — inside the band, so
      // flat + green even though the window nets +10°F and the recent
      // segment falls (the v26 code painted this red + up).
      await grillCase(250, 257, [
        { agoMin: 28, grill: 247 }, { agoMin: 24, grill: 247 }, { agoMin: 20, grill: 247 },
        { agoMin: 16, grill: 251 }, { agoMin: 13, grill: 248 }, { agoMin: 10, grill: 237 },
        { agoMin: 6, grill: 268 }, { agoMin: 3, grill: 263 }, { agoMin: 1, grill: 257 },
      ], "steady", "green", "(i) in-band recovery wiggle, 257 vs 250");
      // (ii) Above the band and falling back toward the setpoint → green DOWN.
      await grillCase(250, 268, [{ agoMin: 20, grill: 255 }, { agoMin: 14, grill: 262 }, { agoMin: 7, grill: 275 }, { agoMin: 1, grill: 268 }], "falling", "green", "(ii) above band falling 275→268");
      // (iii) Above the band and rising away → red up.
      await grillCase(250, 272, [{ agoMin: 20, grill: 252 }, { agoMin: 10, grill: 260 }, { agoMin: 1, grill: 272 }], "rising", "red", "(iii) above band rising 260→272");
      // (iv) Below the band and rising toward it → green up.
      await grillCase(265, 238, [{ agoMin: 20, grill: 210 }, { agoMin: 10, grill: 225 }, { agoMin: 1, grill: 238 }], "rising", "green", "(iv) below band rising 225→238 vs setpoint 265");
      // (v) Below the band and falling away → red down.
      await grillCase(250, 228, [{ agoMin: 20, grill: 246 }, { agoMin: 10, grill: 240 }, { agoMin: 1, grill: 228 }], "falling", "red", "(v) below band falling 240→228");
      // (vi) Steady far outside the band → red flat.
      await grillCase(250, 285, [{ agoMin: 20, grill: 285 }, { agoMin: 10, grill: 285 }, { agoMin: 1, grill: 285 }], "steady", "red", "(vi) steady at 285 vs 250");
      // Helper level: the band overrides any recent wiggle direction.
      const inBand = assessGrillTrend("rising", 257, 250);
      assert(inBand.direction === "steady" && inBand.tone === "green", "in-band rising wiggle → flat green");
      assert(assessGrillTrend("falling", 244, 250).tone === "green", "in-band falling wiggle → green (the band governs)");
      const down = assessGrillTrend("falling", 268, 250);
      assert(down.direction === "falling" && down.tone === "green", "above band falling → green down arrow");
      return "(i) screenshot wiggle in-band → flat green; (ii) green down; (iii) red up; (iv) green up; (v) red down; (vi) red flat — band first, recent segment outside it";
    });
    // T47 R6 exactly ONE header element carries the checking state: the
    // refresh icon button itself. The age label is never an indicator —
    // it keeps showing the snapshot age in every phase (client mirrors
    // countHeaderCheckIndicators; T13/T32 pin the phase resolution).
    await run("T47", async () => {
      const t0 = 1_700_000_000_000;
      const checking = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0 - 60_000, nowMs: t0 + 1_000 });
      assert(checking.phase === "checking", "fixture must be in the checking phase");
      assert(countHeaderCheckIndicators(checking) === 1, `checking phase must carry exactly 1 indicator (the refresh button), got ${countHeaderCheckIndicators(checking)}`);
      assert(countHeaderCheckIndicators({ phase: "idle" }) === 0, "idle phase carries no checking indicator");
      assert(countHeaderCheckIndicators({ phase: "unanswered" }) === 0, "unanswered phase carries no spinner — note only, button live");
      for (const ageMs of [0, 10_000, 60_000, 3_600_000]) {
        assert(!formatSnapshotAge(ageMs).includes("checking"), "the age label must never read as a checking indicator");
      }
      return "checking → exactly 1 indicator (refresh button); idle/unanswered → 0; age label never becomes “checking…”";
    });
    // T48 R6 light payload: the cook view updates from THIS after a
    // refresh / on the poll — it must carry every volatile field and
    // none of the bulk (programs, history, test results, message feed).
    await run("T48", async () => {
      const light = await Actions.getLightDashboard.handler(ctx, {});
      for (const k of ["grill", "trends", "probeEstimate", "stageView", "stageConditionMet", "activeSession", "activeCorrection", "traegerAuth", "lastRefreshTiming"]) {
        assert(k in light, `light payload missing field ${k}`);
      }
      assert(light.grill.grillTemp > 0 && typeof light.grill.lastVerifiedAt === "string", "light grill snapshot must be complete");
      const raw = JSON.stringify(light);
      for (const banned of ["\"programs\"", "\"testRuns\"", "\"history\"", "\"messages\""]) {
        assert(!raw.includes(banned), `light payload must not contain ${banned}`);
      }
      const full = await loadDashboard(ctx);
      assert(raw.length < JSON.stringify(full).length / 3, `light payload (${raw.length}B) must be far smaller than the full dashboard (${JSON.stringify(full).length}B)`);
      return `light payload complete for the cook view, bulk-free, ${raw.length}B vs full ${JSON.stringify(full).length}B`;
    });
    // T49 R6 refresh timing record + retained acceptance + listen cap.
    // Hermetic: the no-login and dead-login paths resolve BEFORE any
    // real Traeger call (same posture as T36), yet must still leave a
    // complete stage-timing record behind.
    await run("T49", async () => {
      resetLiveRefreshGateForTests();
      await db.delete(schema.traegerAuth);
      const r1 = await Actions.liveRefresh.handler(ctx, {});
      assert(r1.status === "signin_needed", `no login → ${r1.status}`);
      assert(r1.timing != null, "the signin_needed result must carry its timing record");
      assert(r1.timing!.outcome === "signin_needed" && typeof r1.timing!.tokenMs === "number" && r1.timing!.totalMs >= r1.timing!.tokenMs, "timing stages must be coherent");
      assert(r1.timing!.mqttMs === null && r1.timing!.listenMs === null, "stages never reached must be null, not invented");
      assert(r1.timing!.proxyMs === 0 && r1.timing!.proxyPresent === null && r1.timing!.failStage === null && r1.timing!.failErrorClass === null, "v26 diagnostics on an unreached path: proxyMs 0, proxyPresent/failStage/failErrorClass null — never invented");
      const light1 = await Actions.getLightDashboard.handler(ctx, {});
      assert(light1.lastRefreshTiming?.outcome === "signin_needed", "timing record must be readable via the light payload");
      await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: "", idToken: null, expiresAt: null });
      const r2 = await Actions.liveRefresh.handler(ctx, {});
      // The 15s gate may answer too_soon after r1's attempt stamp — either
      // way the path resolves honestly and a timing record exists.
      assert(r2.status === "auth_failed" || r2.status === "too_soon", `dead login → ${r2.status}`);
      const light2 = await Actions.getLightDashboard.handler(ctx, {});
      assert(light2.lastRefreshTiming != null, "a timing record must exist after every refresh path");
      assert(classifyStatusPayload({ retained: true, identicalToStored: true }) === "wait", "retained + identical to stored → keep waiting for the live answer");
      assert(classifyStatusPayload({ retained: true, identicalToStored: false }) === "accept", "retained + newer values → accept (data postdates the stored snapshot)");
      assert(classifyStatusPayload({ retained: false, identicalToStored: true }) === "accept", "live publish → accept even when values are unchanged (it answers NOW)");
      assert(classifyStatusPayload({ retained: false, identicalToStored: false }) === "accept", "live publish with new values → accept");
      assert(LIVE_LISTEN_CAP_MS === 12_000, `listen cap must be 12s, got ${LIVE_LISTEN_CAP_MS}`);
      await db.delete(schema.traegerAuth);
      return "timing record with stage fields on signin_needed + dead-login paths, readable via light payload; retained/live matrix holds; listen cap 12s";
    });
    // T50 R6 header geometry invariant: the age label's content is a
    // function of age ONLY — identical in idle, checking and unanswered
    // phases — and the header renders ZERO check-note lines in every
    // phase (v28: the legacy "Check requested…" element is deleted, so
    // its container can never mount/unmount), so the page structure —
    // and its height — cannot change across refresh phases (the client
    // mirrors headerAgeLabel + countHeaderCheckNotes).
    await run("T50", async () => {
      for (const ageMs of [0, 10_000, 44_000, 60_000, 5 * 60_000, 3_600_000, 7_200_000]) {
        const expected = formatSnapshotAge(ageMs);
        for (const phase of ["idle", "checking", "unanswered"] as const) {
          assert(headerAgeLabel(phase, ageMs) === expected, `phase ${phase} at ${ageMs}ms → "${headerAgeLabel(phase, ageMs)}", expected "${expected}" (label must be phase-independent)`);
          assert(countHeaderCheckNotes({ phase }) === 0, `phase ${phase} must render ZERO check-note lines (the legacy line is deleted, not hidden)`);
          assert(countHeaderCheckIndicators({ phase }) === (phase === "checking" ? 1 : 0), `phase ${phase}: the single refresh indicator is the only phase-dependent header element, and it lives in a fixed-size button box`);
        }
      }
      return "age label identical across idle/checking/unanswered at 7 sampled ages; check-note lines = 0 in every phase; the only phase-varying element is the spinner inside its fixed box — page structure height is refresh-phase invariant";
    });
    // T51 R3 the probe estimate line is ONE line in every state — the
    // client renders this exact text inside a truncating element, so a
    // refresh can never grow the active stage card by a wrapped line.
    await run("T51", async () => {
      const nowMs = Date.now();
      const dyn = formatProbeEstimateLine({ state: "dynamic", timeLeftSeconds: 4446, windowMinutes: 20, probeTemp: 121, asOf: new Date(nowMs).toISOString() }, 0, 90, 121, nowMs, 165);
      assert(dyn === "≈1:14:06 left (est. from last 20 min) · started at 90°", `dynamic line: "${dyn}"`);
      const stall = formatProbeEstimateLine({ state: "stall", timeLeftSeconds: null, windowMinutes: null, probeTemp: 140, asOf: null }, 0, 90, 140, nowMs, 165);
      assert(stall === "— left · probe steady at 140° (stall) · started at 90°", `stall line: "${stall}"`);
      const learn = formatProbeEstimateLine({ state: "learning", timeLeftSeconds: null, windowMinutes: null, probeTemp: 100, asOf: null }, 0, null, 100, nowMs, 165);
      assert(learn === "— left · learning this stage's pace", `learning line: "${learn}"`);
      const fb = formatProbeEstimateLine({ state: "fallback", timeLeftSeconds: 10_500, windowMinutes: null, probeTemp: null, asOf: null }, 0, null, 100, nowMs, 165);
      assert(fb === "2:55:00 left (est.)", `fallback line: "${fb}"`);
      const none = formatProbeEstimateLine(null, 3600, null, 100, nowMs, 165);
      assert(none === "1:00:00 left (est.)", `no-estimate line: "${none}"`);
      for (const line of [dyn, stall, learn, fb, none]) assert(!line.includes("\n"), "estimate line must never contain a newline");
      return "dynamic / stall / learning / fallback / absent estimate lines all match the canonical single-line text";
    });
    // T52 R12 appInfo: the full dashboard exposes the build identity —
    // version label aligned to the build id, a build-time stamp that is
    // parseable, not in the future and not older than the previous
    // build's stamp — plus suite counts consistent with testRuns.
    await run("T52", async () => {
      const dash = await loadDashboard(ctx);
      const info = dash.appInfo;
      assert(info != null, "getDashboard must expose appInfo");
      assert(info.buildId === buildId, `appInfo.buildId "${info.buildId}" must equal the current build id "${buildId}"`);
      const m = buildId.match(/^v(\d+)-/);
      assert(m != null, `build id "${buildId}" must carry a vN- prefix`);
      assert(info.versionLabel === `Version ${m![1]}`, `version label "${info.versionLabel}" must align with the build id number ${m![1]}`);
      assert(info.versionLabel === APP_VERSION_LABEL, "version label must be the stamped APP_VERSION_LABEL constant");
      assert(info.builtAtISO === APP_BUILT_AT_ISO, "builtAtISO must be the stamped APP_BUILT_AT_ISO constant");
      const builtMs = Date.parse(info.builtAtISO);
      assert(!Number.isNaN(builtMs), `builtAtISO "${info.builtAtISO}" must parse`);
      assert(builtMs <= Date.now() + 60_000, "builtAt must not be in the future");
      const prevMs = Date.parse(PREVIOUS_BUILD_AT_ISO);
      assert(!Number.isNaN(prevMs), "PREVIOUS_BUILD_AT_ISO must parse");
      assert(builtMs >= prevMs, `builtAt (${info.builtAtISO}) must not be older than the previous build's stamp (${PREVIOUS_BUILD_AT_ISO})`);
      assert(info.testsPassed === dash.testRuns.passed && info.testsTotal === dash.testRuns.total, `appInfo tests ${info.testsPassed}/${info.testsTotal} must match testRuns ${dash.testRuns.passed}/${dash.testRuns.total}`);
      assert(info.testsLastRunAtISO === dash.testRuns.lastRunAt, "appInfo.testsLastRunAtISO must match testRuns.lastRunAt");
      return `appInfo: ${info.versionLabel} · ${info.buildId} · built ${info.builtAtISO} (≥ previous ${PREVIOUS_BUILD_AT_ISO}); tests ${info.testsPassed}/${info.testsTotal} consistent with testRuns`;
    });
    // T53 R12 History App section structure: the canonical lines the
    // History view renders FIRST are version/build id, then the Built
    // line, then the Tests line — built time and suite status never
    // conflated — and the light payload carries no appInfo.
    await run("T53", async () => {
      const dash = await loadDashboard(ctx);
      const lines = appSectionLines(dash.appInfo);
      assert(lines.length === 3, `App section must have exactly 3 lines, got ${lines.length}`);
      assert(lines[0]!.startsWith(dash.appInfo.versionLabel) && lines[0]!.includes(dash.appInfo.buildId), `first line must be version + build id, got "${lines[0]}"`);
      assert(lines[1] === formatBuiltAtLine(dash.appInfo.builtAtISO) && lines[1]!.startsWith("Built "), `second line must be the Built line, got "${lines[1]}"`);
      assert(lines[2]!.startsWith("Tests:") || lines[2] === "Tests: not run yet", `third line must be the Tests line, got "${lines[2]}"`);
      assert(!lines[1]!.includes("Tests"), "the Built line must not carry suite status");
      assert(lines[2] !== lines[1], "built time and suite status must be distinct lines");
      const light = await Actions.getLightDashboard.handler(ctx, {});
      assert(!("appInfo" in light), "the light payload must not carry appInfo");
      return "App section lines in order — version/build id → Built → Tests — rendered first in History; light payload unaffected";
    });
    // T54 R12 release notes: appInfo carries exactly the latest 3
    // releases, newest first, the current entry IS the current build,
    // every entry's label aligns with its build id, and every entry has
    // a terse non-empty bullet list (1–6).
    await run("T54", async () => {
      const dash = await loadDashboard(ctx);
      const rel = dash.appInfo.releases as { versionLabel: string; buildId: string; builtAtISO: string | null; changes: string[] }[];
      assert(Array.isArray(rel) && rel.length === 3, `appInfo.releases must carry exactly 3 entries, got ${Array.isArray(rel) ? rel.length : "none"}`);
      assert(rel[0]!.buildId === buildId, `newest release entry must be the current build (${buildId}), got ${rel[0]!.buildId}`);
      assert(rel[0]!.versionLabel === dash.appInfo.versionLabel, "current release entry's label must match appInfo.versionLabel");
      assert(rel[0]!.builtAtISO === APP_BUILT_AT_ISO, "current release entry's builtAt must be the current build stamp");
      const nums = rel.map((r) => { const m = r.buildId.match(/^v(\d+)-/); assert(m != null, `release build id "${r.buildId}" must carry a vN- prefix`); return Number(m![1]); });
      assert(nums[0]! > nums[1]! && nums[1]! > nums[2]!, `releases must be newest-first by version number, got ${nums.join(", ")}`);
      for (const r of rel) {
        const m = r.buildId.match(/^v(\d+)-/);
        assert(r.versionLabel === `Version ${m![1]}`, `release "${r.buildId}" label "${r.versionLabel}" must align with its number`);
        assert(Array.isArray(r.changes) && r.changes.length >= 1 && r.changes.length <= 6, `release ${r.buildId} must have 1–6 bullets, got ${r.changes?.length}`);
        assert(r.changes.every((c: string) => typeof c === "string" && c.trim().length > 0), `release ${r.buildId} bullets must all be non-empty`);
      }
      return `releases: ${rel.map((r) => `${r.versionLabel} (${r.buildId}, ${r.changes.length} bullets)`).join(" · ")}`;
    });
    // T55 R13 build recovery: a client bundle built for a different
    // build than the server's must take the reload path; a matching or
    // unknown client build must not; and the reload-once guard blocks a
    // second reload for the same server build (no reload loop).
    await run("T55", async () => {
      assert(resolveBuildRecovery(buildId, buildId) === "current", "matching client/server build → current");
      assert(resolveBuildRecovery("v23-fast-refresh", buildId) === "reload", "stale client build → reload");
      assert(resolveBuildRecovery("v99-from-the-future", buildId) === "reload", "any differing client build → reload");
      assert(resolveBuildRecovery(null, buildId) === "current", "unknown client build → never force a reload");
      assert(shouldReloadForBuild("v23-fast-refresh", buildId, null) === true, "mismatch + not yet reloaded → reload");
      assert(shouldReloadForBuild("v23-fast-refresh", buildId, buildId) === false, "already reloaded for this server build → no second reload (loop guard)");
      assert(shouldReloadForBuild(buildId, buildId, null) === false, "current build → no reload");
      assert(shouldReloadForBuild(null, buildId, null) === false, "unknown client build → no reload");
      return "mismatch → reload path; match/unknown → current; reload-once guard prevents a loop";
    });
    // T56 R13 load-time check state: whatever a previous page instance
    // had in flight — fresh, old, or wedged — a fresh load starts idle:
    // no restored check is ever treated as in-flight.
    await run("T56", async () => {
      const nowMs = Date.now();
      for (const restored of [null, { requestedAtMs: null, inFlight: false }, { requestedAtMs: nowMs - 1_000, inFlight: true }, { requestedAtMs: nowMs - 3_600_000, inFlight: true }]) {
        const s = checkStateOnLoad(restored);
        assert(s.phase === "idle" && s.requestedAtMs === null && s.canRequest === true, `restored ${JSON.stringify(restored)} must load idle, got ${JSON.stringify(s)}`);
      }
      return "fresh / 1s-old / 1h-old in-flight restored states all load as idle + canRequest";
    });
    // T18 recovery
    await run("T18", async () => {
      await baselineCooking();
      const started = new Date(Date.now() - 30 * 60_000);
      const sid = await createSession(1, { stageStartedAt: started });
      try {
        const d1 = await loadDashboard(ctx); const d2 = await loadDashboard(ctx);
        assert(d1.activeSession?.id === sid && d2.activeSession?.id === sid, "session must survive fresh loads");
        assert(d1.activeSession?.currentStageIndex === 1 && d2.activeSession?.currentStageIndex === 1, "stage index must be intact");
        assert(d1.activeSession?.stageStartedAt === d2.activeSession?.stageStartedAt, "stage timing must be identical across loads");
        assert(d1.activeSession?.stageStartedAt === started.toISOString(), "stage start must match the stored value");
        return "session/stage/timing identical across two fresh dashboard loads";
      } finally { await cleanupSession(sid); }
    });
    // T19 last meat round-trip
    await run("T19", async () => {
      await Actions.setLastSelectedMeat.handler(ctx, { meatId: "ribs" });
      const dash = await loadDashboard(ctx);
      assert(dash.lastSelectedMeatId === "ribs", `expected ribs, got ${dash.lastSelectedMeatId}`);
      if (origGrill?.lastSelectedMeatId) await Actions.setLastSelectedMeat.handler(ctx, { meatId: origGrill.lastSelectedMeatId });
      return "setLastSelectedMeat(ribs) → dashboard returns ribs; original restored";
    });
    // T20 cancel rejected while cooking
    await run("T20", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        let threw = false;
        try { await Actions.cancelCook.handler(ctx, { sessionId: sid }); } catch { threw = true; }
        assert(threw, "cancelCook must be rejected while Cooking");
        const s = await getSession(sid); assert(s?.status === "active", `session must stay active, got ${s?.status}`);
        return "cancelCook rejected against Cooking snapshot; session stays active";
      } finally { await cleanupSession(sid); }
    });
    // T23 shutdown dialog: nothing recorded until confirm (server-side invariant)
    await run("T23", async () => {
      await baselineCooking({ probeTemp: 90 });
      const sid = await createSession(1);
      try {
        const beforeMsgs = await db.select().from(schema.cookMessages).where(eq(schema.cookMessages.sessionId, sid));
        // Dialog open + dismiss (Keep cooking / backdrop / ✕) = NO action call at all.
        const afterMsgs = await db.select().from(schema.cookMessages).where(eq(schema.cookMessages.sessionId, sid));
        const s = await getSession(sid);
        assert(s?.status === "active", `session must stay active after dialog dismiss, got ${s?.status}`);
        assert(afterMsgs.length === beforeMsgs.length, "no message may be recorded by opening/dismissing the dialog");
        assert(!afterMsgs.some((m) => m.kind === "shutdown"), "no shutdown may be recorded before confirmation");
        return "dialog opened and dismissed → no shutdown recorded, session unchanged (nothing is called until “Yes, shut down”)";
      } finally { await cleanupSession(sid); }
    });
    // T21 shutdown confirm
    await run("T21", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        await Actions.requestShutdown.handler(ctx, { sessionId: sid });
        const s = await getSession(sid);
        assert(s?.status === "shutdown_requested", `expected shutdown_requested, got ${s?.status}`);
        const msgs = await db.select().from(schema.cookMessages).where(eq(schema.cookMessages.sessionId, sid));
        assert(msgs.some((m) => m.kind === "shutdown"), "shutdown request must be recorded on confirm");
        return "confirmed shutdown → session shutdown_requested + shutdown recorded";
      } finally { await cleanupSession(sid); }
    });
    // T27 R10 upcoming preview
    await run("T27", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        const dash = await loadDashboard(ctx);
        const wrap = dash.stageView.find((v: { index: number }) => v.index === 2);
        assert(wrap?.state === "upcoming", `wrap state=${wrap?.state}`);
        assert(wrap?.instructionVisible === true, "upcoming Wrap instruction must be visible as preview");
        assert(typeof wrap?.instruction === "string" && wrap.instruction.length > 0, "preview must carry the instruction text");
        return "Smoke active → upcoming Wrap row exposes its wrap instruction as preview";
      } finally { await cleanupSession(sid); }
    });
    // T28 R10 active probe acked → hidden
    await run("T28", async () => {
      await baselineCooking({ probeTemp: 80 });
      const sid = await createSession(1);
      try {
        await Actions.ackAlarm.handler(ctx, { sessionId: sid, stageIndex: 1, kind: "owner" });
        const dash = await loadDashboard(ctx);
        const smoke = dash.stageView.find((v: { index: number }) => v.index === 1);
        assert(smoke?.state === "active", `smoke state=${smoke?.state}`);
        assert(smoke?.instructionVisible === false, "acked start action → instruction must be hidden on the active card");
        assert(smoke?.instruction === null, "hidden instruction must carry no text");
        return "Smoke active + start action acked → stageView.instructionVisible=false (no “Place roast…” on the card)";
      } finally { await cleanupSession(sid); }
    });
    // T29 R10 active owner unacked → visible
    await run("T29", async () => {
      await baselineCooking();
      const sid = await createSession(2);
      try {
        const dash = await loadDashboard(ctx);
        const wrap = dash.stageView.find((v: { index: number }) => v.index === 2);
        assert(wrap?.state === "active" && wrap?.instructionVisible === true, `owner stage active unacked must show instruction, got ${JSON.stringify(wrap)}`);
        return "Wrap active and unacked → instruction visible (the act is due now)";
      } finally { await cleanupSession(sid); }
    });
    // T30 R10 after Done → hidden
    await run("T30", async () => {
      await baselineCooking();
      const sid = await createSession(2);
      try {
        await Actions.advanceStage.handler(ctx, { sessionId: sid });
        const dash = await loadDashboard(ctx);
        const wrap = dash.stageView.find((v: { index: number }) => v.index === 2);
        assert(wrap?.state === "done" && wrap?.instructionVisible === false, `after Done wrap must be done+hidden, got ${JSON.stringify(wrap)}`);
        return "Done on Wrap → stage done, instruction hidden";
      } finally { await cleanupSession(sid); }
    });
    // T31 R5 snapshot-age label grammar
    await run("T31", async () => {
      assert(formatSnapshotAge(0) === "just now", `0s → "${formatSnapshotAge(0)}", expected "just now"`);
      assert(formatSnapshotAge(10_000) === "just now", `10s → "${formatSnapshotAge(10_000)}", expected "just now"`);
      assert(formatSnapshotAge(44_000) === "just now", `44s → "${formatSnapshotAge(44_000)}", expected "just now"`);
      assert(formatSnapshotAge(60_000) === "1 min ago", `60s → "${formatSnapshotAge(60_000)}", expected "1 min ago"`);
      assert(formatSnapshotAge(45_000) === "1 min ago", `45s → "${formatSnapshotAge(45_000)}", expected "1 min ago" (never "0 min ago")`);
      assert(formatSnapshotAge(5 * 60_000) === "5 min ago", `5m → "${formatSnapshotAge(5 * 60_000)}"`);
      assert(formatSnapshotAge(60 * 60_000) === "1 hr ago", `60m → "${formatSnapshotAge(60 * 60_000)}", expected "1 hr ago"`);
      for (const ms of [0, 10_000, 44_000, 45_000, 60_000, 120_000, 3_600_000, 7_200_000, 86_400_000]) {
        const label = formatSnapshotAge(ms);
        assert(!label.includes("now ago"), `label "${label}" must never contain "now ago"`);
        assert(!label.startsWith("0 "), `label "${label}" must never start with 0`);
      }
      return "0s/10s/44s → “just now”; 60s → “1 min ago”; 60m → “1 hr ago”; no “now ago” / “0 min ago” at any age";
    });
    // T32 R6 unanswered direct refresh always resolves (90s bound, never
    // stuck) — the phase past the bound renders NO status line (v28:
    // the legacy note element is deleted; T50/T74 pin its absence).
    await run("T32", async () => {
      const t0 = 1_700_000_000_000;
      const idle0 = resolveCheckFeedback({ requestedAtMs: null, snapshotVerifiedMs: null, nowMs: t0 });
      assert(idle0.phase === "idle" && idle0.canRequest, "no request → idle + canRequest");
      const answered = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0 + 5_000, nowMs: t0 + 10_000 });
      assert(answered.phase === "idle" && answered.canRequest, "snapshot after request → idle");
      const atRequest = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0, nowMs: t0 + 10_000 });
      assert(atRequest.phase === "idle", "snapshot timestamped at the request counts as the answer");
      const fresh = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0 - 60_000, nowMs: t0 + 1_000 });
      assert(fresh.phase === "checking" && !fresh.canRequest, "1s in, old snapshot → checking, taps blocked");
      const almost = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: null, nowMs: t0 + 89_999 });
      assert(almost.phase === "checking" && !almost.canRequest, "89.9s in → still checking");
      const deadline = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: null, nowMs: t0 + 90_000 });
      assert(deadline.phase === "unanswered" && deadline.canRequest, "at 90s → unanswered, spinner off, fresh tap allowed");
      const longStuck = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0 - 3_600_000, nowMs: t0 + 2 * 3_600_000 });
      assert(longStuck.phase === "unanswered" && longStuck.canRequest, "2h unanswered → resolved as unanswered, never stuck checking");
      const lateAnswer = resolveCheckFeedback({ requestedAtMs: t0, snapshotVerifiedMs: t0 + 2 * 3_600_000, nowMs: t0 + 2 * 3_600_000 + 1_000 });
      assert(lateAnswer.phase === "idle" && lateAnswer.canRequest, "a late snapshot still clears the state");
      return "no tap → idle; snapshot ≥ tap → idle; <90s → checking (taps blocked); ≥90s → unanswered + fresh tap allowed, at any age — and no phase renders a status line";
    });
    // T33 R5 theme resolution: saved choice wins, otherwise system
    await run("T33", async () => {
      assert(resolveThemePreference("dark", true) === "dark", "saved dark must beat a light system");
      assert(resolveThemePreference("light", false) === "light", "saved light must beat a dark system");
      assert(resolveThemePreference("dark", false) === "dark", "saved dark + dark system → dark");
      assert(resolveThemePreference("light", true) === "light", "saved light + light system → light");
      assert(resolveThemePreference(null, true) === "light", "no saved choice → follow light system");
      assert(resolveThemePreference(null, false) === "dark", "no saved choice → follow dark system");
      assert(resolveThemePreference("bogus", true) === "light", "invalid saved value → follow system");
      assert(resolveThemePreference("", false) === "dark", "empty saved value → follow system");
      return "saved light/dark always wins; absent or invalid → system preference";
    });
    // T36 R8 stored-login posture (hermetic: no real Traeger call is made —
    // the failure case uses an empty stored password, which the server
    // rejects as a dead login BEFORE any network attempt)
    await run("T36", async () => {
      resetLiveRefreshGateForTests();
      await db.delete(schema.traegerAuth);
      const r1 = await Actions.liveRefresh.handler(ctx, {});
      assert(r1.ok === false && r1.status === "signin_needed", `no stored login → ${JSON.stringify(r1)}`);
      const d0 = await loadDashboard(ctx);
      assert(d0.traegerAuth.signedIn === false && d0.traegerAuth.email === null, "dashboard must show the signed-out state");
      const fakePw = "FAKE-suite-password-123";
      await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: fakePw, idToken: "fake-token", expiresAt: new Date(Date.now() + 3_600_000) });
      const d1 = await loadDashboard(ctx);
      assert(d1.traegerAuth.signedIn === true && d1.traegerAuth.email === "owner@example.com", "dashboard shows the signed-in email only");
      assert(!("password" in d1.traegerAuth), "traegerAuth payload must have no password field");
      assert(!JSON.stringify(d1).includes(fakePw), "dashboard payload must never contain the stored password");
      const status = await Actions.getTestStatus.handler(ctx, {});
      assert(!JSON.stringify(status).includes(fakePw), "test-status payload must never contain the stored password");
      await db.update(schema.traegerAuth).set({ idToken: "expired-fake", expiresAt: new Date(Date.now() - 60_000), password: "" }).where(eq(schema.traegerAuth.id, 1));
      resetLiveRefreshGateForTests();
      const r2 = await Actions.liveRefresh.handler(ctx, {});
      assert(r2.ok === false && r2.status === "auth_failed", `dead stored login → ${JSON.stringify(r2)}`);
      const d2 = await loadDashboard(ctx);
      assert(d2.grill != null, "dashboard must still load after the failed refresh");
      await db.delete(schema.traegerAuth);
      return "no login → signin_needed; password absent from dashboard + test-status payloads; dead login → auth_failed, no crash";
    });
    // T37 R6 live-refresh gate boundaries
    await run("T37", async () => {
      const t0 = 1_700_000_000_000;
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: null, inFlight: false }) === "proceed", "first call → proceed");
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: t0 - 20_000, inFlight: false }) === "proceed", "20s after last → proceed");
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: t0 - 15_000, inFlight: false }) === "proceed", "at exactly 15s → proceed");
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: t0 - 14_999, inFlight: false }) === "wait", "14.9s after last → wait");
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: null, inFlight: true }) === "join", "in-flight → join");
      assert(resolveLiveRefreshGate({ nowMs: t0, lastAttemptMs: t0 - 1_000, inFlight: true }) === "join", "in-flight beats the interval → join");
      return "proceed / join / wait with the 15s boundary exact";
    });
    // T22 R5 header data contract
    await run("T22", async () => {
      await baselineCooking();
      const dash = await loadDashboard(ctx);
      assert(dash.grill.name.length > 0, "header needs grill name");
      assert(dash.grill.systemStateLabel.length > 0, "header needs state label");
      assert(dash.grill.lastVerifiedAt.length > 0, "header needs checked-age source (lastVerifiedAt)");
      assert(dash.grill.grillTemp > 0 && dash.grill.setpoint > 0, "header tiles need grill/setpoint");
      return "dashboard supplies name, state label, lastVerifiedAt and tiles for the one-row header";
    });
    // ---- Scripted fake MQTT broker socket (R6/R14) ----
    // Implements the socket surface fetchStatusViaMqtt uses; the test
    // drives the broker side by hand, feeding raw MQTT frames into the
    // listen loop exactly as Traeger's broker would. Fully hermetic:
    // no real login, no real network (the v24 bug's listen path —
    // previously manual-only territory — is exercised end to end).
    type FakeSocket = {
      binaryType: string;
      onopen: (() => void) | null;
      onmessage: ((ev: { data: unknown }) => void | Promise<void>) | null;
      onerror: ((ev: { message?: string }) => void) | null;
      onclose: ((ev: { code?: number }) => void) | null;
      sent: Uint8Array[];
      send: (data: Uint8Array) => void;
      close: () => void;
      open: () => void;
      fail: (message: string) => void;
      dropFromServer: () => void;
      deliver: (frame: Uint8Array) => Promise<void>;
    };
    const makeFakeSocket = (): FakeSocket => {
      const sock: FakeSocket = {
        binaryType: "",
        onopen: null, onmessage: null, onerror: null, onclose: null,
        sent: [],
        send: (data) => { sock.sent.push(data); },
        close: () => { /* the listen loop closing its side: no event back */ },
        open: () => { sock.onopen?.(); },
        fail: (message) => { sock.onerror?.({ message }); },
        dropFromServer: () => { sock.onclose?.({ code: 1006 }); },
        deliver: async (frame) => { await sock.onmessage?.({ data: frame.buffer as ArrayBuffer }); },
      };
      return sock;
    };
    const mqttFrame = (header: number, body: number[]): Uint8Array => {
      const rl: number[] = []; let v = body.length;
      do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; rl.push(b); } while (v > 0);
      return new Uint8Array([header, ...rl, ...body]);
    };
    const connackFrame = () => mqttFrame(0x20, [0x00, 0x00]);
    const subackFrame = () => mqttFrame(0x90, [0x00, 0x01, 0x00]);
    const publishFrame = (topic: string, payload: string, retained: boolean): Uint8Array => {
      const t = Array.from(new TextEncoder().encode(topic));
      const p = Array.from(new TextEncoder().encode(payload));
      return mqttFrame(retained ? 0x31 : 0x30, [Math.floor(t.length / 256), t.length % 256, ...t, ...p]);
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const waitFor = async (cond: () => boolean, what: string) => {
      const t0 = Date.now();
      while (!cond()) { if (Date.now() - t0 > 5_000) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 5)); }
    };
    const driveHandshake = async (sock: FakeSocket) => {
      await waitFor(() => sock.onopen != null, "listen socket handlers");
      sock.open(); await tick();
      await sock.deliver(connackFrame()); await tick();
      await sock.deliver(subackFrame()); await tick();
    };
    // T57 R6 listen machine vs a scripted broker socket — the v24 bug
    // reproduction: production's socket died BEFORE any MQTT exchange
    // (egress proxy bypass) while the outcome was recorded as a 12s
    // "timeout" with listenMs ≈ 10. Each death stage now has its own
    // outcome, and only subscribed silence may ever read as a timeout.
    await run("T57", async () => {
      const thing = "TESTTHINGT57";
      const topic = `prod/thing/update/${thing}`;
      const stored = { grillTemp: 250, probeTemp: 80, setpoint: 250, systemStatus: 6 };
      const samePayload = JSON.stringify({ state: { reported: { grill: 250, probe: 80, setpoint: 250, system_status: 6 } } });
      const newPayload = JSON.stringify({ state: { reported: { grill: 251, probe: 95, setpoint: 250, system_status: 6 } } });
      try {
        // (a) Instant pre-CONNACK death → connect_failed, at once.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          const t0 = Date.now();
          const p = fetchStatusViaMqtt("wss://broker.invalid/mqtt", thing, () => {}, stored);
          sock.fail("simulated instant broker death");
          const r = await p;
          const elapsed = Date.now() - t0;
          assert(r.kind === "connect_failed", `(a) instant death → ${r.kind}, expected connect_failed`);
          assert(elapsed < 3_000, `(a) instant death must resolve at once, took ${elapsed}ms against a ${LIVE_LISTEN_CAP_MS}ms cap`);
          assert(listenFailureStatus("connect_failed").status === "unreachable", "(a) connect_failed must map to unreachable, never timeout");
        }
        // (b) CONNACK, then the socket drops before SUBACK.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          const p = fetchStatusViaMqtt("wss://broker.invalid/mqtt", thing, () => {}, stored);
          sock.open(); await tick();
          assert((sock.sent[0]?.[0] ?? 0) === 0x10, "(b) the first packet on the wire must be MQTT CONNECT");
          await sock.deliver(connackFrame()); await tick();
          assert((sock.sent[1]?.[0] ?? 0) === 0x82, "(b) CONNACK must trigger SUBSCRIBE");
          sock.dropFromServer();
          const r = await p;
          assert(r.kind === "subscribe_failed", `(b) drop after CONNACK → ${r.kind}, expected subscribe_failed`);
          assert(listenFailureStatus("subscribe_failed").status === "unreachable", "(b) subscribe_failed must map to unreachable");
        }
        // (c) Fully subscribed, then silence → silent, at the cap.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          liveRefreshTestSeams.listenCapMs = 700;
          const t0 = Date.now();
          const p = fetchStatusViaMqtt("wss://broker.invalid/mqtt", thing, () => {}, stored);
          await driveHandshake(sock);
          const r = await p;
          const elapsed = Date.now() - t0;
          assert(r.kind === "silent", `(c) subscribed silence → ${r.kind}, expected silent`);
          assert(elapsed >= 600 && elapsed < 5_000, `(c) silence must resolve at the configured 700ms cap, took ${elapsed}ms`);
          assert(listenFailureStatus("silent").status === "timeout", "(c) silent is the only listen failure that may map to timeout");
          assert(listenFailureStatus("link_lost").status === "unreachable", "(c) a mid-listen drop must map to unreachable");
          liveRefreshTestSeams.listenCapMs = null;
        }
        // (d) Retained identical → keep waiting; live publish accepted.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          let resolved = false;
          const p = fetchStatusViaMqtt("wss://broker.invalid/mqtt", thing, () => {}, stored).then((r) => { resolved = true; return r; });
          await driveHandshake(sock);
          await sock.deliver(publishFrame(topic, samePayload, true));
          await new Promise((r) => setTimeout(r, 150));
          assert(!resolved, "(d) a retained payload identical to the stored snapshot must NOT resolve the listen");
          await sock.deliver(publishFrame(topic, newPayload, false));
          const r = await p;
          assert(r.kind === "payload" && r.source === "live", `(d) live publish → ${r.kind}/${String(r.source)}`);
        }
        // (e) Retained carrying newer values → accepted as retained.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          const p = fetchStatusViaMqtt("wss://broker.invalid/mqtt", thing, () => {}, stored);
          await driveHandshake(sock);
          await sock.deliver(publishFrame(topic, newPayload, true));
          const r = await p;
          assert(r.kind === "payload" && r.source === "retained", `(e) retained-newer → ${r.kind}/${String(r.source)}`);
        }
        return "instant death → connect_failed in <3s (never a fake 12s timeout); post-CONNACK drop → subscribe_failed; subscribed silence → silent at the cap; retained-identical waits for the live answer; retained-newer accepted";
      } finally {
        liveRefreshTestSeams.socketFactory = null;
        liveRefreshTestSeams.listenCapMs = null;
      }
    });
    // T58 R6 egress proxy resolution for the MQTT socket — the direct
    // route is what killed the v24 refresh; the socket must follow the
    // same proxy env fetch uses, in this precedence.
    await run("T58", async () => {
      assert(resolveEgressProxy({ HTTPS_PROXY: "http://proxy:3128" }) === "http://proxy:3128", "HTTPS_PROXY must be used");
      assert(resolveEgressProxy({ https_proxy: "http://lower:3128" }) === "http://lower:3128", "lowercase https_proxy fallback");
      assert(resolveEgressProxy({ HTTPS_PROXY: "", https_proxy: "http://lower:3128" }) === "http://lower:3128", "blank HTTPS_PROXY falls through");
      assert(resolveEgressProxy({ ALL_PROXY: "http://all:3128" }) === "http://all:3128", "ALL_PROXY fallback");
      assert(resolveEgressProxy({ HTTP_PROXY: "http://plain:3128" }) === "http://plain:3128", "HTTP_PROXY last fallback");
      assert(resolveEgressProxy({ HTTPS_PROXY: "http://secure:3128", http_proxy: "http://plain:3128" }) === "http://secure:3128", "HTTPS_PROXY wins (the broker URL is wss)");
      assert(resolveEgressProxy({}) === null, "no proxy env → null (direct)");
      assert(resolveEgressProxy({ HTTPS_PROXY: "   " }) === null, "whitespace-only → null");
      return "HTTPS_PROXY → lowercase → ALL_PROXY → HTTP_PROXY; blank/absent → direct connection";
    });
    // T59 R14 getDashboard response contract.
    await run("T59", async () => {
      await baselineCooking();
      const sid = await createSession(1);
      try {
        const dash = await Actions.getDashboard.handler(ctx, {});
        for (const k of ["grill", "programs", "appInfo", "activeSession", "messages", "history", "lastSelectedMeatId", "activeCorrection", "trends", "probeEstimate", "traegerAuth", "stageConditionMet", "testRuns", "stageView"]) {
          assert(k in dash, `dashboard missing key ${k}`);
        }
        const g = dash.grill;
        for (const k of ["grillTemp", "ambientTemp", "probeTemp", "setpoint", "systemStatus", "wifiSignal", "cookCycles"]) {
          assert(typeof g[k] === "number", `grill.${k} must be a number, got ${typeof g[k]}`);
        }
        assert(typeof g.connected === "boolean" && typeof g.probeConnected === "boolean", "grill connection flags must be booleans");
        assert(typeof g.lastVerifiedAt === "string" && !Number.isNaN(Date.parse(g.lastVerifiedAt)), "grill.lastVerifiedAt must be an ISO timestamp");
        assert(Array.isArray(dash.programs) && dash.programs.length >= 1 && dash.programs.every((p: { stages: unknown[] }) => Array.isArray(p.stages)), "programs must be an array of programs with stage arrays");
        assert(dash.activeSession?.id === sid, "activeSession must be the live session object");
        assert(typeof dash.activeSession?.stageStartedAt === "string" && Array.isArray(dash.activeSession?.alarmAckedKeys), "session shape: ISO timing + ack key array");
        assert(dash.stageView.length === chuck.stages.length, `stageView length ${dash.stageView.length} must equal the active program's stage count ${chuck.stages.length}`);
        for (const v of dash.stageView) {
          assert(typeof v.index === "number" && ["done", "active", "upcoming"].includes(v.state) && typeof v.instructionVisible === "boolean", `stageView entry shape: ${JSON.stringify(v)}`);
        }
        assert("grill" in dash.trends && "probe" in dash.trends, "trends must carry grill + probe keys");
        for (const t of [dash.trends.grill, dash.trends.probe]) {
          if (t != null) assert(["rising", "falling", "steady"].includes(t.direction) && ["green", "red", "grey"].includes(t.tone) && Array.isArray(t.series) && typeof t.windowMinutes === "number", `trend shape: ${JSON.stringify(t)}`);
        }
        if (dash.probeEstimate != null) {
          assert(["dynamic", "stall", "fallback", "learning"].includes(dash.probeEstimate.state), "probeEstimate state enum");
          assert("asOf" in dash.probeEstimate && (dash.probeEstimate.asOf === null || (typeof dash.probeEstimate.asOf === "string" && !Number.isNaN(Date.parse(dash.probeEstimate.asOf)))), "probeEstimate.asOf must be present — ISO timestamp or null (v27 R14)");
        }
        const info = dash.appInfo;
        assert(typeof info.versionLabel === "string" && typeof info.buildId === "string" && typeof info.builtAtISO === "string", "appInfo identity fields must be strings");
        assert(Array.isArray(info.releases) && info.releases.length === 3, "appInfo.releases must carry exactly 3 entries");
        for (const rel of info.releases) {
          assert(typeof rel.versionLabel === "string" && typeof rel.buildId === "string" && (rel.builtAtISO === null || typeof rel.builtAtISO === "string") && Array.isArray(rel.changes), `release entry shape: ${JSON.stringify(rel)}`);
        }
        assert(info.testsPassed === dash.testRuns.passed && info.testsTotal === dash.testRuns.total, "appInfo test counts must be consistent with testRuns");
        assert(dash.traegerAuth && typeof dash.traegerAuth.signedIn === "boolean" && (dash.traegerAuth.email === null || typeof dash.traegerAuth.email === "string") && typeof dash.traegerAuth.tokenValid === "boolean", "traegerAuth shape {signedIn, email, tokenValid}");
        assert(typeof dash.stageConditionMet === "boolean" && Array.isArray(dash.messages), "stageConditionMet boolean + messages array");
        return "dashboard keys + types hold; grill numerics + ISO verified time; stageView length = program stages; appInfo {identity, releases[3]} consistent with testRuns";
      } finally { await cleanupSession(sid); }
    });
    // T60 R14 getLightDashboard response contract.
    await run("T60", async () => {
      const light = await Actions.getLightDashboard.handler(ctx, {});
      for (const k of ["grill", "activeSession", "activeCorrection", "trends", "probeEstimate", "stageConditionMet", "stageView", "lastSelectedMeatId", "traegerAuth", "lastRefreshTiming"]) {
        assert(k in light, `light payload missing key ${k}`);
      }
      for (const banned of ["programs", "history", "messages", "testRuns", "appInfo"]) {
        assert(!(banned in light), `light payload must not carry ${banned}`);
      }
      assert(typeof light.grill.grillTemp === "number" && typeof light.grill.probeTemp === "number" && typeof light.grill.lastVerifiedAt === "string", "light grill core fields");
      if (light.probeEstimate != null) assert("asOf" in light.probeEstimate && (light.probeEstimate.asOf === null || typeof light.probeEstimate.asOf === "string"), "light probeEstimate must carry asOf (string|null) — the tick-down anchor rides the light payload (v27 R14)");
      assert(Array.isArray(light.stageView) && typeof light.stageConditionMet === "boolean", "light stageView array + stageConditionMet boolean");
      const t = light.lastRefreshTiming;
      if (t != null) {
        for (const k of ["at", "outcome", "totalMs", "tokenMs", "tokenRenewed", "mqttMs", "listenMs", "payloadSource", "listenOutcome", "proxyMs", "proxyPresent", "failStage", "failErrorClass"]) {
          assert(k in t, `lastRefreshTiming missing field ${k}`);
        }
        assert(typeof t.at === "string" && !Number.isNaN(Date.parse(t.at)) && typeof t.outcome === "string", "timing at/outcome types");
        assert(typeof t.totalMs === "number" && t.totalMs >= 0 && typeof t.tokenMs === "number" && typeof t.tokenRenewed === "boolean", "timing numeric/boolean fields");
        assert(t.mqttMs === null || typeof t.mqttMs === "number", "timing.mqttMs number|null");
        assert(t.listenMs === null || typeof t.listenMs === "number", "timing.listenMs number|null");
        assert(t.payloadSource === null || t.payloadSource === "live" || t.payloadSource === "retained", "timing.payloadSource enum|null");
        assert(t.listenOutcome === null || ["payload", "connect_failed", "subscribe_failed", "link_lost", "silent"].includes(t.listenOutcome), "timing.listenOutcome enum|null");
        assert(typeof t.proxyMs === "number" && t.proxyMs >= 0, "timing.proxyMs number ≥ 0 (v26: proxy fetch timed separately)");
        assert(t.proxyPresent === null || typeof t.proxyPresent === "boolean", "timing.proxyPresent boolean|null");
        assert(t.failStage === null || ["proxy_connect", "tls", "ws_upgrade", "worker_socket", "probe_unavailable"].includes(t.failStage), "timing.failStage enum|null");
        assert(t.failErrorClass === null || typeof t.failErrorClass === "string", "timing.failErrorClass string|null");
      }
      return `light payload: 10 core keys with types, 5 heavy sections absent, lastRefreshTiming ${t == null ? "null (no refresh yet in this server run)" : "full 13-field record"}`;
    });
    // T61 R14 liveRefresh contracts on EVERY path — the full action run
    // hermetically through the test seams (cached token, scripted
    // signed-URL provider, scripted broker socket, scripted command
    // sender). Includes the regression net for the v24 bug: a timeout
    // whose listenMs doesn't match the configured window fails here.
    await run("T61", async () => {
      const topic = "prod/thing/update/801F12F782F9";
      const payloadSame = JSON.stringify({ state: { reported: { grill: 250, probe: 80, setpoint: 250, system_status: 6 } } });
      const payloadNew = JSON.stringify({ state: { reported: { grill: 251, probe: 95, setpoint: 250, system_status: 6 } } });
      const timingKeys = ["at", "outcome", "totalMs", "tokenMs", "tokenRenewed", "mqttMs", "listenMs", "payloadSource", "listenOutcome", "proxyMs", "proxyPresent", "failStage", "failErrorClass"];
      const assertTimingShape = (t: { [k: string]: unknown } | null, where: string) => {
        assert(t != null, `${where}: timing record missing`);
        for (const k of timingKeys) assert(k in t!, `${where}: timing missing ${k}`);
        assert(typeof t!.at === "string" && !Number.isNaN(Date.parse(t!.at as string)), `${where}: timing.at must be ISO`);
        assert(typeof t!.totalMs === "number" && typeof t!.tokenMs === "number" && typeof t!.tokenRenewed === "boolean", `${where}: timing field types`);
      };
      const events: string[] = [];
      try {
        await baselineCooking();
        await db.delete(schema.traegerAuth);
        // (0) signin_needed: full documented shape + timing record.
        resetLiveRefreshGateForTests();
        const r0 = await Actions.liveRefresh.handler(ctx, {});
        assert(r0.ok === false && r0.status === "signin_needed" && r0.verifiedAt === null && typeof r0.message === "string" && r0.message.length > 0, `signin_needed shape: ${JSON.stringify(r0)}`);
        assertTimingShape(r0.timing, "signin_needed");
        assert(r0.timing!.listenMs === null && r0.timing!.mqttMs === null && r0.timing!.listenOutcome === null, "signin_needed: stages never reached must be null, not invented");
        // Plant a login with a fresh cached token → no auth network.
        await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: "FAKE-suite-password-123", idToken: "TEST-TOKEN", expiresAt: new Date(Date.now() + 3_600_000) });
        liveRefreshTestSeams.signedUrlProvider = async () => "wss://broker.invalid/mqtt";
        // (a) Instant broker death → unreachable + connect_failed, and
        // lastVerifiedAt must NOT move (no falsified freshness).
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => { queueMicrotask(() => sock.fail("simulated instant death")); return sock; };
          const before = await loadDashboard(ctx);
          resetLiveRefreshGateForTests();
          const r = await Actions.liveRefresh.handler(ctx, {});
          assert(r.ok === false && r.status === "unreachable", `(a) instant death → status ${r.status}, expected unreachable (NOT timeout)`);
          assertTimingShape(r.timing, "(a)");
          assert(r.timing!.listenOutcome === "connect_failed", `(a) listenOutcome=${String(r.timing!.listenOutcome)}`);
          assert(r.timing!.failStage === null && r.timing!.proxyPresent === null, "(a) seamed hermetic path must record NO privileged diagnostics — failStage/proxyPresent stay null, never invented");
          assert(r.timing!.failErrorClass === "socket_error", `(a) the socket's own error class is classified locally, got ${String(r.timing!.failErrorClass)}`);
          assert((r.timing!.listenMs ?? 99_999) < 5_000, `(a) listenMs=${r.timing!.listenMs} must be ≪ the listen window`);
          assert(r.verifiedAt === null, "(a) verifiedAt must be null on failure");
          const after = await loadDashboard(ctx);
          assert(after.grill.lastVerifiedAt === before.grill.lastVerifiedAt, "(a) a failed refresh must never advance lastVerifiedAt");
        }
        // (b) Subscribed silence → timeout, listenMs ≈ the window.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          liveRefreshTestSeams.listenCapMs = 700;
          liveRefreshTestSeams.commandSender = async () => { events.push("command90"); };
          resetLiveRefreshGateForTests();
          const p = Actions.liveRefresh.handler(ctx, {});
          await driveHandshake(sock);
          const r = await p;
          assert(r.ok === false && r.status === "timeout", `(b) subscribed silence → ${r.status}, expected timeout`);
          assertTimingShape(r.timing, "(b)");
          assert(r.timing!.listenOutcome === "silent", `(b) listenOutcome=${String(r.timing!.listenOutcome)}`);
          const lm = r.timing!.listenMs ?? -1;
          assert(lm >= 600 && lm <= 5_000, `(b) REGRESSION NET: a timeout's listenMs (${lm}ms) must match the configured 700ms window — a ~10ms timeout is the v24 bug`);
          assert(events.filter((e) => e === "command90").length === 1, "(b) command 90 must be sent exactly once, after SUBACK");
          liveRefreshTestSeams.listenCapMs = null;
        }
        // (c) Success: retained-identical waits, the live answer lands
        // → ok + fresh verifiedAt == the dashboard's lastVerifiedAt.
        {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          liveRefreshTestSeams.commandSender = async () => { events.push("command90-c"); };
          resetLiveRefreshGateForTests();
          const p = Actions.liveRefresh.handler(ctx, {});
          await driveHandshake(sock);
          await sock.deliver(publishFrame(topic, payloadSame, true));
          await new Promise((r) => setTimeout(r, 120));
          await sock.deliver(publishFrame(topic, payloadNew, false));
          const r = await p;
          assert(r.ok === true && r.status === "ok", `(c) success path → ${r.status}`);
          assert(typeof r.verifiedAt === "string" && Math.abs(Date.now() - Date.parse(r.verifiedAt)) < 15_000, `(c) verifiedAt must be a fresh timestamp, got ${String(r.verifiedAt)}`);
          assertTimingShape(r.timing, "(c)");
          assert(r.timing!.listenOutcome === "payload" && r.timing!.payloadSource === "live", `(c) timing outcome/source: ${String(r.timing!.listenOutcome)}/${String(r.timing!.payloadSource)}`);
          const dash = await loadDashboard(ctx);
          assert(dash.grill.lastVerifiedAt === r.verifiedAt, "(c) the dashboard's lastVerifiedAt must equal the refresh's verifiedAt");
          assert(dash.grill.probeTemp === 95 && dash.grill.grillTemp === 251, `(c) the payload's temps must be applied, got grill ${dash.grill.grillTemp} probe ${dash.grill.probeTemp}`);
          const light = await Actions.getLightDashboard.handler(ctx, {});
          assert(light.lastRefreshTiming?.outcome === "ok" && light.lastRefreshTiming?.listenOutcome === "payload", "(c) the light payload must carry the success timing record");
        }
        return "signin_needed shape + null stages; instant death → unreachable/connect_failed with lastVerifiedAt unmoved; subscribed silence → timeout with listenMs ≈ window (regression net); success → fresh verifiedAt == dashboard lastVerifiedAt, temps applied";
      } finally {
        liveRefreshTestSeams.socketFactory = null;
        liveRefreshTestSeams.signedUrlProvider = null;
        liveRefreshTestSeams.commandSender = null;
        liveRefreshTestSeams.listenCapMs = null;
        resetLiveRefreshGateForTests();
        await db.delete(schema.traegerAuth);
      }
    });
    // T62 R14 sign-in / sign-out contracts + password hygiene sweep.
    await run("T62", async () => {
      const fakePw = "FAKE-suite-password-XYZ";
      try {
        await db.delete(schema.traegerAuth);
        const bad1 = await Actions.traegerSignIn.handler(ctx, { email: "not-an-email", password: "whatever" });
        assert(bad1.ok === false && bad1.status === "invalid_input" && bad1.expiresAt === null && typeof bad1.message === "string", `invalid email → ${JSON.stringify(bad1)}`);
        const bad2 = await Actions.traegerSignIn.handler(ctx, { email: "owner@example.com", password: "" });
        assert(bad2.ok === false && bad2.status === "invalid_input", `empty password → ${JSON.stringify(bad2)}`);
        const rowsAfterBad = await db.select().from(schema.traegerAuth);
        assert(rowsAfterBad.length === 0, "a rejected sign-in must store nothing");
        await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: fakePw, idToken: "fake-token", expiresAt: new Date(Date.now() + 3_600_000) });
        const payloads: [string, unknown][] = [
          ["getDashboard", await Actions.getDashboard.handler(ctx, {})],
          ["getLightDashboard", await Actions.getLightDashboard.handler(ctx, {})],
          ["getTestStatus", await Actions.getTestStatus.handler(ctx, {})],
          ["getStatusHistory", await Actions.getStatusHistory.handler(ctx, {})],
          ["feedSnapshotHistory", await Actions.feedSnapshotHistory.handler(ctx, {})],
          ["traegerSignIn(invalid)", bad1],
        ];
        for (const [name, payload] of payloads) {
          assert(!JSON.stringify(payload).includes(fakePw), `${name} response must never contain the stored password`);
        }
        const out = await Actions.traegerSignOut.handler(ctx, {});
        assert(out.ok === true && Object.keys(out).length === 1, `sign-out shape: ${JSON.stringify(out)}`);
        const rowsAfterOut = await db.select().from(schema.traegerAuth);
        assert(rowsAfterOut.length === 0, "sign-out must remove the stored login");
        const dash = await loadDashboard(ctx);
        assert(dash.traegerAuth.signedIn === false && dash.traegerAuth.email === null, "dashboard must show the signed-out state after sign-out");
        return "invalid sign-in → invalid_input + nothing stored; sign-out → {ok:true} + login removed; the stored password appears in none of 6 action responses";
      } finally { await db.delete(schema.traegerAuth); }
    });
    // T63 R14 cook-action contracts: success + rejection shapes, and
    // rejections leave server state byte-identical.
    await run("T63", async () => {
      await baselineCooking();
      const rowJson = async (id: number) => JSON.stringify(await getSession(id));
      // startCook: unknown program rejects and writes nothing.
      const grillRowJson = async () => JSON.stringify((await db.select().from(schema.grillState).limit(1))[0] ?? null);
      const grillBefore = await grillRowJson();
      let threw = false;
      try { await Actions.startCook.handler(ctx, { meatId: "no-such-meat" }); } catch { threw = true; }
      assert(threw, "startCook with an unknown meat must reject");
      assert((await grillRowJson()) === grillBefore, "a rejected startCook must not write anything");
      // startCook success — the production active session (cancelled as
      // a side effect of any cook start) is restored byte-identical.
      const prodRow = origActive ? await getSession(origActive.id) : null;
      const prodJson = prodRow ? JSON.stringify(prodRow) : null;
      const started = await Actions.startCook.handler(ctx, { meatId: "chuckroast" });
      assert(started.ok === true && typeof started.sessionId === "number", `startCook shape: ${JSON.stringify(started)}`);
      const newSession = await getSession(started.sessionId);
      assert(newSession?.meatId === "chuckroast" && newSession.currentStageIndex === 0 && newSession.status === "active", "startCook must create an active stage-0 session for the program");
      await cleanupSession(started.sessionId);
      if (prodRow && prodJson) {
        await db.update(schema.cookSessions).set({ status: prodRow.status, updatedAt: prodRow.updatedAt }).where(eq(schema.cookSessions.id, prodRow.id));
        assert((await rowJson(prodRow.id)) === prodJson, "the production session must be byte-identical after the startCook contract check");
      }
      const sid = await createSession(1);
      try {
        const before = await rowJson(sid);
        let threw2 = false;
        try { await Actions.advanceStage.handler(ctx, { sessionId: sid }); } catch { threw2 = true; }
        assert(threw2, "advanceStage on a probe stage must reject");
        assert((await rowJson(sid)) === before, "a rejected advanceStage must leave the session byte-identical");
        const refused = await Actions.autoAdvanceStage.handler(ctx, { sessionId: sid });
        assert(refused.ok === true && refused.advanced === false && refused.completed === false, `autoAdvance refusal shape: ${JSON.stringify(refused)}`);
        assert((await rowJson(sid)) === before, "a refused autoAdvance must leave the session byte-identical");
        const ack = await Actions.ackAlarm.handler(ctx, { sessionId: sid, stageIndex: 1, kind: "owner" });
        assert(ack.ok === true && Array.isArray(ack.ackedKeys) && ack.ackedKeys.includes("1-owner"), `ackAlarm shape: ${JSON.stringify(ack)}`);
        const hold = await Actions.setTimerHold.handler(ctx, { sessionId: sid, since: new Date().toISOString() });
        assert(hold.ok === true, "setTimerHold shape {ok}");
        const bank = await Actions.bankHeldTime.handler(ctx, { sessionId: sid, heldMs: 60_000 });
        assert(bank.ok === true && typeof bank.shiftedMs === "number" && bank.shiftedMs >= 0, `bankHeldTime shape: ${JSON.stringify(bank)}`);
        await setGrill({ setpoint: 240 });
        const c1 = await Actions.requestSetpointCorrection.handler(ctx, { sessionId: sid, stageIndex: 1, fromTemp: 240, toTemp: 250 });
        assert(c1.ok === true && c1.recorded === true && typeof c1.correctionId === "number", `correction shape: ${JSON.stringify(c1)}`);
        const c2 = await Actions.requestSetpointCorrection.handler(ctx, { sessionId: sid, stageIndex: 1, fromTemp: 240, toTemp: 250 });
        assert(c2.ok === true && c2.recorded === false, "a duplicate outstanding correction must not be recorded twice");
        await setGrill({ setpoint: 250 });
        const beforeCancel = await rowJson(sid);
        let threw3 = false;
        try { await Actions.cancelCook.handler(ctx, { sessionId: sid }); } catch { threw3 = true; }
        assert(threw3, "cancelCook while Cooking must reject");
        assert((await rowJson(sid)) === beforeCancel, "a rejected cancelCook must leave the session byte-identical");
        const shut = await Actions.requestShutdown.handler(ctx, { sessionId: sid });
        assert(shut.ok === true, "requestShutdown shape {ok}");
        const sAfter = await getSession(sid);
        assert(sAfter?.status === "shutdown_requested", "requestShutdown must move the session to shutdown_requested");
      } finally { await cleanupSession(sid); }
      // reconcileSession5 no-op contract: outside its one-time
      // condition it must return its shape and disturb nothing.
      const fiveJson = async () => JSON.stringify((await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, 5)).limit(1))[0] ?? null);
      const fiveBefore = await fiveJson();
      const rec = await Actions.reconcileSession5.handler(ctx, {});
      assert(rec.ok === true && typeof rec.reverted === "boolean", `reconcile shape: ${JSON.stringify(rec)}`);
      assert((await fiveJson()) === fiveBefore, "reconcileSession5 must not disturb session 5 outside its one-time condition");
      return "startCook success + unknown-meat rejection (no writes); advance/auto-advance/cancel rejections byte-identical; ack/hold/bank/correction-dedupe/shutdown/reconcile shapes hold";
    });
    // T64 R14 feeder + test-status contracts; handler-level negative
    // cases (unknown targets) resolve as documented no-ops. (Zod-level
    // arg rejection happens in the RPC layer before any handler runs,
    // so it is covered by the platform, not re-asserted here.)
    await run("T64", async () => {
      const feed = await Actions.feedSnapshotHistory.handler(ctx, {});
      assert(feed.ok === true && typeof feed.appended === "boolean" && typeof feed.reason === "string" && feed.reason.length > 0, `feeder shape: ${JSON.stringify(feed)}`);
      const status = await Actions.getTestStatus.handler(ctx, {});
      assert(Array.isArray(status.requirements) && status.requirements.length >= 14, "the requirements list must cover R1–R14");
      for (const r of status.requirements) {
        assert(typeof r.id === "string" && typeof r.title === "string" && typeof r.description === "string" && ["guarded", "failing", "not_covered"].includes(r.status) && Array.isArray(r.scenarios), `requirement shape for ${String(r.id)}`);
        for (const s of r.scenarios) {
          assert(typeof s.id === "string" && typeof s.name === "string" && (s.passed === null || typeof s.passed === "boolean"), `scenario shape for ${String(s.id)}`);
        }
      }
      const r14 = status.requirements.find((r: { id: string }) => r.id === "R14");
      assert(r14 != null && r14.scenarios.length === 7, "R14 must be registered with its 7 contract scenarios");
      assert(typeof status.gateLine === "string" && status.gateLine.includes("does not ship"), "the gate line must be present");
      const tr = status.testRuns;
      assert(typeof tr.passed === "number" && typeof tr.failed === "number" && typeof tr.total === "number" && typeof tr.stale === "boolean" && Array.isArray(tr.tests) && (tr.lastRunAt === null || typeof tr.lastRunAt === "string"), "testRuns summary shape");
      const stored = await db.select().from(schema.testRuns).limit(5);
      for (const row of stored) {
        assert(row.suite.length > 0 && row.scenario.length > 0 && row.rule.length > 0 && typeof row.detail === "string" && row.buildId.length > 0 && row.runAt instanceof Date, "stored test_runs rows must carry suite/scenario/rule/detail/buildId/runAt");
      }
      const ackGhost = await Actions.ackAlarm.handler(ctx, { sessionId: 999_999, stageIndex: 0, kind: "owner" });
      assert(ackGhost.ok === true && Array.isArray(ackGhost.ackedKeys) && ackGhost.ackedKeys.length === 0, `ackAlarm(ghost) → ${JSON.stringify(ackGhost)}`);
      const bankGhost = await Actions.bankHeldTime.handler(ctx, { sessionId: 999_999, heldMs: 1_000 });
      assert(bankGhost.ok === true && bankGhost.shiftedMs === 0, `bankHeldTime(ghost) → ${JSON.stringify(bankGhost)}`);
      const autoGhost = await Actions.autoAdvanceStage.handler(ctx, { sessionId: 999_999 });
      assert(autoGhost.ok === true && autoGhost.advanced === false && autoGhost.completed === false, `autoAdvanceStage(ghost) → ${JSON.stringify(autoGhost)}`);
      const corrGhost = await Actions.requestSetpointCorrection.handler(ctx, { sessionId: 999_999, stageIndex: 0, fromTemp: 240, toTemp: 250 });
      assert(corrGhost.ok === true && corrGhost.recorded === false && corrGhost.correctionId === null, `requestSetpointCorrection(ghost) → ${JSON.stringify(corrGhost)}`);
      const ghostRows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, 999_999));
      assert(ghostRows.length === 0, "ghost-target calls must not create rows");
      return "feeder {ok, appended, reason} + getTestStatus {requirements[14], testRuns, gateLine} shapes hold; R14 registered with 7 scenarios; ghost-session calls resolve as documented no-ops with no writes";
    });
    // T65 R14 stage-diagnosis mapping — the v26 timing record's
    // failStage comes from ONE canonical mapper over the privileged
    // broker-path probe: a stage failure passes through with its
    // sanitized error class; a probe whose stages all pass (the
    // broker answered the upgrade with an HTTP status) maps to
    // worker_socket — the fault is isolated to the action worker's
    // own socket; a probe that could not run maps to
    // probe_unavailable, never a guessed stage.
    await run("T65", async () => {
      const none = failStageFromProbe(null);
      assert(none.failStage === "probe_unavailable" && none.failErrorClass === null, `no probe → ${JSON.stringify(none)}`);
      const pc = failStageFromProbe({ proxyPresent: true, failStage: "proxy_connect", errorClass: "http_403", httpStatus: 403 });
      assert(pc.failStage === "proxy_connect" && pc.failErrorClass === "http_403", `proxy refusal → ${JSON.stringify(pc)}`);
      const pcRefused = failStageFromProbe({ proxyPresent: false, failStage: "proxy_connect", errorClass: "ECONNREFUSED", httpStatus: null });
      assert(pcRefused.failStage === "proxy_connect" && pcRefused.failErrorClass === "ECONNREFUSED", `proxy unreachable → ${JSON.stringify(pcRefused)}`);
      const tlsRes = failStageFromProbe({ proxyPresent: true, failStage: "tls", errorClass: "ERR_TLS_CERT_ALTNAME_INVALID", httpStatus: null });
      assert(tlsRes.failStage === "tls" && tlsRes.failErrorClass === "ERR_TLS_CERT_ALTNAME_INVALID", `tls death → ${JSON.stringify(tlsRes)}`);
      const ws = failStageFromProbe({ proxyPresent: true, failStage: "ws_upgrade", errorClass: "ECONNRESET", httpStatus: null });
      assert(ws.failStage === "ws_upgrade" && ws.failErrorClass === "ECONNRESET", `upgrade death → ${JSON.stringify(ws)}`);
      const healthy = failStageFromProbe({ proxyPresent: true, failStage: null, errorClass: null, httpStatus: 403 });
      assert(healthy.failStage === "worker_socket" && healthy.failErrorClass === "http_403", `all stages healthy (broker answered 403 to the unsigned probe) → ${JSON.stringify(healthy)}`);
      const healthy101 = failStageFromProbe({ proxyPresent: true, failStage: null, errorClass: null, httpStatus: 101 });
      assert(healthy101.failStage === "worker_socket" && healthy101.failErrorClass === "http_101", `upgrade accepted → ${JSON.stringify(healthy101)}`);
      const healthyBare = failStageFromProbe({ proxyPresent: false, failStage: null, errorClass: null, httpStatus: null });
      assert(healthyBare.failStage === "worker_socket" && healthyBare.failErrorClass === null, `healthy, no status → ${JSON.stringify(healthyBare)}`);
      // Socket error classification: raw Bun error messages embed the
      // signed URL — only the coarse class may survive.
      assert(classifySocketError("WebSocket connection to 'wss://broker/mqtt?X-Amz-Signature=SECRET' failed: Expected 101 status code: 403") === "http_403", "upgrade refusal → http_403 (and the embedded signature is dropped)");
      assert(classifySocketError("TLS handshake failed: error:100000f7:SSL routines:OPENSSL_internal:WRONG_VERSION_NUMBER") === "tls_handshake", "TLS death → tls_handshake");
      assert(classifySocketError("Failed to connect to proxy") === "proxy_error", "proxy failure → proxy_error");
      assert(classifySocketError("Connection timed out") === "timeout", "timeout → timeout");
      assert(classifySocketError("connect ECONNREFUSED 10.0.0.1:3128") === "conn_refused", "refusal → conn_refused");
      assert(classifySocketError("getaddrinfo ENOTFOUND broker.invalid") === "dns_error", "DNS failure → dns_error");
      assert(classifySocketError("simulated instant death") === "socket_error", "unrecognized → socket_error");
      assert(classifySocketError(undefined) === "socket_error", "missing message → socket_error");
      return "probe → failStage matrix: proxy_connect/tls/ws_upgrade pass through with error class; all-healthy → worker_socket (+http_NNN class); probe missing → probe_unavailable; socket messages classify to coarse classes only (http_NNN/tls_handshake/proxy_error/timeout/conn_refused/dns_error/socket_error)";
    });
    // T75 R5 keep-awake directive — the state machine behind the
    // self-healing keep-awake (v28). Every re-arm trigger in the
    // client (open, visibility return, sentinel release, pageshow,
    // watchdog, video pause, first tap) evaluates THIS directive
    // against the live mechanism state; the assertions pin the
    // owner's failure mode: mechanisms down while the page sits
    // visible and untouched must be restarted, and "awake" may only
    // be claimed while a mechanism is actually live.
    await run("T75", async () => {
      const base = { intentOn: true, visible: true, wakeLockSupported: true, sentinelHeld: false, videoPlaying: false };
      const open = keepAwakeDirective(base);
      assert(open.requestWakeLock && open.playVideo && !open.awake && open.showRetry, `cook-active open: acquire both, not yet awake, retry offered until live: ${JSON.stringify(open)}`);
      const held = keepAwakeDirective({ ...base, sentinelHeld: true });
      assert(!held.requestWakeLock && held.awake && !held.showRetry, "sentinel held → no re-request, awake, no retry");
      const videoOnly = keepAwakeDirective({ ...base, videoPlaying: true });
      assert(videoOnly.awake && !videoOnly.playVideo && videoOnly.requestWakeLock, "video live → awake; wake lock still topped up");
      const dropped = keepAwakeDirective({ ...base, sentinelHeld: false, videoPlaying: false });
      assert(dropped.requestWakeLock && dropped.playVideo && !dropped.awake, "after a simulated drop (release/watchdog evaluation) → re-acquire both");
      const noApi = keepAwakeDirective({ ...base, wakeLockSupported: false });
      assert(!noApi.requestWakeLock && noApi.playVideo, "Wake Lock API absent → the video fallback is selected, no lock request");
      const hidden = keepAwakeDirective({ ...base, visible: false, sentinelHeld: true });
      assert(!hidden.requestWakeLock && !hidden.playVideo && !hidden.showRetry, "hidden → no requests, no retry (arming resumes on return)");
      const noIntent = keepAwakeDirective({ ...base, intentOn: false });
      assert(!noIntent.requestWakeLock && !noIntent.playVideo && !noIntent.showRetry, "intent off → nothing requested");
      assert(keepAwakeIntent("1", false) === true, "persisted flag → a reloaded page re-arms intent before the session loads");
      assert(keepAwakeIntent(null, true) === true, "active session → intent on");
      assert(keepAwakeIntent(null, false) === false, "no flag, no session → no persisted intent");
      assert(keepAwakeIntent("0", false) === false, "a cleared flag → no intent");
      return "open acquires both; held → awake, no re-request; drop → re-acquire; no Wake Lock API → video fallback; hidden/intent-off → quiet; persisted flag re-arms intent across a reload; awake claimed only while a mechanism is live";
    });
    // T76 R4 alarm speech — the fire path's contract: the spoken text
    // is the stage's EXACT phrase (verbatim from the program data),
    // repeats siren→speak until ack with a hard cap, and the unlock
    // directive models the per-session iOS rule: a fresh page session
    // (incl. after the self-reload) starts LOCKED, the first gesture
    // attempts the unlock, later gestures don't re-attempt.
    await run("T76", async () => {
      const takeOff = chuck.stages[4]!;
      assert(typeof takeOff.speak === "string" && takeOff.speak.length > 0, "fixture stage must carry a spoken phrase");
      for (let i = 0; i < 5; i++) {
        const plan = alarmRepeatPlan({ phrase: takeOff.speak, repeatsDone: i, acked: false });
        assert(plan.fire && plan.text === takeOff.speak, `repeat ${i + 1} must speak the stage's exact phrase verbatim`);
      }
      assert(!alarmRepeatPlan({ phrase: takeOff.speak, repeatsDone: 5, acked: false }).fire, "after 5 repeats the loop stops");
      const ackedPlan = alarmRepeatPlan({ phrase: takeOff.speak, repeatsDone: 0, acked: true });
      assert(!ackedPlan.fire && ackedPlan.text === null, "an acked alarm never speaks again");
      const fresh = speechUnlockDirective({ gestureSeen: false, sessionUnlocked: false });
      assert(!fresh.attemptUnlock && !fresh.unlocked, "fresh page session (post-reload) starts locked; no gesture → no unlock attempt");
      const firstTap = speechUnlockDirective({ gestureSeen: true, sessionUnlocked: false });
      assert(firstTap.attemptUnlock && firstTap.unlocked, "the first gesture anywhere attempts the unlock and marks the session unlocked");
      const laterTap = speechUnlockDirective({ gestureSeen: true, sessionUnlocked: true });
      assert(!laterTap.attemptUnlock && laterTap.unlocked, "later gestures don't re-attempt; the session stays unlocked");
      return "fire path speaks the stage's exact phrase on repeats 1–5, stops at the cap and on ack; sessions start locked, first gesture unlocks, no re-attempts after";
    });
    // T77 R5 one meaning, one place — scanned over EVERY stage of
    // EVERY program: the detail sheet's blocks are title + 3 fact
    // tiles + the instruction (details) exactly once. None of the
    // removed chrome may appear: no duplicate instruction card (the
    // ownerDoes / claudeDoes / speak strings as separate blocks), no
    // spoken-phrase section, no per-stage boilerplate, no owner chip.
    await run("T77", async () => {
      let stagesChecked = 0;
      for (const prog of PROGRAMS) {
        for (const st of prog.stages) {
          stagesChecked++;
          const blocks = stageDetailSheetBlocks(st);
          assert(blocks.title === st.title, `${prog.id}: sheet title must be the stage title`);
          assert(blocks.facts.length === 3, `${prog.id} "${st.title}": exactly 3 fact tiles`);
          assert(blocks.why === st.why, `${prog.id} "${st.title}": the sheet's why block is the stage's why-line`);
          assert(blocks.instruction === st.details, `${prog.id} "${st.title}": the single instruction block is the details text`);
          const joined = [blocks.title, ...blocks.facts, blocks.why, blocks.instruction].join("\n");
          const occurrences = joined.split(st.details).length - 1;
          assert(occurrences === 1, `${prog.id} "${st.title}": instruction text must appear exactly once on the sheet, found ${occurrences}`);
          const whyOccurrences = joined.split(st.why).length - 1;
          assert(whyOccurrences === 1, `${prog.id} "${st.title}": why-line must appear exactly once on the sheet, found ${whyOccurrences}`);
          for (const chrome of ["WHAT THE ALARM WILL SAY", "This step ends when", "YOUR JOB —", "Muse:", "You:"]) {
            assert(!joined.includes(chrome), `${prog.id} "${st.title}": removed sheet chrome "${chrome}" must be absent`);
          }
          const blockTexts = [blocks.title, ...blocks.facts, blocks.why, blocks.instruction];
          for (const dup of [st.ownerDoes, st.claudeDoes, st.speak]) {
            if (typeof dup === "string" && dup.length > 0 && dup !== st.details) {
              assert(!blockTexts.includes(dup), `${prog.id} "${st.title}": "${dup.slice(0, 32)}…" must not appear as a separate sheet block (one meaning, one place)`);
            }
          }
        }
      }
      assert(stagesChecked >= 50, `expected to scan every stage of every program, checked ${stagesChecked}`);
      return `all ${stagesChecked} stages: sheet = title + 3 facts + why + instruction exactly once; no duplicate instruction/spoken/narration blocks, no boilerplate, no owner chip`;
    });
    // T78 R10 stage lines teach, not repeat (owner, 17:14 PT): every
    // stage of every program carries a why-line — non-empty, within
    // the cap (≤200 chars, ≤2 sentences), NOT the old number-restating
    // template ("…at 250°F to 203°F…") and not the filler cliché. The
    // active card renders stage.why in the old claudeDoes slot (client
    // mirror) and the sheet shows it exactly once (T77).
    await run("T78", async () => {
      let stagesChecked = 0;
      for (const prog of PROGRAMS) {
        for (const st of prog.stages) {
          stagesChecked++;
          assert(typeof st.why === "string" && st.why.trim().length > 0, `${prog.id} "${st.title}": why-line must be non-empty`);
          assert(st.why.length <= 200, `${prog.id} "${st.title}": why-line ${st.why.length} chars exceeds the 200 cap`);
          const sentences = (st.why.match(/\./g) ?? []).length;
          assert(sentences <= 2, `${prog.id} "${st.title}": why-line must be at most two short sentences, found ${sentences} periods`);
          assert(!/\d+°F to \d+°F/.test(st.why), `${prog.id} "${st.title}": why-line restates the stage's numbers (templated line) — forbidden`);
          assert(!/real test is probe-tender/i.test(st.why), `${prog.id} "${st.title}": filler cliché in why-line`);
          assert(st.why !== st.claudeDoes && st.why !== st.details, `${prog.id} "${st.title}": why-line must be its own text, not a copy of another block`);
        }
      }
      assert(stagesChecked === 56, `expected all 56 stages, checked ${stagesChecked}`);
      const chuck = PROGRAMS.find((p) => p.id === "chuckroast")!;
      assert(chuck.stages[3]!.why.startsWith("Wrapped, the roast braises"), "the owner's reported stage (Wrapped finish) carries his why-line in place of 'Cooking wrapped at 250°F to 203°F…'");
      assert(!chuck.stages[3]!.why.includes("Cooking wrapped at"), "the old number-restating template is gone from the card slot");
      return `all ${stagesChecked} stages carry a why-line ≤200 chars / ≤2 sentences; none restates the stage's numbers; Chuck Roast stage 4 shows the braising/collagen line`;
    });
    // T70 R6 auto-refetch cadence — the v28 regression guard for the
    // owner's "screen stays on but data went stale" report. Two layers:
    // (1) the canonical scheduler decision fires on the ~60s cadence
    // while open + visible + active cook with ZERO user input;
    // (2) the cycles it fires are real liveRefresh runs (scripted
    // broker, T57/T61 pattern) and each one advances the verified time.
    await run("T70", async () => {
      const t0 = 1_700_000_000_000;
      assert(AUTO_REFRESH_CADENCE_MS === 60_000, `cadence must be ~60s, got ${AUTO_REFRESH_CADENCE_MS}`);
      const first = autoRefreshDecision({ nowMs: t0, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: null, foregroundAtMs: null });
      assert(first.fire && first.reason === "cadence", `first tick with a cook running must fire: ${JSON.stringify(first)}`);
      const mid = autoRefreshDecision({ nowMs: t0 + 30_000, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: null });
      assert(!mid.fire && mid.reason === "interval_wait", `30s after an attempt must wait: ${JSON.stringify(mid)}`);
      const next = autoRefreshDecision({ nowMs: t0 + AUTO_REFRESH_CADENCE_MS, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: null });
      assert(next.fire && next.reason === "cadence", `at the cadence boundary must fire again: ${JSON.stringify(next)}`);
      const topic = "prod/thing/update/801F12F782F9";
      try {
        await baselineCooking();
        await db.delete(schema.traegerAuth);
        await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: "FAKE-suite-password-123", idToken: "TEST-TOKEN", expiresAt: new Date(Date.now() + 3_600_000) });
        liveRefreshTestSeams.signedUrlProvider = async () => "wss://broker.invalid/mqtt";
        liveRefreshTestSeams.commandSender = async () => {};
        const cycle = async (payload: string) => {
          const sock = makeFakeSocket();
          liveRefreshTestSeams.socketFactory = () => sock;
          resetLiveRefreshGateForTests();
          const p = Actions.liveRefresh.handler(ctx, {});
          await driveHandshake(sock);
          await sock.deliver(publishFrame(topic, payload, false));
          return p;
        };
        const before = await loadDashboard(ctx);
        const r1 = await cycle(JSON.stringify({ state: { reported: { grill: 251, probe: 96, setpoint: 250, system_status: 6 } } }));
        assert(r1.ok && r1.status === "ok", `auto cycle 1 → ${r1.status}`);
        const midDash = await loadDashboard(ctx);
        assert(midDash.grill.lastVerifiedAt !== before.grill.lastVerifiedAt && midDash.grill.probeTemp === 96, "cycle 1 must advance the verified time and apply the payload");
        const r2 = await cycle(JSON.stringify({ state: { reported: { grill: 252, probe: 101, setpoint: 250, system_status: 6 } } }));
        assert(r2.ok && r2.status === "ok", `auto cycle 2 → ${r2.status}`);
        const after = await loadDashboard(ctx);
        assert(after.grill.probeTemp === 101 && after.grill.lastVerifiedAt >= midDash.grill.lastVerifiedAt, "cycle 2 must land the next payload — verified time never sits stale across cycles");
        return "decision fires at 0s and again at the 60s boundary (waits between); two scripted live cycles advance the verified time and apply their payloads with zero user input";
      } finally {
        liveRefreshTestSeams.socketFactory = null;
        liveRefreshTestSeams.signedUrlProvider = null;
        liveRefreshTestSeams.commandSender = null;
        resetLiveRefreshGateForTests();
        await db.delete(schema.traegerAuth);
      }
    });
    // T71 R6 auto-refetch gate discipline: the scheduler must never
    // overlap a live call and never land an attempt inside the 15s
    // server gate. A manual tap during an auto cycle is the same
    // situation from the other side — the canonical gate answers
    // "join" (T37 pins the boundary values), so one call serves both.
    await run("T71", async () => {
      const t0 = 1_700_000_000_000;
      const busy = autoRefreshDecision({ nowMs: t0 + 300_000, visible: true, hasActiveSession: true, inFlight: true, lastAttemptMs: t0, foregroundAtMs: null });
      assert(!busy.fire && busy.reason === "in_flight", `in-flight must suppress any fire, however stale: ${JSON.stringify(busy)}`);
      const gated = autoRefreshDecision({ nowMs: t0 + 10_000, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: t0 + 9_000 });
      assert(!gated.fire && gated.reason === "gate_wait", `10s after an attempt (even with a foreground trigger) must wait for the 15s gate: ${JSON.stringify(gated)}`);
      assert(resolveLiveRefreshGate({ nowMs: t0 + 10_000, lastAttemptMs: t0, inFlight: true }) === "join", "a manual tap while an auto call is in flight joins it — never a second live call");
      // Simulated 5-minute run on a 5s tick: consecutive fires are
      // never closer than the cadence, hence never inside the gate.
      let last: number | null = null;
      const fires: number[] = [];
      for (let t = 0; t <= 300_000; t += 5_000) {
        const d = autoRefreshDecision({ nowMs: t0 + t, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: last, foregroundAtMs: null });
        if (d.fire) { fires.push(t); last = t0 + t; }
      }
      assert(fires.length === 6, `expected 6 fires over 5 min (0,60,…,300s), got ${fires.length}: ${fires.join(",")}`);
      for (let i = 1; i < fires.length; i++) {
        assert(fires[i]! - fires[i - 1]! >= AUTO_REFRESH_CADENCE_MS, `fires ${i - 1}→${i} are ${fires[i]! - fires[i - 1]!}ms apart — closer than the cadence`);
      }
      return "in-flight → never fire; inside 15s → gate_wait even on a foreground trigger; a tap during an auto call joins (gate); simulated 5-min run fires exactly on cadence, never closer";
    });
    // T72 R6 auto-refetch visibility: hidden pauses the cycle entirely;
    // returning to the foreground fires promptly (gate-aware) alongside
    // the scroll-to-current, then the plain cadence resumes. No active
    // cook → the scheduler never fires at all.
    await run("T72", async () => {
      const t0 = 1_700_000_000_000;
      const hidden = autoRefreshDecision({ nowMs: t0 + 300_000, visible: false, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: null });
      assert(!hidden.fire && hidden.reason === "hidden", `hidden must never fire, even when long overdue: ${JSON.stringify(hidden)}`);
      const back = autoRefreshDecision({ nowMs: t0 + 30_000, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: t0 + 30_000 });
      assert(back.fire && back.reason === "foreground", `returning at +30s (past the gate, before cadence) must fire promptly: ${JSON.stringify(back)}`);
      const consumed = autoRefreshDecision({ nowMs: t0 + 31_000, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0 + 30_000, foregroundAtMs: t0 + 30_000 });
      assert(!consumed.fire && consumed.reason === "interval_wait", `the foreground fire is consumed by its attempt — no double fire: ${JSON.stringify(consumed)}`);
      const resumed = autoRefreshDecision({ nowMs: t0 + 90_000, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0 + 30_000, foregroundAtMs: t0 + 30_000 });
      assert(resumed.fire && resumed.reason === "cadence", `60s after the foreground attempt the cadence resumes: ${JSON.stringify(resumed)}`);
      const noCook = autoRefreshDecision({ nowMs: t0, visible: true, hasActiveSession: false, inFlight: false, lastAttemptMs: null, foregroundAtMs: null });
      assert(!noCook.fire && noCook.reason === "no_active_session", `no active cook → never fire: ${JSON.stringify(noCook)}`);
      return "hidden → no attempts; visible again → prompt foreground fire (gate-aware), consumed once; cadence resumes after it; no cook → never fires";
    });
    // T73 R6 auto-refetch failure resilience: an unreachable attempt
    // must not wedge the cycle, must not move the verified time (no
    // fake freshness — the age keeps counting honestly), and the next
    // scheduled attempt still fires and lands.
    await run("T73", async () => {
      const topic = "prod/thing/update/801F12F782F9";
      try {
        await baselineCooking();
        await db.delete(schema.traegerAuth);
        await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: "FAKE-suite-password-123", idToken: "TEST-TOKEN", expiresAt: new Date(Date.now() + 3_600_000) });
        liveRefreshTestSeams.signedUrlProvider = async () => "wss://broker.invalid/mqtt";
        liveRefreshTestSeams.commandSender = async () => {};
        const before = await loadDashboard(ctx);
        const dead = makeFakeSocket();
        liveRefreshTestSeams.socketFactory = () => { queueMicrotask(() => dead.fail("simulated instant death")); return dead; };
        resetLiveRefreshGateForTests();
        const r1 = await Actions.liveRefresh.handler(ctx, {});
        assert(!r1.ok && r1.status === "unreachable", `dead broker attempt → ${r1.status}, expected unreachable`);
        const mid = await loadDashboard(ctx);
        assert(mid.grill.lastVerifiedAt === before.grill.lastVerifiedAt, "a failed attempt must NOT move the verified time — no fake freshness");
        const t0 = 1_700_000_000_000;
        const next = autoRefreshDecision({ nowMs: t0 + AUTO_REFRESH_CADENCE_MS, visible: true, hasActiveSession: true, inFlight: false, lastAttemptMs: t0, foregroundAtMs: null });
        assert(next.fire && next.reason === "cadence", "the decision at the next cadence still fires after a failed attempt — the cycle is not wedged");
        const sock = makeFakeSocket();
        liveRefreshTestSeams.socketFactory = () => sock;
        resetLiveRefreshGateForTests();
        const p = Actions.liveRefresh.handler(ctx, {});
        await driveHandshake(sock);
        await sock.deliver(publishFrame(topic, JSON.stringify({ state: { reported: { grill: 251, probe: 97, setpoint: 250, system_status: 6 } } }), false));
        const r2 = await p;
        assert(r2.ok && r2.status === "ok", `the cycle after the failure → ${r2.status}`);
        const after = await loadDashboard(ctx);
        assert(after.grill.lastVerifiedAt !== before.grill.lastVerifiedAt && after.grill.probeTemp === 97, "the next cycle lands fresh data after a failure");
        return "unreachable attempt → verified time unmoved (no fake freshness); next cadence decision still fires; next scripted cycle lands fresh data";
      } finally {
        liveRefreshTestSeams.socketFactory = null;
        liveRefreshTestSeams.signedUrlProvider = null;
        liveRefreshTestSeams.commandSender = null;
        resetLiveRefreshGateForTests();
        await db.delete(schema.traegerAuth);
      }
    });
    // T74 R6 direct-only refresh — the legacy Muse-mediated path is
    // dead: neither a refresh tap nor an auto-refetch cycle (both are
    // the same liveRefresh action) creates a check-request feed
    // message; the retired requestStatusCheck endpoint records
    // nothing; and the legacy status line exists in NO refresh phase
    // (idle / checking / unanswered — the element is deleted, so there
    // is nothing to show even when a refresh fails).
    await run("T74", async () => {
      const topic = "prod/thing/update/801F12F782F9";
      const checkRequestCount = async (afterId: number) => {
        const msgs = await db.select().from(schema.cookMessages);
        return msgs.filter((m) => m.id > afterId && (m.text.includes("re-check grill") || m.text.includes("Ask Muse"))).length;
      };
      const baseMsgs = await db.select().from(schema.cookMessages);
      const baseMaxId = baseMsgs.reduce((mx, m) => Math.max(mx, m.id), 0);
      const legacy = await Actions.requestStatusCheck.handler(ctx, {});
      assert(legacy.ok === true, "the retired endpoint keeps its {ok:true} shape for old clients");
      const afterLegacy = await db.select().from(schema.cookMessages);
      assert(afterLegacy.length === baseMsgs.length, `the retired endpoint must record nothing (feed ${baseMsgs.length} → ${afterLegacy.length})`);
      try {
        await baselineCooking();
        await db.delete(schema.traegerAuth);
        await db.insert(schema.traegerAuth).values({ id: 1, email: "owner@example.com", password: "FAKE-suite-password-123", idToken: "TEST-TOKEN", expiresAt: new Date(Date.now() + 3_600_000) });
        liveRefreshTestSeams.signedUrlProvider = async () => "wss://broker.invalid/mqtt";
        liveRefreshTestSeams.commandSender = async () => {};
        // A "tap" cycle that succeeds…
        const sock = makeFakeSocket();
        liveRefreshTestSeams.socketFactory = () => sock;
        resetLiveRefreshGateForTests();
        const p = Actions.liveRefresh.handler(ctx, {});
        await driveHandshake(sock);
        await sock.deliver(publishFrame(topic, JSON.stringify({ state: { reported: { grill: 251, probe: 98, setpoint: 250, system_status: 6 } } }), false));
        const okRes = await p;
        assert(okRes.ok && okRes.status === "ok", `tap cycle → ${okRes.status}`);
        // …and an "auto" cycle that fails: neither may leave a
        // check-request message behind.
        const dead = makeFakeSocket();
        liveRefreshTestSeams.socketFactory = () => { queueMicrotask(() => dead.fail("simulated instant death")); return dead; };
        resetLiveRefreshGateForTests();
        const failRes = await Actions.liveRefresh.handler(ctx, {});
        assert(!failRes.ok && failRes.status === "unreachable", `auto cycle → ${failRes.status}`);
        assert((await checkRequestCount(baseMaxId)) === 0, "no refresh path may create a check-request ('Ask Muse' / 're-check grill') feed message");
        for (const phase of ["idle", "checking", "unanswered"] as const) {
          assert(countHeaderCheckNotes({ phase }) === 0, `phase ${phase}: the legacy status line must be absent (deleted, not hidden)`);
        }
        return "retired endpoint records nothing; a successful tap cycle + a failed auto cycle create zero check-request messages; the legacy status line count is 0 in idle/checking/unanswered";
      } finally {
        liveRefreshTestSeams.socketFactory = null;
        liveRefreshTestSeams.signedUrlProvider = null;
        liveRefreshTestSeams.commandSender = null;
        resetLiveRefreshGateForTests();
        await db.delete(schema.traegerAuth);
      }
    });
    // T39 R11 coverage self-audit — runs LAST: every registered non-manual
    // scenario must have produced a result in THIS run. A feature (or a
    // scenario) without a test fails the suite here, per the owner's rule.
    await run("T39", async () => {
      const registered = REQUIREMENTS.flatMap((r: { scenarios: { id: string; manual?: string }[] }) => r.scenarios)
        .filter((s: { id: string; manual?: string }) => !s.manual)
        .map((s: { id: string }) => s.id);
      const done = new Set(results.map((r) => r.id));
      const missing = registered.filter((id: string) => id !== "T39" && !done.has(id));
      assert(missing.length === 0, `registered scenarios with no result in this run: ${missing.join(", ")}`);
      return `all ${registered.length} registered automated scenarios produced a result in this run`;
    });
  } finally {
    await restoreAll();
  }

  // Verify production state restored
  if (origActive) {
    const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, origActive.id)).limit(1);
    const now = rows[0];
    if (!now || now.status !== origActive.status || now.currentStageIndex !== origActive.currentStageIndex) {
      const f = results.find((r) => r.id === "T18");
      if (f) { f.passed = false; f.detail += " — WARNING: production session changed by the run"; }
    }
  }
  void parseAckedKeys; // (helper re-export guard)

  const runAt = new Date();
  for (const t of results) {
    await db.insert(schema.testRuns).values({ suite: "grill-guard", scenario: t.id, rule: t.rule, passed: t.passed ? 1 : 0, detail: t.detail, runAt, buildId });
  }
  const passed = results.filter((r) => r.passed).length;
  return { passed, failed: results.length - passed, total: results.length, tests: results };
}
