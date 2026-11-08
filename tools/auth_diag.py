#!/usr/bin/env python3
"""Diagnose ONE Traeger auth attempt and print the FULL error body.

Purpose (2026-11-07): the auth-api returned an opaque HTTP 400 to
run_once.py after working all day. This script surfaces the response
body so the cause is visible instead of guessed.

- Credentials: ONE JSON line on stdin {"username": "...", "password": "..."}
  (transient, never stored/logged).
- Exactly ONE auth attempt: POST auth-api /tokens. Nothing else.
- Prints: HTTP status, response headers (sanitized), full body text.
- NEVER prints the password or any returned token: on success it prints
  only the sorted field names and expiresIn.
"""
import json
import sys

import requests

AUTH_API_URL = "https://auth-api.iot.traegergrills.io/tokens"


def main():
    creds = json.loads(sys.stdin.readline())
    r = requests.post(
        AUTH_API_URL,
        json={"password": creds["password"], "username": creds["username"]},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    print("HTTP_STATUS", r.status_code, flush=True)
    print("BODY", r.text[:2000], flush=True)
    if r.ok:
        try:
            data = r.json()
            print("FIELDS", sorted(data.keys()), flush=True)
            print("EXPIRES_IN", data.get("expiresIn"), flush=True)
        except Exception as exc:  # noqa: BLE001
            print("JSON_PARSE_FAILED", exc, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
