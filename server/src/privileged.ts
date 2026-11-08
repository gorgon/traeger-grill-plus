// Host-side privileged functions for Traeger Grill Control.
//
// This module runs OUTSIDE the sandboxed action worker (via the
// runtime's privileged executor), so it may read the host environment
// and open raw sockets. Action code never imports this file: it imports
// only the contract descriptors (from `@space/privileged`, generated
// from the definePrivilegedContracts call below) and calls
// ctx.executePrivileged(...).
import { definePrivilegedContracts, definePrivilegedHandlers, z } from "@hatch/space-sdk";
import { randomBytes } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";

// getEgressProxy: the egress proxy the server runtime is configured
// with (HTTPS_PROXY & friends). fetch honors it automatically, but a
// raw WebSocket does not — so the live-refresh action asks here for
// the value it must hand to the WebSocket constructor. Without it the
// MQTT socket connects directly, dies at TLS in ~10ms, and no grill
// payload ever arrives (the v24 "refresh shows Stale" bug).
//
// The returned value is a credential-bearing URL: it goes only to this
// artifact's own server action, is used only as the socket's proxy,
// and is never logged, stored, or returned to the client.
//
// The precedence below mirrors resolveEgressProxy in src/actions.ts
// (the canonical copy, guarded by test T58) — keep the two in sync.
function resolveProxyFromEnv(): string | null {
  for (const key of ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return null;
}

// Sanitized error class ONLY: a Node error code (ECONNREFUSED,
// ETIMEDOUT, ERR_TLS_*, …) or the error's name. Never the message —
// messages can embed hostnames, addresses, or the proxy value.
function errorClassOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.length > 0 && code.length <= 48) return code;
  const name = (e as { name?: unknown } | null)?.name;
  if (typeof name === "string" && name.length > 0 && name.length <= 48) return name;
  return "Error";
}

