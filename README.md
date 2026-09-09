# Sri Chakravarthy Mall — Shopify Theme

Custom Shopify theme for Sri Chakravarthy Mall, built on **Horizon 4.1.5**
(Shopify's current flagship theme).

Everything on the storefront is section-based, so the merchant can add, drag to
reorder, and remove sections directly in the Shopify theme editor — no code.

- **No build step.** Plain Liquid + CSS. Edit files in `assets/` and the CLI hot-reloads them.
- **Nothing hardcoded.** Text, images, colors and links are exposed as section settings.

## Design sources

Two Shopify themes from this store are the reference:

- **Horizon 4.1.5** — the base. 42 sections and 95 theme blocks, all drag-and-drop.
- **Debut 17.1.0** — a *vintage* (pre-OS 2.0) theme, kept only as a visual reference.
  All of Debut's templates are `.liquid` with no JSON, so nothing structural can be
  copied from it — its distinctive sections (feature-columns, feature-row, image-bar,
  logo-bar, map, quotes, video, custom-content) get **rebuilt** as modern sections
  with `presets` and blocks.

## Setup (one time)

```bash
npm install -g @shopify/cli
shopify version
```

Then set your store domain in [`shopify.theme.toml`](shopify.theme.toml).

## Daily commands

```bash
shopify theme dev -e dev --open   # local preview + theme editor, hot reload
shopify theme check               # lint Liquid, schema and accessibility
shopify theme push --unpublished -e dev   # upload as a new, unpublished theme
shopify theme push -e dev         # update the theme you're working on
shopify theme pull -e dev         # pull down changes made in the theme editor
```

The storefront is password protected, so `theme dev` needs the storefront password
(Admin → Online Store → Preferences) and cannot prompt for it in a non-interactive
shell:

```bash
shopify theme dev -e dev --store-password '<storefront password>' --open
```

`shopify theme dev` prints two URLs: a local **preview** and the **theme editor**.
Changes saved in the editor live on the store, not on disk — run `theme pull` to
bring them back into git.

## Structure

| Path | What it holds |
|---|---|
| `assets/` | CSS, JS, images. Section CSS is named `section-<name>.css`. |
| `config/settings_schema.json` | Theme settings the merchant sees (colors, fonts, logo). |
| `config/settings_data.json` | The saved values for those settings. |
| `layout/theme.liquid` | Page shell. |
| `sections/` | Sections + their `{% schema %}`. |
| `sections/*-group.json` | Header/footer section groups. |
| `blocks/` | Theme blocks — reusable, nestable units a section can accept. |
| `snippets/` | Reusable Liquid partials. |
| `templates/*.json` | Per-page section lists — the drag-and-drop surface. |
| `locales/` | Translations. |

`templates/`, `config/` and `locales/` JSON files are **JSONC** — Shopify allows
`/* */` and `//` comments in them, so a strict JSON parser will reject them.
Use `shopify theme check` to validate, not `jq` or `JSON.parse`.

## Brand assets

Generated from the client's single supplied file (a 3473x3474 JPEG, gold artwork
on a black background with a vignette) using ffmpeg's `lumakey` filter, which
keys on luminance and so removes the vignette cleanly rather than fighting it.

| Asset | Size | Use |
|---|---|---|
| `assets/brand-logo-horizontal.png` | 920x220 | Desktop/mobile header |
| `assets/brand-monogram.png` | 256x256 | Favicon, and mobile header if space is tight |
| `assets/brand-logo.png` | 700x438 | Stacked lockup, for footer or splash use |

All three have a transparent background, so they sit on the dark bands and on
ivory equally.

**The horizontal lockup is ours, not the client's.** The supplied artwork stacks
the monogram above a flourish above the wordmark, at roughly 1.6:1. In a header
at 40-56px tall that puts the wordmark at about 5px - illegible. The horizontal
version re-lays the same two elements side by side at about 4:1, which keeps the
wordmark readable at 40px. The client's designer should sign this off, and
ideally supply a proper vector lockup before launch.

