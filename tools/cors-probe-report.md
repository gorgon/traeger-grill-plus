# Traeger WiFIRE — Browser-Direct (CORS) Feasibility Probe Report

- **Date/time (UTC):** Sat Nov 7, 2026, 22:47 UTC (14:47 PST)
- **Purpose:** Decide whether a public web app could talk to Traeger's WiFIRE cloud **directly from the user's browser**, with the user's Traeger credentials exchanged in-browser and only a token kept client-side.
- **Method:** `curl` from this VM via the `HTTPS_PROXY` egress proxy. All probes were read-only and credential-free. **Zero login attempts (real or fake) were made.** The `HTTP/1.1 200 Connection Established` line in the raw dumps is the proxy's CONNECT response, not Traeger's.
- **Test origin (arbitrary public origin):** `https://grillcontrol.example.com`
- **Endpoints (from `traeger_client.py`):**
  - Auth: `POST https://auth-api.iot.traegergrills.io/tokens`
  - API base: `https://mobile-iot-api.iot.traegergrills.io` (`GET /users/self`, `POST /mqtt-connections`, `POST /things/{thingName}/commands`)
  - Fallback auth: direct Cognito `InitiateAuth` (`USER_PASSWORD_AUTH`, client ID `4id473dsrcq4kevlgrikukqn2a`) at `https://cognito-idp.us-west-2.amazonaws.com/`

---

## Bottom line (measured)

**Browser-direct from an arbitrary public origin is BLOCKED by CORS on both Traeger hosts — but for two different reasons, and the auth host is surprisingly close to open:**

1. **Auth host (`auth-api.iot.traegergrills.io`)** runs a *selective* CORS allowlist: it echoes `Access-Control-Allow-Origin` only for some origins (measured: `https://www.traeger.com`, `https://traeger.com`, `http://localhost:8100`) and omits it for others (measured: our test origin, `https://app.traeger.com`, `https://evil-traeger.com`, `https://foo.traegergrills.io`, `capacitor://localhost`, `ionic://localhost`, `null`). An origin not on the list gets a preflight a browser will **reject**.
2. **API host (`mobile-iot-api.iot.traegergrills.io`)** returned **no `Access-Control-Allow-Origin` for any origin tested** — including `https://www.traeger.com`. Every cross-origin browser call to the actual grill API would be blocked at preflight (or, for the simple GET, its response would be unreadable).

So the proposed "password in the page once → token in the browser → browser talks to Traeger directly" architecture **does not work against today's Traeger cloud configuration**, unless the page is served from an origin Traeger has allowlisted (only observed: traeger.com domains / localhost) — not something a third-party public app controls.

---

## Probe 1 — CORS preflight against the auth endpoint

**Request**
```
OPTIONS https://auth-api.iot.traegergrills.io/tokens
Origin: https://grillcontrol.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type
```

**Response:** `HTTP/1.1 200 OK`, `Content-Length: 0`

CORS-relevant headers (verbatim, complete list as returned):
```
Access-Control-Allow-Headers: Accept,Accept-Language,Authorization,Content-Type
Access-Control-Allow-Methods: POST,OPTIONS
Access-Control-Allow-Credentials: true
Vary: Origin
```
**`Access-Control-Allow-Origin`: ABSENT.**

**Interpretation (fact + rule):** methods, headers and credentials are all generously allowed, but without `Access-Control-Allow-Origin` matching the page origin, the Fetch spec fails the preflight and the browser blocks the subsequent POST. For this origin: **blocked**.

---

## Probe 2 — CORS preflight against the API base

**Request**
```
OPTIONS https://mobile-iot-api.iot.traegergrills.io/users/self
Origin: https://grillcontrol.example.com
Access-Control-Request-Method: GET
Access-Control-Request-Headers: authorization
```

**Response:** `HTTP/1.1 204 No Content`

CORS-relevant headers (verbatim):
```
Access-Control-Allow-Headers: authorization
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Credentials: true
Vary: Origin, Access-Control-Request-Headers
```
**`Access-Control-Allow-Origin`: ABSENT.**

**Interpretation:** same failure mode — no ACAO, so a browser rejects the preflight for the authorized GET. For this origin: **blocked**.

---

## Probe 3 — Simple cross-origin GET, no credentials (error-response CORS)

**Request**
```
GET https://mobile-iot-api.iot.traegergrills.io/users/self
Origin: https://grillcontrol.example.com
(no token)
```

**Response:** `HTTP/1.1 401 Unauthorized`, body `{"message":"Unauthorized"}` — exactly the expected unauthenticated result.

