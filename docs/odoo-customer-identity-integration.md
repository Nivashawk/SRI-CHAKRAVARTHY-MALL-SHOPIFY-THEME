# Customer Identity: Odoo ↔ Shopify Storefront — Integration Contract for the Odoo Team

**Prepared by:** Shopify team
**Companion file:** [`openapi/odoo-identity-api.yaml`](openapi/odoo-identity-api.yaml) — the machine-readable spec of every endpoint described here. Import it into Postman or generate a server stub from it.
**Status:** the login half is built and accepted. Section 0 records where both sides stand after your `ODOO_LOGIN_MODULE_SUMMARY.md` of 1 October 2026, and answers the five questions you asked us.

---

## 0. Where this stands (1 October 2026)

### 0.1 Accepted as built

Your `sso_identity` module meets this contract for the login itself. Nothing in it needs to change for us to start:

- RS256 with a `kid`, rotation keeping the old key published, and claims carrying `sub`, `sid`, `tv`, `auth_time` and `phone` at a 15-minute expiry.
- Refresh tokens opaque, hashed at rest, rotated on every use, with reuse detection that kills the session family.
- OTP codes hashed and single-use, five attempts, five-minute life, 3/hour and 10/day per number, 30→60→300s backoff, `+91` mobiles only, identical answers for known and unknown numbers, codes never logged.
- `login_phone` unique in the database, which settles §3.1 by schema rather than by process — `partner_ambiguous` cannot occur, and we have dropped it from our client.
- `DELETE /partners/me` and the test-server flag that returns the code in the response were not asked for and are both welcome. The second one lets us automate end-to-end tests without spending a single SMS.

### 0.2 Still to come from you

| Item | Note |
|---|---|
| **Service auth on the OTP endpoints** | The one urgent item. Public today; we will not publish the URL until it is closed |
| **Daily spend ceiling with a breaker, and the per-IP limit** | Before any live SMS, as you proposed |
| `resend_after` and attempts-remaining in responses | Small, but our UI needs both to tell the customer what to do |
| `POST /notifications/order` | **Blocks launch.** Waiting on the client's WhatsApp/DLT answer, not on you |
| `GET POST PATCH DELETE /partners/me/addresses` | **v1** — see §0.3 |
| `POST /partners/{id}/external-ids` | Where we hand you the Shopify customer id |
| `GET /api/v1/health` | Lets us tell an outage from a slow call and degrade instead of hanging |
| Three token errors still returning English sentences | `session_revoked`, `signed_out_everywhere`, `token_invalid` as you proposed |
| `Idempotency-Key` on writes | Above all order notifications: a retry must not send a second message |
| Test environment with its own keys and data | We will not load-test production |

### 0.3 Answers to your section 7

1. **Service auth: client credentials**, since you prefer them, plus the IP allowlist. We will send the IP privately once our backend host is provisioned; it is not up yet.
2. **Error shape: keep yours.** Your flat `{"status":"error","error":"invalid_code"}` already carries stable codes, and rewrapping working code buys nothing. Two additions only: `retry_after` on anything rate-limited, and `resend_after` on `otp/request`. We will adapt §6 of this document to your shape rather than the other way round.
3. **Token claims: please add `amr`, and leave `email` and `name` out.** The token sits in browser storage and travels in request bodies, so personal details belong behind `/partners/me` over TLS, not in a bearer token that can end up in a log. `aud` can stay the single string `shopify-storefront`; we validate that exact value.
4. **Order-event payload:** agreed as in §8. The WhatsApp/DLT decision sits with the client and we are chasing it.
5. **Scope: the address book is v1, invoices are phase 2.** The account area is too thin without saved addresses. For invoices we would rather wait until orders have been flowing into Odoo through your courier API long enough to prove the GST numbering on real orders; until then the account area shows a plain order receipt we render from Shopify data, clearly not labelled as a tax invoice.

**Also decided:** date of birth becomes **day and month only**. You offered the switch and we are taking it — a full date lets the system identify minors, which brings a parental-consent duty under the DPDP Act, and birthday offers do not need the year.

**One question back:** do your product records already carry **HSN codes and tax rates**? You are the product master, so if they are there, phase-2 invoicing is mostly plumbing as you say. If not, HSN has to be captured per product first, which is a catalogue job for the client and worth starting early.

---

## 1. What we are building together

The client wants **one customer login across their whole environment** — Odoo POS, rewards, invoicing, virtual try-on, and the Shopify storefront — with the **phone number as the identity**, verified by a one-time code.