The `logo`, `logo_inverse` and `favicon` theme settings are `image_picker`
fields, which reference Shopify **Files** rather than theme assets - so these
PNGs must be uploaded to the store (theme editor, or the Files API) before the
settings can point at them.

## Rules for new sections

A section is only drag-and-droppable if its `{% schema %}` includes a `presets`
array — that's what puts it in the editor's "Add section" list. Beyond that:

- Every piece of content is a `setting`; nothing is hardcoded in the markup.
- Repeating items (slides, cards, testimonials) are theme `blocks` rendered with
  `{% content_for 'blocks' %}`, so they can be added and reordered by dragging.
- A block's root element needs `{{ block.shopify_attributes }}` or the editor
  cannot select it.
- Keep templates as `.json`, never `.liquid`, or the page stops being editable.
- Put section CSS in an inline `{% stylesheet %}` block, not a separate file in
  `assets/` — that is Horizon's convention.
- Label things with `t:` keys and add them to `locales/en.default.schema.json`.

Two traps that `shopify theme check` does **not** catch:

- **Range settings need at least 3 steps** — `(max - min) / step >= 3`. Shopify
  rejects the upload server-side. Use a `select` for a 2–3 value choice, which is
  what Horizon does.
- Inside a `{% liquid %}` tag every newline is a separate statement, so a
  multi-line `render` silently breaks. Use a standalone `{% render %}` tag.

## Footer

Four columns plus a full-width payment row, then the utilities bar. The layout
is not hand-built: `sections/footer.liquid` sets `--grid-columns` to
`min(block_count, 4)` and gives a lone trailing block its own full-width row, so
**five top-level blocks** produce 4 columns on desktop, 2 on tablet, 1 on mobile
with the payment icons spanning the bottom. Add a sixth block and the grid
reflows on its own; nothing in `custom.css` touches it.

The three link columns render Shopify navigation menus, so the client reorders
them in Admin without touching code:

| Menu handle | Column |
|---|---|
| `footer-shop` | Shop |
| `footer-help` | Help |
| `footer-about` | The house |

Rebuild them with `node scripts/build-footer-menus.mjs <outdir>` and apply each
emitted file with `menuCreate`. **If a menu handle is deleted in Admin the
column silently renders empty** — the block has no fallback.

`snippets/footer-contact.liquid` prints the store email and WhatsApp link from
`shop.email` and `settings.whatsapp_number` rather than from typed-in text, so
neither can go stale. It is invoked from a `custom_liquid` block setting inside
`sections/footer-group.json`, which is why `theme check` reports it as an
orphaned snippet — that warning is expected and is the only one the repo has.

`snippets/whatsapp-number.liquid` normalises the number for `wa.me`: digits
only, and a bare 10-digit value is treated as Indian and given a `91` prefix.
`wa.me` does not error on a number missing its country code, it just opens an
"invalid number" page, so this is not cosmetic. Both the footer link and the
floating button render this one snippet.

Two footer blocks populate themselves from store settings and are collapsed by
CSS while those settings are empty: `payment-icons` (needs an activated payment
provider) and `social-links`, which by design renders nothing on the storefront
unless a URL has a profile path — a bare `https://www.instagram.com/` is
deliberately inert, though the theme editor still shows it greyed out.

### Page and policy content

`scripts/footer-content/*.html` holds the source for the two pages (`about`,
`faq`) and two shop policies (shipping, refund) created for the footer to link
to. Every claim in them is taken from the homepage `faq`, `promise` and `craft`
sections, so the two never contradict each other — change one, change both.
Shipping and returns are **shop policies rather than pages**, so checkout links
to them too.

## Product spec table

`blocks/product-specs.liquid` renders the "Product details" list under the
description on the product page. It holds **no content of its own** -- every row
comes from a pinned product metafield in the `specs` namespace, so the client
edits them as ordinary fields on the product in Admin:

