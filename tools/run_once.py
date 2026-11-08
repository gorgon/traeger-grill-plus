#!/usr/bin/env python3
"""One-shot read-only grill state check.

- Credentials: ONE JSON line on stdin {"username": "...", "password": "..."}
  (transient, never stored, never logged by this script).
- Auth: auth-api ONLY -- no Cognito fallback, so exactly one auth attempt.
- Actions: list grills, open MQTT live channel, subscribe to each grill's
  status topic, send the "90" status-request command, listen ~15s, print
  a sanitized summary. No temperature/timer/shutdown commands.
"""
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
    creds = json.loads(sys.stdin.readline())
    client = WiFire(creds["username"], creds["password"])

    # Exactly one auth attempt, primary route only.
    token, expires = client._auth_via_auth_api()
    client._token = token
    client._token_expires = time.time() + float(expires)
    print("AUTH_OK expires_in_s=", int(expires), flush=True)

    user = client.get_user_data()
    things = user.get("things", [])
    summary = []
    for t in things:
        if isinstance(t, dict):
            summary.append({k: t.get(k) for k in
                            ("thingName", "name", "friendlyName", "model", "serialNumber", "firmwareVersion")
                            if k in t})
        else:
            summary.append({"thing": str(t)})
    print("THINGS:", json.dumps(summary), flush=True)
    if not things:
        print("NO_GRILLS_ON_ACCOUNT")
        return 0

    thing_names = []
    for t in things:
        if isinstance(t, dict):
            tn = t.get("thingName") or t.get("name") or t.get("id")
            if tn:
                thing_names.append(tn)
        else:
            thing_names.append(str(t))

    # Live state via MQTT signed URL.
    mqtt_info = client.get_mqtt_signed_url()
    signed_url = mqtt_info.get("signedUrl") or mqtt_info.get("signed_url")
    if not signed_url:
        print("MQTT_NO_SIGNED_URL keys=", list(mqtt_info.keys()))
        return 0

    messages = []

    def on_connect(c, userdata, flags, rc):
        print("MQTT_CONNECTED rc=", rc, flush=True)
        for tn in thing_names:
            c.subscribe(f"prod/thing/update/{tn}")

    def on_message(c, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8", "replace"))
        except Exception:
            payload = {"raw": msg.payload[:500].decode("utf-8", "replace")}
        messages.append({"topic": msg.topic, "payload": payload})
        print("MQTT_MSG:", json.dumps({"topic": msg.topic, "payload": payload})[:2000], flush=True)

    parts = urllib.parse.urlparse(signed_url)
    mc = mqtt.Client(transport="websockets")
    # This VM reaches the internet only through an HTTP egress proxy
    # (requests uses it automatically; a raw MQTT socket must be told).
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
        print("MQTT_PROXY_SET", flush=True)
    mc.on_connect = on_connect
    mc.on_message = on_message
    mc.ws_set_options(path=f"{parts.path}?{parts.query}", headers={"Host": parts.netloc})
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    mc.tls_set_context(ctx)
    mc.connect(parts.netloc, 443)
    mc.loop_start()
    time.sleep(3)

    for tn in thing_names:
        try:
            status = client.request_status_update(tn)
            print(f"STATUS_REQUEST_SENT thing={tn} http={status}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"STATUS_REQUEST_FAILED thing={tn} err={exc}", flush=True)

    time.sleep(15)
    mc.loop_stop()
    mc.disconnect()
    print(f"DONE messages_received={len(messages)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