// ---- Staged broker probe (v26 diagnostics) ----
// Walks the exact path the MQTT WebSocket must travel — proxy CONNECT
// (or direct TCP when no proxy is configured) → TLS handshake →
// WebSocket upgrade — with raw sockets, and reports the FIRST stage
// that fails plus a sanitized error class. The upgrade request is
// unsigned (path "/"), so a healthy broker answers 4xx: any HTTP
// status line proves the upgrade reached the server and the transport
// path is whole. Only the broker HOST crosses into this process (the
// action parses it from the signed URL; the signature never leaves the
// action), and nothing sensitive is returned: stage names, an error
// class, an HTTP status number, and whether a proxy is configured.
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolvePromise, reject) => {
    const s = net.connect({ host, port });
    const to = setTimeout(() => { try { s.destroy(); } catch { /* ignore */ } reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })); }, timeoutMs);
    s.once("error", (e) => { clearTimeout(to); reject(e); });
    s.once("connect", () => { clearTimeout(to); resolvePromise(s); });
  });
}
function readHttpHead(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let acc = Buffer.alloc(0);
    const cleanup = () => { clearTimeout(to); socket.off("data", onData); socket.off("error", onErr); socket.off("close", onClose); };
    const to = setTimeout(() => { cleanup(); reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })); }, timeoutMs);
    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      const idx = acc.indexOf("\r\n\r\n");
      if (idx >= 0) { cleanup(); resolvePromise(acc.subarray(0, idx + 4).toString("latin1")); }
      else if (acc.length > 16384) { cleanup(); reject(Object.assign(new Error("head too large"), { code: "EHEADTOOLARGE" })); }
    };
    const onErr = (e: Error) => { cleanup(); reject(e); };
    const onClose = () => { cleanup(); reject(Object.assign(new Error("closed"), { code: "ECONNRESET" })); };
    socket.on("data", onData);
    socket.once("error", onErr);
    socket.once("close", onClose);
  });
}
function tlsHandshake(raw: net.Socket, servername: string, timeoutMs: number): Promise<tls.TLSSocket> {
  return new Promise((resolvePromise, reject) => {
    const t = tls.connect({ socket: raw, servername });
    const to = setTimeout(() => { try { t.destroy(); } catch { /* ignore */ } reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })); }, timeoutMs);
    t.once("error", (e) => { clearTimeout(to); reject(e); });
    t.once("secureConnect", () => { clearTimeout(to); resolvePromise(t); });
  });
}
async function probeBrokerPathImpl(host: string, port: number): Promise<{ proxyPresent: boolean; failStage: "proxy_connect" | "tls" | "ws_upgrade" | null; errorClass: string | null; httpStatus: number | null }> {
  const proxy = resolveProxyFromEnv();
  const proxyPresent = proxy != null;
  let socket: net.Socket | tls.TLSSocket | null = null;
  const destroy = () => { try { socket?.destroy(); } catch { /* ignore */ } socket = null; };
  // Stage 1: reach the proxy and tunnel through it (or direct TCP).
  try {
    if (proxy) {
      let purl: URL;
      try { purl = new URL(proxy); } catch { return { proxyPresent, failStage: "proxy_connect", errorClass: "InvalidProxyUrl", httpStatus: null }; }
      const proxyPort = purl.port ? Number(purl.port) : 8080;
      socket = await tcpConnect(purl.hostname, proxyPort, 4_000);
      const auth = purl.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(purl.username)}:${decodeURIComponent(purl.password)}`).toString("base64")}\r\n`
        : "";
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}Proxy-Connection: keep-alive\r\n\r\n`);
      const head = await readHttpHead(socket, 4_000);
      const status = Number(/^HTTP\/\d\.\d (\d{3})/.exec(head)?.[1] ?? 0);
      if (status !== 200) { destroy(); return { proxyPresent, failStage: "proxy_connect", errorClass: `http_${status || 0}`, httpStatus: status || null }; }
    } else {
      socket = await tcpConnect(host, port, 4_000);
    }
  } catch (e) { destroy(); return { proxyPresent, failStage: "proxy_connect", errorClass: errorClassOf(e), httpStatus: null }; }
  // Stage 2: TLS handshake with the broker over the tunnel.
  try {
    socket = await tlsHandshake(socket, host, 5_000);
  } catch (e) { destroy(); return { proxyPresent, failStage: "tls", errorClass: errorClassOf(e), httpStatus: null }; }
  // Stage 3: WebSocket upgrade request (unsigned — any HTTP answer
  // proves the request reached the broker's HTTP layer).
  try {
    const key = Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64");
    socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n`);
    const head = await readHttpHead(socket, 5_000);
    const status = Number(/^HTTP\/\d\.\d (\d{3})/.exec(head)?.[1] ?? 0);
    destroy();
    if (status > 0) return { proxyPresent, failStage: null, errorClass: null, httpStatus: status };
    return { proxyPresent, failStage: "ws_upgrade", errorClass: "EBADSTATUS", httpStatus: null };
  } catch (e) { destroy(); return { proxyPresent, failStage: "ws_upgrade", errorClass: errorClassOf(e), httpStatus: null }; }
}