Odoo is the identity provider. A customer who signs in once is signed in everywhere.

```
                       ┌──────────────────────────────┐
                       │  ODOO  (you)                 │
   phone + OTP ───────▶│  identity provider           │
                       │  partner, addresses,         │
                       │  invoices, rewards, POS      │
                       └──────────┬───────────────────┘
                                  │  signed token (JWT)
                                  │  + partner data over REST
                                  ▼
                       ┌──────────────────────────────┐
   storefront ────────▶│  mall-backend  (us)          │──▶ Shopify Admin API
   srichakravarthymall │  Shopify app + account area  │    customers, orders,
   .com/apps/account   │                              │    returns, cancellations
                       └──────────────────────────────┘
```

**You own:** the customer's identity, the OTP lifecycle, the token, partner records, addresses, invoices, rewards, and outbound customer messaging (WhatsApp/SMS).

**We own:** the Shopify app, the storefront account pages, everything that touches Shopify (orders, returns, cancellations, the Shopify customer record), and calling your API.

Neither side writes to the other's database directly. Everything crosses through the REST contract below.

---

## 2. Constraints from the Shopify side (why the design looks like this)

These are verified platform limits, not preferences. They explain why Shopify cannot simply accept your login the way your other apps can.

| Constraint | Consequence |
|---|---|
| Connecting an external identity provider to Shopify's own customer accounts requires **Shopify Plus**. This store is on **Advanced**. | Shopify's own account system can never be part of the single sign-on. We therefore build a **separate account area** at `srichakravarthymall.com/apps/account` which *can* accept your token, and hide Shopify's own account pages. |
| A Shopify customer **account** always requires an email address. | The phone number cannot be the login for Shopify's own accounts. It is the login for ours, which is what the customer sees. |
| Shopify **checkout** can accept a phone number instead of an email (a store setting we will switch on). | Customers can buy without an email. |
| Shopify's SMS order notifications **do not cover India**. | A phone-only customer gets **no order confirmation from Shopify at all**. Filling this gap is the job of §8 — we send you the order event, you message the customer. **This is a launch blocker; the store cannot go live on phone-only checkout without it.** |
| Phone-only checkout also disables Shop Pay and Shopify's own abandoned-checkout emails. | Abandoned-cart recovery for phone-only customers becomes a WhatsApp flow on your side, same mechanism as §8. |

---

## 3. Identity model

| Field | Owner | Notes |
|---|---|---|
| `partner_id` | Odoo | Your `res.partner` id. The identity across all Odoo apps. |
| `phone` (E.164) | Odoo | **The login.** Must be unique across partners. See §3.1. |
| `email` | Odoo | Optional. If present we copy it to Shopify so the customer gets native emails and invoices. |
| `account_id` | us | Our internal id. You never need it. |
| `shopify_customer_gid` | us | One partner may end up with **several** Shopify customer records (guest checkouts create them). We keep the mapping; we push the primary one to you via §7.5 for your reference only. |

### 3.1 Phone numbers

- Always **E.164**: `+919876543210`. No spaces, no `0` prefix, no `91` without `+`.
- We normalise on our side before every call; please store and return E.164 so comparisons match.
- v1 accepts **Indian mobiles only** (10 digits starting 6–9). Anything else we reject before calling you.
- **Duplicates are a real risk in an existing Odoo database.** Before go-live, please de-duplicate partners by phone. If `otp/verify` can return two partners for one number, we cannot know which customer's orders to show. Our client treats a multi-partner response as an error and blocks the login.

---

## 4. Authentication between the customer and Odoo

### 4.1 Flow

```
1. Customer opens srichakravarthymall.com/apps/account
2. One input box: phone number or email
3. We call  POST /api/v1/auth/otp/request      { identifier }
4. You send the code (SMS for a phone, email for an email)
5. Customer types the code
6. We call  POST /api/v1/auth/otp/verify       { request_id, code }
7. You return: access_token (JWT), refresh_token, partner profile
8. We validate the JWT against your JWKS and open our own session
9. Customer sees orders, addresses, invoices, rewards
```

The same token is what your other apps accept, which is what makes the single sign-on real. If a customer moves from the storefront to the try-on app or a rewards page, the token travels with them; we do not mint a competing identity.

### 4.2 Token requirements

**Access token — JWT, RS256** (not HS256; we must be able to verify without holding your signing secret).

