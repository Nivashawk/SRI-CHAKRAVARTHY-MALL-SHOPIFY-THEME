# `POST /api/v1/shopify/orders` — fields to add

**From:** Shopify team · **To:** Odoo backend team · **Date:** 5 October 2026
**Endpoint:** `POST https://altbriterai.brite.app/api/v1/shopify/orders`

---

## Why we are asking

Your endpoint was specified for booking ST Courier, and for that it has everything it needs. We are now also using it as the **source of the customer's order history**: the storefront account page will call `GET /api/v1/partners/me/orders` (§4) and show the customer what they bought.

That read can only return what this write stored. Anything missing here is missing on the customer's screen later, with no way to backfill it — so it is worth settling before orders start flowing.

**Nothing below changes what you already built.** Every addition is a new optional field; the existing ones keep their names, types and meaning.

**One question first, which may make half of this unnecessary.** You are the product master — you push products into Shopify. If your product records already hold the image and the HSN code against the same SKU, say so and we will drop those fields from the request: you can join on `sku` instead, and the payload stays lean. The money fields in §2.2 are needed either way.

---

## 1. What we send today

Unchanged. Listed so the diff is readable.

| Field | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Shopify GID, e.g. `gid://shopify/Order/5551234567`. Your idempotency key |
| `order_number` | string | yes | `#1001` |
| `phone` | string | yes | The customer's own number, and how you find their partner. Always present — see §3.2 |
| `email` | string | no | Optional. Many customers here shop without one |
| `customer_name` | string | no | |
| `amount_total` | number | yes | |
| `currency` | string | yes | `INR` |
| `payment_method` | string | yes | `cod` or `prepaid` |
| `cod_amount` | number | no | |
| `order_date` | string | yes | ISO 8601, UTC |
| `weight_kg` | number | no | See §3.1 |
| `shipping_address` | object | yes | `name`, `street`, `street2`, `city`, `state`, `zip` |
| `items[]` | array | yes | `name`, `product_id`, `variant_id`, `sku`, `barcode`, `quantity`, `price` |

---

## 2. Fields to add

### 2.1 So the order history screen is usable

| New field | Type | Why |
|---|---|---|
| `items[].image_url` | string | Without it the customer's order history is a text list. In a saree shop people recognise the photograph, not the SKU. Shopify's CDN URLs are public and stable — safe to store as given |
| `items[].variant_title` | string | Which one. `name` alone gives "Soft silk saree" with no colour or size |
| `items[].properties` | object | Stitching instructions, gift messages, blouse measurements. Entered by the customer at checkout and currently lost |
| `items[].product_url` | string | Lets "buy it again" work from the account page |
| `fulfillment_status` | string | `unfulfilled`, `partial`, `fulfilled` — what the customer sees as the order's state before the courier takes over |

### 2.2 So your totals reconcile with what was charged

Today only `amount_total` arrives, so you cannot tell how it was arrived at. Every one of these is a number we already have:

| New field | Type | Why |
|---|---|---|
| `subtotal` | number | Goods before shipping, discounts and tax |
| `discount_total` | number | |
| `discount_codes` | array of string | Which code was used |
| `shipping_total` | number | |
| `tax_total` | number | |
| `items[].original_price` | number | Before any discount — `price` today is ambiguous about which it is |
| `items[].discount` | number | Per line |
| `items[].line_total` | number | What that line actually came to |

Please also tell us whether `price` is per unit or the line total. We have assumed **per unit** and will send `line_total` alongside it.

### 2.3 So invoicing and delivery are correct

| New field | Type | Why |
|---|---|---|
| `shipping_address.country` | string | **Your payload has no country field.** The store sells to 22 countries; we filter to India before calling you, but you should reject anything else rather than trust us |
| `shipping_address.country_code` | string | `IN` |
| `shipping_address.phone` | string | The *delivery* phone, which on a gift order is the recipient's — not the customer's. Keep it separate from the top-level `phone` |
| `billing_address` | object | Same shape as `shipping_address`. Needed for the GST invoice |
| `customer_locale` | string | `en` or `ta`, so your messages go out in the language they shop in |
| `order_status_url` | string | Shopify's own tracking page for that order |

---

## 3. Three things to know about the data

### 3.1 No product has a weight
Nothing in the catalogue carries one, so `weight_kg` will be absent or zero on every order until the client fills them in. Your default will apply to every consignment, and freight is billed on weight. Flagged to the client; a saree runs roughly 0.5–1.2 kg.

### 3.2 Two phones, and both keys matter

**A phone number will now be on every order.** We are setting *Shipping address phone number* to **Required** in the Shopify checkout, so no order can be placed without one. Email stays optional.

(Shopify has no "phone only" contact method — the choice is *Phone number or email* or *Email*, and the first lets the customer pick. Requiring the address phone is how we guarantee a number regardless of what they pick.)

That gives you **two phone numbers, and they are not the same thing**:

| Field | Whose number | Use |
|---|---|---|
| `phone` | the **customer's** — what they typed as their contact, and the number they signed in with | **Matching the order to a partner** |
| `shipping_address.phone` | the **delivery** number — on a gift order this is the recipient, not the customer | Giving to the courier |

