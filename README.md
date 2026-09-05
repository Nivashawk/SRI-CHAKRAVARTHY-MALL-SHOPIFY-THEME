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

## Rules for new sections

A section is only drag-and-droppable if its `{% schema %}` includes a `presets`
array — that's what puts it in the editor's "Add section" list. Beyond that:

- Every piece of content is a `setting`; nothing is hardcoded in the markup.
- Repeating items (slides, cards, testimonials) are `blocks`, so they can be
  added and reordered by dragging.
- Keep templates as `.json`, never `.liquid`, or the page stops being editable.
- Put section CSS in `assets/section-<name>.css` and load it from that section.

## Upstream

The baseline was pulled from the store's own Horizon theme with `shopify theme pull`
(theme id `165493375224`), committed unmodified so later work diffs cleanly against
stock Horizon. Horizon is a Shopify-provided theme licensed for use on this store —
unlike Dawn it is not MIT open source, so don't redistribute it.
