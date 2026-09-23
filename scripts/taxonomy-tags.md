# Product tags — which tag puts a product in which menu

Every collection in the navigation fills itself from **product tags**. Nothing has to
be added to a collection by hand. Tag the product and it appears; remove the tag and
it leaves.

The rule is simple: **a collection's tag is the same as its web address.**
`/collections/saree-cotton` is filled by the tag `saree-cotton`.

Tags are set on the product page in the Shopify admin, in the **Tags** box on the
right. Separate them with commas.

## Every product needs two tags

**1. What kind of item it is** — this drives the top-level menu:

| Tag | Menu |
|---|---|
| `saree` | Saree Collections |
| `salwar-material` | Salwar Material |
| `salwar-suit` | Salwar Suit |
| `kurti` | Kurti |

**2. Which sub-item it is** — this drives the dropdown:

### Saree Collections
`saree-cotton` · `saree-linen` · `saree-jute` · `saree-banarasi` ·
`saree-semi-tussar` · `saree-calcutta-tussar` · `saree-baswada` ·
`saree-gulabi-dori` · `saree-raw-silk` · `saree-soft-silk` · `saree-art-silk` ·
`saree-dola-silk` · `saree-tissue` · `saree-synthetic`

### Salwar Material
`salwar-cotton` · `salwar-linen-cotton` · `salwar-organza` · `salwar-banarasi` ·
`salwar-silk` · `salwar-soft-silk` · `salwar-synthetic`

### Salwar Suit
`salwar-suit-2-piece` · `salwar-suit-3-piece`

### Kurti
`kurti-straight-cut` · `kurti-umbrella`

> **Saree and salwar tags are deliberately different.** Banarasi, Soft Silk, Organza,
> Cotton and Synthetic each appear under *both* Saree Collections and Salwar Material.
> A Banarasi saree is `saree-banarasi`; Banarasi salwar material is `salwar-banarasi`.
> Using the wrong one puts the product in the wrong menu.

## Optional: occasion

Add one of these to make the product show under **Occasions**:

`wedding` · `office-wear` · `festive`

## Nothing to do for Price Range

The five price bands (₹300–599, ₹600–999, ₹1,000–1,499, ₹1,500–1,999, ₹2,000 & above)
sort themselves by the product's price. Change the price and the product moves band on
its own.

## Nothing to tag for Offer Sale either

**Offer Sale fills itself from the compare-at price.** To put an item on offer, set its
**Compare-at price** higher than its price — the usual way to show a discount. The
product appears under Offer Sale automatically, in the right sub-section for its type.
Clear the compare-at price and it leaves. There is no "sale" tag to remember.

## Example

A cotton saree for weddings, on offer:

```
Tags:               saree, saree-cotton, wedding
Price:              ₹899
Compare-at price:   ₹1,299
```

It appears under: Saree Collections › Cotton · Occasions › Wedding ·
Price Range › ₹600–₹999 · Offer Sale › Sarees.

---

## For developers

The structure is defined in [`taxonomy.mjs`](taxonomy.mjs) — collections and menu in
one file so they cannot drift apart. After editing it:

```bash
export SHOPIFY_STORE=4qzxbq-rf          # canonical handle; chakravathy 401s
node scripts/build-collections.mjs --dry-run   # review
node scripts/build-collections.mjs             # create/update (idempotent)
node scripts/publish-collections.mjs           # REQUIRED - unpublished is invisible to Liquid
node scripts/build-gidmap.mjs /tmp             # after creation, so handles resolve
node scripts/build-menu.mjs   /tmp
node scripts/apply-menus.mjs  /tmp
```

`build-collections.mjs` updates existing collections in place when their rules or title
change, so the file stays the source of truth. Do **not** run `seed.mjs menu` or
`seed.mjs all`: `seed.mjs:177` uses the `menus(query:)` filter, which the Admin API
silently ignores, and can rename an unrelated menu.

The older saree-weave collections (Kanchipuram, Chanderi, Silk Cotton, Georgette,
Ikat, Gadwal, Tussar, Organza, Mysore Crepe) still exist and are still linked from the
homepage, but no longer appear in the main menu. They are defined in
[`catalog.mjs`](catalog.mjs), which this taxonomy does not touch.

The header's dropdown style is set to `text` in `sections/header-group.json`. Switch it
back to `collection_images` once collections have products or images — until then the
theme would render blank thumbnail slots.