CORS-relevant headers (verbatim):
```
Access-Control-Allow-Credentials: true
Vary: Origin
```
**`Access-Control-Allow-Origin`: ABSENT** — also on the error response.

**Interpretation:** even a "simple" request that skips preflight would have its response withheld from page JavaScript. Confirms the API host does not expose responses cross-origin (for this origin).

---

## Probe 4 — Auth endpoint, plain OPTIONS and HEAD (no CORS request headers)

**4a — `OPTIONS https://auth-api.iot.traegergrills.io/tokens` (no Origin):**
`HTTP/1.1 200 OK` with the identical header set as Probe 1:
```
Access-Control-Allow-Headers: Accept,Accept-Language,Authorization,Content-Type
Access-Control-Allow-Methods: POST,OPTIONS
Access-Control-Allow-Credentials: true
Vary: Origin
```
(ACAO absent — expected with no Origin sent; shows the Allow-Methods/Headers/Credentials set is emitted unconditionally by the auth service's middleware.)

**4b — `HEAD https://auth-api.iot.traegergrills.io/tokens`:**
`HTTP/1.1 404 Not Found` (HEAD is not a routed method on /tokens), still with `Access-Control-Allow-Credentials: true` and `Vary: Origin`, ACAO absent.

**Note from the dumps:** the auth host also sends `Cross-Origin-Resource-Policy: same-origin` — a further signal it is not configured for cross-origin browser embedding/use by arbitrary sites.

---

## Supplementary probes — which origins DOES the auth host allow? (measured)

Same preflight as Probe 1, varying only `Origin`:

| Origin | ACAO in response? |
|---|---|
| `https://grillcontrol.example.com` (arbitrary) | **No** |
| `https://www.traeger.com` | **Yes** — `Access-Control-Allow-Origin: https://www.traeger.com` |
| `https://traeger.com` | **Yes** — `Access-Control-Allow-Origin: https://traeger.com` |
| `https://app.traeger.com` | No |
| `http://localhost:8100` | **Yes** — `Access-Control-Allow-Origin: http://localhost:8100` |
| `https://evil-traeger.com` | No |
| `https://foo.traegergrills.io` | No |
| `capacitor://localhost` | No |
| `ionic://localhost` | No |
| `null` | No |

**Facts:** ACAO is an exact echo of the request Origin when present (not `*`), consistent with an allowlist + `Access-Control-Allow-Credentials: true`. Which exact list Traeger maintains is **not knowable from outside** — only the sampled results above are measured. The `http://localhost:8100` allowance suggests developer/dev-build origins are whitelisted; a production third-party domain cannot be assumed onto the list (and cannot be added by us).

**API host cross-checks (measured):**
- Preflight on `/users/self` with `Origin: https://www.traeger.com`, `http://localhost:8100`, and `capacitor://localhost`: **ACAO absent in all three** (otherwise identical to Probe 2).
- Preflight on `/mqtt-connections` with `Origin: https://www.traeger.com`, `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: authorization,content-type`: `204 No Content`, `Access-Control-Allow-Headers: authorization,content-type`, `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`, `Access-Control-Allow-Credentials: true` — **ACAO absent**.
- `GET /users/self` with `Origin: https://www.traeger.com`, no token: `401 Unauthorized`, **ACAO absent** (same as Probe 3).

So the API host shows **no origin-dependent ACAO behavior at all** in our samples — unlike the auth host, it appears to run CORS middleware (helmet/Express-style header set with `Vary: Origin`) that never actually grants an origin. Whether any origin exists that the API host would grant is **inconclusive by sampling alone**, but the practical verdict for any origin we could actually deploy on is: blocked.

**Not probed:** `Access-Control-Allow-Origin` behavior of the Cognito endpoint (`cognito-idp.us-west-2.amazonaws.com`) — out of scope of the assigned probes; AWS service endpoints historically do not emit ACAO for arbitrary origins, but that is unverified here and labeled as such.

---

## Refresh tokens — what the code says (code/docs-based, NOT live-verified)

### (a) auth-api `POST /tokens` response shape, per fork code

Fields the forks **actually read** from the `/tokens` response:

| Source | Fields read |
|---|---|
| `traeger_client.py` (this workspace) | `idToken`, `expiresIn` — nothing else |
| njobrien1006/hass_traeger `traeger.py` (`do_cognito()` → `__refresh_token()`) | `response["expiresIn"]`, `response["idToken"]` — nothing else |
| johnvoipguy/Traeger-WiFire | Does **not** use auth-api; uses direct Cognito (below) |

**No fork reads, stores, or uses any refresh-token field from the auth-api response.** Both auth-api consumers treat "refresh" as *re-POSTing the username/password* when `expiresIn` is about to lapse (njobrien's method is literally named `__refresh_token` but re-authenticates with the password). Whether the `/tokens` JSON contains additional un-read fields cannot be determined from the code — and per task constraints was not tested live (a live test would require a credentialed login).

**Also from fork code:** `/mqtt-connections` response fields read are `signedUrl` and `expirationSeconds` (both forks).

### (b) Direct Cognito `USER_PASSWORD_AUTH` (client ID `4id473dsrcq4kevlgrikukqn2a`)

- johnvoipguy's fork uses this flow and reads only `AuthenticationResult.ExpiresIn` and `AuthenticationResult.IdToken`. A search of its full `traeger.py` finds **no `RefreshToken` reference anywhere**.
- **Per AWS documentation for `InitiateAuth`** (docs-based, unverified live for this specific client): the `AuthenticationResultType` response shape includes `AccessToken`, `ExpiresIn`, `TokenType`, **`RefreshToken`**, and `IdToken`. For a successful non-challenge `USER_PASSWORD_AUTH` sign-in, Cognito normally returns a refresh token alongside the ID/access tokens (subject to the app client's token-validity configuration, which only Traeger can see). A client could then use `REFRESH_TOKEN_AUTH` to renew ID/access tokens without the password.
- **Status: PLAUSIBLE BUT UNVERIFIED-LIVE for Traeger's client.** No credentialed call was made in this probe (by design — prior fake-credential attempts triggered Cognito throttling). If this route does return a refresh token, it materially improves any token-based design (long-lived renewal without storing the password) — but note the browser-direct design is already blocked on CORS grounds above, so this matters mainly for a server-side or self-hosted design.

---

## MQTT note

Per `traeger_client.py` and both forks, live state comes from `POST /mqtt-connections`, which returns a **pre-signed AWS IoT WebSocket URL** (`signedUrl`, with `expirationSeconds`). A signed `wss://` URL authenticates via its query string — no extra headers needed — so it is **browser-compatible in principle** (standard WebSocket + MQTT-over-WS libraries work in browsers; the current server-side monitor uses the same URL via paho). **Caveat:** you can only *obtain* the signed URL by POSTing to the API host, which is itself CORS-blocked from the browser (see supplementary probe on `/mqtt-connections`). So MQTT does not rescue a pure-browser architecture; it fits a design where any non-browser component fetches the signed URL.

---

## Per-endpoint verdicts

| Endpoint | Verdict |
|---|---|
| `POST https://auth-api.iot.traegergrills.io/tokens` | **Blocked by CORS for arbitrary public origins** (measured). Works only from allowlisted origins (measured: `traeger.com`, `www.traeger.com`, `http://localhost:8100`); a third-party app cannot get its production origin allowlisted. |
| `GET https://mobile-iot-api.iot.traegergrills.io/users/self` | **Blocked by CORS for every origin tested** (measured), including traeger.com origins — no ACAO on preflight or on the 401 response. |
| `POST https://mobile-iot-api.iot.traegergrills.io/mqtt-connections` | **Blocked by CORS for every origin tested** (measured) — preflight grants methods/headers but never an origin. |
| Direct Cognito `InitiateAuth` | **Inconclusive — not probed** (out of assigned scope); no ACAO expectations established. Refresh-token issuance is docs-supported but unverified-live for Traeger's client. |
| Signed MQTT `wss://` URL | **Browser-compatible in principle** (inference from the signed-URL mechanism), but obtaining the URL requires the CORS-blocked API host. |

## Architecture implication (inference, clearly labeled)

Measured facts kill the pure-browser variant as proposed: the password→token exchange *might* work from an allowlisted origin, but the grill API calls the app actually needs (`/users/self`, `/mqtt-connections`, `/things/.../commands`) are refused cross-origin from **every** origin sampled, including Traeger's own. The realistic shapes that remain are the ones already discussed with the user: (1) a small server-side proxy/worker per user holding only a **token** (never the password) — CORS is a browser-only constraint and does not apply server-to-server; or (2) self-hosted/local deployment (e.g., a page served from `http://localhost` — interestingly an origin the auth host allowlists, though the API host still does not). A definitive test of the *full* browser flow (post-login API calls, Cognito endpoint CORS) would require a real credentialed login from a real browser origin and was explicitly out of scope for this probe.