// ---- Full MQTT listen inside the privileged executor (v26) ----
// The whole broker exchange, run in THIS process over RAW sockets:
// proxy CONNECT (or direct TCP) → TLS → WebSocket upgrade → framed
// MQTT — the exact staged transport probeBrokerPath walks, which
// reaches Traeger's broker reliably here, while Bun's WebSocket
// (the action worker's socket AND a first privileged attempt) dies
// opaquely in the daemon-spawned processes. One context reads the
// proxy from its own environment AND opens the connection with it
// AND fires command "90" through its (proxy-wrapped) fetch. It is a
// pure transport: it returns every status payload that arrives on
// the subscription, in order, with its RETAIN flag — retained-vs-
// live acceptance stays in the action, which owns
// extractGrillStatus/classifyStatusPayload. The signed URL and token
// cross only into this server-side process; neither is logged or
// returned. Error reporting is sanitized: an outcome enum plus an
// error class token (http_NNN / a Node error code / connack_N) —
// never a message, a URL, or a credential.
function mqttRemainingLength(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; out.push(b); } while (v > 0);
  return out;
}
function mqttUtf8Field(s: string): number[] {
  const b = Array.from(new TextEncoder().encode(s));
  return [Math.floor(b.length / 256), b.length % 256, ...b];
}
function mqttConnectPacket(clientId: string): Uint8Array {
  const body = [...mqttUtf8Field("MQTT"), 4, 0x02, 0, 60, ...mqttUtf8Field(clientId)];
  return new Uint8Array([0x10, ...mqttRemainingLength(body.length), ...body]);
}
function mqttSubscribePacket(topic: string): Uint8Array {
  const body = [0, 1, ...mqttUtf8Field(topic), 0];
  return new Uint8Array([0x82, ...mqttRemainingLength(body.length), ...body]);
}
// One client→server WebSocket frame (RFC 6455: client frames MUST be
// masked). Payloads here are single MQTT packets, always FIN.
function wsClientFrame(opcode: number, payload: Uint8Array): Buffer {
  const len = payload.length;
  const maskKey = randomBytes(4);
  let head: number[];
  if (len < 126) head = [0x80 | opcode, 0x80 | len];
  else if (len < 65_536) head = [0x80 | opcode, 0x80 | 126, Math.floor(len / 256), len % 256];
  else head = [0x80 | opcode, 0x80 | 127, 0, 0, 0, 0, Math.floor(len / 16_777_216), Math.floor(len / 65_536) % 256, Math.floor(len / 256) % 256, len % 256];
  const masked = Buffer.from(payload.map((b, i) => b ^ maskKey[i % 4]!));
  return Buffer.concat([Buffer.from(head), maskKey, masked]);
}
type MqttListenOutcome = "payloads" | "connect_failed" | "subscribe_failed" | "link_lost" | "silent";
type MqttListenResult = { outcome: MqttListenOutcome; payloads: { json: string; retained: boolean }[]; proxyPresent: boolean; errorClass: string | null };
async function mqttListenImpl(args: { signedUrl: string; thingName: string; token: string; apiBase: string; capMs: number }): Promise<MqttListenResult> {
  const topic = `prod/thing/update/${args.thingName}`;
  const proxy = resolveProxyFromEnv();
  const proxyPresent = proxy != null;
  const capMs = Math.min(Math.max(args.capMs, 500), 20_000);
  let broker: URL;
  try { broker = new URL(args.signedUrl); } catch { return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: "InvalidUrl" }; }
  const host = broker.hostname;
  const port = broker.port ? Number(broker.port) : 443;
  const path = `${broker.pathname}${broker.search}`;
  let socket: net.Socket | tls.TLSSocket | null = null;
  const destroy = () => { try { socket?.destroy(); } catch { /* ignore */ } socket = null; };
  // Stage 1: proxy CONNECT tunnel (or direct TCP).
  try {
    if (proxy) {
      let purl: URL;
      try { purl = new URL(proxy); } catch { return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: "InvalidProxyUrl" }; }
      const proxyPort = purl.port ? Number(purl.port) : 8080;
      socket = await tcpConnect(purl.hostname, proxyPort, 4_000);
      const auth = purl.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(purl.username)}:${decodeURIComponent(purl.password)}`).toString("base64")}\r\n`
        : "";
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}Proxy-Connection: keep-alive\r\n\r\n`);
      const head = await readHttpHead(socket, 4_000);
      const status = Number(/^HTTP\/\d.\d (\d{3})/.exec(head)?.[1] ?? 0);
      if (status !== 200) { destroy(); return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: `http_${status || 0}` }; }
    } else {
      socket = await tcpConnect(host, port, 4_000);
    }
  } catch (e) { destroy(); return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: errorClassOf(e) }; }
  // Stage 2: TLS handshake with the broker.
  try {
    socket = await tlsHandshake(socket, host, 5_000);
  } catch (e) { destroy(); return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: errorClassOf(e) }; }
  // Stage 3: WebSocket upgrade with the REAL signed path (the path +
  // signature never leave this process). Any non-101 is a refusal.
  try {
    const key = randomBytes(16).toString("base64");
    socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n`);
    const head = await readHttpHead(socket, 5_000);
    const status = Number(/^HTTP\/\d.\d (\d{3})/.exec(head)?.[1] ?? 0);
    if (status !== 101) { destroy(); return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: `http_${status || 0}` }; }
  } catch (e) { destroy(); return { outcome: "connect_failed", payloads: [], proxyPresent, errorClass: errorClassOf(e) }; }
  // Stage 4: framed MQTT exchange until an acceptable-candidate set
  // is collected or the cap elapses.
  const tlsSocket = socket;
  return await new Promise<MqttListenResult>((resolvePromise) => {
    let settled = false;
    let connacked = false;
    let subscribed = false;
    const payloads: { json: string; retained: boolean }[] = [];
    let errorClass: string | null = null;
    const finish = (outcome: MqttListenOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      destroy();
      resolvePromise({ outcome, payloads, proxyPresent, errorClass });
    };
    const dropOutcome = (): MqttListenOutcome => (subscribed ? "link_lost" : connacked ? "subscribe_failed" : "connect_failed");
    const capOutcome = (): MqttListenOutcome => (subscribed ? "silent" : connacked ? "subscribe_failed" : "connect_failed");
    const deadline = setTimeout(() => finish(payloads.length > 0 ? "payloads" : capOutcome()), capMs);
    const sendMqtt = (packet: Uint8Array) => { try { tlsSocket.write(wsClientFrame(2, packet)); } catch { finish(dropOutcome()); } };
    // MQTT byte-stream parser (same framing rules as the action's
    // listen loop): complete packets are reassembled from the stream
    // regardless of how WS messages are chunked.
    let mbuf: number[] = [];
    const feedMqtt = (bytes: Uint8Array) => {
      mbuf.push(...Array.from(bytes));
      for (;;) {
        if (mbuf.length < 2) return;
        let remLen = 0; let mult = 1; let idx = 1; let lenComplete = false;
        for (; idx < mbuf.length && idx <= 4; idx++) {
          const b = mbuf[idx]!;
          remLen += (b & 0x7f) * mult;
          mult *= 128;
          if ((b & 0x80) === 0) { lenComplete = true; idx++; break; }
        }
        if (!lenComplete) return;
        const total = idx + remLen;
        if (mbuf.length < total) return;
        const packet = mbuf.slice(0, total);
        mbuf = mbuf.slice(total);
        const type = (packet[0]! >> 4) & 0x0f;
        if (type === 2) {
          const rc = packet[idx + 1] ?? 0;
          if (rc !== 0) { errorClass = `connack_${rc}`; finish("connect_failed"); return; }
          connacked = true;
          sendMqtt(mqttSubscribePacket(topic));
        } else if (type === 9) {
          if (!subscribed) {
            subscribed = true;
            void fetch(`${args.apiBase}/things/${args.thingName}/commands`, {
              method: "POST",
              headers: { authorization: args.token, "content-type": "application/json" },
              body: JSON.stringify({ command: "90" }),
            }).catch(() => { /* the listen cap governs the outcome */ });
          }
        } else if (type === 3) {
          const qos = (packet[0]! >> 1) & 0x03;
          let off = idx;
          const topicLen = (packet[off]! << 8) | packet[off + 1]!;
          off += 2 + topicLen;
          if (qos > 0) {
            const pid = (packet[off]! << 8) | packet[off + 1]!;
            off += 2;
            try { tlsSocket.write(wsClientFrame(2, new Uint8Array([0x40, 2, Math.floor(pid / 256), pid % 256]))); } catch { /* ignore */ }
          }
          const text = new TextDecoder().decode(new Uint8Array(packet.slice(off)));
          const retained = (packet[0]! & 0x01) === 1;
          payloads.push({ json: text, retained });
          // A live publish is always acceptable downstream — stop as
          // soon as one lands; also stop at 4 candidates.
          if (!retained || payloads.length >= 4) { finish("payloads"); return; }
        }
      }
    };
    // WebSocket frame reassembly: server frames may arrive split or
    // coalesced; control frames are handled inline.
    let rx: Buffer = Buffer.alloc(0);
    let msgParts: Buffer[] = [];
    tlsSocket.on("data", (chunk: Buffer) => {
      if (settled) return;
      rx = Buffer.concat([rx, chunk]);
      for (;;) {
        if (rx.length < 2) return;
        const fin = (rx[0]! & 0x80) !== 0;
        const opcode = rx[0]! & 0x0f;
        const masked = (rx[1]! & 0x80) !== 0;
        let len = rx[1]! & 0x7f;
        let off = 2;
        if (len === 126) { if (rx.length < off + 2) return; len = rx.readUInt16BE(off); off += 2; }
        else if (len === 127) {
          if (rx.length < off + 8) return;
          const big = rx.readBigUInt64BE(off);
          if (big > BigInt(16 * 1024 * 1024)) { finish(dropOutcome()); return; }
          len = Number(big); off += 8;
        }
        let mask: Buffer | null = null;
        if (masked) { if (rx.length < off + 4) return; mask = Buffer.from(rx.subarray(off, off + 4)); off += 4; }
        if (rx.length < off + len) return;
        let payload: Buffer = Buffer.from(rx.subarray(off, off + len));
        if (mask) { const mk = mask; payload = Buffer.from(payload.map((b, i) => b ^ mk[i % 4]!)); }
        rx = rx.subarray(off + len);
        if (opcode === 8) { finish(payloads.length > 0 ? "payloads" : dropOutcome()); return; }
        if (opcode === 9) { try { tlsSocket.write(wsClientFrame(10, payload)); } catch { /* ignore */ } continue; }
        if (opcode === 10) continue;
        msgParts.push(payload);
        if (fin) { const msg = Buffer.concat(msgParts); msgParts = []; feedMqtt(msg); if (settled) return; }
      }
    });
    tlsSocket.once("error", (e: Error) => { if (!errorClass) errorClass = errorClassOf(e); finish(payloads.length > 0 ? "payloads" : dropOutcome()); });
    tlsSocket.once("close", () => { if (!settled) finish(payloads.length > 0 ? "payloads" : dropOutcome()); });
    sendMqtt(mqttConnectPacket(`cockpit-${Math.random().toString(36).slice(2, 12)}`));
  });
}