Matching rules we are asking for:

1. `order_id` identifies the **order**. It is your deduplication key: the same `order_id` twice is one order, never two.
2. `phone` identifies the **customer**. Match it, normalised to E.164, against `login_phone` to find the partner.
3. If the top-level `phone` is absent, fall back to `email`, then to `shipping_address.phone` — but treat that last one as **weak**: on a gift order it belongs to someone else, and matching on it would put one customer's order in another customer's account.
4. No match at all → store the order, attach no partner, and flag it for staff. Please do not guess.

So both matter, for different jobs: **`order_id` says which order, `phone` says whose.**

### 3.3 The API key cannot be locked to an IP
You offered to restrict it to our server's address. There is no server: the call comes from **Shopify Flow**, running on Shopify's own infrastructure, whose addresses are neither fixed nor published. An IP allowlist would block every call. The key alone, please, over TLS.

---

## 4. The other half: reading orders back

This is what makes the work above worth doing, and it does not exist yet (`404` today).

```
GET /api/v1/partners/me/orders
Authorization: Bearer <the customer's access token>
```

The storefront is already built against this shape, so matching it means no further work on either side:

```json
{
  "status": "ok",
  "orders": [
    {
      "id": "1043",
      "number": "#1043",
      "placed_at": "2026-09-29T08:14:22Z",
      "total": "12450.00",
      "currency": "INR",
      "item_count": 2,
      "status": "out_for_delivery",
      "tracking": {
        "carrier": "ST Courier",
        "number": "TN123456789",
        "url": "https://…"
      },
      "items": [
        {
          "title": "Kanchipuram silk saree — deep maroon",
          "variant_title": "Deep maroon",
          "quantity": 1,
          "price": "9800.00",
          "image_url": "https://…"
        }
      ]
    }
  ]
}
```

Notes:
- The partner comes from the **token**, never from an id in the request.
- `status` should be one of `placed`, `paid`, `packed`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `returned`, `refunded`. Anything else is shown to the customer as "In progress" — please do not send raw courier codes such as `DRS` or `RTO`.
- Newest first.

---

## 5. Full example of the extended payload

New fields marked `← new`.

```json
{
  "order_id": "gid://shopify/Order/5551234567",
  "order_number": "#1043",
  "phone": "+919876543210",
  "email": "ravi@example.com",
  "customer_name": "Ravi Kumar",
  "customer_locale": "ta",                      // ← new
  "order_date": "2026-10-05T09:15:00Z",
  "currency": "INR",
  "payment_method": "cod",
  "cod_amount": 12450.00,
  "amount_total": 12450.00,
  "subtotal": 12450.00,                         // ← new
  "discount_total": 0.00,                       // ← new
  "discount_codes": [],                         // ← new
  "shipping_total": 0.00,                       // ← new
  "tax_total": 0.00,                            // ← new
  "fulfillment_status": "unfulfilled",          // ← new
  "order_status_url": "https://…",              // ← new
  "weight_kg": 1.25,
  "shipping_address": {
    "name": "Ravi Kumar",
    "street": "12 Gandhi Nagar",
    "street2": "Near bus stand",
    "city": "Ambur",
    "state": "Tamil Nadu",
    "zip": "635802",
    "country": "India",                         // ← new
    "country_code": "IN",                       // ← new
    "phone": "+919840011223"                    // ← new, the delivery phone
  },
  "billing_address": {                          // ← new, same shape
    "name": "Ravi Kumar",
    "street": "12 Gandhi Nagar",
    "city": "Ambur",
    "state": "Tamil Nadu",
    "zip": "635802",
    "country_code": "IN"
  },
  "items": [
    {
      "name": "Kanchipuram silk saree",
      "variant_title": "Deep maroon",           // ← new
      "product_id": "7712345",
      "variant_id": "42123",
      "sku": "SAR-MRN-01",
      "barcode": "8901234567890",
      "quantity": 1,
      "price": 9800.00,
      "original_price": 9800.00,                // ← new
      "discount": 0.00,                         // ← new
      "line_total": 9800.00,                    // ← new
      "image_url": "https://cdn.shopify.com/…", // ← new
      "product_url": "https://srichakravarthymall.com/products/…", // ← new
      "properties": {                           // ← new
        "Blouse stitching": "Yes — measurements by phone"
      }
    }
  ]
}
```

---

## 6. What we need back from you

1. **Will unknown fields be ignored or rejected?** If ignored, we can start sending the new ones before you store them, and nothing breaks.
2. **Images and HSN: do your product records already hold them against the same SKU?** If yes, we drop `image_url` from this request and you join instead.
3. **Is `price` per unit or per line** in what you have built?
4. **The API key**, with no IP restriction (§3.3).
5. **Confirmation that the order attaches to the partner created at sign-in**, matched on the top-level `phone` per §3.2, rather than creating a new contact — and that `shipping_address.phone` is never used for that match.
6. **A date for `GET /partners/me/orders`** (§4). Until it exists the account page shows "Order history is being connected", which is honest but not much use to a customer.
