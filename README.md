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

## Upstream

The baseline was pulled from the store's own Horizon theme with `shopify theme pull`
(theme id `165493375224`), committed unmodified so later work diffs cleanly against
stock Horizon. Horizon is a Shopify-provided theme licensed for use on this store —
unlike Dawn it is not MIT open source, so don't redistribute it.
