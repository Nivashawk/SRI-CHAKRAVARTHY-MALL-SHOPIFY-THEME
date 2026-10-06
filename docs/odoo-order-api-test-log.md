# Odoo order API — test log, 6 October 2026

Every call below was made from this machine against the live Odoo instance
`https://altbriterai.brite.app`, with header `X-API-KEY: <key>`. **All customer data is
synthetic** — invented names, `+9190000000xx` numbers and a test SKU — so nothing here is a real
person's order. Two test orders now exist in Odoo (`#TEST-0002`, `10003`) and can be deleted.

The purpose was to answer one question: is Shopify's push reaching Odoo, and what happens to it?

---

## Call 1 — 14:51 · create order · **422**

`POST /api/v1/shopify/orders`

Request:

```json
{
  "order_id": "gid://shopify/Order/9000000000002",
  "order_number": "#TEST-0002",
  "phone": "+919000000002",
  "email": "test.order2@example.com",
  "customer_name": "Test Customer Two",
  "customer_locale": "en",
  "order_date": "2026-10-06T09:00:00Z",
  "currency": "INR",
  "payment_method": "cod",
  "cod_amount": 4500.0,
  "amount_total": 4500.0,
  "subtotal": 4500.0,
  "discount_total": 0.0,
  "discount_codes": [],
  "shipping_total": 0.0,
  "tax_total": 0.0,
  "fulfillment_status": "unfulfilled",
  "order_status_url": "https://srichakravarthymall.com/test-order-status",
  "weight_kg": 0.8,
  "shipping_address": {
    "name": "Test Customer Two",
    "street": "1 Test Street",
    "street2": "",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "zip": "600001",
    "country": "India",
    "country_code": "IN",
    "phone": "+919000000002"
  },
  "billing_address": {
    "name": "Test Customer Two",
    "street": "1 Test Street",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "zip": "600001",
    "country_code": "IN"
  },
  "items": [
    {
      "name": "Test Saree",
      "variant_title": "Test colour",
      "product_id": "0000001",
      "variant_id": "0000002",
      "sku": "TEST-SKU-01",
      "barcode": "",
      "quantity": 1,
      "price": 4500.0,
      "original_price": 4500.0,
      "discount": 0.0,
      "line_total": 4500.0,
      "image_url": "",
      "product_url": "",
      "properties": {}
    }
  ]
}
```

Response — **HTTP 422**:

```json
{
  "status": "error",
  "error": "invalid_request",
  "detail": "Cannot book STC/2026/03381 (#TEST-0002) with ST Courier:\n- Sender name and address are missing on the connector.\n- Sender PIN code must have 6 digits.\n- Sender phone must have 10 digits."
}
```

Read as: the payload was accepted and understood, but the ST Courier booking failed because the
connector had no sender address. Note the shipment reference `STC/2026/03381` in the message — a
record *was* created.

---

## Call 2 — 14:51 · read the same order back · **200**

`GET /api/v1/shopify/order?order_id=gid://shopify/Order/9000000000002`

```json
{
  "status": "ok",
  "order": {
    "order_id": "gid://shopify/Order/9000000000002",
    "order_number": "#TEST-0002",
    "phone": "+919000000002",
    "email": "test.order2@example.com",
    "customer_name": "Test Customer Two",
    "customer_locale": "en",
    "partner_id": 85,
    "partner_match": "phone",
    "needs_review": false,
    "order_date": "2026-10-06T09:00:00Z",
    "currency": "INR",
    "payment_method": "cod",
    "cod_amount": 4500.0,
    "amount_total": 4500.0,
    "subtotal": 4500.0,
    "discount_total": 0.0,
    "discount_codes": [],
    "shipping_total": 0.0,
    "tax_total": 0.0,
    "fulfillment_status": "unfulfilled",
    "order_status_url": "https://srichakravarthymall.com/test-order-status",
    "weight_kg": 0.8,
    "shipping_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country": "India",
      "country_code": "IN",
      "phone": "+919000000002"
    },
    "billing_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country_code": "IN"
    },
    "items": [
      {
        "name": "Test Saree",
        "variant_title": "Test colour",
        "product_id": "0000001",
        "variant_id": "0000002",
        "sku": "TEST-SKU-01",
        "barcode": null,
        "quantity": 1,
        "price": 4500.0,
        "original_price": 4500.0,
        "discount": 0.0,
        "line_total": 4500.0,
        "image_url": null,
        "product_url": null,
        "properties": null
      }
    ],
    "state": "shipment_created",
    "customer_status": "placed",
    "awb_no": null,
    "courier": "ST Courier",
    "tracking_url": null,
    "tracking_state": "error",
    "last_status": null,
    "last_status_at": null,
    "delivered": false,
    "delivered_at": null,
    "events": []
  }
}
```

Read as: **the order was stored in full despite the 422.** Every extended field came back, the
line item is intact, and the customer matched on phone (`partner_id: 85`, `partner_match: "phone"`,
`needs_review: false`). What is missing is only the courier half: `state: shipment_created`,
`tracking_state: "error"`, `awb_no: null`, `events: []`.

---

## Call 3 — 15:43 · create order, numeric order number · **201**

Same payload shape, with `order_number` as bare digits and a different phone:

```json
{
  "order_id": "gid://shopify/Order/9000000000003",
  "order_number": "10003",
  "phone": "+919000000003",
  "payment_method": "cod",
  "amount_total": 4500.0
}
```

