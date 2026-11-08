import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import keepAwakeLoopUrl from "./assets/keepawake-loop.mp4";

type Dashboard = ApiResponse<typeof api, "getDashboard">;
type Program = Dashboard["programs"][number];
type Stage = Program["stages"][number];

type AlarmInfo = { key: string; headline: string; body: string; phrase: string; isTest: boolean; kind: "owner" | "expired" };

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtDur(min: number): string {
  if (min >= 60) { const h = Math.floor(min / 60); const m = min % 60; return m ? `${h}h ${m}m` : `${h}h`; }
  return `${min}m`;
}
// Canonical probe-estimate line — mirrors formatProbeEstimateLine in
// server actions (guarded by test T51). The text is rendered inside a
// truncating element, so it can never wrap to a second line and grow
// the active stage card when a refresh updates the estimate.
// LIVE tick-down (v27): a dynamic estimate is anchored at the newest
// reading behind it (asOf) and ticks down every second between data
// arrivals — liveProbeSecondsLeft mirrors tickDownEstimateSeconds in
// server actions (guarded by T67). Every fresh dashboard/poll
// re-anchors it. At zero with the probe still short of target the line
// holds at "≈0 left — any moment", never negative; a stall never ticks.
function liveProbeSecondsLeft(timeLeftSeconds: number, asOfIso: string | null, nowMs: number): number {
  if (asOfIso == null) return timeLeftSeconds;
  const asOfMs = Date.parse(asOfIso);
  if (Number.isNaN(asOfMs)) return timeLeftSeconds;
  const elapsedSec = Math.max(0, Math.floor((nowMs - asOfMs) / 1000));
  return Math.max(0, timeLeftSeconds - elapsedSec);
}
function probeEstimateLineText(
  estimate: Dashboard["probeEstimate"],
  nominalLeftSeconds: number,
  stageStartProbe: number | null,
  currentProbeTemp: number,
  nowMs: number,
  probeTarget: number | null,
): string {
  let main: string;
  if (estimate?.state === "dynamic" && estimate.timeLeftSeconds != null) {
    const live = liveProbeSecondsLeft(estimate.timeLeftSeconds, estimate.asOf, nowMs);
    if (live <= 0 && probeTarget != null && (estimate.probeTemp ?? currentProbeTemp) < probeTarget) {
      main = `≈0 left — any moment (est. from last ${estimate.windowMinutes ?? 10} min)`;
    } else {
      main = `≈${fmtCountdown(live * 1000)} left (est. from last ${estimate.windowMinutes ?? 10} min)`;
    }
  } else if (estimate?.state === "stall") {
    main = `— left · probe steady at ${estimate.probeTemp ?? currentProbeTemp}° (stall)`;
  } else if (estimate?.state === "learning") {
    main = "— left · learning this stage's pace";
  } else {
    main = `${fmtCountdown((estimate?.timeLeftSeconds ?? nominalLeftSeconds) * 1000)} left (est.)`;
  }
  return stageStartProbe != null ? `${main} · started at ${stageStartProbe}°` : main;
}
// Canonical scroll-to-current-stage decision — mirrors
// shouldScrollToCurrentStageKey in server actions (guarded by T68).
// Keyed by (open/foreground generation, session, stage): the cook view
// scrolls to the current stage card exactly once per open or return to
// the foreground; polls, refreshes and re-renders never re-scroll.
function shouldScrollToCurrentStageKey(generation: number, sessionId: number | null, stageIndex: number | null, lastKey: string | null): { scroll: boolean; key: string | null } {
  if (sessionId == null || stageIndex == null) return { scroll: false, key: null };
  const key = `${generation}:${sessionId}:${stageIndex}`;
  return { scroll: key !== lastKey, key };
}
// Canonical auto-refetch decision — mirrors autoRefreshDecision in
// server actions (guarded by T70–T73). While the app is open and
// VISIBLE with an active cook, the scheduler fires the live refresh on
// a ~60s cadence; hidden pauses it; a return to the foreground fires
// promptly once the 15s gate allows; an in-flight live call (auto or
// manual) is never duplicated — the server's gate joins them. A failed
// attempt records only the attempt time, so the next cadence tick
// fires on schedule regardless (failure can never wedge the cycle).
const AUTO_REFRESH_CADENCE_MS = 60_000;
const LIVE_REFRESH_MIN_INTERVAL_MS = 15_000;
type AutoRefreshReason = "cadence" | "foreground" | "hidden" | "no_active_session" | "in_flight" | "gate_wait" | "interval_wait";
function autoRefreshDecision(input: {
  nowMs: number;
  visible: boolean;
  hasActiveSession: boolean;
  inFlight: boolean;
  lastAttemptMs: number | null;
  foregroundAtMs: number | null;
}): { fire: boolean; reason: AutoRefreshReason } {
  if (!input.visible) return { fire: false, reason: "hidden" };
  if (!input.hasActiveSession) return { fire: false, reason: "no_active_session" };
  if (input.inFlight) return { fire: false, reason: "in_flight" };
  const sinceAttemptMs = input.lastAttemptMs == null ? null : input.nowMs - input.lastAttemptMs;
  // gate_wait only while a foreground fire is pending but blocked by
  // the 15s gate; once consumed, the plain cadence regime applies
  // (interval_wait) — mirrors the server canonical, guarded by T72.
  const foregroundPending = input.foregroundAtMs != null && (input.lastAttemptMs == null || input.lastAttemptMs < input.foregroundAtMs);
  if (foregroundPending) {
    if (sinceAttemptMs != null && sinceAttemptMs < LIVE_REFRESH_MIN_INTERVAL_MS) return { fire: false, reason: "gate_wait" };
    return { fire: true, reason: "foreground" };
  }
  if (sinceAttemptMs == null || sinceAttemptMs >= AUTO_REFRESH_CADENCE_MS) return { fire: true, reason: "cadence" };
  return { fire: false, reason: "interval_wait" };
}
// Canonical keep-awake heal decision — mirrors keepAwakeDirective in
// server actions (guarded by T75). Every heal trigger (mount, watchdog,
// visibility return, pageshow, sentinel release, first gesture) asks
// the same question: given what is actually held right now, which
// mechanisms need (re)starting? The header chip is honest because it
// keys off the same live held-state (wakeOn/videoOn), never off intent.
type KeepAwakeTrigger = "mount" | "watchdog" | "visible" | "pageshow" | "release" | "gesture";
function keepAwakeDirective(input: {
  trigger: KeepAwakeTrigger;
  wakeLockSupported: boolean;
  wakeLockHeld: boolean;
  videoPlaying: boolean;
  visible: boolean;
}): { acquireWakeLock: boolean; playVideo: boolean; anyLive: boolean } {
  const anyLive = input.wakeLockHeld || input.videoPlaying;
  if (!input.visible) return { acquireWakeLock: false, playVideo: false, anyLive };
  return {
    acquireWakeLock: input.wakeLockSupported && !input.wakeLockHeld,
    playVideo: !input.videoPlaying,
    anyLive,
  };
}
// Canonical keep-awake intent — mirrors keepAwakeIntent in server
// actions (guarded by T75): the localStorage flag written while a
// cook is active makes the intent survive the R13 self-reload; an
// active session alone also implies it.
function keepAwakeIntent(storedFlag: string | null, hasActiveSession: boolean): boolean {
  return storedFlag === "1" || hasActiveSession;
}
// Canonical alarm repeat plan — mirrors alarmRepeatPlan in server
// actions (guarded by T76): the fire loop's cadence lives here so the
// exact-phrase / cap / ack behavior is the tested behavior.
const ALARM_MAX_REPEATS = 5;
function alarmRepeatPlan(input: { phrase: string; repeatsDone: number; acked: boolean }): { speak: boolean; phrase: string } {
  if (input.acked) return { speak: false, phrase: "" };
  if (!input.phrase) return { speak: false, phrase: "" };
  if (input.repeatsDone >= ALARM_MAX_REPEATS) return { speak: false, phrase: "" };
  return { speak: true, phrase: input.phrase };
}
// Canonical speech-unlock decision — mirrors speechUnlockDirective in
// server actions (guarded by T76). A fresh document (mount or R13
// self-reload) always starts locked; the first gesture attempts the
// unlock exactly once; later gestures don't re-attempt.
function speechUnlockDirective(input: { gestureSeen: boolean; sessionUnlocked: boolean }): { attemptUnlock: boolean; unlocked: boolean } {
  if (input.sessionUnlocked) return { attemptUnlock: false, unlocked: true };
  if (!input.gestureSeen) return { attemptUnlock: false, unlocked: false };
  return { attemptUnlock: true, unlocked: true };
}
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
function fmtVerified(raw: string): string {
  if (!raw.includes("T")) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";
}
// App section lines — mirror appSectionLines / formatPtDateTime in
// server actions (guarded by T52/T53): "Nov 7, 2026 · 3:23pm PT" in the
// owner's timezone; the History view renders these three lines FIRST.
function fmtPtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} · ${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()} PT`;
}
function appSectionLines(info: { versionLabel: string; buildId: string; builtAtISO: string; testsPassed: number; testsTotal: number; testsLastRunAtISO: string | null }): string[] {
  const tests = info.testsLastRunAtISO == null || info.testsTotal === 0
    ? "Tests: not run yet"
    : `Tests: ${info.testsPassed}/${info.testsTotal} passed · ${fmtPtDateTime(info.testsLastRunAtISO)}`;
  return [`${info.versionLabel} · ${info.buildId}`, `Built ${fmtPtDateTime(info.builtAtISO)}`, tests];
}
function parseVerifiedMs(raw: string): number | null {
  const cleaned = raw.replace(/\s+(PT|PST|PDT)$/i, "").trim();
  const t = Date.parse(cleaned);
  return Number.isNaN(t) ? null : t;
}
// Full snapshot-age label — includes its own suffix, never append " ago"
// at the call site. Keep in sync with formatSnapshotAge in server actions
// (guarded by test T31): <45s "just now", then "N min ago" (N ≥ 1),
// then "1 hr ago" / "N hr ago" style.
function fmtAgeShort(ageMs: number): string {
  if (ageMs < 45_000) return "just now";
  const min = Math.max(1, Math.floor(ageMs / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) {
    if (rem === 0) return h === 1 ? "1 hr ago" : `${h} hr ago`;
    return `${h} hr ${rem} min ago`;
  }
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}
// Canonical refresh-feedback resolution — mirrors resolveCheckFeedback in
// server actions (guarded by tests T13 + T32). A refresh tap's pending
// state is "checking" for up to 90 seconds while no snapshot at/after
// the tap has landed; past that it is "unanswered" — spinner off and a
// fresh tap allowed, so the checking state can NEVER stick. No status
// line is rendered in ANY phase (v28: the legacy note element is
// deleted); refresh state shows only in the refresh indicator + age.
const CHECK_RESPONSE_WINDOW_MS = 90_000;
function resolveCheckFeedback(input: { requestedAtMs: number | null; snapshotVerifiedMs: number | null; nowMs: number }): { phase: "idle" | "checking" | "unanswered"; canRequest: boolean } {
  const { requestedAtMs, snapshotVerifiedMs, nowMs } = input;
  if (requestedAtMs == null) return { phase: "idle", canRequest: true };
  if (snapshotVerifiedMs != null && snapshotVerifiedMs >= requestedAtMs) return { phase: "idle", canRequest: true };
  if (nowMs - requestedAtMs < CHECK_RESPONSE_WINDOW_MS) return { phase: "checking", canRequest: false };
  return { phase: "unanswered", canRequest: true };
}
// Canonical theme resolution — mirrors resolveThemePreference in server
// actions (guarded by test T33): a saved manual choice wins; anything
// else follows the phone's system preference.
function resolveThemePreference(stored: string | null, systemPrefersLight: boolean): "light" | "dark" {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersLight ? "light" : "dark";
}
// Build recovery (R13) — mirrors resolveBuildRecovery /
// shouldReloadForBuild in server actions (guarded by T55).
// CLIENT_BUILD_ID is the build THIS bundle was compiled from; it is set
// to the server's BUILD_ID by the build bump step. When the server's
// live build (appInfo.buildId) differs, this page is running stale code
// and reloads ONCE per server build to pick up the new bundle.
const CLIENT_BUILD_ID = "v28-auto-refetch";
function resolveBuildRecovery(clientBuildId: string | null, serverBuildId: string): "current" | "reload" {
  if (!clientBuildId) return "current";
  return clientBuildId === serverBuildId ? "current" : "reload";
}
function shouldReloadForBuild(clientBuildId: string | null, serverBuildId: string, alreadyReloadedFor: string | null): boolean {
  return resolveBuildRecovery(clientBuildId, serverBuildId) === "reload" && alreadyReloadedFor !== serverBuildId;
}

type GrillSnapLike = { systemStatus?: number; systemStateLabel?: string; cookIdPresent?: boolean; grillTemp: number; setpoint: number; connected: boolean };
function deriveGrillStateLabel(g: GrillSnapLike): string {
  const code = g.systemStatus ?? (g.connected ? 3 : 99);
  if (code === 99) return "Offline";
  if (code === 3) return "Idle";
  if (code === 5) return "Igniting";
  if (code === 6) return "Cooking";
  // For other codes, prefer a stored behavior label if it is already one of the derived ones.
  const stored = g.systemStateLabel ?? "";
  if (stored === "Cooking" || stored === "Heating" || stored === "Cooling down") return stored;
  const hasCook = Boolean(g.cookIdPresent);
  if (hasCook && g.grillTemp >= g.setpoint - 15) return "Cooking";
  if (hasCook && g.grillTemp < g.setpoint - 15) return "Heating";
  if (!hasCook && g.grillTemp > 150) return "Cooling down";
  if (stored) return stored;
  return `State ${code}`;
}

type TrendLike = { direction: "rising" | "falling" | "steady"; tone: "green" | "red" | "grey"; series: number[]; reference: number | null; windowMinutes?: number } | null;
function Sparkline({ trend, label }: { trend: TrendLike; label: string }) {
  if (!trend || trend.series.length < 2) return null;
  const w = 60; const h = 20; const pad = 2;
  const vals = trend.series;
  const ref = trend.reference;
  const all = ref != null ? [...vals, ref] : vals;
  let min = Math.min(...all); let max = Math.max(...all);
  if (max - min < 10) { min -= 5; max += 5; }
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, vals.length - 1);
  const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // Theme tokens (not raw hex) so the graph stays legible in light + dark;
  // green/red keep their expectation meaning in both themes.
  const color = trend.tone === "green" ? "var(--green)" : trend.tone === "red" ? "var(--red)" : "var(--dim)";
  const arrow = trend.direction === "rising" ? "▲" : trend.direction === "falling" ? "▼" : "▬";
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label} trend ${trend.direction}, last ${trend.windowMinutes ?? 30} minutes`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {ref != null && <line x1={pad} x2={w - pad} y1={y(ref)} y2={y(ref)} style={{ stroke: color }} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" />}
        <polyline points={pts} fill="none" style={{ stroke: color }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[11px] font-bold leading-none" style={{ color }}>{arrow}</span>
    </span>
  );
}

