# One fix and one new endpoint, after today's end-to-end test

**From:** Shopify team · **To:** Odoo backend team · **Date:** 6 October 2026
**Tested against:** `https://altbriterai.brite.app`, live, 6 October

Thank you for the extended payload — everything in our 5 October change request is in and working,
and bookings started succeeding this afternoon. Two things are left: one change to how failures are
reported, and one endpoint the storefront needs before the account page goes live.

---

## What we tested

We posted synthetic orders to `POST /api/v1/shopify/orders` through the afternoon:

| Time | Order | Result |
|---|---|---|
| 15:14 | `#TEST-0002` | `422` — "Sender name and address are missing on the connector" |
| 15:43 | `10003` | `201` · `state: booked` · AWB **53038567175** |
| 15:44 | `#TEST-0002`, re-posted | `200`, `created: false` · AWB **53038567186** |

**The sender address was configured between those calls, and booking now works.** Thank you.
Everything else held up: all extended fields are stored and returned, the customer matched on
phone (`partner_match: "phone"`, `needs_review: false`), and re-posting the same `order_id`
updated the order rather than creating a second one.

One note for the record: the order number does **not** need to be numeric. Shopify's own order
names carry a hash — `#1043` — and ST Courier's `refno` accepts any alphanumeric string up to 20
characters. `#TEST-0002` booked without complaint.

That leaves one fix and one gap.

---

## 1. A failed booking should not fail the whole call

Storing the order and booking the courier are two different jobs, and right now one status code
covers both. Odoo stored `#TEST-0002` perfectly and still answered `422`.

This matters because the caller is **Shopify Flow**, which reads the status code and nothing else.
A `422` is recorded as a failed run, so from the Shopify side it looks as though no order ever
arrived — which is exactly the conclusion we drew, wrongly, for most of today.

**What we are asking for:**

| Situation | Now | Please |
|---|---|---|
| Payload is invalid (bad PIN, bad phone, missing field) | `422` | keep `422` — this is ours to fix |
| Order stored, booking failed | `422` | **`201`**, with `tracking_state: "error"` and the reason in the body |
| Order stored and booked | `201` | unchanged |

In other words, `4xx` should mean "we could not accept your order", not "we accepted it but the
courier refused". A booking that fails for a reason on your side should be retried by you, or
flagged for staff, not pushed back onto Shopify — Flow cannot act on it.

## 2. Please add a customer-facing order detail endpoint

```
GET /api/v1/partners/me/orders/<id>
Authorization: Bearer <the customer's access token>
```

`GET /partners/me/orders` (§4) gives us the list, and the storefront's new detail screen is built
and shipping against it. What the list cannot show is the courier's history, because `events[]`
only exists on the API-key endpoint — and the storefront cannot use an API key, since anything the
browser holds is public.

Please return the same object the list returns for one order, plus:

```json
{
  "status": "ok",
  "order": {
    "...": "every field from the list entry",
    "payment_method": "cod",
    "shipping_address": { "name": "…", "street": "…", "city": "…", "state": "…", "zip": "…" },
    "events": [
      { "at": "2026-10-05T04:00:00Z", "status": "Out for delivery", "location": "TNABR-AMBUR → Gandhi Nagar" }
    ]
  }
}
```

Two rules for `events`, the same ones that apply to `status`:

- **Plain words only.** `"Out for delivery"`, never `DRS`. No NDR codes such as `AD` or `PS`
  either — if a delivery failed, say "Delivery attempted" and keep the reason for staff.
- **The partner comes from the token.** An order that is not that customer's must return `404`,
  not the order.

Until this exists the detail screen shows the journey derived from `status` and the link to ST
Courier's own page, and simply adds the history underneath when you ship it. No further work on
our side.

---

## What we have done on the Shopify side

- The Flow workflow is documented in `docs/odoo-order-flow-workflow.md`: it fires on **order
  created** (not on payment — COD orders are never "paid"), filters to India, and sends the full
  extended payload.
- The storefront account page lists orders from `/partners/me/orders` and opens one to show its
  items, totals, delivery journey and tracking number.
- Shopify app credentials for the fulfilment write-back have been shared and are working.

## What we need back

1. Your answer on the status-code change in §1.
2. A date for `GET /partners/me/orders/<id>` (§2).
3. Confirmation that the connector points at ST Courier's **demo** endpoint
   (`/ecom/v2/demobookings.php`) while we are testing, so these AWBs are not real consignments.