| Key | Label | Populated? |
|---|---|---|
| `specs.colour` | Colour | yes, hand-read from each title |
| `specs.weave` | Weave | yes, from the product's weave tag |
| `specs.occasion` | Occasion | yes, from the product's occasion tag |
| `specs.blouse` | Blouse piece | yes, stated in every description |
| `specs.length` | Saree length | **empty -- needs real data** |
| `specs.zari` | Zari | **empty -- needs real data** |
| `specs.weight` | Weight | **empty -- needs real data** |
| `specs.care` | Care | falls back to the block's default text |

**Empty fields are skipped, not rendered blank.** `length`, `zari` and `weight`
ship empty on purpose: nobody supplied them, and the homepage FAQ promises zari
is described honestly per product -- writing "pure zari" into 19 products to
fill a table would turn that promise into a lie. Each row appears the moment
someone fills it in, with no theme change.

Care is the one field with a theme-level default, because the sentence is the
same for every silk saree; a product metafield overrides it only where a saree
needs different wording.

Rebuild the values with `node scripts/build-product-specs.mjs <outdir>` (reads
`products.json` from the products query, writes `metafieldsSet` batches of 25).
It **exits non-zero if any product's colour, weave or occasion cannot be
derived** rather than skipping it quietly, since a silently skipped product
ships a half-empty table.

Note the products themselves have no options -- every one is a single default
variant. The `variant-picker` block is already on the product template, so if
real options are ever added (blouse stitching, fall and pico) they render with
no theme work. Each variant would then need its own SKU, which is what the item
code search matches on.

## Markets and the currency switcher

**The currency switcher is store configuration, not theme code.** Do not go
looking for a snippet to write. `snippets/localization-form.liquid:35-38` sets
`show_currencies` when `localization.available_countries | map: 'currency' |
uniq` has more than one entry, and the selector already renders on desktop
(`sections/header.liquid:250`) and in the mobile drawer
(`snippets/header-drawer.liquid:621`), switched on by `show_country` in
`sections/header-group.json`. The header button shows
`localization.country.currency.iso_code`, so it reads `INR` today.

The store previously offered **only Canada and the United States** -- India, the
home market, was not a country at all. `scripts/build-markets.mjs` defines five
markets covering 23 countries:

| Market | Countries |
|---|---|
| `india` | IN |
| `us` | US |
| `canada` | CA |
| `uk-europe-australia` | GB IE DE FR IT ES NL BE AT PT SE DK FI PL GR CZ AU |
| `singapore-malaysia-uae` | SG MY AE |

US and Canada stay separate markets rather than merging into one: a country
belongs to exactly one market, so merging would mean moving CA between markets
mid-flight, and separate markets are what you want once shipping rates differ.
Existing markets are updated, **never deleted** -- `marketDelete` discards the
delivery and catalog config attached to a market.

### Currencies are a second phase, and need Shopify Payments

Prices are still INR everywhere, and the currency label in the selector is still
`hidden`. **That is correct behaviour, not a bug:** with one currency,
`currencies.size == 1`. Shopify rejects the flag outright until Shopify Payments
is activated, in as many words:

> The shop's payment gateway does not support enabling more than one currency.

So the script runs in two phases:

```bash
# Phase 1 -- regions only. Safe today, already applied.
node scripts/build-markets.mjs <outdir> <markets.json>

# Phase 2 -- AFTER Shopify Payments is activated. Re-dump markets.json first
# so the newly created markets have ids.
node scripts/build-markets.mjs <outdir> <markets.json> --currency
```

Phase 2 emits `mkt_currency_*.json` for `marketUpdate`, setting
`currencySettings.localCurrencies`. Once that succeeds the theme starts showing
`USD $`, `GBP £` and the rest on its own, with no theme change.

Before promising the client conversion will work, confirm with Shopify support
that an **India-based Shopify Payments account can settle foreign currencies** --
Indian accounts have had FEMA-related limits, and that should be checked rather
than assumed.