export const Privileged = definePrivilegedContracts({
  getEgressProxy: {
    request: z.object({}),
    response: z.object({ proxy: z.string().nullable() }),
  },
  probeBrokerPath: {
    request: z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535) }),
    response: z.object({
      proxyPresent: z.boolean(),
      failStage: z.enum(["proxy_connect", "tls", "ws_upgrade"]).nullable(),
      errorClass: z.string().nullable(),
      httpStatus: z.number().nullable(),
    }),
  },
  mqttListen: {
    request: z.object({
      signedUrl: z.string().min(1),
      thingName: z.string().min(1),
      token: z.string().min(1),
      apiBase: z.string().min(1),
      capMs: z.number().int().min(500).max(20_000),
    }),
    response: z.object({
      outcome: z.enum(["payloads", "connect_failed", "subscribe_failed", "link_lost", "silent"]),
      payloads: z.array(z.object({ json: z.string(), retained: z.boolean() })),
      proxyPresent: z.boolean(),
      errorClass: z.string().nullable(),
    }),
  },
});

export const handlers = definePrivilegedHandlers(Privileged, {
  getEgressProxy: async () => ({ proxy: resolveProxyFromEnv() }),
  probeBrokerPath: async ({ host, port }) => probeBrokerPathImpl(host, port),
  mqttListen: async (args) => mqttListenImpl(args),
});