Response — **HTTP 201**:

```json
{
  "status": "ok",
  "created": true,
  "order": {
    "order_id": "gid://shopify/Order/9000000000003",
    "order_number": "10003",
    "phone": "+919000000003",
    "email": "test.order3@example.com",
    "customer_name": "Test Customer Two",
    "customer_locale": "en",
    "partner_id": 86,
    "partner_match": "phone",
    "needs_review": false,
    "order_date": "2026-10-06T09:00:00Z",
    "currency": "INR",
    "payment_method": "cod",
    "cod_amount": 4500.0,
    "amount_total": 4500.0,
    "subtotal": 4500.0,
    "discount_total": 0.0,
    "discount_codes": [],
    "shipping_total": 0.0,
    "tax_total": 0.0,
    "fulfillment_status": "unfulfilled",
    "order_status_url": "https://srichakravarthymall.com/test-order-status",
    "weight_kg": 0.8,
    "shipping_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country": "India",
      "country_code": "IN",
      "phone": "+919000000003"
    },
    "billing_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country_code": "IN"
    },
    "items": [
      {
        "name": "Test Saree",
        "variant_title": "Test colour",
        "product_id": "0000001",
        "variant_id": "0000002",
        "sku": "TEST-SKU-01",
        "barcode": null,
        "quantity": 1,
        "price": 4500.0,
        "original_price": 4500.0,
        "discount": 0.0,
        "line_total": 4500.0,
        "image_url": null,
        "product_url": null,
        "properties": null
      }
    ],
    "state": "booked",
    "customer_status": "packed",
    "awb_no": "53038567175",
    "courier": "ST Courier",
    "tracking_url": null,
    "tracking_state": "booked",
    "last_status": null,
    "last_status_at": null,
    "delivered": false,
    "delivered_at": null,
    "events": []
  }
}
```

Read as: booked. `state: booked`, `awb_no: 53038567175`, `tracking_state: "booked"`,
`customer_status: "packed"`.

---

## Call 4 — 15:44 · re-post the original `#TEST-0002` · **200**

The same request as call 1, byte for byte.

```json
{
  "status": "ok",
  "created": false,
  "order": {
    "order_id": "gid://shopify/Order/9000000000002",
    "order_number": "#TEST-0002",
    "phone": "+919000000002",
    "email": "test.order2@example.com",
    "customer_name": "Test Customer Two",
    "customer_locale": "en",
    "partner_id": 85,
    "partner_match": "phone",
    "needs_review": false,
    "order_date": "2026-10-06T09:00:00Z",
    "currency": "INR",
    "payment_method": "cod",
    "cod_amount": 4500.0,
    "amount_total": 4500.0,
    "subtotal": 4500.0,
    "discount_total": 0.0,
    "discount_codes": [],
    "shipping_total": 0.0,
    "tax_total": 0.0,
    "fulfillment_status": "unfulfilled",
    "order_status_url": "https://srichakravarthymall.com/test-order-status",
    "weight_kg": 0.8,
    "shipping_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country": "India",
      "country_code": "IN",
      "phone": "+919000000002"
    },
    "billing_address": {
      "name": "Test Customer Two",
      "street": "1 Test Street",
      "street2": null,
      "city": "Chennai",
      "state": "Tamil Nadu",
      "zip": "600001",
      "country_code": "IN"
    },
    "items": [
      {
        "name": "Test Saree",
        "variant_title": "Test colour",
        "product_id": "0000001",
        "variant_id": "0000002",
        "sku": "TEST-SKU-01",
        "barcode": null,
        "quantity": 1,
        "price": 4500.0,
        "original_price": 4500.0,
        "discount": 0.0,
        "line_total": 4500.0,
        "image_url": null,
        "product_url": null,
        "properties": null
      }
    ],
    "state": "booked",
    "customer_status": "packed",
    "awb_no": "53038567186",
    "courier": "ST Courier",
    "tracking_url": null,
    "tracking_state": "booked",
    "last_status": null,
    "last_status_at": null,
    "delivered": false,
    "delivered_at": null,
    "events": []
  }
}
```

Read as two separate findings:

1. **The order number was never the problem.** `#TEST-0002`, hash and letters included, booked and
   received AWB `53038567186`. The sender address had been configured on Odoo's side between
   14:51 and 15:43; that is what changed.
2. **Idempotency works.** `created: false`, and no second order was made. A Flow retry is safe.

---

## What this log does not cover

No order has yet travelled the real path — *Shopify checkout → Flow → Odoo*. Everything above was
posted by hand with curl. The Flow leg is still unproven, and its run log in the Shopify admin is
the place that will show it.

## Where to look for logs from now on

| Log | Where | Shows |
|---|---|---|
| **Flow run log** | Shopify admin › Flow › the workflow › run history | Every trigger, the HTTP step's status code and response body. The first place to look when an order does not appear in Odoo |
| **Odoo raw payload** | Odoo keeps the payload it received, including fields it ignores | What Shopify actually sent, as opposed to what we think it sent |
| **Odoo booking errors** | the `detail` string, as in call 1 | Why ST Courier refused |
| **This file** | repo | The manual tests, re-runnable with `scripts/odoo-order-test.sh` |

## Re-running these tests

```bash
export ODOO_API_KEY=<the key>
scripts/odoo-order-test.sh            # posts a fresh synthetic order, prints status and AWB
scripts/odoo-order-test.sh <order_id> # reads one back
```
