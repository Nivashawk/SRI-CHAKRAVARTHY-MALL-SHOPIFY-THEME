# Setup notes: things done in the admin, not in code

Four of the client's requests need no development. They are settings in the Shopify
admin or in an app's own dashboard, which is why they are written up here rather than
built. Each takes minutes.

---

## Review moderation (request 7)

**Judge.me is already installed** and has moderation built in, so nothing needs
buying or building.

By default Judge.me publishes reviews automatically. To hold them for approval:

1. Shopify admin → **Apps** → **Judge.me Product Reviews**
2. **Settings** → **General settings**
3. Turn **off** "Auto-publish new reviews" (Judge.me also labels this
   "Automatically publish reviews when they arrive")
4. Save

New reviews then sit in **Reviews → Awaiting approval** until someone publishes them.

To hide a review that is already live: **Reviews** → find it → **Unpublish**. It stays
in the account but disappears from the storefront. Individual reviews can also be
deleted outright, though unpublishing is safer — it is reversible.

One caveat worth passing to the client: hiding genuine negative reviews tends to
backfire. A shop with nothing but five-star reviews reads as untrustworthy, and a
politely answered three-star review often sells better than silence. Moderation is
best used for spam, abuse and mistaken reviews.

---

## Traffic: direct vs indirect (request 10)

**This already exists** — no app, no tracking code.

Shopify admin → **Analytics** → **Reports** → **Sessions by referrer**.

That report splits every visit into Direct, Search, Social, Email and Referral.
"Direct" means someone typed the address or used a bookmark; everything else is
indirect, broken down by where it came from.

Related reports in the same place:
- **Sessions by location** — where visitors are
- **Sessions by device type**
- **Online store conversion over time** — how many of those sessions bought

The store is on the **Advanced** plan, which also includes custom reports, so any of
these can be filtered and saved.

If the client wants deeper analysis than Shopify's own reports (multi-step funnels,
ad attribution), Google Analytics 4 is free and connects through
**Settings → Apps and sales channels → Google & YouTube**. Worth checking whether it
is already connected before adding it.

---

## Tamil language (request 3)

**The theme side is already done.** The language selector is switched on in the header,
and `sections/header.liquid:156-158` deliberately hides it until two or more languages
are published — so it appears by itself the moment Tamil is added. No theme change is
needed, now or later.

To add Tamil:

1. Shopify admin → **Settings** → **Languages**
2. **Add language** → Tamil → publish it
3. Install **Translate & Adapt** (free, made by Shopify) if it is not already there
4. In Translate & Adapt, choose Tamil and run the automatic translation across
   Products, Collections, and — importantly — **Theme content**

Two honest caveats to set expectations:

- **This theme ships no Tamil translation file.** Horizon includes about thirty
  languages; Tamil is not among them. Every button and label ("Add to cart", "Search",
  "Sold out") is therefore machine-translated rather than professionally written.
- **Machine translation will not know saree vocabulary.** Weave names, "pallu", "zari",
  "Kanchipuram" and the collection names need a Tamil speaker to read through
  afterwards. Translate & Adapt lets anyone edit any string by hand, so this is easy —
  but it is a content job, not a technical one, and it is what decides whether the
  Tamil version reads well or reads like a machine.

Setting it up takes about ten minutes. Making it good takes someone who speaks Tamil.

---

## Trust badges (request 13)

**No development needed** — the theme can already do this, and the client can maintain
it themselves.

The theme's icon block has an **image upload** option alongside its built-in icon list
(`blocks/icon.liquid` → `image_upload`, rendered by `snippets/icon-or-image.liquid`).
So any badge image — an accreditation mark, a payment logo, a handloom mark, a
"100% genuine" seal — can be used directly.

To add a badge row:

1. Theme editor → the page you want (the product page is where trust badges do the
   most work, just under the Add to cart button)
2. **Add block** → **Group**, set its direction to **Row**
3. Inside it, **Add block** → **Icon**, once per badge
4. On each icon block, use **Image** rather than the icon list, and upload the badge
5. Set width (24–40px suits a row of badges) and a gap of about 16–24px on the group

What the client needs to supply: the badge images themselves, as **PNG with a
transparent background**. Badges on a white rectangle will show as white boxes against
the ivory page.

Note the footer already has a **payment icons** block that fills itself automatically
with the card and wallet logos the store actually accepts — it stays hidden until
Shopify Payments is live (`assets/custom.css:353-359`). So card logos specifically do
not need to be added by hand.

A caution worth passing on: only use marks the business genuinely holds. Invented or
borrowed trust seals are a legal risk and are easy for customers to check.
