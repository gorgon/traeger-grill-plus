#!/usr/bin/env python3
"""Segment monitor: hold the grill's setpoint at the active recipe stage
target until the probe reaches a threshold, then exit with an EVENT line.

- Credentials: ONE JSON line on stdin {"username": "...", "password": "..."}
  (transient, in-memory only, never stored/logged).
- Auth: auth-api ONLY, exactly one attempt.
- Behavior: subscribes to the grill's MQTT state feed; whenever the grill
  is igniting/cooking (system_status 5/6) and its setpoint != --target,
  sends the set-temp command (at most once per 60s). Requests a status
  update if the feed goes quiet for >240s.
- Exits (printing EVENT <name> ...) when: probe >= --until-probe,
  the grill stays offline >5 min, the cook stops (idle >3 min),
  or --max-minutes elapses.
"""
import argparse
import json
import os
import ssl
import sys
import time
import urllib.parse

sys.path.insert(0, "/home/hatch/workspace/traeger-wifire")
from traeger_client import WiFire  # noqa: E402

import paho.mqtt.client as mqtt  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, required=True)
    ap.add_argument("--until-probe", type=int, required=True)
    ap.add_argument("--event", default="THRESHOLD_REACHED")
    ap.add_argument("--max-minutes", type=int, default=330)
    ap.add_argument("--feed-app", action="store_true",
                    help="also POST each fresh state to the grill app (updategrillstate)")
    ap.add_argument("--feed-interval", type=int, default=120,
                    help="min seconds between app snapshot pushes")
    args = ap.parse_args()

    creds = json.loads(sys.stdin.readline())
    client = WiFire(creds["username"], creds["password"])
    token, expires = client._auth_via_auth_api()
    client._token = token
    client._token_expires = time.time() + float(expires)
    print("AUTH_OK", flush=True)

    user = client.get_user_data()
    things = user.get("things", [])
    thing = None
    for t in things:
        if isinstance(t, dict):
            thing = t.get("thingName") or t.get("name") or t.get("id")
            if thing:
                break
    if not thing:
        print("EVENT NO_GRILL", flush=True)
        return 0
    print(f"MONITORING thing={thing} target={args.target} until_probe={args.until_probe}", flush=True)

    latest = {"status": None, "at": 0.0}

    def on_connect(c, userdata, flags, rc):
        print("MQTT_CONNECTED rc=", rc, flush=True)
        c.subscribe(f"prod/thing/update/{thing}")

    def on_message(c, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8", "replace"))
        except Exception:
            return
        st = payload.get("status")
        if isinstance(st, dict) and "system_status" in st:
            latest["status"] = st
            latest["at"] = time.time()
            print(
                f"STATE sys={st.get('system_status')} grill={st.get('grill')} "
                f"set={st.get('set')} probe={st.get('probe')} conn={st.get('connected')}",
                flush=True,
            )

    mqtt_info = client.get_mqtt_signed_url()
    signed_url = mqtt_info.get("signedUrl") or mqtt_info.get("signed_url")
    parts = urllib.parse.urlparse(signed_url)
    mc = mqtt.Client(transport="websockets")
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy_url:
        import socks

        pp = urllib.parse.urlparse(proxy_url)
        mc.proxy_set(
            proxy_type=socks.PROXY_TYPE_HTTP,
            proxy_addr=pp.hostname,
            proxy_port=pp.port,
            proxy_username=pp.username,
            proxy_password=pp.password,
        )
    mc.on_connect = on_connect
    mc.on_message = on_message
    mc.ws_set_options(path=f"{parts.path}?{parts.query}", headers={"Host": parts.netloc})
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    mc.tls_set_context(ctx)
    mc.connect(parts.netloc, 443)
    mc.loop_start()

    started = time.time()
    last_correction = 0.0
    last_request = 0.0
    idle_since = None
    offline_since = None

    def finish(event, detail=""):
        print(f"EVENT {event} {detail}", flush=True)
        try:
            mc.loop_stop()
            mc.disconnect()
        except Exception:
            pass
        return 0


    # --- optional app feeder: push fresh snapshots into the grill app ---
    feed_state = {"last": 0.0}
    STATE_LABELS = {99: "Offline", 3: "Idle", 5: "Igniting", 6: "Cooking"}

    def feed_app(st):
        if not args.feed_app:
            return
        now = time.time()
        if now - feed_state["last"] < args.feed_interval:
            return
        feed_state["last"] = now
        try:
            import subprocess
            from datetime import datetime, timezone
            ts = st.get("time")
            iso = None
            if ts:
                iso = datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
            acc = st.get("acc") or []
            probe_con = any(
                a.get("type") == "probe" and a.get("con") for a in acc if isinstance(a, dict)
            )
            payload = {
                "ambientTemp": st.get("ambient"),
                "connected": bool(st.get("connected")),
                "cookIdPresent": bool(st.get("cook_id")),
                "grillTemp": st.get("grill"),
                "keepWarm": bool(st.get("keepwarm")),
                "probeConnected": bool(probe_con or st.get("probe_con")),
                "probeTemp": st.get("probe"),
                "setpoint": st.get("set"),
                "superSmoke": bool(st.get("smoke")),
                "systemStateLabel": STATE_LABELS.get(st.get("system_status"), "Unknown"),
                "systemStatus": st.get("system_status"),
            }
            if iso:
                payload["lastReportAt"] = iso
                payload["lastVerifiedAt"] = iso
            payload = {k: v for k, v in payload.items() if v is not None}
            # Shell bridge: append one JSON line; the coordinator drains
            # this file into the app via its artifact action tool.
            with open(os.path.expanduser(
                    "~/workspace/traeger-wifire/app_feed.jsonl"), "a") as fh:
                fh.write(json.dumps(payload) + "\n")
            print("FEED_APP queued snapshot for app push", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"FEED_APP_FAILED err={exc}", flush=True)

    time.sleep(3)
    try:
        client.request_status_update(thing)
        last_request = time.time()
    except Exception as exc:  # noqa: BLE001
        print(f"STATUS_REQUEST_FAILED err={exc}", flush=True)

    while True:
        time.sleep(5)
        now = time.time()
        if now - started > args.max_minutes * 60:
            return finish("TIMEOUT", f"after_min={args.max_minutes}")
        st = latest["status"]
        if st is None:
            if now - last_request > 240:
                try:
                    client.request_status_update(thing)
                    last_request = now
                except Exception:
                    pass
            continue
        feed_app(st)
        ss = st.get("system_status")
        setp = st.get("set")
        probe = st.get("probe")
        conn = st.get("connected")

        if probe is not None and probe >= args.until_probe:
            return finish(args.event, f"probe={probe} target={args.target} set={setp}")

        if (not conn) or ss == 99:
            if offline_since is None:
                offline_since = now
            elif now - offline_since > 300:
                return finish("GRILL_OFFLINE", f"sys={ss}")
            continue
        offline_since = None

        if ss == 3:
            if idle_since is None:
                idle_since = now
            elif now - idle_since > 180:
                return finish("COOK_STOPPED", "grill idle >3min")
            continue
        idle_since = None

        if ss in (5, 6) and setp is not None and setp != args.target:
            if now - last_correction > 60:
                try:
                    http = client.set_grill_temp(thing, args.target)
                    print(f"CORRECTION set {setp}->{args.target} http={http}", flush=True)
                    last_correction = now
                except Exception as exc:  # noqa: BLE001
                    print(f"CORRECTION_FAILED err={exc}", flush=True)
                    last_correction = now

        # Adaptive cadence: poll faster as the probe nears the threshold
        # so a target crossing is never missed between grill pushes.
        gap = args.until_probe - (probe if probe is not None else args.until_probe)
        if gap <= 8:
            quiet_limit, req_limit = 20, 25
        elif gap <= 20:
            quiet_limit, req_limit = 45, 60
        else:
            quiet_limit, req_limit = 120, 180
        if now - latest["at"] > quiet_limit and now - last_request > req_limit:
            try:
                client.request_status_update(thing)
                last_request = now
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
