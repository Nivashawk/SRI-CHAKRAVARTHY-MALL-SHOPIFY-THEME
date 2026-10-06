#!/usr/bin/env bash
# Post a synthetic order to Odoo, or read one back. Nothing here is real customer data.
#
#   export ODOO_API_KEY=...
#   scripts/odoo-order-test.sh                       # post a fresh test order
#   scripts/odoo-order-test.sh gid://shopify/Order/9000000000003   # read one back
#
# The order it posts is booked with ST Courier immediately, so keep the Odoo
# connector pointed at ST Courier's demo endpoint while testing.
set -euo pipefail

BASE="${ODOO_BASE:-https://altbriterai.brite.app}"
KEY="${ODOO_API_KEY:?set ODOO_API_KEY first}"

if [ $# -gt 0 ]; then
  curl -sS -G "$BASE/api/v1/shopify/order" \
    --data-urlencode "order_id=$1" -H "X-API-KEY: $KEY" |
    python3 -m json.tool
  exit 0
fi

# A new id each run, so repeats do not collide with an earlier test.
STAMP="$(date +%s)"
ID="gid://shopify/Order/9${STAMP}"
PHONE="+9190000${STAMP: -5}"

curl -sS -X POST "$BASE/api/v1/shopify/orders" \
  -H "X-API-KEY: $KEY" -H "Content-Type: application/json" \
  --data @- <<JSON | python3 -c 'import json,sys; d=json.load(sys.stdin); o=d.get("order",{}); print(json.dumps({k:d.get(k) for k in ("status","created","detail")}|{k:o.get(k) for k in ("order_number","state","awb_no","tracking_state","partner_id","partner_match","needs_review")}, indent=2))'
{
  "order_id": "$ID",
  "order_number": "TEST-$STAMP",
  "phone": "$PHONE",
  "email": "test.$STAMP@example.com",
  "customer_name": "Test Customer",
  "customer_locale": "en",
  "order_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "currency": "INR",
  "payment_method": "cod",
  "cod_amount": 4500.00,
  "amount_total": 4500.00,
  "subtotal": 4500.00,
  "discount_total": 0.00,
  "discount_codes": [],
  "shipping_total": 0.00,
  "tax_total": 0.00,
  "fulfillment_status": "unfulfilled",
  "order_status_url": "https://srichakravarthymall.com/test-order-status",
  "weight_kg": 0.8,
  "shipping_address": {
    "name": "Test Customer", "street": "1 Test Street", "street2": "",
    "city": "Chennai", "state": "Tamil Nadu", "zip": "600001",
    "country": "India", "country_code": "IN", "phone": "$PHONE"
  },
  "billing_address": {
    "name": "Test Customer", "street": "1 Test Street", "city": "Chennai",
    "state": "Tamil Nadu", "zip": "600001", "country_code": "IN"
  },
  "items": [{
    "name": "Test Saree", "variant_title": "Test colour",
    "product_id": "0000001", "variant_id": "0000002", "sku": "TEST-SKU-01",
    "barcode": "", "quantity": 1,
    "price": 4500.00, "original_price": 4500.00, "discount": 0.00, "line_total": 4500.00,
    "image_url": "", "product_url": "", "properties": {}
  }]
}
JSON