The four `currency_code_enabled_*` settings are on, so prices read
`Rs. 5,680.00 INR`. That matters more once live: the chosen regions span four
different dollars (USD, CAD, AUD, SGD), and a bare `$68.00` is ambiguous.

## Shipping zones

The store was set up with US defaults: the "Domestic" zone contained **only the
United States**, so India fell into "International" and every Indian order was
charged the flat international rate. The zone is now `India` (IN, all provinces
-- Shopify rejects an Indian zone without them), and `International` is
rest-of-world, covering the export markets.

**All rates are still defined in USD on an INR store** and are converted at
checkout, so they drift with the exchange rate. Measured against a Rs 5,680
saree:

| Destination | Charged | Defined as |
|---|---|---|
| India | Rs 756 Standard, Rs 1,418 Express | $8 / $15 |
| Everywhere else | Rs 2,835 | $30 |

Two rate conditions contradict the storefront and need re-entering **in INR** in
Admin -> Settings -> Shipping:

- Free domestic shipping triggers at **$70** (about Rs 6,600), but the
  announcement bar, the FAQ and `scripts/footer-content/shipping-policy.html`
  all promise **free over Rs 4,999**. An order between those two figures is
  charged despite the promise.
- "Free International Shipping" requires **total weight >= 20 kg**. A saree is
  roughly 600 g, so it needs about 33 of them and effectively never applies --
  while the FAQ promises free international over **Rs 39,999**.

Until those are fixed the shipping policy page states terms the checkout does
not honour. The zone structure is correct; only the amounts and conditions are
the merchant's to set.

## Environments — read this before running any CLI command

`shopify theme dev` **uploads local files to whatever theme it is pointed at.**
`-e dev` used to be pinned to the published theme, so every preview run wrote
straight to the live storefront -- which is how a colour change reached the real
site while it was supposedly being previewed locally. `-e dev` now points at an
unpublished staging theme, and the live theme has its own explicit environment:

| Environment | Theme | Use |
|---|---|---|
| `-e dev` (default) | `165628346616` "Staging — do not publish" | `theme dev`, `theme push`, everyday work |
| `-e production` | `165494358264` (published) | `shopify theme push -e production --allow-live` only |

Verify the split still holds by running `shopify theme push -e dev` with no
`--allow-live`: it must succeed. If it demands the flag, `-e dev` is pointing at
the live theme again.

## Colour palette and type

Current direction is **Antique Gold** with **Cormorant + Work Sans**. Gold leads
as the accent and call-to-action colour on a deep gold-brown ground.

Fonts are `cormorant_n6` heading / `cormorant_n7` accent / `work_sans_n5`
subheading / `work_sans_n4` body. **Cormorant has a small x-height and sets
noticeably smaller than Playfair at the same nominal size**, so h1-h4 were
raised about 20% (56/48/32/24 -> 68/58/38/28) to compensate. h5 and h6 use the
subheading font, so they were left alone.

Not every font is available: `cormorant_garamond`, `eb_garamond` and `cinzel`
**500 the page** -- they are not in Shopify's library. `cormorant` (no
"Garamond"), `marcellus`, `lora`, `libre_baskerville` and `crimson_text` all
work. Validate a handle by setting it locally and checking
`--font-heading--family` resolves, before offering it to the client.

| Role | Value | Notes |
|---|---|---|
| Surface bands (header, footer, section bands, quick-add) | `#3E2C10` | 11 values across 4 files |
| Accent / dividers / column headings | `#D9982F` | `color_palette.color1` |
| Primary button fill | `#D9982F` with `#221E1A` text | bound via `color_palette.color1` |
| Price on the ivory page | `#8B6914` | deeper gold; see below |
| Footer utilities divider | `#6B5220` | |
| Background / foreground / `color2` | `#FDFBF7` / `#221E1A` / `#E7DFD2` | unchanged |