```json
{
  "iss": "https://<odoo-host>/",
  "sub": "<partner_id>",
  "aud": ["mall-backend", "odoo-apps"],
  "phone": "+919876543210",
  "email": "customer@example.com",
  "name": "Full Name",
  "amr": ["otp"],
  "auth_time": 1790000000,
  "sid": "<session id>",
  "tv": 1,
  "iat": 1790000000,
  "exp": 1790000900
}
```

- `exp`: **15 minutes**. Short-lived, because a leaked token cannot be recalled.
- `sid`: session id, so a single session can be revoked.
- `tv`: token version for the partner. Increment it to invalidate every token for that customer at once (used when a customer says "log me out everywhere" or a number is reported stolen).
- `auth_time` / `amr`: we require a **fresh OTP within the last 10 minutes** before a customer may cancel an order, request a return, or change their email. We read `auth_time` to enforce this. If it is missing we force a re-verification every time, which is a worse experience.
- **Keys published at `/.well-known/jwks.json`**, cached by us for 10 minutes and re-fetched on an unknown `kid`. Rotate keys by publishing the new one alongside the old for at least 24 hours before retiring the old.

**Refresh token:** opaque, at least 32 random bytes, **rotated on every use**, 60-day expiry. If a refresh token is presented twice, treat it as theft: revoke the whole session family and force a new OTP. Please store refresh tokens **hashed**.

### 4.3 Abuse protection you must implement

The OTP endpoint is the most attacked surface in any system like this, and in India the specific risk is **SMS pumping** — an attacker forcing thousands of paid messages to numbers they control. We enforce our own limits at the edge, but yours are the ones that count, because your endpoint is the one that spends money.

