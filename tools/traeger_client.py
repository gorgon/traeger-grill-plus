#!/usr/bin/env python3
"""
Direct WiFIRE client v2 for Igor's own Traeger grill.

CORRECTED 2026-11-07 after live probing. v1 was built from the oldest
community library (sebirdman/traeger) and is DEAD against today's Traeger
cloud -- verified live:
  * v1's Cognito client id (2fuohjtqv1e63dckp5v84rau0j) now returns
    ResourceNotFoundException: "User pool client ... does not exist."
  * v1's API base (1ywgyc65d1.execute-api.us-west-2.amazonaws.com/prod)
    no longer responds at all.

How the CURRENT Traeger app uses your login/password (from the maintained
community forks njobrien1006/hass_traeger, updated Sep 2026, and
johnvoipguy/Traeger-WiFire, 2025 -- cross-checked with live dummy-credential
probes on 2026-11-07, each returning NotAuthorizedException
"Incorrect username or password.", i.e. the endpoint is live and the
flow is correct; only the probe credentials were fake):

  Primary auth (what the current integrations use):
    POST https://auth-api.iot.traegergrills.io/tokens
    JSON body: {"username": "<email>", "password": "<password>"}
    -> flat JSON {"idToken": "...", "expiresIn": <sec>, ...}
    Traeger's own auth service fronts Cognito for the app; there is no
    AuthenticationResult wrapper anymore.

  Equivalent direct-Cognito route (also verified live):
    POST https://cognito-idp.us-west-2.amazonaws.com/
    InitiateAuth, USER_PASSWORD_AUTH, NEW ClientId 4id473dsrcq4kevlgrikukqn2a
    -> {"AuthenticationResult": {"IdToken": ..., "ExpiresIn": ...}}

  API base (all calls): https://mobile-iot-api.iot.traegergrills.io
    GET  /users/self                 -> {"things": [...]}  (your grills)
    POST /things/{thingName}/commands  body {"command": "<code>"}
         "90" status update, "11,{tempF}" grill temp,
         "120,10,{sensor_id},{tempF}" probe target, "12,{sec:05d}" timer,
         "13" reset timer, "17" shutdown. NO ignite command exists.
    POST /mqtt-connections           -> {"signedUrl": ...} live state via
                                        AWS IoT MQTT-over-WebSocket.

Credentials: environment variables TRAEGER_USERNAME / TRAEGER_PASSWORD
only. Never hard-coded, logged, or written to disk by this script.
NOTE: Muse's Secure Vault cannot feed this script (by design it never
releases a saved password to any tool) -- run this where the password can
be entered locally, e.g. on Igor's own Mac/PC.

Safety: read-only by default; state-changing commands need --confirm.
Deps: requests, paho-mqtt  (pip install requests paho-mqtt)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    requests = None

AUTH_API_URL = "https://auth-api.iot.traegergrills.io/tokens"
COGNITO_URL = "https://cognito-idp.us-west-2.amazonaws.com/"
COGNITO_CLIENT_ID = "4id473dsrcq4kevlgrikukqn2a"  # current app client id (public identifier)
API_BASE = "https://mobile-iot-api.iot.traegergrills.io"
APP_UA = "Traeger/11 CFNetwork/1209 Darwin/20.2.0"


class WiFire:
    def __init__(self, username: str, password: str, auth_header: str = "raw"):
        if requests is None:
            raise SystemExit("Missing dependency: pip install requests paho-mqtt")
        self.username = username
        self.password = password
        self.auth_header = auth_header  # "raw" (njobrien style) or "bearer" (johnvoipguy style)
        self._token = None
        self._token_expires = 0.0
        self.session = requests.Session()

    # -- auth ---------------------------------------------------------
    def _auth_via_auth_api(self):
        r = self.session.post(
            AUTH_API_URL,
            json={"password": self.password, "username": self.username},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return data["idToken"], float(data["expiresIn"])

    def _auth_via_cognito(self):
        now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        r = self.session.post(
            COGNITO_URL,
            json={
                "ClientMetadata": {},
                "AuthParameters": {"PASSWORD": self.password, "USERNAME": self.username},
                "AuthFlow": "USER_PASSWORD_AUTH",
                "ClientId": COGNITO_CLIENT_ID,
            },
            headers={
                "Content-Type": "application/x-amz-json-1.1",
                "X-Amz-Date": now,
                "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
            },
            timeout=30,
        )
        r.raise_for_status()
        result = r.json()["AuthenticationResult"]
        return result["IdToken"], float(result["ExpiresIn"])

    def _refresh_token(self):
        if self._token and self._token_expires - time.time() > 60:
            return
        errors = []
        for route in (self._auth_via_auth_api, self._auth_via_cognito):
            try:
                token, expires = route()
                break
            except Exception as exc:  # noqa: BLE001 - report both routes below
                resp = getattr(exc, "response", None)
                detail = ""
                if resp is not None:
                    try:
                        detail = resp.text[:200]
                    except Exception:
                        detail = ""
                errors.append(f"{route.__name__}: {exc} {detail}".strip())
        else:
            raise SystemExit("Traeger auth failed on both routes:\n  " + "\n  ".join(errors))
        self._token = token
        self._token_expires = time.time() + expires

    def _headers(self):
        self._refresh_token()
        auth_value = f"Bearer {self._token}" if self.auth_header == "bearer" else self._token
        return {
            "authorization": auth_value,
            "Content-Type": "application/json",
            "Accept-Language": "en-US",
            "User-Agent": APP_UA,
        }

    # -- read-only ----------------------------------------------------
    def get_user_data(self):
        r = self.session.get(f"{API_BASE}/users/self", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json()

    def list_grills(self):
        return self.get_user_data().get("things", [])

    def get_mqtt_signed_url(self):
        r = self.session.post(f"{API_BASE}/mqtt-connections", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json()

    # -- commands (require --confirm at the CLI layer) -----------------
    def _send_command(self, thing: str, command: str):
        r = self.session.post(
            f"{API_BASE}/things/{thing}/commands",
            json={"command": command},
            headers=self._headers(),
            timeout=30,
        )
        r.raise_for_status()
        return r.status_code

    def request_status_update(self, thing: str):
        return self._send_command(thing, "90")

    def set_grill_temp(self, thing: str, temp_f: int):
        if not 165 <= temp_f <= 500:
            raise SystemExit(f"Refusing out-of-range grill temp: {temp_f}F")
        return self._send_command(thing, f"11,{temp_f}")

    def set_probe_temp(self, thing: str, temp_f: int, sensor_id=0):
        if not 100 <= temp_f <= 215:
            raise SystemExit(f"Refusing out-of-range probe temp: {temp_f}F")
        return self._send_command(thing, f"120,10,{sensor_id},{temp_f}")

    def set_timer(self, thing: str, seconds: int):
        return self._send_command(thing, f"12,{seconds:05d}")

    def reset_timer(self, thing: str):
        return self._send_command(thing, "13")

    def shutdown(self, thing: str):
        return self._send_command(thing, "17")


def _creds(from_stdin=False):
    if from_stdin:
        # One-shot transient credentials: a single JSON line on stdin,
        # {"username": "...", "password": "..."} -- never written to disk,
        # never in argv / environment / shell history.
        line = sys.stdin.readline()
        try:
            data = json.loads(line)
            return data["username"], data["password"]
        except Exception:
            raise SystemExit("Could not read credentials JSON from stdin.")
    u = os.environ.get("TRAEGER_USERNAME")
    p = os.environ.get("TRAEGER_PASSWORD")
    if not u or not p:
        raise SystemExit(
            "Set TRAEGER_USERNAME and TRAEGER_PASSWORD in the environment first "
            "(on your own machine, locally -- do not paste them in chat)."
        )
    return u, p


def main(argv=None):
    ap = argparse.ArgumentParser(description="Direct WiFIRE client v2 (read-only by default)")
    ap.add_argument("--auth-header", choices=["raw", "bearer"], default=os.environ.get("TRAEGER_AUTH_HEADER", "raw"))
    ap.add_argument("--creds-stdin", action="store_true", help="Read one-shot credentials JSON from stdin instead of env vars")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-grills", help="List grills on the account (read-only)")

    for name, helptext in [
        ("set-temp", "Set grill temp F (needs --confirm)"),
        ("set-probe", "Set probe target F (needs --confirm)"),
    ]:
        sp = sub.add_parser(name, help=helptext)
        sp.add_argument("thing")
        sp.add_argument("temp", type=int)
        sp.add_argument("--confirm", action="store_true")

    sp = sub.add_parser("set-timer", help="Set cook timer in minutes (needs --confirm)")
    sp.add_argument("thing")
    sp.add_argument("minutes", type=int)
    sp.add_argument("--confirm", action="store_true")

    sp = sub.add_parser("shutdown", help="Shut the grill down (needs --confirm)")
    sp.add_argument("thing")
    sp.add_argument("--confirm", action="store_true")

    args = ap.parse_args(argv)
    write_cmds = {"set-temp", "set-probe", "set-timer", "shutdown"}
    if args.cmd in write_cmds and not getattr(args, "confirm", False):
        raise SystemExit(f"{args.cmd} changes the grill -- re-run with --confirm if that's intended.")

    client = WiFire(*_creds(from_stdin=args.creds_stdin), auth_header=args.auth_header)

    if args.cmd == "list-grills":
        print(json.dumps(client.list_grills(), indent=2))
    elif args.cmd == "set-temp":
        print("set-temp status:", client.set_grill_temp(args.thing, args.temp))
    elif args.cmd == "set-probe":
        print("set-probe status:", client.set_probe_temp(args.thing, args.temp))
    elif args.cmd == "set-timer":
        print("set-timer status:", client.set_timer(args.thing, args.minutes * 60))
    elif args.cmd == "shutdown":
        print("shutdown status:", client.shutdown(args.thing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
