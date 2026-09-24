# Research: phone-OTP signup, WhatsApp invoices, auto-printed order slips

Three of the client's requests cannot simply be built — each needs a paid service, and
one runs into a hard Shopify limit. This is the research, with a recommendation for
each. **Nothing has been installed, bought or connected.**

Two facts about this store decide most of what follows. Both were checked against the
live store, not assumed:

| Fact | Value | How it was checked |
|---|---|---|
| Plan | **Advanced** (not Plus) | Admin API: `shop.plan.shopifyPlus = false` |
| Customer accounts | **New customer accounts** | Storefront links to `account.srichakravarthymall.com`; no legacy `/account/login` |

---

## Requests 2 + 12 — phone-OTP signup capturing name, phone, DOB

These arrived as two separate requests — "a form to fetch customer details" and
"OTP-based phone login". They are one feature: **customers register with their phone
number, verify by OTP, and we capture name, phone, date of birth and a few further
details.** Building them separately would produce two competing ways to sign in.

### The obstacle, stated plainly

The clean way to log a customer in from outside Shopify is **Multipass**, and
[Multipass requires Shopify Plus](https://shopify.dev/docs/api/multipass). This store
is on Advanced.

That alone would not be fatal — several OTP apps work without Multipass. The harder
problem is the second fact above. Apps in this category generally support Shopify's
**legacy** customer accounts on every plan, but support **new** customer accounts only
on Plus. [Simplify My Login](https://apps.shopify.com/login-using-otp) states exactly
that split. This store is on new customer accounts.

So the honest summary: **phone-OTP login is not straightforwardly available here.**
Anyone promising the client otherwise should be asked which of these two facts they
have worked around.

### Three routes

**A. Move back to legacy customer accounts, then use an OTP app.**
Restores the widest app compatibility. Not recommended: Shopify is steadily moving
merchants onto new customer accounts, so this trades a problem today for a larger one
later, and it would undo the `account.srichakravarthymall.com` setup already done.

**B. Find an app that genuinely supports new customer accounts on Advanced.**
[Quick Login OTP](https://apps.shopify.com/easy-otp-login) advertises exactly this —
login by a code sent to phone or email, working with new customer accounts.
[OTP+](https://apps.shopify.com/otp-plus-social-login) offers phone OTP plus social
login and OTP verification at checkout.

If this route is taken, **verify before paying** — ask each vendor directly:
1. Does this work with **new** customer accounts on the **Advanced** plan, without Multipass?
2. After OTP login, is the customer logged into *Shopify* — so checkout and order
   history recognise them — or only into the app?
3. Can it capture **date of birth** and custom fields at signup, and where are they stored?

Question 2 is the one that matters. If the answer is "only into the app", customers end
up with two identities and a confusing checkout.

**C. Keep Shopify's login. Capture the details ourselves. (Recommended.)**
Do not fight the platform for authentication. Instead:

- Customers continue to sign in the way Shopify supports here — a one-time code by
  email — which already works and needs no app.
- Add our own **phone-verified details form**: the customer enters name, phone, DOB and
  whatever else the client wants; we send an OTP by SMS to confirm the phone is real;
  on success we write it to their Shopify customer record.
- **DOB has no native field in Shopify**, so it goes into a customer metafield. The
  repo already creates metafield definitions in
  [`build-metafield-definitions.mjs`](build-metafield-definitions.mjs) — it currently
  does `ownerType: PRODUCT`, and the same pattern extends to `CUSTOMER`.

This gets the client what the requests are actually *for* — reachable customers, known
birthdays for offers, a real marketing list — without a second login system. It needs a
small backend and an SMS provider (MSG91 and Twilio both serve India; MSG91 is usually
cheaper domestically). **A backend is already being planned for the ST Courier
integration** (`st-courier-as-provided-playful-crayon.md`), so this can share it rather
than paying for separate hosting.

The trade-off, stated openly: customers still log in with email, not phone. If
logging in *by phone* is non-negotiable for the client, route B is the one to
investigate — but it must be verified with the vendor first.

---

## Request 8 — send the invoice by WhatsApp

### What has to be understood first

The WhatsApp button already on the site is a `wa.me` deep link — it opens a chat.
Sending messages *to* customers automatically is a different thing: it needs the
**WhatsApp Business API**, a Meta-approved sender, and **pre-approved message
templates**. Meta charges per conversation on top of any app subscription. This is a
running cost, not a one-off build.

### Apps

| App | Notes |
|---|---|
| [Interakt](https://apps.shopify.com/interakt-marketing) | Indian, broad: order notifications, abandoned cart, COD confirmation. The most established of these. |
| [Whatomation](https://apps.shopify.com/whatomation) | Notifications at each stage — placed, confirmed, shipped, out for delivery, delivered. |
| [Watix](https://apps.shopify.com/watix) | Order alerts plus courier tracking notifications. |
| [Confirmify](https://apps.shopify.com/confirmify) | Narrower: COD confirmation only. |
| [Zaptilo](https://zaptilo.ai/shopify-whatsapp-integration) | Pay-as-you-go in INR, advertised from about ₹0.04/message at volume, no monthly fee. |

### The catch on "invoice" specifically

Most of these send order *notifications* — a message with order details and a link.
Attaching an actual invoice **document** is a narrower capability, and Shopify does not
generate a customer-facing invoice PDF natively. Before choosing, confirm with the
vendor whether they send a PDF attachment or a link to an order page, and check which
the client actually means. In practice a link to the order status page is often better:
it stays current as the order ships.

**Recommendation:** clarify with the client whether they want a document or an order
update. If it is really "keep the customer informed on WhatsApp", start with order
notifications from one app, which is cheaper and more useful. Pair the decision with
request 9 below, since both concern order documents.

---

## Request 9 — print the order slip automatically

### What Shopify does on its own

Shopify prints packing slips on demand: select orders, print. There is **no native
setting that prints automatically** when an order arrives. The free Order Printer app
is still manual — it improves the template, not the trigger.

### What automatic printing actually requires

Two pieces, always:

1. An app that can trigger on an order event, and
2. **A computer at the shop, switched on, running a print client** connected to the
   printer. Shopify runs in the cloud and cannot reach a printer directly.

[**Printout Designer**](https://apps.shopify.com/printout-designer) is the established
answer: connect any printer via **PrintNode**, then set rules to print invoices or
packing slips automatically when orders are *created*, *paid* or *fulfilled*.
[SPConnector](https://spconnector.com/for/shopify-stores) does something similar via
Shippo, but adds a second service and syncs only every 15 minutes.

### What to tell the client

This is the most operationally demanding of the three. It needs a dedicated machine at
the counter that stays on, plus two subscriptions (the app and PrintNode). That is
reasonable for a shop printing many orders a day, and poor value for a handful.

**Ask how many orders a day they expect.** Below roughly ten, printing from the admin
in one batch each morning is faster, cheaper and less fragile than keeping a print
server alive.

---

## Summary

| Request | Verdict | Next step |
|---|---|---|
| 2 + 12 phone-OTP signup | Not straightforward — Advanced plan, new customer accounts, Multipass is Plus-only | Recommend route C: keep email login, add our own phone-verified details form on the ST Courier backend. DOB via a customer metafield. |
| 8 WhatsApp invoice | Possible, needs WhatsApp Business API and per-message cost | Confirm whether "invoice" means a document or an order update — the cheaper answer is probably what they want |
| 9 Auto-print slip | Possible, needs an always-on PC plus two subscriptions | Ask the expected daily order volume before committing |

Sources: [Multipass (Shopify)](https://shopify.dev/docs/api/multipass) ·
[Simplify My Login](https://apps.shopify.com/login-using-otp) ·
[Quick Login OTP](https://apps.shopify.com/easy-otp-login) ·
[OTP+](https://apps.shopify.com/otp-plus-social-login) ·
[Interakt](https://apps.shopify.com/interakt-marketing) ·
[Whatomation](https://apps.shopify.com/whatomation) ·
[Watix](https://apps.shopify.com/watix) ·
[Confirmify](https://apps.shopify.com/confirmify) ·
[Zaptilo](https://zaptilo.ai/shopify-whatsapp-integration) ·
[Printout Designer](https://apps.shopify.com/printout-designer) ·
[SPConnector](https://spconnector.com/for/shopify-stores) ·
[Shopify packing slips](https://help.shopify.com/en/manual/fulfillment/managing-orders/printing-orders/packing-slips)

Prices and app capabilities change; re-check before purchase.
