# Shopify Flow → Odoo: the order push workflow

**Endpoint:** `POST https://altbriterai.brite.app/api/v1/shopify/orders`
**Updated:** 6 October 2026

This is the only thing that sends orders from Shopify to Odoo. There is no backend of ours in
between: Shopify Flow runs on Shopify's infrastructure and calls Odoo directly. Odoo stores the
order, matches the customer by phone, creates the ST Courier consignment and — while
*Book immediately* is on — books it and returns the AWB.

Keep this file in step with the workflow in the admin. The admin is the live copy; this is the
reviewable one.

---

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Trigger | **Order created** | `Order paid` never fires for COD, which is most orders here. The payload carries `payment_method`, so Odoo can still tell them apart |
| Booking moment | **Immediate** (Odoo's default) | ST Courier is on the demo endpoint, so a booking costs nothing. Switch to `POST /orders/<id>/book` at packing time before going live |
| Scope | India only | ST Courier is domestic and Odoo's address has no country field it can refuse on. Flow filters first |
| Retries | Flow's own | Flow waits 30s for a response and resends on timeout. `order_id` is Odoo's idempotency key, so a resend updates rather than duplicates |

---

## 2. Workflow steps

```
Trigger   Order created
   │
   ├─ Condition  shippingAddress.countryCodeV2 == IN    → otherwise stop
   │
   └─ Action     Send HTTP request  (POST, see §3)
```

### Action configuration

| Field | Value |
|---|---|
| HTTP method | `POST` |
| URL | `https://altbriterai.brite.app/api/v1/shopify/orders` |
| Header 1 | `X-API-KEY` : `f6qmq2BYu2ChBC10HRSkREs7oCXNtC4yxb_rBDgGAyY` |
| Header 2 | `Content-Type` : `application/json` |
| Body | the Liquid template in §3 |

Odoo replies `201` created, `200` already existed, `401` bad key, `422` validation (the `detail`
names the field), `500` retry.

---

## 3. Body template

Every value goes through `| json`, which quotes the string and escapes anything inside it. That is
why the template has no quotation marks of its own around those values — the filter supplies them.
`url_encode` and `json` are the two filters Flow allows in HTTP actions.

```liquid
{% assign raw = order.customer.phone | default: order.phone | default: order.shippingAddress.phone %}
{% assign digits = raw | remove: " " | remove: "-" | remove: "(" | remove: ")" | remove: "+" %}
{% assign msisdn = digits | slice: -10, 10 %}
{% if order.displayFinancialStatus == 'PAID' %}{% assign pay = 'prepaid' %}{% else %}{% assign pay = 'cod' %}{% endif %}
{
  "order_id": {{ order.id | json }},
  "order_number": {{ order.name | json }},
  "order_name": {{ order.name | json }},
  "phone": "+91{{ msisdn }}",
  "email": {{ order.email | json }},
  "customer_name": {{ order.customer.displayName | json }},
  "customer_locale": {{ order.customerLocale | json }},
  "order_date": {{ order.createdAt | json }},
  "currency": {{ order.currencyCode | json }},
  "payment_method": "{{ pay }}",
  "cod_amount": {% if pay == 'cod' %}{{ order.totalPriceSet.shopMoney.amount }}{% else %}0{% endif %},
  "amount_total": {{ order.totalPriceSet.shopMoney.amount }},
  "subtotal": {{ order.subtotalPriceSet.shopMoney.amount }},
  "discount_total": {{ order.totalDiscountsSet.shopMoney.amount }},
  "discount_codes": [{% for c in order.discountCodes %}{{ c | json }}{% unless forloop.last %},{% endunless %}{% endfor %}],
  "shipping_total": {{ order.totalShippingPriceSet.shopMoney.amount }},
  "tax_total": {{ order.totalTaxSet.shopMoney.amount }},
  "fulfillment_status": {{ order.displayFulfillmentStatus | downcase | json }},
  "order_status_url": {{ order.statusPageUrl | json }},
  "weight_kg": {{ order.totalWeight | divided_by: 1000.0 }},
  "shipping_address": {
    "name": {{ order.shippingAddress.name | json }},
    "street": {{ order.shippingAddress.address1 | json }},
    "street2": {{ order.shippingAddress.address2 | json }},
    "city": {{ order.shippingAddress.city | json }},
    "state": {{ order.shippingAddress.province | json }},
    "zip": {{ order.shippingAddress.zip | json }},
    "country": {{ order.shippingAddress.country | json }},
    "country_code": {{ order.shippingAddress.countryCodeV2 | json }},
    "phone": "+91{{ order.shippingAddress.phone | remove: ' ' | remove: '-' | remove: '+' | slice: -10, 10 }}"
  },
  "billing_address": {
    "name": {{ order.billingAddress.name | json }},
    "street": {{ order.billingAddress.address1 | json }},
    "street2": {{ order.billingAddress.address2 | json }},
    "city": {{ order.billingAddress.city | json }},
    "state": {{ order.billingAddress.province | json }},
    "zip": {{ order.billingAddress.zip | json }},
    "country_code": {{ order.billingAddress.countryCodeV2 | json }}
  },
  "items": [
    {% for item in order.lineItems %}{
      "name": {{ item.name | json }},
      "variant_title": {{ item.variantTitle | json }},
      "product_id": {{ item.product.id | json }},
      "variant_id": {{ item.variant.id | json }},
      "sku": {{ item.sku | json }},
      "barcode": {{ item.variant.barcode | json }},
      "quantity": {{ item.quantity }},
      "price": {{ item.originalUnitPriceSet.shopMoney.amount }},
      "original_price": {{ item.originalUnitPriceSet.shopMoney.amount }},
      "line_total": {{ item.discountedTotalSet.shopMoney.amount }},
      "image_url": {{ item.image.url | json }},
      "product_url": {{ item.product.onlineStoreUrl | json }},
      "properties": { {% for a in item.customAttributes %}{{ a.key | json }}: {{ a.value | json }}{% unless forloop.last %},{% endunless %}{% endfor %} }
    }{% unless forloop.last %},{% endunless %}{% endfor %}
  ]
}
```

The names above are the GraphQL Admin API `Order` object's, which is what the trigger hands over,
and this template is the one running in the admin — not an untested draft. Two names caught us out
when building it and are worth remembering: the address field is **`countryCodeV2`**, not
`countryCode` (the plain one belongs to locations and the retail shop), and the line item's picture
is `item.image.url`. When adding a field, use Flow's variable picker so the path is validated as it
is inserted.

---

## 4. Things that will bite

| Thing | What happens | What to do |
|---|---|---|
| **No weights in the catalogue** | `weight_kg` is `0` on every order | Odoo's default weight applies. Freight is billed on weight, so the client must fill these in |
| **Phone shape** | Odoo rejects anything that is not a 10-digit Indian mobile | The template takes the last 10 digits and re-adds `+91`. Shipping-address phone is now required at checkout, so one is always present |
| **Two phones** | `phone` matches the customer, `shipping_address.phone` is the delivery number | Odoo must never match a partner on the delivery phone — it is the recipient's on a gift order |
| **No partner match** | Odoo stores the order with `needs_review: true` and no customer | These do not appear under any customer. Check `GET /shopify/orders/list?needs_review=true` before concluding nothing was stored |
| **Discount wording** | `price` is the unit price, `line_total` is what the line came to | Confirmed by Odoo in `ORDER_API_REFERENCE.md` §1 |

---

## 5. Verifying it

1. Flow → the workflow → confirm the toggle reads **Active** and the trigger is **Order created**.
2. Place a test order on the storefront with an Indian address and a real-shaped mobile number.
3. Flow's run log should show one run, and the HTTP step a `201`.
4. Confirm in Odoo: `GET /api/v1/shopify/order?order_id=gid://shopify/Order/<id>` with the API key.
   Check `partner_match` is `phone`, `needs_review` is `false`, and an `awb_no` came back.
5. Re-run the same order: Odoo must answer `200` with `created: false`, not create a second one.

If the run log is empty, the workflow is off or the trigger never fired — that is the first thing
to rule out, not the payload.

---

## 6. Answers to Odoo's open questions (`API_details_SHOPIFY_.md` §8)

1. **When do we call you** — on **order created**, for every order including COD. Not on payment.
2. **`order_id`** — the **GID**, e.g. `gid://shopify/Order/5551234567`.
3. **Phone** — always present. `phone` is the customer's, `shipping_address.phone` is the
   delivery number. Shipping-address phone is required at checkout.
4. **`barcode`** — not set on every variant. Treat it as optional.
5. **Your server IP** — there is none to give. The call comes from Shopify Flow, on Shopify's own
   infrastructure, whose addresses are neither fixed nor published. The key alone, over TLS.
6. **Retries** — Flow waits 30 seconds, then resends. `order_id` keeps that safe.
7. **Returns and cancellations** — to be specified. We can add an *Order cancelled* workflow once
   you tell us the endpoint and whether it should also cancel the ST Courier booking.