| Control | Requirement |
|---|---|
| Codes | 6 digits, cryptographically random, **stored hashed**, single use, 5-minute expiry |
| Verify attempts | Max 5 per code, then the code dies and the number is locked for 15 minutes |
| Per-number requests | Max 3/hour and 10/day |
| Per-IP requests | Max 10/hour (we forward the customer's IP in `X-Forwarded-For`) |
| Resend backoff | 30s, then 60s, then 300s; return `resend_after` in the response |
| Country allowlist | `+91` mobiles only; reject everything else before sending |
| Daily spend ceiling | A configurable cap on messages per day with an alert, and a circuit breaker that stops sending when breached |
| No enumeration | `otp/request` must return an **identical response and similar timing** whether or not the identifier exists. Never "no account found". |
| Logging | Never log the code. Mask phone numbers to the last 4 digits. |

### 4.4 Single sign-on across the Odoo apps

Out of scope for this contract in the sense that we don't need to know how you do it — but two things affect us:

1. **One issuer.** Every app must accept tokens from the same issuer, so a customer who signs in on the storefront is recognised in POS, rewards and try-on without signing in again.
2. **Revocation must be global.** When `tv` is incremented or a session is revoked, our access must die too. We check on every request, so this works automatically as long as §7.6 reports it.

---

## 5. Authentication between our two servers

Every call in §6 and §7 is server-to-server. No browser ever calls your API directly; our backend is the only client.

- **OAuth 2.0 client credentials** preferred: we hold a client id and secret, exchange them for a short-lived service token, and send `Authorization: Bearer <token>`.
- A **static API key** in `X-Api-Key` is acceptable if client credentials are difficult in your setup, provided it can be rotated without downtime (accept two keys during a rotation window).
- **Please allowlist our server's IP** (we will send it privately) and reject everything else.
- **TLS 1.2 or better**, valid certificate. We will not disable verification.
- Secrets travel via a password manager or vault, never email or chat.

---

## 6. Endpoints you implement

Full request and response shapes are in [`openapi/odoo-identity-api.yaml`](openapi/odoo-identity-api.yaml). Summary:

| # | Endpoint | Purpose |
|---|---|---|
| 6.1 | `POST /api/v1/auth/otp/request` | Send a code to a phone or email |
| 6.2 | `POST /api/v1/auth/otp/verify` | Verify the code, return tokens + profile |
| 6.3 | `POST /api/v1/auth/token/refresh` | Rotate the refresh token, issue a new access token |
| 6.4 | `POST /api/v1/auth/logout` | Revoke one session (`sid`) or all sessions for a partner |
| 6.5 | `GET /.well-known/jwks.json` | Public keys for verifying the JWT |
| 6.6 | `GET /api/v1/partners/me` | Profile: name, phone, email, DOB, consents, rewards balance |
| 6.7 | `PATCH /api/v1/partners/me` | Update name, email, DOB, marketing consents |
| 6.8 | `GET/POST/PATCH/DELETE /api/v1/partners/me/addresses[/{id}]` | Address book (max 5) |
| 6.9 | `GET /api/v1/partners/me/invoices` | Invoice list and a signed PDF link. **Phase 2, not v1** — see §0.3 |
| 6.10 | `POST /api/v1/notifications/order` | **We call this on every Shopify order event; you message the customer.** See §8 |
| 6.11 | `POST /api/v1/partners/{partner_id}/external-ids` | We tell you the Shopify customer id we linked |
| 6.12 | `GET /api/v1/health` | Liveness, for our circuit breaker |

`/partners/me` resolves the partner from the **customer's** access token, which we forward. It must never accept a partner id from us as a way to read someone else's data.

### Rules that apply to every endpoint

- **JSON only.** UTF-8. `Content-Type: application/json`.
- **Idempotency:** we send `Idempotency-Key` on every POST/PATCH. Replaying the same key within 24 hours must return the original result, not perform the action twice. This matters most for §8 — a retry must not send a second WhatsApp message.
- **Timeouts:** respond within **2 seconds** (p99). We abort at 5 seconds and treat it as a failure. Five consecutive failures open our circuit breaker for 60 seconds, during which the customer sees degraded but working pages.
- **Errors** use one shape, so we can handle them generically:

```json
{ "error": { "code": "otp_invalid", "message": "Human readable, safe to show", "retry_after": 30 } }
```

Codes we handle specifically: `invalid_identifier`, `rate_limited`, `otp_invalid`, `otp_expired`, `otp_locked`, `sender_unavailable`, `partner_not_found`, `partner_ambiguous`, `validation_failed`, `step_up_required`, `internal_error`. Anything else is treated as `internal_error`.

- **Versioning:** the `/v1` prefix is part of the contract. Breaking changes need a `/v2` and an overlap period. Additive fields are fine at any time — we ignore what we don't know.

---

## 7. What we send you

| # | Trigger | Call |
|---|---|---|
| 7.5 | We create or link a Shopify customer | `POST /api/v1/partners/{id}/external-ids` with `{ "system": "shopify", "id": "gid://shopify/Customer/123" }` |
| 7.6 | — | **You** call us when a partner changes: `POST https://mall-app.brite.app/api/internal/odoo/partner-changed`, signed per §9 |
| 7.7 | Shopify order events | `POST /api/v1/notifications/order` — §8 |

We do **not** push orders into Odoo in this phase. Shopify remains the order record, mirrored into our database. If the client later wants full order and invoice sync into Odoo, that is a separate piece of work and an off-the-shelf Odoo connector may serve better than a custom build.

---

## 8. Order notifications — the part that replaces Shopify's emails

Because Shopify sends no SMS in India, and phone-only customers have no email, **the customer hears nothing after paying unless you message them.**

We call `POST /api/v1/notifications/order` when Shopify tells us an order was placed, paid, shipped, delivered, cancelled or refunded. You decide the channel (WhatsApp preferred, SMS fallback) using the client's existing provider and DLT-registered templates.

```json
{
  "event": "order.placed",
  "occurred_at": "2026-09-29T08:14:22Z",
  "partner_id": 4711,
  "phone": "+919876543210",
  "email": null,
  "locale": "ta",
  "order": {
    "number": "#1043",
    "placed_at": "2026-09-29T08:14:20Z",
    "currency": "INR",
    "total": "12450.00",
    "item_count": 2,
    "items": [{ "title": "Kanchipuram Silk Saree — Deep Maroon", "quantity": 1, "price": "9800.00" }],
    "status_url": "https://srichakravarthymall.com/apps/account/orders/1043",
    "tracking": { "carrier": "ST Courier", "number": "TN123456789", "url": "https://…" }
  }
}
```

Requirements:
- **Idempotent** on `Idempotency-Key` — we retry on failure with backoff, and the customer must not get the message twice.
- Respect marketing consent for promotional messages; order notifications are service messages and always send.
- `locale` is `en` or `ta`; please template both.
- Return `202` once you've queued it. Don't hold the connection while the provider responds.

Events we send: `order.placed`, `order.paid`, `order.shipped`, `order.out_for_delivery`, `order.delivered`, `order.cancelled`, `order.refunded`, `return.requested`, `return.approved`, `cart.abandoned`.

---

## 9. Webhooks from you to us

One endpoint, `POST https://mall-app.brite.app/api/internal/odoo/partner-changed`, for `partner.updated`, `partner.merged`, `partner.deleted`.

- Sign the **raw request body** with HMAC-SHA256 using a shared secret and send it as `X-Mall-Signature: sha256=<hex>`, plus `X-Mall-Timestamp` (Unix seconds). We reject anything older than 5 minutes or with a bad signature.
- We respond `202` fast and process asynchronously. Retry `5xx` with exponential backoff for up to 24 hours; do not retry `4xx` other than `429`.
- `partner.merged` must carry both ids so we can re-point our records.

A nightly reconciliation pull is acceptable for v1 if webhooks are hard for you — tell us in §12 and we will build the pull instead.

---

## 10. Privacy and data protection

Both sides hold personal data of Indian residents, so the **DPDP Act 2023** applies to both.

- **Purpose limitation:** we send you only what a message or a partner lookup needs. Please do the same.
- **Deletion:** when a customer asks to be deleted, we delete our rows and call you; you must erase or anonymise the partner except what tax law requires you to keep. We keep the Shopify order record because Shopify and Indian tax rules require it, but we unlink it.
- **Consent:** OTP messages are service messages. Marketing needs separate, timestamped consent — please store the timestamp and expose it on `/partners/me` so both systems agree.
- **Date of birth: day and month only**, decided 1 October 2026. A full date lets the system identify minors, which brings a parental-consent duty; birthday offers do not need the year. Existing full dates should be truncated when you make the change.
- **Logs:** no OTP codes, no tokens, no full phone numbers. Mask to the last 4 digits.

---

## 11. Environments, testing and acceptance

We need **two environments** — a test Odoo with its own keys and data, and production. We cannot test OTP flows against live customer records.

Acceptance checklist before go-live, run jointly:

1. OTP to a real Indian mobile arrives within 30 seconds; the code verifies; a token comes back and validates against the JWKS.
2. A wrong code five times locks the number; a sixth attempt returns `otp_locked`.
3. `otp/request` responds identically for a registered and an unregistered number (we will diff the responses and the timings).
4. Rate limits return `429` with `retry_after`.
5. The refresh token rotates, and replaying an old one kills the session.
6. Incrementing `tv` logs the customer out of both Odoo and the storefront within one access-token lifetime.
7. A test order fires `order.placed`, and the WhatsApp message arrives once — **and only once when we deliberately retry with the same idempotency key**.
8. Killing the Odoo test server leaves the storefront shoppable: product pages, cart and checkout keep working, and the account area degrades with an honest message rather than an error page.
9. Address create, update and delete round-trip between the account area and Odoo.
10. The duplicate-contact clean-up is finished, and the unique constraint on `login_phone` is verified against the live data rather than only on new logins.

---

## 12. Open questions

Answered in your summary of 1 October and closed here: RS256 and JWKS (yes, live) · who sends the OTP (you, with the limits and the spend cap) · service authentication (client credentials plus our IP) · webhooks rather than a pull (you push `partner.updated`) · date of birth (day and month) · rewards balance on `/partners/me` (yes) · invoices as time-limited signed URLs (yes).

Still open:

1. **Phone uniqueness across existing contacts.** The constraint covers new logins; tell us when the clean-up of existing duplicates is done. This blocks go-live.
2. **Provider and DLT templates** — which provider, and does the registration cover the OTP template and both order templates in English and Tamil?
3. **WhatsApp:** is the Business API account approved? Earlier notes say it was blocked. If it stays blocked, order notifications fall back to SMS and we need those templates instead. **This is the one thing blocking launch**, and it sits with the client.
4. **Uptime and on-call.** You are right that POS depends on the same service, so the number has to be one you can actually hold. We need it written down, with who to call at night.
5. **Test environment date.** Our side is about nine weeks; the two tracks need to converge well before that.
6. **HSN codes and tax rates on your product records** — see §0.3. Decides whether phase-2 invoicing is plumbing or a catalogue project.

---

## Appendix A — Glossary for the Shopify side

| Term | Meaning |
|---|---|
| App proxy | A Shopify feature that serves our pages under `srichakravarthymall.com/apps/account`, so the customer never leaves the shop's domain. |
| Shopify customer GID | Shopify's id for a customer, like `gid://shopify/Customer/12345`. |
| Customer accounts | Shopify's own login system. We are **hiding** it; it is not part of the single sign-on because that needs Shopify Plus. |
| Checkout contact method | The store setting that lets a customer check out with a phone number instead of an email. |
| Storefront vs Admin API | Public product data vs the authenticated management API. Only our backend holds Admin credentials. |