export function App() {
  const queryClient = useQueryClient();
  // Full dashboard: initial load + structural changes (mutations, view
  // switches). The 10s cadence runs on the LIGHT query below instead —
  // a refresh or poll must never haul the ~59KB full payload (programs,
  // history, test results) just to update temps.
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  // R13 build recovery: when the server's live build differs from the
  // build this bundle was compiled from, reload ONCE for that server
  // build (sessionStorage guard — no reload loop if the WebView keeps
  // serving the cached old bundle). This runs on load and again whenever
  // the dashboard refetches, including the visibility-change refresh —
  // a page left open across a redeploy restarts itself onto the new
  // build instead of running stale code forever.
  const serverBuildId = dash.data?.appInfo.buildId ?? null;
  const buildReloadRef = useRef(false);
  useEffect(() => {
    if (!serverBuildId || buildReloadRef.current) return;
    let already: string | null = null;
    try { already = window.sessionStorage.getItem("traeger-reloaded-for"); } catch { /* ignore */ }
    if (shouldReloadForBuild(CLIENT_BUILD_ID, serverBuildId, already)) {
      buildReloadRef.current = true;
      try { window.sessionStorage.setItem("traeger-reloaded-for", serverBuildId); } catch { /* ignore */ }
      window.location.reload();
    }
  }, [serverBuildId]);
  const light = useQuery({ queryKey: ["light"], queryFn: () => api.getLightDashboard({}), refetchInterval: 10000, enabled: dash.data != null });
  // Merge light results into the dashboard cache IN PLACE: only the
  // volatile fields are replaced, so React updates the changed values
  // (temps, trends, estimate, stage view) without remounting lists or
  // cards — zero layout shift, scroll position untouched.
  useEffect(() => {
    const l = light.data;
    if (!l) return;
    queryClient.setQueryData<Dashboard>(["dashboard"], (old) => (old ? {
      ...old,
      grill: l.grill, trends: l.trends, probeEstimate: l.probeEstimate,
      stageView: l.stageView, stageConditionMet: l.stageConditionMet,
      activeSession: l.activeSession, activeCorrection: l.activeCorrection,
      lastSelectedMeatId: l.lastSelectedMeatId, traegerAuth: l.traegerAuth,
    } : old));
  }, [light.data, queryClient]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Scroll-to-current-stage (R4 v27): generation 0 is this open; every
  // return to the foreground bumps it (see the visibility effect below).
  const [openGeneration, setOpenGeneration] = useState(0);
  const lastScrollKeyRef = useRef<string | null>(null);
  const activeStageCardRef = useRef<HTMLLIElement | null>(null);

  const [selectedId, setSelectedId] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem("traeger-last-meat");
      if (saved) return saved;
    } catch { /* ignore */ }
    return "chuckroast";
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showSpec, setShowSpec] = useState(false);
  const [confirmShutdown, setConfirmShutdown] = useState(false);
  const [ackedAlarms, setAckedAlarms] = useState<Set<string>>(new Set());
  const [testAlarm, setTestAlarm] = useState<AlarmInfo | null>(null);
  const [wakeOn, setWakeOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // Set once the load-time guard-suite run settles — the auto-refetch
  // scheduler stays quiet until then so its live calls can never race
  // the suite's hermetic gate/seam state (see the scheduler below).
  const [autoSuiteSettled, setAutoSuiteSettled] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Speech unlock (Item B): a fresh document — first load or the R13
  // self-reload — starts LOCKED on iOS: speechSynthesis silently drops
  // speak() until a user gesture unlocks it in THIS document. The first
  // pointerdown anywhere establishes it (speechUnlockDirective, T76).
  const speechUnlockedRef = useRef(false);
  const speechGestureRef = useRef(false);
  const keepAwakeGestureRef = useRef(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const startMut = useMutation({ mutationFn: (meatId: string) => api.startCook({ meatId }), onSuccess: invalidate });
  const advanceMut = useMutation({ mutationFn: (sessionId: number) => api.advanceStage({ sessionId }), onSuccess: invalidate });
  const [completionAlarm, setCompletionAlarm] = useState<AlarmInfo | null>(null);
  const autoAdvanceMut = useMutation({
    mutationFn: (sessionId: number) => api.autoAdvanceStage({ sessionId }),
    onSuccess: (res) => {
      invalidate();
      if (res.advanced && res.completed) {
        // A monitored final stage (e.g. Rest) finished the whole cook:
        // celebrate through the same siren + voice overlay.
        setCompletionAlarm({
          key: `cook-complete-${Date.now()}`,
          headline: "⏰ COOK COMPLETE",
          body: "The last step finished on its own — the cook is done.",
          phrase: "Igor, the cook is complete. Time to serve.",
          isTest: true, kind: "expired",
        });
      }
    },
  });
  const shutdownMut = useMutation({ mutationFn: (sessionId: number | null) => api.requestShutdown({ sessionId }), onSuccess: invalidate });
  // Refresh-path mutations refresh the LIGHT payload only (merged in
  // place above) — never the full dashboard.
  const refreshLight = () => { void queryClient.invalidateQueries({ queryKey: ["light"] }); };
  // R13 refresh watchdog: when the current tap's refresh chain started.
  // A call still pending 35s later is wedged (e.g. its socket hung
  // across a server swap during a redeploy) and gets abandoned — the
  // server's own live path caps at ~12s listen + a fast fallback write,
  // so no honest refresh ever runs this long.
  const refreshStartedRef = useRef<number | null>(null);
  // Direct refresh (R6, v28): the tap talks DIRECTLY to Traeger's API
  // via liveRefresh — there is no Muse-mediated check path anymore.
  // Every liveRefresh status is terminal for the tap: ok lands a fresh
  // snapshot; signin_needed / auth_failed surface the sign-in prompt;
  // unreachable / timeout / too_soon simply end (the timing record in
  // the light payload carries the diagnosis). Nothing records a
  // request for anyone, and no status line is ever rendered for a
  // refresh — state shows only in the single refresh indicator + age.
  const [signinNeeded, setSigninNeeded] = useState(false);
  const liveRefreshMut = useMutation({
    mutationFn: () => api.liveRefresh({}),
    onSuccess: (res) => {
      if (res.status === "ok") setSigninNeeded(false);
      if (res.status === "signin_needed" || res.status === "auth_failed") setSigninNeeded(true);
      refreshLight();
    },
    onError: () => { /* transport-level failure: pending state clears in onSettled; the age keeps counting honestly */ },
    onSettled: () => { refreshStartedRef.current = null; setPendingCheck(null); },
  });
  // Auto-refetch (R6, v28): the scheduler below fires this on cadence
  // while the app is open + visible with an active cook — the same
  // direct liveRefresh, no other path. An auto attempt that can't
  // complete simply ends, the checked-age keeps counting honestly, and
  // the next cadence tick fires on schedule. It deliberately does not
  // touch pendingCheck either: auto attempts never gate the refresh
  // button; a manual tap during an auto call joins the same
  // server-side in-flight call (gate, T37).
  const autoRefreshMut = useMutation({
    mutationFn: () => api.liveRefresh({}),
    onSuccess: (res) => {
      if (res.status === "signin_needed") { setSigninNeeded(true); return; }
      refreshLight();
    },
    onError: () => { /* transport-level failure: the cycle continues on cadence */ },
  });
  // Scheduler bookkeeping (refs — attempt timing must not re-render):
  // lastLiveAttemptMs stamps EVERY live attempt start (manual taps
  // included, so the cadence measures from the freshest attempt);
  // foregroundAtMs stamps the latest return to the foreground that no
  // attempt has answered yet.
  const lastLiveAttemptRef = useRef<number | null>(null);
  const foregroundAtRef = useRef<number | null>(null);
  const signInMut = useMutation({
    mutationFn: (args: { email: string; password: string }) => api.traegerSignIn(args),
    onSuccess: (res) => { if (res.ok) { setSigninNeeded(false); invalidate(); } },
  });
  const signOutMut = useMutation({ mutationFn: () => api.traegerSignOut({}), onSuccess: invalidate });
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const bankMut = useMutation({ mutationFn: (args: { sessionId: number; heldMs: number }) => api.bankHeldTime(args), onSuccess: invalidate });
  const holdMut = useMutation({ mutationFn: (args: { sessionId: number; since: string }) => api.setTimerHold(args), onSuccess: invalidate });
  const recoveryMut = useMutation({ mutationFn: (sessionId: number) => api.recordSessionRecovery({ sessionId }), onSuccess: invalidate });
  const setLastMeatMut = useMutation({ mutationFn: (meatId: string) => api.setLastSelectedMeat({ meatId }) });
  const correctionMut = useMutation({ mutationFn: (args: { sessionId: number; stageIndex: number; fromTemp: number; toTemp: number }) => api.requestSetpointCorrection(args), onSuccess: invalidate });
  const ackMut = useMutation({ mutationFn: (args: { sessionId: number; stageIndex: number; kind: "owner" | "expired" }) => api.ackAlarm(args), onSuccess: invalidate });
  const runTestsMut = useMutation({ mutationFn: () => api.runIntegrationTests({}), onSuccess: () => { invalidate(); void queryClient.invalidateQueries({ queryKey: ["testStatus"] }); }, onSettled: () => setAutoSuiteSettled(true) });
  const testStatus = useQuery({ queryKey: ["testStatus"], queryFn: () => api.getTestStatus({}), enabled: showSpec });
  const autoTestRanRef = useRef(false);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  // Refresh-button feedback: a check stays "outstanding" from the tap until a
  // snapshot with a NEWER lastVerifiedAt lands (see header derivation below).
  // R13: this ALWAYS starts null on load — no check state is ever restored
  // as in-flight (mirrors checkStateOnLoad in server actions; guarded by T56).
  const [pendingCheck, setPendingCheck] = useState<{ requestedAt: number; baselineVerifiedMs: number | null } | null>(null);
  // R13 watchdog (runs on the 1s clock): abandon a refresh call still
  // pending 35s after it started — it is wedged, not slow — so the
  // button and the checking state always free up without a page restart.
  useEffect(() => {
    if (refreshStartedRef.current != null && Date.now() - refreshStartedRef.current >= 35_000) {
      if (liveRefreshMut.isPending) liveRefreshMut.reset();
      refreshStartedRef.current = null;
      setPendingCheck(null);
    }
    if (autoRefreshMut.isPending && lastLiveAttemptRef.current != null && Date.now() - lastLiveAttemptRef.current >= 35_000) {
      autoRefreshMut.reset();
    }
  }, [now]);

  // ---- Theme: saved manual choice (localStorage "traeger-theme", applied
  // pre-paint via data-theme in index.html) wins; otherwise follow the
  // phone's system setting, live, until the owner picks one. Display-only
  // preference — deliberately no server round-trip.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem("traeger-theme"); } catch { /* ignore */ }
    const systemLight = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
    return resolveThemePreference(stored, systemLight);
  });
  const themeManualRef = useRef(false);
  useEffect(() => {
    try { themeManualRef.current = window.localStorage.getItem("traeger-theme") != null; } catch { /* ignore */ }
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => { if (!themeManualRef.current) setTheme(mq.matches ? "light" : "dark"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      themeManualRef.current = true;
      try { window.localStorage.setItem("traeger-theme", next); } catch { /* ignore */ }
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  // Persist + restore last picked meat.
  // Server is the source of truth (survives across devices/opens); localStorage is a fast mirror/fallback.
  const hasSyncedFromServerRef = useRef(false);
  const prevSessionIdRef = useRef<number | null | undefined>(undefined);
  const pendingMeatRef = useRef<string | null>(null);

  const handleSelectMeat = useCallback((meatId: string) => {
    setSelectedId(meatId);
    pendingMeatRef.current = meatId;
    try { window.localStorage.setItem("traeger-last-meat", meatId); } catch { /* ignore */ }
    setLastMeatMut.mutate(meatId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = dash.data;
  // Ship gate (R11): if the guard suite has never run — or the stored
  // results predate this build (stale: scenarios added since have no
  // result yet) — run it once so the Spec view always shows real,
  // current results for THIS build, never an ambiguous blank.
  useEffect(() => {
    if (!data || autoTestRanRef.current) return;
    autoTestRanRef.current = true;
    if (data.testRuns.total === 0 || data.testRuns.stale) runTestsMut.mutate();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const session = data?.activeSession ?? null;
  const program: Program | null = useMemo(() => {
    if (!data || !session) return null;
    return data.programs.find((p) => p.id === session.meatId) ?? null;
  }, [data, session]);
  const stage: Stage | null = program && session ? (program.stages[session.currentStageIndex] ?? null) : null;
  const nextStage: Stage | null = program && session ? (program.stages[session.currentStageIndex + 1] ?? null) : null;
  const selected: Program | null = useMemo(() => {
    if (!data) return null;
    return data.programs.find((p) => p.id === selectedId) ?? data.programs[0] ?? null;
  }, [data, selectedId]);

  // Restore last picked meat from server on load (when not in an active cook),
  // and again when a cook ends so the picker returns to that meat.
  useEffect(() => {
    if (!data) return;
    const serverMeat = data.lastSelectedMeatId ?? null;
    const hasActive = data.activeSession != null;
    const currentSessionId = data.activeSession?.id ?? null;

    // Track session transitions: when a session disappears, restore picker.
    const prevSessionId = prevSessionIdRef.current;
    const sessionJustEnded = prevSessionId !== undefined && prevSessionId != null && currentSessionId == null;
    prevSessionIdRef.current = currentSessionId;

    if (hasActive) {
      // Cook view is shown; don't fight the picker state, but remember we've seen data.
      hasSyncedFromServerRef.current = true;
      return;
    }

    if (!serverMeat) {
      // No server value: fall back to localStorage mirror if it names a real program.
      if (!hasSyncedFromServerRef.current) {
        try {
          const local = window.localStorage.getItem("traeger-last-meat");
          if (local && data.programs.some((p) => p.id === local)) {
            setSelectedId(local);
            pendingMeatRef.current = local;
            setLastMeatMut.mutate(local);
          }
        } catch { /* ignore */ }
        hasSyncedFromServerRef.current = true;
      }
      return;
    }

    const isValid = data.programs.some((p) => p.id === serverMeat);
    if (!isValid) { hasSyncedFromServerRef.current = true; return; }

    if (!hasSyncedFromServerRef.current) {
      // First load with no active cook: restore directly.
      setSelectedId(serverMeat);
      try { window.localStorage.setItem("traeger-last-meat", serverMeat); } catch { /* ignore */ }
      pendingMeatRef.current = null;
      hasSyncedFromServerRef.current = true;
      return;
    }

    if (sessionJustEnded) {
      setSelectedId(serverMeat);
      try { window.localStorage.setItem("traeger-last-meat", serverMeat); } catch { /* ignore */ }
      pendingMeatRef.current = null;
      return;
    }

    // After initial sync, only follow the server if we aren't waiting for our own change to persist.
    if (pendingMeatRef.current) {
      if (pendingMeatRef.current === serverMeat) pendingMeatRef.current = null;
      return;
    }
    if (serverMeat !== selectedId) {
      setSelectedId(serverMeat);
      try { window.localStorage.setItem("traeger-last-meat", serverMeat); } catch { /* ignore */ }
    }
  }, [data, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageEndMs = session && stage ? new Date(session.stageStartedAt).getTime() + stage.durationMinutes * 60000 : null;
  const remainingMs = stageEndMs != null ? stageEndMs - now : null;
  const shutdownRequested = session?.status === "shutdown_requested";
  // Timer hold is driven by the grill's OWN system state, not temps alone.
  // - Not ignited (hold): ONLY Idle or Offline.
  // - Heating hold: Igniting / Heating — timer stays held until the state
  //   becomes Cooking OR grillTemp is within 15°F of the ACTIVE STAGE target.
  const grillSnap = data?.grill ?? null;
  const stageTargetEarly = stage?.grillTemp ?? null;
  const grillStateLabelEarly = grillSnap ? deriveGrillStateLabel(grillSnap) : "Offline";
  const isIdleOrOfflineEarly = grillStateLabelEarly === "Idle" || grillStateLabelEarly === "Offline";
  const isIgnitingEarly = grillStateLabelEarly === "Igniting";
  const isHeatingEarly = grillStateLabelEarly === "Heating";
  const isCookingEarly = grillStateLabelEarly === "Cooking";
  const notIgnitedEarly = Boolean(
    session && stage && stageTargetEarly != null && !shutdownRequested && isIdleOrOfflineEarly,
  );
  const heatingHeldEarly = Boolean(
    session && stage && stageTargetEarly != null && grillSnap && !shutdownRequested
    && (isIgnitingEarly || isHeatingEarly)
    && !isCookingEarly
    && grillSnap.grillTemp < stageTargetEarly - 15,
  );
  const timerHeldEarly = notIgnitedEarly || heatingHeldEarly;
  // Probe stages complete on the PROBE, never on the timer alone: a stage
  // with a probe target is "due" only when the snapshot probe reaches the
  // target. The countdown is an estimate for those stages.
  const probeTargetEarly = stage?.probeTarget ?? null;
  const probeReachedEarly = Boolean(
    session && stage && probeTargetEarly != null && grillSnap && !shutdownRequested && !timerHeldEarly
    && grillSnap.probeConnected && grillSnap.probeTemp >= probeTargetEarly,
  );
  const stageExpired = probeTargetEarly != null
    ? probeReachedEarly && session?.status === "active"
    : remainingMs != null && remainingMs <= 0 && session?.status === "active" && !timerHeldEarly;

  // Bank held time durably — server-side. While not ignited, the hold start
  // is recorded on the session row itself (setTimerHold), never only in
  // localStorage, so it survives reloads, phone restarts, and app rebuilds.
  // When a snapshot confirms ignition, bankHeldTime shifts the stage start
  // forward by the held time so none of the cold time ever counts.
  const holdPrevRef = useRef<boolean | null>(null);
  const holdMarkingRef = useRef<string | null>(null);
  const holdBankingRef = useRef<string | null>(null);
  const sessionIdForHold = session?.id ?? null;
  const sessionStageForHold = session?.currentStageIndex ?? null;
  const sessionStageStartForHold = session?.stageStartedAt ?? null;
  const sessionHoldStartForHold = session?.holdStartedAt ?? null;
  useEffect(() => {
    if (sessionIdForHold == null || sessionStageForHold == null || sessionStageStartForHold == null) { holdPrevRef.current = null; return; }
    const key = `${sessionIdForHold}-${sessionStageForHold}`;
    if (timerHeldEarly) {
      if (!sessionHoldStartForHold && holdMarkingRef.current !== key) {
        holdMarkingRef.current = key;
        holdBankingRef.current = null;
        // Hold began at the stage start if the grill was already cold when
        // first observed, or at the moment it went cold.
        const sinceMs = holdPrevRef.current === false ? Date.now() : new Date(sessionStageStartForHold).getTime();
        holdMut.mutate({ sessionId: sessionIdForHold, since: new Date(sinceMs).toISOString() });
      }
    } else if (sessionHoldStartForHold) {
      const bankKey = `${key}-${sessionHoldStartForHold}`;
      if (holdBankingRef.current !== bankKey) {
        holdBankingRef.current = bankKey;
        holdMarkingRef.current = null;
        bankMut.mutate({ sessionId: sessionIdForHold, heldMs: 0 });
      }
    }
    holdPrevRef.current = timerHeldEarly;
  }, [timerHeldEarly, sessionIdForHold, sessionStageForHold, sessionStageStartForHold, sessionHoldStartForHold]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-fix setpoint mismatches ----
  // While a cook is active and the grill is Igniting/Heating/Cooking, if the
  // grill's setpoint differs from the ACTIVE STAGE's target, record ONE
  // correction request per stage (server dedupes too). The app never talks
  // to Traeger — Muse's monitor applies the set-temp on the grill and the
  // confirming snapshot lands via updateGrillState, which clears the flag.
  const activeCorrectionEarly = data?.activeCorrection ?? null;
  const correctionOutstandingEarly = Boolean(
    activeCorrectionEarly && session && stage
    && activeCorrectionEarly.sessionId === session.id
    && activeCorrectionEarly.stageIndex === session.currentStageIndex
    && activeCorrectionEarly.status === "requested",
  );
  const autoFixActiveEarly = Boolean(
    session && stage && stageTargetEarly != null && grillSnap && !shutdownRequested
    && (isIgnitingEarly || isHeatingEarly || isCookingEarly)
    && grillSnap.setpoint !== stageTargetEarly,
  );
  const correctionFiredRef = useRef<string | null>(null);
  const sessionIdForCorrection = session?.id ?? null;
  const stageIndexForCorrection = session?.currentStageIndex ?? null;
  const setpointForCorrection = grillSnap?.setpoint ?? null;
  useEffect(() => {
    if (!autoFixActiveEarly || correctionOutstandingEarly) return;
    if (sessionIdForCorrection == null || stageIndexForCorrection == null || setpointForCorrection == null || stageTargetEarly == null) return;
    const key = `${sessionIdForCorrection}-${stageIndexForCorrection}-${setpointForCorrection}-${stageTargetEarly}`;
    if (correctionFiredRef.current === key) return;
    correctionFiredRef.current = key;
    correctionMut.mutate({ sessionId: sessionIdForCorrection, stageIndex: stageIndexForCorrection, fromTemp: setpointForCorrection, toTemp: stageTargetEarly });
  }, [autoFixActiveEarly, correctionOutstandingEarly, sessionIdForCorrection, stageIndexForCorrection, setpointForCorrection, stageTargetEarly]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-advance monitored stages ----
  // Monitored stages (probe / timer / grilltemp) have NO Done button: when
  // the server reports the stage condition met (probe at target, timer
  // elapsed, grill at temp), ask the server to advance. The server
  // re-validates before moving, so this can never skip a stage early.
  // Retries are spaced out if a call fails or doesn't advance.
  const autoAdvanceFiredRef = useRef<{ key: string; at: number } | null>(null);
  const stageConditionMetVal = data?.stageConditionMet ?? false;
  const autoSessionId = session?.id ?? null;
  const autoStageIndex = session?.currentStageIndex ?? null;
  const autoCompletion = stage?.completion ?? null;
  useEffect(() => {
    if (!stageConditionMetVal || autoSessionId == null || autoStageIndex == null) return;
    if (!autoCompletion || autoCompletion === "owner" || shutdownRequested) return;
    const key = `${autoSessionId}-${autoStageIndex}`;
    const prev = autoAdvanceFiredRef.current;
    if (prev && prev.key === key && Date.now() - prev.at < 20000) return;
    if (autoAdvanceMut.isPending) return;
    autoAdvanceFiredRef.current = { key, at: Date.now() };
    autoAdvanceMut.mutate(autoSessionId);
  }, [stageConditionMetVal, autoSessionId, autoStageIndex, autoCompletion, shutdownRequested, now]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Full state recovery on every fresh load ----
  // Everything (session, stage, timing, messages, last meat, grill snapshot)
  // is rehydrated from getDashboard — nothing lives only in this page. On a
  // fresh page load that restores an active session: post the one-time
  // "Session recovered" feed note. Fresh grill data on open comes from
  // the auto-refetch scheduler (direct liveRefresh), never from a
  // recorded request to anyone.
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (!data || initialLoadRef.current) return;
    initialLoadRef.current = true;
    const active = data.activeSession;
    if (!active) return;
    recoveryMut.mutate(active.id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill the sign-in form's email from the stored login (never the
  // password — the server never sends it back).
  const storedAuthEmail = data?.traegerAuth.email ?? null;
  useEffect(() => {
    if (storedAuthEmail && signInEmail === "") setSignInEmail(storedAuthEmail);
  }, [storedAuthEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning to the app (tab/app switch) re-reads the server state at once
  // instead of waiting for the next poll tick.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") { foregroundAtRef.current = Date.now(); setOpenGeneration((g) => g + 1); refreshLight(); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); } };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [queryClient]);

  // ---- Auto-refetch scheduler (R6 amendment, v28) ----
  // Evaluated on the 1s clock. Root cause of the staleness bug: the
  // only automatic cycle was the 10s light poll, which re-reads the
  // STORED snapshot and can never advance the verified time — the live
  // pull ran only on a manual tap. Now, while the app is open and
  // visible with an active cook, the canonical decision fires the live
  // refresh on a ~60s cadence (foreground returns fire promptly,
  // gate-aware); hidden pauses it entirely. Quiet while the Spec view
  // is open or the guard suite is running/settling, so auto live calls
  // never race the suite's hermetic gate state. Any live call already
  // in flight (auto or manual) suppresses a new fire — the server gate
  // joins them into one call.
  const autoSessionActive = session?.status === "active";
  const autoInFlight = liveRefreshMut.isPending || autoRefreshMut.isPending;
  const autoTestsClear = data != null && (!data.testRuns.stale || autoSuiteSettled) && !runTestsMut.isPending;
  const autoRefreshMutate = autoRefreshMut.mutate;
  useEffect(() => {
    if (!data || showSpec || !autoTestsClear) return;
    const decision = autoRefreshDecision({
      nowMs: now,
      visible: document.visibilityState === "visible",
      hasActiveSession: autoSessionActive,
      inFlight: autoInFlight,
      lastAttemptMs: lastLiveAttemptRef.current,
      foregroundAtMs: foregroundAtRef.current,
    });
    if (!decision.fire) return;
    lastLiveAttemptRef.current = now;
    autoRefreshMutate();
  }, [now, data, showSpec, autoTestsClear, autoSessionActive, autoInFlight, autoRefreshMutate]);

  // ---- Scroll to the current stage on open / foreground (R4, v27) ----
  // Exactly once per open (generation 0) and per return to the foreground
  // (generation bump): scroll the cook view so the CURRENT stage card is
  // in view, smooth, with a small top offset (scroll-mt on the card).
  // The canonical key check decides — polls, refreshes and re-renders
  // with the same key never re-scroll, so an owner who scrolled away is
  // left alone until the next open/foregrounding. `now` is a dep so a
  // card that mounts a beat after the generation bump still gets its
  // one scroll; the key is consumed only when the scroll actually runs.
  const scrollSessionId = session?.id ?? null;
  const scrollStageIndex = session?.currentStageIndex ?? null;
  const cookViewShown = Boolean(session && program && stage && !showHistory && !showSpec);
  useEffect(() => {
    if (!cookViewShown) return;
    const decision = shouldScrollToCurrentStageKey(openGeneration, scrollSessionId, scrollStageIndex, lastScrollKeyRef.current);
    if (!decision.scroll) return;
    const el = activeStageCardRef.current;
    if (!el) return;
    lastScrollKeyRef.current = decision.key;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openGeneration, scrollSessionId, scrollStageIndex, cookViewShown, now]);

  // ---- Keep the screen awake while the app is open ----
  // v28 self-healing repair (Item A). The v27 seams: the sentinel
  // 'release' listener only MARKED the lock gone and never re-acquired
  // (healing waited for the 15s watchdog); there was no pageshow
  // handler, so a bfcache restore skipped the mount arm entirely; and
  // after the R13 self-reload the fresh document has had no user
  // gesture, so the video fallback's play() could stay rejected with
  // only the watchdog retrying — the phone slept on the app screen.
  // Now every heal trigger — mount, watchdog tick, visibility return,
  // pageshow, sentinel release, first gesture — consults the canonical
  // keepAwakeDirective (T75) against the LIVE held-state and restarts
  // whichever mechanism is actually down. Two mechanisms:
  //  1. Wake Lock — re-acquired the moment it drops while visible.
  //  2. A tiny silent looping video in the corner — iOS never sleeps
  //     the screen while media is playing; it restarts itself on pause.
  // Intent persists across reloads: while a cook is active a
  // localStorage flag is set, and a fresh document reads it back
  // (keepAwakeIntent) and arms immediately, as far as the platform
  // allows; the first tap after a reload completes the heal. The
  // header chip keys off the LIVE held-state (wakeOn || videoOn),
  // never off intent — no fake "awake".
  type WakeSentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };
  const wakeSentinelRef = useRef<WakeSentinel | null>(null);
  const wakeWantRef = useRef(true);
  const wakeTryingRef = useRef(false);
  const acquireWakeLock = useCallback(async () => {
    if (!wakeWantRef.current || wakeTryingRef.current) return;
    if (wakeSentinelRef.current && !wakeSentinelRef.current.released) { setWakeOn(true); return; }
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeSentinel> } };
    if (!nav.wakeLock) return;
    wakeTryingRef.current = true;
    try {
      const wl = await nav.wakeLock.request("screen");
      wakeSentinelRef.current = wl;
      setWakeOn(true);
      wl.addEventListener("release", () => {
        if (wakeSentinelRef.current === wl) wakeSentinelRef.current = null;
        setWakeOn(false);
        // Self-heal on release: if the page is visible, ask the
        // canonical directive and re-acquire immediately instead of
        // waiting for the watchdog (the v27 seam).
        if (document.visibilityState === "visible") {
          const nav2 = navigator as unknown as { wakeLock?: unknown };
          const d = keepAwakeDirective({ trigger: "release", wakeLockSupported: nav2.wakeLock != null, wakeLockHeld: false, videoPlaying: Boolean(videoRef.current && !videoRef.current.paused && !videoRef.current.ended), visible: true });
          if (d.acquireWakeLock) void acquireWakeLock();
        }
      });
    } catch { setWakeOn(false); }
    wakeTryingRef.current = false;
  }, []);
  const tryPlayVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused && !v.ended) { setVideoOn(true); return; }
    v.play().then(() => setVideoOn(true)).catch(() => setVideoOn(false));
  }, []);
  const armKeepAwake = useCallback(() => { void acquireWakeLock(); tryPlayVideo(); }, [acquireWakeLock, tryPlayVideo]);
  // Directive-driven heal for the passive triggers (watchdog,
  // visibility, pageshow): restarts only what is actually down.
  const healKeepAwake = useCallback((trigger: KeepAwakeTrigger) => {
    const nav = navigator as unknown as { wakeLock?: unknown };
    const v = videoRef.current;
    const d = keepAwakeDirective({
      trigger,
      wakeLockSupported: nav.wakeLock != null,
      wakeLockHeld: Boolean(wakeSentinelRef.current && !wakeSentinelRef.current.released),
      videoPlaying: Boolean(v && !v.paused && !v.ended),
      visible: document.visibilityState === "visible",
    });
    if (d.acquireWakeLock) void acquireWakeLock();
    if (d.playVideo) tryPlayVideo();
  }, [acquireWakeLock, tryPlayVideo]);
  useEffect(() => { armKeepAwake(); }, [armKeepAwake, retryNonce]);
  // Watchdog: heals either mechanism whenever it lapses while visible.
  useEffect(() => {
    const t = setInterval(() => healKeepAwake("watchdog"), 15000);
    return () => clearInterval(t);
  }, [healKeepAwake]);
  // iOS releases the wake lock when the page hides — heal on return,
  // and on pageshow (bfcache restores skip the mount arm entirely).
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") healKeepAwake("visible"); };
    const onShow = () => healKeepAwake("pageshow");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onShow); };
  }, [healKeepAwake]);
  // Intent persistence across the R13 self-reload: the read runs once
  // per document, BEFORE the write effect below can clear anything.
  useEffect(() => {
    let flag: string | null = null;
    try { flag = window.localStorage.getItem("traeger-keepawake"); } catch { /* ignore */ }
    if (keepAwakeIntent(flag, false)) armKeepAwake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (session?.status === "active") window.localStorage.setItem("traeger-keepawake", "1");
      else if (dash.isSuccess) window.localStorage.removeItem("traeger-keepawake");
    } catch { /* ignore */ }
  }, [session?.status, dash.isSuccess]);
  const screenAwake = wakeOn || videoOn;

  // ---- Audio + speech unlock (user gesture) ----
  const unlockAudioSpeech = useCallback(() => {
    speechUnlockedRef.current = true;
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
    } catch { /* ignore */ }
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.getVoices();
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
      }
    } catch { /* ignore */ }
  }, []);

  // First user interaction ANYWHERE unlocks audio + speech for this
  // document and re-arms keep-awake (Item A + B, T76): before v28 the
  // unlock happened only on the COOK button, so a restored session —
  // or any page after the R13 self-reload — had no gesture in-document
  // and iOS silently dropped every real alarm's speak() calls. The
  // directive guarantees exactly one unlock attempt per document;
  // after a reload this listener registers again and the next first
  // tap re-establishes the unlock.
  useEffect(() => {
    const onFirstGesture = () => {
      const d = speechUnlockDirective({ gestureSeen: speechGestureRef.current, sessionUnlocked: speechUnlockedRef.current });
      speechGestureRef.current = true;
      if (d.attemptUnlock) unlockAudioSpeech();
      if (!keepAwakeGestureRef.current) { keepAwakeGestureRef.current = true; armKeepAwake(); }
    };
    document.addEventListener("pointerdown", onFirstGesture);
    return () => document.removeEventListener("pointerdown", onFirstGesture);
  }, [unlockAudioSpeech, armKeepAwake]);

  const sirenBurst = useCallback(async () => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      gain.gain.value = 1.0;
      osc.connect(gain); gain.connect(ctx.destination);
      const t0 = ctx.currentTime;
      for (let i = 0; i < 8; i++) osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 1174, t0 + i * 0.18);
      osc.start(t0); osc.stop(t0 + 1.45);
      await sleep(1500);
      try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    } catch { await sleep(400); }
  }, []);

  const speakPhrase = useCallback((phrase: string) => new Promise<void>((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      synth.cancel();
      // A paused synthesis queue (iOS parks it after interruptions)
      // silently swallows speak() — resume explicitly before speaking.
      try { synth.resume(); } catch { /* ignore */ }
      const u = new SpeechSynthesisUtterance(phrase);
      u.rate = 0.95; u.volume = 1;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onend = finish; u.onerror = finish;
      synth.speak(u);
      setTimeout(finish, Math.min(14000, 2500 + phrase.length * 110));
    } catch { resolve(); }
  }), []);

  // ---- Alarm derivation ----
  const realAlarm: AlarmInfo | null = useMemo(() => {
    if (!session || !program || !stage || shutdownRequested) return null;
    // "Expired" alarms exist only for owner stages (a nudge when the owner
    // hasn't confirmed a physical step). Monitored stages never nag about
    // expiry — they auto-advance, and the NEXT stage's owner alarm (below,
    // on the following render) delivers the exact instruction instead.
    if (stageExpired && stage.completion === "owner") {
      const phrase = nextStage?.speak ?? stage.speak ?? `Igor, ${stage.title} is done.`;
      return {
        key: `${session.id}-${session.currentStageIndex}-expired`,
        headline: "⏰ TIME TO ACT",
        body: nextStage ? `“${stage.title}” is done. Next: ${nextStage.title}. ${nextStage.ownerDoes ?? ""}` : `“${stage.title}” is done — last step of the cook.`,
        phrase, isTest: false, kind: "expired" as const,
      };
    }
    if (stage.ownerAction) {
      return {
        key: `${session.id}-${session.currentStageIndex}-owner`,
        headline: "🙋 YOUR TURN",
        body: stage.ownerDoes ?? stage.title,
        phrase: stage.speak ?? `Igor, ${stage.title}.`,
        isTest: false, kind: "owner" as const,
      };
    }
    return null;
  }, [session, program, stage, nextStage, stageExpired, shutdownRequested]);

  // An alarm counts as acked if EITHER this page acked it OR the server has
  // the durable ack (survives reloads/rebuilds, incl. reality auto-acks the
  // server recorded when the snapshot proved the action already done).
  const serverAckedFull = session ? session.alarmAckedKeys.map((k) => `${session.id}-${k}`) : [];
  const realAlarmUnacked = realAlarm != null && !ackedAlarms.has(realAlarm.key) && !serverAckedFull.includes(realAlarm.key);
  const activeAlarm: AlarmInfo | null = completionAlarm ?? testAlarm ?? (realAlarmUnacked && realAlarm ? realAlarm : null);
  const activeAlarmKey = activeAlarm?.key ?? null;

  // Alarm sequence: siren -> speak -> pause -> repeat, until "Got it".
  // The cadence is the canonical alarmRepeatPlan (T76): the stage's
  // EXACT phrase, up to ALARM_MAX_REPEATS speaks, stopping the moment
  // the alarm is acked/dismissed (cleanup flips `cancelled`).
  useEffect(() => {
    if (!activeAlarm) return;
    let cancelled = false;
    const phrase = activeAlarm.phrase;
    (async () => {
      for (let i = 0; ; i++) {
        const plan = alarmRepeatPlan({ phrase, repeatsDone: i, acked: cancelled });
        if (!plan.speak) break;
        await sirenBurst();
        if (cancelled) break;
        try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch { /* ignore */ }
        await speakPhrase(plan.phrase);
        if (cancelled) break;
        await sleep(1400);
      }
    })();
    return () => {
      cancelled = true;
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    };
  }, [activeAlarmKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ackAlarm = () => {
    if (completionAlarm) { setCompletionAlarm(null); return; }
    if (testAlarm) { setTestAlarm(null); return; }
    if (realAlarm && session) {
      setAckedAlarms((prev) => new Set(prev).add(realAlarm.key));
      // Persist server-side per session + stage + kind: once acked, this
      // stage's alarm NEVER fires again — not on reload, not on recovery.
      ackMut.mutate({ sessionId: session.id, stageIndex: session.currentStageIndex, kind: realAlarm.kind });
    }
  };

  if (dash.isPending) {
    return <div className="flex h-[100dvh] items-center justify-center bg-[var(--bg)] text-[var(--dim)]">Loading your grill…</div>;
  }
  if (dash.error || !data) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center text-[var(--text)]">
        <p>Couldn't load the grill panel.</p>
        <button type="button" aria-label="Retry loading" onClick={() => void dash.refetch()}
          className="min-h-[48px] rounded-xl bg-[var(--accent)] px-6 font-display text-base font-bold text-[var(--on-accent)]">Retry</button>
      </div>
    );
  }

  const g = data.grill;
  const verifiedMs = parseVerifiedMs(g.lastVerifiedAt);
  const snapshotAgeMs = verifiedMs != null ? Math.max(0, now - verifiedMs) : null;
  const snapshotStale = Boolean(session && snapshotAgeMs != null && snapshotAgeMs > 30 * 60_000);
  // Refresh feedback (R6), resolved by the canonical resolveCheckFeedback
  // (mirrored from server actions; guarded by T13 + T32). The ONLY source
  // is this page's own tap: the tap IS the direct liveRefresh call, and
  // its pending state is local — nothing is recorded server-side for
  // anyone (the legacy feed-derived phase is gone). The phase ALWAYS
  // resolves: the call settles, a snapshot at/after the tap ends it, and
  // the 90s outer bound frees the button — and NO status line is
  // rendered in any phase (the legacy "Check requested…" element is
  // deleted, not hidden: its mount/unmount shifted the whole layout).
  // Refresh state shows only in the single refresh indicator + age label.
  const checkFeedback = resolveCheckFeedback({ requestedAtMs: pendingCheck?.requestedAt ?? null, snapshotVerifiedMs: verifiedMs, nowMs: now });
  const checkingNow = checkFeedback.phase === "checking";
  // R13: the button is gated ONLY by the bounded check phase — never by
  // a mutation's pending flag, which a wedged call could hold forever.
  const canRequestCheck = checkFeedback.canRequest;
  const handleCheckTap = () => {
    if (!canRequestCheck) return;
    // Abandon any still-pending call from an earlier tap (wedged across
    // a redeploy) — every tap starts from a clean slate.
    if (liveRefreshMut.isPending) liveRefreshMut.reset();
    refreshStartedRef.current = Date.now();
    // A manual tap is a live attempt too: the auto-refetch cadence
    // measures from it, so a tap never triggers an immediate auto fire.
    lastLiveAttemptRef.current = Date.now();
    setPendingCheck({ requestedAt: Date.now(), baselineVerifiedMs: verifiedMs });
    liveRefreshMut.mutate();
  };
  const snapshotShortAge = snapshotAgeMs != null ? fmtAgeShort(snapshotAgeMs) : fmtVerified(g.lastVerifiedAt);
  const h = data.history;
  const appLines = appSectionLines(data.appInfo);
  const fastPrograms = data.programs.filter((p) => p.category === "fast");
  const slowPrograms = data.programs.filter((p) => p.category === "slow");
  const stageTargetTemp = stageTargetEarly;
  const notIgnited = notIgnitedEarly;
  const timerHeld = timerHeldEarly;
  const grillStateLabel = deriveGrillStateLabel(g);
  const isIgniting = grillStateLabel === "Igniting";
  const isHeating = grillStateLabel === "Heating";
  const setpointMismatch = Boolean(session && stage && stage.grillTemp != null && g.setpoint !== stage.grillTemp);
  const canAutoFix = grillStateLabel === "Igniting" || grillStateLabel === "Heating" || grillStateLabel === "Cooking";
  const correctionForStage = data.activeCorrection && session && data.activeCorrection.sessionId === session.id && data.activeCorrection.stageIndex === session.currentStageIndex ? data.activeCorrection : null;
  const correctionPending = correctionForStage?.status === "requested";
  const correctionConfirmed = correctionForStage?.status === "confirmed";
  const detailStage: Stage | null = detailIdx != null && program ? (program.stages[detailIdx] ?? null) : null;
  const stageProgress = timerHeld ? 0 : stage && remainingMs != null
    ? Math.min(100, Math.max(0, 100 - (remainingMs / (stage.durationMinutes * 60000)) * 100))
    : 0;

  return (
    <div className="flex h-[100dvh] w-full justify-center bg-[var(--frame)]" onClick={() => { armKeepAwake(); try { if (audioRef.current?.state === "suspended") void audioRef.current.resume(); } catch { /* ignore */ } }}>
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />

        {/* ===== HEADER — one row ===== */}
        <header className="shrink-0 px-3 pb-3 pt-3">
          {/* Silent looping media keeps iOS from auto-locking — kept rendered
              (never display:none) but visually negligible in the minimal header. */}
          <video ref={videoRef} src={keepAwakeLoopUrl} autoPlay loop muted playsInline preload="auto" aria-hidden="true" tabIndex={-1}
            onPlaying={() => setVideoOn(true)} onPause={() => { setVideoOn(false); if (document.visibilityState === "visible") tryPlayVideo(); }} onEnded={() => setVideoOn(false)}
            className="pointer-events-none absolute h-1 w-1 opacity-[0.01]" />
          <div className="flex h-9 items-center gap-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${grillStateLabel === "Offline" ? "bg-[var(--red)]" : grillStateLabel === "Cooking" ? "bg-[var(--green)]" : grillStateLabel === "Igniting" || grillStateLabel === "Heating" ? "bg-[var(--accent)]" : "bg-[var(--idle-dot)]"} pulse-dot`} />
            <span className="min-w-0 truncate whitespace-nowrap font-display text-sm font-bold leading-none tracking-tight">{g.name}</span>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${grillStateLabel === "Offline" ? "bg-[var(--bad-bg)] text-[var(--bad-text)]" : grillStateLabel === "Cooking" ? "bg-[var(--ok-bg)] text-[var(--ok-text)]" : grillStateLabel === "Igniting" ? "bg-[var(--info-bg)] text-[var(--info-text)]" : grillStateLabel === "Heating" ? "bg-[var(--warn-bg)] text-[var(--warn-text)]" : "bg-[var(--surface)] text-[var(--dim)]"}`}>{grillStateLabel.toUpperCase()}</span>
            <span className="flex-1" />
            {!screenAwake && (
              <button type="button" aria-label="Keep screen on" onClick={() => { armKeepAwake(); setRetryNonce((n) => n + 1); }} className="whitespace-nowrap text-[11px] font-semibold text-[var(--accent-text)] underline underline-offset-2">Keep screen on</button>
            )}
            {/* Single refresh indicator (R6): while a check is in flight the
                ONLY element in the checking state is the refresh icon
                button below (it spins and stays the tap target). This age
                label stays MOUNTED with the same content in every phase
                (mirrors headerAgeLabel in server actions, test T50) and
                only dims while checking — the header row's geometry is
                identical in idle, checking, and done states. */}
            <span className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] leading-none tabular-nums transition-opacity ${checkingNow ? "opacity-60" : ""} ${snapshotStale ? "font-semibold text-[var(--warn-text)]" : "text-[var(--dim)]"}`} title={snapshotStale ? "Grill state may be stale" : undefined}>
              <span>{snapshotShortAge}</span>
              {snapshotStale && <span aria-label="Grill state may be stale">· stale</span>}
            </span>
            <button type="button" aria-label="Refresh grill status" disabled={!canRequestCheck} onClick={handleCheckTap}
              className="flex h-8 w-[30px] shrink-0 items-center justify-center rounded-lg text-[var(--dim)] transition-colors hover:bg-[var(--surface)] disabled:opacity-60">
              <svg className={checkingNow ? "animate-spin" : undefined} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
            </button>
            <button type="button" aria-label="Spec and tests" aria-expanded={showSpec} onClick={() => { const next = !showSpec; setShowSpec(next); setShowHistory(false); if (next) invalidate(); }}
              className={`flex h-8 w-[30px] shrink-0 items-center justify-center rounded-lg transition-colors ${showSpec ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--dim)] hover:bg-[var(--surface)]"}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m3 6 1.2 1.2L6.5 5" /><path d="m3 12 1.2 1.2L6.5 11" /><path d="m3 18 1.2 1.2L6.5 17" /></svg>
            </button>
            <button type="button" aria-label="Status and history" aria-expanded={showHistory} onClick={() => { const next = !showHistory; setShowHistory(next); setShowSpec(false); if (next) invalidate(); }}
              className={`flex h-8 w-[30px] shrink-0 items-center justify-center rounded-lg transition-colors ${showHistory ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--dim)] hover:bg-[var(--surface)]"}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>
            </button>
            {/* Theme toggle (R5): icon only, 44px tap target; the choice
                persists in localStorage and is applied pre-paint. */}
            <button type="button" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--dim)] transition-colors hover:bg-[var(--surface)]">
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
              )}
            </button>
          </div>
          {signinNeeded && (
            <button type="button" onClick={() => { setShowHistory(true); setShowSpec(false); }}
              className="mt-1.5 block text-left text-[11px] font-semibold leading-tight text-[var(--accent-text)] underline underline-offset-2">
              {data.traegerAuth.signedIn ? "Traeger sign-in failed — tap to update the stored login" : "Traeger sign-in needed — tap to sign in"}
            </button>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[var(--surface)] px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">Grill</p>
              <p className="mt-0.5 font-display text-[26px] font-extrabold leading-none tabular-nums">{g.grillTemp}°</p>
              <div className="mt-1 flex h-5 items-center justify-center"><Sparkline trend={data.trends.grill} label="Grill" /></div>
            </div>
            <div className="rounded-xl bg-[var(--surface)] px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">Probe</p>
              <p className="mt-0.5 font-display text-[26px] font-extrabold leading-none tabular-nums">{g.probeTemp}°</p>
              <div className="mt-1 flex h-5 items-center justify-center"><Sparkline trend={data.trends.probe} label="Probe" /></div>
            </div>
            <div className="rounded-xl bg-[var(--surface)] px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">Set</p>
              <p className="mt-0.5 font-display text-[26px] font-extrabold leading-none tabular-nums text-[var(--accent)]">{g.setpoint}°</p>
              <div className="mt-1 h-5" />
            </div>
          </div>
        </header>

        {showSpec ? (
          /* ===== SPEC & TESTS ===== */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold">Spec &amp; Tests</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${data.testRuns.total === 0 ? "bg-[var(--surface2)] text-[var(--dim)]" : data.testRuns.failed === 0 ? "bg-[var(--ok-bg)] text-[var(--ok-text)]" : "bg-[var(--bad-bg)] text-[var(--bad-text)]"}`}>
                  {data.testRuns.total === 0 ? "Not run yet" : `${data.testRuns.passed}/${data.testRuns.total} passing`}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--dim)]">The business rules this app must never break — each one guarded by automated end-to-end tests that drive the real actions against synthetic grill snapshots.</p>
              <p className="mt-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-[13px] font-semibold leading-relaxed text-[var(--accent-text)]">Every feature, past and future, ships with automated E2E tests. A change without tests, or with a red suite, does not ship.</p>
              {data.testRuns.lastRunAt && <p className="mt-2 text-[11px] tabular-nums text-[var(--dim)]">Last run {fmtVerified(data.testRuns.lastRunAt)}{data.testRuns.buildId ? ` · ${data.testRuns.buildId}` : ""}</p>}
              {runTestsMut.data && <p className="mt-1 text-[12px] font-semibold text-[var(--ok-text)]" role="status">Suite finished: {runTestsMut.data.passed} passed, {runTestsMut.data.failed} failed.</p>}
              {runTestsMut.error && <p className="mt-1 text-[12px] font-semibold text-[var(--bad-text)]" role="alert">Suite failed to run — try again.</p>}

              <div className="mt-4 space-y-4">
                {(testStatus.data?.requirements ?? []).map((r) => (
                  <section key={r.id} className="rounded-xl bg-[var(--surface)] px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-[15px] font-bold leading-snug"><span className="text-[var(--accent-text)]">{r.id}</span> · {r.title}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${r.status === "guarded" ? "bg-[var(--ok-bg)] text-[var(--ok-text)]" : r.status === "failing" ? "bg-[var(--bad-bg)] text-[var(--bad-text)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>
                        {r.status === "guarded" ? "✓ GUARDED" : r.status === "failing" ? "✗ FAILING" : "NOT COVERED"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--dim)]">{r.description}</p>
                    <ul className="mt-2 space-y-1.5">
                      {r.scenarios.map((s) => (
                        <li key={s.id} className="flex gap-2 text-[12px] leading-snug">
                          <span aria-hidden="true" className={s.manual ? "text-[var(--warn-text)]" : s.passed === true ? "text-[var(--ok-text)]" : s.passed === false ? "text-[var(--bad-text)]" : "text-[var(--dim)]"}>{s.manual ? "◐" : s.passed === true ? "✓" : s.passed === false ? "✗" : "○"}</span>
                          <span className="min-w-0"><span className="font-semibold">{s.id}</span> {s.name}
                            {s.manual
                              ? <span className="block text-[11px] font-semibold text-[var(--warn-text)]">Manual verification only — {s.manual}</span>
                              : s.detail ? <span className="block text-[11px] text-[var(--dim)]">{s.detail}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {testStatus.isPending && <p className="text-[13px] text-[var(--dim)]">Loading requirements…</p>}
                {testStatus.error && <p className="text-[13px] text-[var(--bad-text)]">Couldn't load the test registry — the dashboard summary above still applies.</p>}
              </div>
            </div>
            <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
              <button type="button" aria-label="Run tests" disabled={runTestsMut.isPending} onClick={() => runTestsMut.mutate()}
                className="min-h-[52px] w-full rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)] disabled:opacity-50">
                {runTestsMut.isPending ? "Running tests…" : "Run tests"}
              </button>
              <button type="button" aria-label="Back from spec" onClick={() => setShowSpec(false)}
                className="mt-2 min-h-[44px] w-full rounded-2xl font-display text-sm font-semibold text-[var(--dim)]">← Back</button>
            </div>
          </div>
        ) : showHistory ? (
          /* ===== STATUS / HISTORY ===== */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold">Status / History</h2>
                <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-text)]">{h.verifiedAt}</span>
              </div>

              {/* App section (R12) — FIRST section of this view: current
                  build version + when this build was built, then the
                  guard suite's latest status on its own line, then the
                  latest 3 releases' notes grouped by release. */}
              <h3 className="mt-4 font-display text-base font-bold">App</h3>
              <div className="mt-2 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-sm">
                <p className="font-semibold">{appLines[0]}</p>
                <p className="mt-0.5 text-[13px] text-[var(--dim)]">{appLines[1]}</p>
                <p className="mt-0.5 text-[13px] text-[var(--dim)]">{appLines[2]}</p>
                {data.appInfo.releases.map((r) => (
                  <div key={r.buildId} className="mt-3">
                    <p className="text-[13px] font-bold">{r.versionLabel} · {r.buildId}{r.builtAtISO ? ` · ${fmtPtDateTime(r.builtAtISO)}` : ""}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-snug text-[var(--dim)]">
                      {r.changes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="mt-4 rounded-lg bg-[var(--surface2)] px-3 py-2 text-xs leading-relaxed text-[var(--dim)]">{h.verifiedNote}</p>

              <h3 className="mt-5 font-display text-base font-bold">Traeger sign-in</h3>
              {data.traegerAuth.signedIn && (
                <div className="mt-2 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-sm">
                  <p>Signed in as <b>{data.traegerAuth.email}</b></p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--dim)]">
                    {data.traegerAuth.tokenValid && data.traegerAuth.tokenExpiresAt
                      ? <>Live refresh is on — token active until {fmtVerified(data.traegerAuth.tokenExpiresAt)}, then it renews itself from the stored login.</>
                      : <>Live refresh is on — the token renews itself from the stored login on the next refresh.</>}
                  </p>
                  <button type="button" aria-label="Sign out of Traeger" disabled={signOutMut.isPending} onClick={() => signOutMut.mutate()}
                    className="mt-2 min-h-[40px] rounded-lg border border-[var(--border)] px-3 font-display text-sm font-bold disabled:opacity-50">Sign out</button>
                </div>
              )}
              <form className="mt-2" onSubmit={(e) => { e.preventDefault(); if (signInMut.isPending) return; const args = { email: signInEmail, password: signInPassword }; setSignInPassword(""); signInMut.mutate(args); }}>
                {data.traegerAuth.signedIn
                  ? <p className="text-[13px] font-semibold">Update stored login</p>
                  : <p className="text-[13px] leading-relaxed text-[var(--dim)]">Sign in once and the refresh button pulls fresh grill status straight from Traeger — no waiting on anyone.</p>}
                <label htmlFor="traeger-email" className="mt-2 block text-[11px] font-bold uppercase text-[var(--dim)]">Email</label>
                <input id="traeger-email" type="email" autoComplete="username" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text)]" />
                <label htmlFor="traeger-password" className="mt-2 block text-[11px] font-bold uppercase text-[var(--dim)]">Password</label>
                <input id="traeger-password" type="password" autoComplete="current-password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text)]" />
                <button type="submit" aria-label={data.traegerAuth.signedIn ? "Update stored Traeger login" : "Sign in to Traeger"} disabled={signInMut.isPending}
                  className="mt-3 min-h-[48px] w-full rounded-xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)] disabled:opacity-50">
                  {signInMut.isPending ? "Signing in…" : data.traegerAuth.signedIn ? "Update stored login" : "Sign in"}
                </button>
                {signInMut.data && !signInMut.data.ok && <p className="mt-2 text-[13px] font-semibold text-[var(--bad-text)]" role="alert">{signInMut.data.message}</p>}
                {signInMut.data?.ok && <p className="mt-2 text-[13px] font-semibold text-[var(--ok-text)]" role="status">{signInMut.data.message}</p>}
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--dim)]">Stored on this app&rsquo;s server so refresh works without re-entering it. Change it here after you rotate your Traeger password.</p>
              </form>
              <button type="button" aria-label="Open spec and tests" onClick={() => { setShowHistory(false); setShowSpec(true); }}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border)] font-display text-sm font-bold">
                Spec &amp; Tests — the rules + guard suite{data.testRuns.total > 0 ? ` · ${data.testRuns.passed}/${data.testRuns.total} passing` : ""}
              </button>

              <h3 className="mt-5 font-display text-base font-bold">Account</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Owner</dt><dd className="font-semibold">{h.account.owner}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Email</dt><dd className="break-all font-semibold">{h.account.email}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Phone</dt><dd className="font-semibold">{h.account.phoneOnFile ?? "None on file"}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Mailing list</dt><dd className="font-semibold">{h.account.mailingListSubscribed ? "Subscribed" : "Not subscribed"}</dd></div>
                <div className="col-span-2 rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Orders</dt><dd className="font-semibold">{h.account.orderHistory} — {h.account.orderHistoryDetail}</dd></div>
              </dl>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {h.account.communicationPreferences.map((p) => <span key={p} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">{p}</span>)}
              </div>

              <h3 className="mt-5 font-display text-base font-bold">Grill</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Model</dt><dd className="font-semibold">{h.identity.name} · {h.identity.modelFamily}</dd><dd className="text-xs text-[var(--dim)]">{h.identity.firmwareJobPackage}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Grill ID</dt><dd className="font-mono font-semibold">{h.identity.thingName}</dd><dd className="text-xs text-[var(--dim)]">Type {h.identity.deviceTypeId}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Firmware</dt><dd className="font-semibold">{h.identity.firmware}</dd><dd className="text-xs text-[var(--dim)]">Config {h.identity.configVersion}</dd></div>
                <div className="rounded-xl bg-[var(--surface)] px-3 py-2.5"><dt className="text-[11px] font-bold uppercase text-[var(--dim)]">Max temp</dt><dd className="font-semibold">{h.identity.maxGrillTemp}°F</dd></div>
              </dl>

              <h3 className="mt-5 font-display text-base font-bold">Lifetime</h3>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.cookCycles}</p><p className="text-[11px] text-[var(--dim)]">Cooks</p></div>
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.runtimeHours}h</p><p className="text-[11px] text-[var(--dim)]">Runtime</p></div>
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.fanHours}h</p><p className="text-[11px] text-[var(--dim)]">Fan</p></div>
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.augerHours}h</p><p className="text-[11px] text-[var(--dim)]">Auger</p></div>
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.hotRodHours}h</p><p className="text-[11px] text-[var(--dim)]">Igniter</p></div>
                <div className="rounded-xl bg-[var(--surface)] px-2 py-3"><p className="font-display text-2xl font-black">{h.lifetime.greaseTrapCleanCountdown}/{h.lifetime.grillCleanCountdown}</p><p className="text-[11px] text-[var(--dim)]">Clean counters</p></div>
              </div>

              <h3 className="mt-5 font-display text-base font-bold">Errors</h3>
              <p className="mt-2 rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm font-semibold text-[var(--ok-text)]">{h.errors.currentNote}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {h.errors.lifetime.map((e) => (
                  <li key={e.label} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${e.count > 0 ? "border border-[var(--accent)] bg-[var(--accent-soft)]" : "bg-[var(--surface)] text-[var(--dim)]"}`}>
                    <span>{e.label}</span><span className="font-display font-black">×{e.count}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 font-display text-base font-bold">Settings</h3>
              <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5">WiFi “{h.settings.wifiSsid}” · {h.settings.wifiRssi} dBm</span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Speaker: <b>{h.settings.speakerOn ? "On" : "Off"}</b></span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Pellet sensor: <b>{h.settings.pelletSensorConnected ? "connected" : "NOT connected"}</b></span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5">Super Smoke on unit: <b>{h.settings.superSmokeEnabled ? "Yes" : "No"}</b></span>
              </div>
              <p className="mt-2 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-sm">Stored cook: <b>“{h.settings.customCookName}”</b> — {h.settings.customCookGrillTemp}°F · probe {h.settings.customCookProbeTemp}°F</p>

              <h3 className="mt-5 font-display text-base font-bold">Past events</h3>
              <ol className="mt-2 space-y-3">
                {h.events.map((ev, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]">{ev.kind === "firmware" ? "↑" : ev.kind === "check" ? "✓" : "•"}</span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--accent-text)]">{ev.dateLabel}</p>
                      <p className="font-display font-bold">{ev.title}</p>
                      <p className="text-sm leading-relaxed text-[var(--dim)]">{ev.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">Traeger keeps lifetime counters + the last report — there's no per-cook log in its cloud payload.</p>
            </div>
            <div className="shrink-0 border-t border-[var(--border)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
              <button type="button" aria-label="Back" onClick={() => setShowHistory(false)}
                className="min-h-[52px] w-full rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)]">← Back</button>
            </div>
          </div>
        ) : session && program && stage ? (
          /* ===== COOK VIEW ===== */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="min-w-0 truncate font-display text-[20px] font-bold leading-tight tracking-tight">{program.emoji} {program.name}</h2>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--dim)]">{session.currentStageIndex + 1} / {program.stages.length}</span>
              </div>

              {notIgnited && stageTargetTemp != null && (
                <div className="mt-3 rounded-lg bg-[var(--warn-bg)] px-3 py-2.5" role="status">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--warn-text)]">Not ignited — ignite to start step {session.currentStageIndex + 1}</p>
                </div>
              )}

              {(isIgniting || isHeating) && (
                <div className="mt-3 rounded-lg bg-[var(--info-bg)] px-3 py-2.5" role="status">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--info-text-bright)]">{isIgniting ? `Igniting — heating to ${g.setpoint}°F` : `Heating to ${g.setpoint}°F`}</p>
                </div>
              )}

              {!setpointMismatch && correctionConfirmed && correctionForStage && (
                <p className="mt-3 text-[12px] font-medium text-[var(--ok-text)]" role="status">Grill follows recipe — {correctionForStage.toTemp}°F</p>
              )}

              {setpointMismatch && stage.grillTemp != null && (canAutoFix ? (
                <div className="mt-3 rounded-lg bg-[var(--info-bg)] px-3 py-2.5" role="status">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--info-text-bright)]">{correctionPending ? "Auto-fix requested — waiting for grill…" : `Auto-fix: setting grill to ${stage.grillTemp}°F`}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-[var(--bad-bg)] px-3 py-2.5" role="alert">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--bad-text-bright)]">Grill set to {g.setpoint}°F — this step needs {stage.grillTemp}°F</p>
                </div>
              ))}

              {shutdownRequested && (
                <div className="alarm-flash mt-3 rounded-xl px-3 py-2.5 text-white" role="alert">
                  <p className="font-display text-base font-bold">Shutdown requested</p>
                  <p className="text-[13px]">Muse is shutting the grill down. If anything looks unsafe, power off at the grill.</p>
                </div>
              )}

              <ol className="mt-3 space-y-1.5">
                {program.stages.map((s, i) => {
                  const isDone = i < session.currentStageIndex;
                  const isActive = i === session.currentStageIndex;
                  // R10 instruction lifecycle, from the server view-model:
                  // upcoming rows preview the instruction; the active card
                  // shows it only while visible per stageView (monitored
                  // stages hide it once the start action is acked — a local
                  // ack hides it instantly too); done rows never show it.
                  const sv = data.stageView.find((v) => v.index === i);
                  const locallyAcked = ackedAlarms.has(`${session.id}-${i}-owner`);
                  const instructionVisible = Boolean(sv?.instructionVisible) && !(isActive && locallyAcked && s.completion !== "owner");
                  return (
                    <li key={i} ref={isActive ? (el: HTMLLIElement | null) => { activeStageCardRef.current = el; } : undefined} onClick={() => setDetailIdx(i)} className={`flex scroll-mt-3 cursor-pointer gap-2.5 rounded-xl px-3 py-3 ${isActive ? "border border-[var(--accent)]/70 bg-[var(--surface)]" : isDone ? "bg-[var(--surface2)] opacity-50" : "bg-[var(--surface2)]"}`}>
                      <span className={`flex shrink-0 items-center justify-center rounded-full font-display ${isActive ? "h-6 w-6 border-[1.5px] border-[var(--accent)] text-[11px] font-bold text-[var(--accent)]" : isDone ? "h-6 w-6 bg-[var(--green)] text-[11px] font-bold text-[var(--on-green)]" : "h-6 w-6 border border-[var(--border)] text-[11px] font-medium text-[var(--dim)]"}`}>
                        {isDone ? "✓" : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className={`font-display font-semibold leading-snug ${isActive ? "text-[16px]" : "text-[14px]"} ${!isActive && !isDone ? "text-[var(--dim)]" : ""}`}>{s.title}</p>
                          {s.ownerAction && (!isActive || instructionVisible) && <span className="whitespace-nowrap text-[10px] font-bold tracking-wide text-[var(--accent-text)]">YOUR JOB</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--dim)]">
                          {fmtDur(s.durationMinutes)}{s.grillTemp != null ? ` · ${s.grillTemp}°F` : " · off"}{s.probeTarget != null ? ` · probe ${s.probeTarget}°F` : ""}
                        </p>
                        {!isActive && !isDone && instructionVisible && s.ownerDoes && (
                          <p className="mt-1 text-[12px] leading-relaxed text-[var(--dim)]">{s.ownerDoes}</p>
                        )}
                        {isActive && (
                          <>
                            {timerHeld ? (
                              <>
                                <p className="mt-2.5 font-display text-[20px] font-bold leading-tight tracking-tight text-[var(--warn-text)]">{notIgnited ? "Waiting for ignition" : isIgniting ? "Igniting…" : "Heating…"}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--dim)]">{notIgnited ? `Timer held — starts when the grill is heating.` : `Timer held — starts when Cooking or within 15°F of ${s.grillTemp}°F.`}</p>
                                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
                                  <div className="h-full rounded-full bg-[var(--held-fill)]" style={{ width: "0%" }} />
                                </div>
                              </>
                            ) : s.probeTarget != null ? (
                              <>
                                {(() => {
                                  const startProbe = session.stageStartProbe ?? 40;
                                  const pct = s.probeTarget > startProbe
                                    ? Math.min(100, Math.max(0, ((g.probeTemp - startProbe) / (s.probeTarget - startProbe)) * 100))
                                    : Math.min(100, Math.max(0, (g.probeTemp / s.probeTarget) * 100));
                                  const reached = g.probeConnected && g.probeTemp >= s.probeTarget;
                                  return (
                                    <>
                                      <p className="mt-2 font-display text-[30px] font-extrabold leading-none tabular-nums tracking-tight">
                                        Probe {g.probeTemp}° <span className="text-[18px] font-bold text-[var(--dim)]">→ {s.probeTarget}°</span>
                                        {reached && <span className="ml-2 align-middle text-[13px] font-bold text-[var(--ok-text)]">Target reached</span>}
                                      </p>
                                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
                                        <div className={`h-full rounded-full ${reached ? "bg-[var(--green)]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                                      </div>
                                      {/* Single-line by contract (T51): the
                                          canonical line text, truncated with
                                          an ellipsis — never wraps, so the
                                          card height is refresh-stable. */}
                                      <p className="mt-1.5 truncate text-[11px] tabular-nums text-[var(--dim)]">
                                        {probeEstimateLineText(data.probeEstimate, Math.max(0, Math.round((remainingMs ?? 0) / 1000)), session.stageStartProbe, g.probeTemp, now, s.probeTarget)}
                                      </p>
                                    </>
                                  );
                                })()}
                              </>
                            ) : (
                              <>
                                <p className={`mt-2 font-display text-[36px] font-extrabold leading-none tabular-nums tracking-tight ${stageExpired ? "text-[var(--red)]" : ""}`}>{fmtCountdown(remainingMs ?? 0)}</p>
                                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
                                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(stageProgress, 3)}%` }} />
                                </div>
                              </>
                            )}
                            {/* The stage's why-line (R10, T78): what's
                                happening to the meat + why the target —
                                replaces the old templated line that
                                restated the stage's numbers. Shown once,
                                here; the tiles already carry the numbers. */}
                            <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--dim)]">{s.why}</p>
                            {instructionVisible && s.ownerDoes && <p className="mt-1 text-[13px] font-medium leading-relaxed text-[var(--accent-text)]">{s.ownerDoes}</p>}
                          </>
                        )}
                      </div>
                      <button type="button" aria-label={`View details: ${s.title}`} onClick={(e) => { e.stopPropagation(); setDetailIdx(i); }}
                        className="flex h-8 w-5 shrink-0 items-center justify-center self-center text-base leading-none text-[var(--dim)]">›</button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="shrink-0 bg-[var(--bg)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
              {stage.completion === "owner" ? (
                <button type="button" aria-label="Done, go to next stage" disabled={advanceMut.isPending || timerHeld}
                  onClick={() => { if (realAlarm) { setAckedAlarms((prev) => new Set(prev).add(realAlarm.key)); ackMut.mutate({ sessionId: session.id, stageIndex: session.currentStageIndex, kind: realAlarm.kind }); } advanceMut.mutate(session.id); }}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)] disabled:opacity-50">
                  {timerHeld ? (notIgnited ? "Waiting for ignition" : isIgniting ? "Igniting — heating…" : "Heating…") : session.currentStageIndex + 1 >= program.stages.length ? "Finish cook" : "Done — next step"}
                </button>
              ) : (
                <p className="flex min-h-[36px] w-full items-center justify-center px-1 text-center text-[13px] font-medium tabular-nums text-[var(--dim)]" role="status">
                  <span className="truncate">
                    {stage.completion === "probe" && stage.probeTarget != null
                      ? `Auto-advances at ${stage.probeTarget}°F`
                      : stage.completion === "grilltemp" && stage.grillTemp != null
                        ? `Auto-advances at ${stage.grillTemp - 15}°F`
                        : "Auto-advances when the timer ends"}
                  </span>
                </p>
              )}
              {/* No cancel/back-out in a live cook (R9): the only exits are
                  the cook completing or Shutdown. Shutdown NEVER acts on a
                  single tap — it opens the confirmation dialog first, and
                  nothing is recorded until "Yes, shut down" is tapped. */}
              <div className="mt-2 flex gap-2">
                <button type="button" aria-label="Emergency shutdown" disabled={shutdownMut.isPending} onClick={() => setConfirmShutdown(true)}
                  className="flex h-11 min-h-[44px] flex-1 items-center justify-center overflow-hidden whitespace-nowrap rounded-lg bg-[var(--red)] font-display text-sm font-semibold text-white disabled:opacity-50">Shutdown</button>
              </div>
            </div>
          </div>
        ) : selected ? (
          /* ===== PICKER VIEW ===== */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <label htmlFor="meat-picker" className="text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">What's cooking?</label>
              <select id="meat-picker" aria-label="Pick a meat" value={selected.id}
                onChange={(e) => handleSelectMeat(e.target.value)}
                className="mt-2 min-h-[56px] w-full rounded-xl border border-[var(--accent)]/70 bg-[var(--surface)] px-4 font-display text-lg font-bold text-[var(--text)]">
                <optgroup label="FAST">
                  {fastPrograms.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name} · {p.totalLabel}</option>)}
                </optgroup>
                <optgroup label="LOW & SLOW">
                  {slowPrograms.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name} · {p.totalLabel}</option>)}
                </optgroup>
              </select>

              <p className="mt-3 text-[13px] text-[var(--dim)]">Target {selected.probeTarget}°F · {selected.stages.length} steps</p>

              <h3 className="mt-5 font-display text-base font-bold">Buy</h3>
              <ul className="mt-1.5 space-y-1.5">
                {selected.buy.map((b, i) => <li key={i} className="flex gap-2 text-[14px] leading-snug"><span className="text-[var(--accent)]">•</span><span>{b}</span></li>)}
              </ul>

              <h3 className="mt-5 font-display text-base font-bold">Prep</h3>
              <ul className="mt-1.5 space-y-1.5">
                {selected.prep.map((b, i) => <li key={i} className="flex gap-2 text-[14px] leading-snug"><span className="text-[var(--accent)]">•</span><span>{b}</span></li>)}
              </ul>

              <p className="mt-5 text-[13px] leading-relaxed text-[var(--dim)]">You ignite — Muse runs temps, timers and alarms after that.</p>
              {!g.connected && <p className="mt-2 text-[13px] font-medium text-[var(--accent-text)]">Grill offline — power it on before you cook.</p>}
            </div>
            <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
              <button type="button" aria-label={`Cook ${selected.name}`} disabled={startMut.isPending}
                onClick={() => { try { window.localStorage.setItem("traeger-last-meat", selected.id); } catch { /* ignore */ } unlockAudioSpeech(); armKeepAwake(); startMut.mutate(selected.id); }}
                className="min-h-[56px] w-full rounded-xl bg-[var(--accent)] font-display text-lg font-bold text-[var(--on-accent)] disabled:opacity-50">
                Cook {selected.name}
              </button>
            </div>
          </div>
        ) : null}

        {/* ===== STAGE DETAIL SHEET ===== */}
        {detailStage && program && detailIdx != null && (
          <div className="absolute inset-0 z-[60] flex items-end bg-[var(--scrim)]" role="dialog" aria-modal="true" aria-label={`Stage details: ${detailStage.title}`}
            onClick={() => setDetailIdx(null)}>
            <div className="max-h-[86%] w-full overflow-y-auto overscroll-contain rounded-t-3xl border-t border-[var(--border)] bg-[var(--surface)] px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
              onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">
                    Step {detailIdx + 1} of {program.stages.length} · {detailIdx < (session?.currentStageIndex ?? 0) ? "Done" : detailIdx === session?.currentStageIndex ? (timerHeld ? "Active — timer held" : "Active now") : "Upcoming"}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-extrabold leading-tight">{detailStage.title}</h3>
                </div>
                <button type="button" aria-label="Close stage details" onClick={() => setDetailIdx(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--dim)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[var(--surface2)] px-2 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Duration</p>
                  <p className="mt-0.5 font-display text-base font-bold tabular-nums">{fmtDur(detailStage.durationMinutes)}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface2)] px-2 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Grill</p>
                  <p className="mt-0.5 font-display text-base font-bold tabular-nums">{detailStage.grillTemp != null ? `${detailStage.grillTemp}°F` : "Off"}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface2)] px-2 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Probe</p>
                  <p className="mt-0.5 font-display text-base font-bold tabular-nums">{detailStage.probeTarget != null ? `${detailStage.probeTarget}°F` : "—"}</p>
                </div>
              </div>

              {/* One meaning, one place (R5/T77): the sheet is title +
                  3 fact tiles + the why-line + ONE instruction block
                  (details). No owner chip (the row already tags it), no
                  per-stage boilerplate, no Muse:/You: cards, no
                  spoken-phrase section — the alarm speaks this same
                  instruction; printing it again was the duplication. */}
              <p className="mt-4 text-[13px] leading-relaxed text-[var(--dim)]">{detailStage.why}</p>

              <p className="mt-2 text-[15px] leading-relaxed">{detailStage.details}</p>

              <button type="button" aria-label="Close details" onClick={() => setDetailIdx(null)}
                className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)]">Close</button>
            </div>
          </div>
        )}

        {/* ===== SHUTDOWN CONFIRMATION (R9) — nothing is recorded until confirmed ===== */}
        {confirmShutdown && session && program && stage && (
          <div className="absolute inset-0 z-[70] flex items-end bg-[var(--scrim)]" role="dialog" aria-modal="true" aria-label="Confirm shutdown"
            onClick={() => setConfirmShutdown(false)}>
            <div className="w-full rounded-t-3xl border-t-2 border-[var(--red)] bg-[var(--surface)] px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
              onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
              <div className="mt-3 flex items-start justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-xl font-extrabold leading-tight text-[var(--bad-text-bright)]">
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bad-bg)] text-lg">⚠</span>
                  Shut down the grill?
                </h3>
                <button type="button" aria-label="Cancel shutdown" onClick={() => setConfirmShutdown(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--dim)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">
                Your {program.name} is at <b>{stage.title}</b>, probe <b>{g.probeTemp}°F</b>. Shutting down <b>ends this cook and this session</b> — the grill will cool down, and this <b>cannot be undone</b>: cooking again means igniting from scratch.
              </p>
              <button type="button" aria-label="Keep cooking" onClick={() => setConfirmShutdown(false)}
                className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-[var(--on-accent)]">
                Keep cooking
              </button>
              <button type="button" aria-label="Yes, shut down" disabled={shutdownMut.isPending}
                onClick={() => { setConfirmShutdown(false); shutdownMut.mutate(session.id); }}
                className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[var(--red)] font-display text-base font-bold text-white disabled:opacity-50">
                Yes, shut down
              </button>
            </div>
          </div>
        )}

        {/* ===== ALARM OVERLAY ===== */}
        {activeAlarm && (
          <div className="alarm-flash absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white" role="alert">
            <p className="text-6xl">🔔</p>
            <p className="mt-3 font-display text-4xl font-black leading-tight">{activeAlarm.headline}</p>
            <p className="mt-3 text-lg font-semibold leading-snug">{activeAlarm.body}</p>
            <button type="button" aria-label="Got it, silence alarm" onClick={ackAlarm}
              className="mt-6 min-h-[60px] w-full max-w-[300px] rounded-2xl bg-white font-display text-xl font-black text-[#7a1405]">
              ✓ Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