**Bright gold cannot be a surface colour, and the logo is the reason.** The logo
is gold-bronze linework (dominant tone `#C09048`) that the client has twice said
not to change. On a `#D9982F` header it measures **1.16:1 and disappears**;
cream text on it is 2.40:1 and also fails. Gold-family surfaces only become
usable around `#5C4317` and darker. `#3E2C10` gives logo 4.66 and cream text
12.92 -- as safe as the maroon it replaced (5.24 / 14.53).

**Never use `#D9982F` as text on the ivory page: it is 2.40:1 and fails AA.**
Product card prices used to do exactly that; they now use `#8B6914` (4.92:1),
the same hue carried deeper. On the dark bands `#D9982F` reaches 5.39:1 and is
fine, which is why the footer headings keep it.

Measured on the final palette -- cream on espresso 12.92, gold on espresso 5.39,
ink on the gold button 6.69, deep gold price on ivory 4.92, ink on ivory 16.02.
All clear AA.

### Reverting to maroon

| Situation | Undo |
|---|---|
| Not yet merged | `git checkout main` |
| Pushed live, we revert | `git checkout main && shopify theme push -e dev --allow-live` |
| Client wants it back themselves | Admin -> Online Store -> Themes -> **"Maroon backup — pre-gold 2026-09-09"** (id `165627101432`) -> Publish |

That backup is a full unpublished copy of the maroon site, verified to render
11 maroon and 11 gold values identically to the live theme at the time. Tag
`maroon-v1` marks the same state in git.

## Local changes to stock Horizon files

Most customisation lives in `assets/custom.css`, `assets/custom.js` and the JSON
templates, which upstream updates never touch. One stock file is forked:

**`blocks/_slide.liquid`** — adds per-slide mobile art direction: a
`custom_mobile_media` toggle plus `media_type_1_mobile` / `image_1_mobile` /
`video_1_mobile`, rendered as a `<picture>` with a `max-width: 749px` source, so
a phone downloads only the mobile file. The pattern is copied from
`sections/hero.liquid:118-140`, which already did this for the static hero. When
the toggle is off the block renders exactly as stock. If a theme update changes
`_slide.liquid`, re-apply this.

The same file also anchors the mobile crop to the top
(`object-position: center top` under `max-width: 749px`). The mobile hero images
are 3:4 portrait model shots dropped into a landscape `40dvh` row, so the stock
`center center` cover crop cut roughly 90px off the top -- taking the model's
head with it. Anchoring to the top sends the whole overflow to the bottom
instead. Desktop stays centred, because those images are landscape and lose
nothing worth keeping.

Three traps this cost, worth remembering when editing Liquid here:

- Inside a `{% liquid %}` tag, **every newline is a separate statement**. A
  wrapped `if ... and ...` parses `and` as a tag name.
- **Never put Liquid delimiters inside a `#` comment in a `{% liquid %}` tag.**
  A closing brace pair ends the tag early and silently drops every statement
  below it, with no error — the condition simply never runs.
- `split` returns **strings**. Comparing one to an image width throws
  "comparison of String with N failed"; coerce with `| plus: 0` first.

Three more, found building the footer:

- **`footer-utilities` accepts only three block types** (`footer-copyright`,
  `footer-policy-list`, `social-links`) and `max_blocks: 3`. Payment icons
  cannot go there; they belong to the `footer` section.
- The `custom-liquid` block's setting id is **`custom_liquid`**, not `code`, and
  it takes no padding settings.
- The storefront password page answers **200 for every URL**, so a bare `curl`
  check proves nothing. Post `form_type=storefront_password` first and reuse the
  cookie jar, or you will "verify" pages that do not exist.

## Upstream

The baseline was pulled from the store's own Horizon theme with `shopify theme pull`
(theme id `165493375224`), committed unmodified so later work diffs cleanly against
stock Horizon. Horizon is a Shopify-provided theme licensed for use on this store —
unlike Dawn it is not MIT open source, so don't redistribute it.
