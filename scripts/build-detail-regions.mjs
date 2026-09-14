// Builds the detail.regions metafield values behind the product-page detail
// explorer: close-up regions cropped from each product's own photo.
//
//   node scripts/dump-products.mjs        <outdir>
//   node scripts/build-detail-regions.mjs <outdir> [--only handle,handle]
//   node scripts/apply-product-specs.mjs  <outdir> v_detail
//
// Writes into <outdir>:
//   v_detail_N.json      metafieldsSet batches for apply-product-specs.mjs
//   contact-sheet.html   every photo with its regions outlined, plus the CDN crop
//                        each region will actually serve. Review this -- and have
//                        the client review it -- before applying.
//
// Every close-up is the real photo, cropped by Shopify's CDN. No image is
// generated or uploaded. Coordinates are percentages of the source photo, so
// they survive a re-upload at a different resolution -- but NOT a different
// photo. Replace a product's photo and its regions must be re-picked here.
//
// Rules for picking regions (see README "Detail explorer"):
//   - Saree fabric only. The blouse and jewellery in each photo are styling, not
//     the product; a region centred on them implies they are sold with it.
//   - A region's centre is where its hotspot marker sits, so it must land on
//     saree fabric, not the wall, floor or the model.
//   - Only label what is visibly there. A plain hem is not a "Border".
//   - Crops must be at least 400 source px wide, or the close-up is too soft.
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) {
  console.error('Usage: node scripts/build-detail-regions.mjs <outdir> [--only handle,handle]');
  process.exit(1);
}
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1]?.split(',').filter(Boolean)) : null;

// Region presets, in percent of the photo. w 35 x h 20 on a 1200x1600 photo is a
// 420x320 crop: just above the 400px floor, and short enough that pallu, body
// and hem sit in separate bands instead of overlapping.
const W = 35, H = 20;
const r = (id, label, x, y) => ({ id, label, x, y, w: W, h: H });
const pallu  = (x, y) => r('pallu',  'Pallu',  x, y);
const weave  = (x, y) => r('weave',  'Weave',  x, y);
const border = (x, y) => r('border', 'Border', x, y);

// Keyed by product handle. Picked by eye against a 10% grid over each photo, then
// checked against a crop sheet. Pallu regions start at 42-44%: the model's hands,
// rings and bangles sit at ~38-42%, and a crop starting higher leads with them.
const REGIONS = {
  'bronze-teal-border':     [pallu(30, 42), weave(33, 62), border(30, 79)],
  'chocolate-brown-pallu':  [pallu(45, 46), weave(30, 58)],
  'deep-brown-zari':        [weave(33, 45), pallu(40, 60)],
  'ivory-blue-border':      [pallu(32, 42), weave(33, 62), border(26, 79)],
  'ivory-violet-border':    [pallu(32, 42), weave(34, 62), border(28, 79)],
  'maroon-contrast-border': [weave(30, 43), pallu(47, 52)],
  'mauve-silver-zari':      [pallu(33, 42), weave(35, 60), border(30, 79)],
  'mustard-navy-border':    [pallu(33, 42), weave(36, 60), border(31, 79)],
  'orange-silk':            [weave(36, 48), r('motif', 'Motif', 33, 76)],
  'parrot-green-maroon':    [pallu(37, 42), weave(38, 62), border(34, 79)],
  'peach-gold-zari':        [pallu(33, 42), weave(36, 60), border(33, 79)],
  'powder-blue-striped':    [pallu(46, 50), weave(33, 58)],
  'purple-checked-silk':    [weave(33, 48), pallu(42, 62)],
  // Shot outdoors with the model lower in frame: her hands sit at ~42-45%.
  'red-blue-striped':       [pallu(45, 46), weave(50, 60), border(48, 78)],
  'rose-pink-green-border': [pallu(33, 44), weave(38, 62), border(33, 79)],
  'sky-blue-floral':        [pallu(36, 44), weave(40, 62), border(33, 79)],
  'teal-striped-printed':   [pallu(38, 46), weave(38, 72)],
  'turquoise-contrast':     [pallu(36, 42), weave(37, 60), border(33, 79)],
  'violet-gold-zari':       [pallu(30, 52), weave(40, 76)],
};

const MIN_CROP_PX = 400;
const RECOMMENDED_CROP_PX = 520;

const products = JSON.parse(readFileSync(`${OUT}/products.json`, 'utf8')).products.nodes;
const byHandle = new Map(products.map((p) => [p.handle, p]));

const errors = [];
const warnings = [];
const built = [];

for (const [handle, regions] of Object.entries(REGIONS)) {
  if (ONLY && !ONLY.has(handle)) continue;
  const fail = (msg) => errors.push(`${handle}: ${msg}`);

  const product = byHandle.get(handle);
  if (!product) { fail('no such product in products.json'); continue; }

  // Shopify renames duplicate uploads (saree-x-1_3f34f360-....jpg), so match the
  // -1 photo by prefix rather than exact filename.
  const images = (product.media?.nodes ?? []).filter((m) => m?.image);
  const stem = `saree-${handle}-1`;
  const source = images.find((m) => fileOf(m.image.url).startsWith(stem)) ?? images[0];
  if (!source) { fail('product has no images'); continue; }
  const { width: iw, height: ih } = source.image;

  if (regions.length < 1 || regions.length > 4) fail(`${regions.length} regions; allowed 1-4`);

  const ids = new Set();
  for (const g of regions) {
    const where = `region "${g.id}"`;
    if (!/^[a-z][a-z0-9-]{1,15}$/.test(g.id)) fail(`${where}: id must be lowercase, 2-16 chars`);
    if (ids.has(g.id)) fail(`${where}: duplicate id`);
    ids.add(g.id);
    if (!g.label || g.label.length > 14) fail(`${where}: label must be 1-14 chars`);
    if (g.x < 0 || g.y < 0 || g.w <= 0 || g.h <= 0) fail(`${where}: negative or empty box`);
    if (g.x + g.w > 100 || g.y + g.h > 100) fail(`${where}: box runs off the photo`);

    const cw = Math.round((iw * g.w) / 100);
    const ch = Math.round((ih * g.h) / 100);
    if (cw < MIN_CROP_PX) fail(`${where}: crop ${cw}px wide, minimum ${MIN_CROP_PX}px`);
    else if (cw < RECOMMENDED_CROP_PX) warnings.push(`${handle}: ${where} crop ${cw}px wide (soft below ${RECOMMENDED_CROP_PX}px)`);
    const aspect = cw / ch;
    if (aspect < 0.6 || aspect > 1.4) fail(`${where}: aspect ${aspect.toFixed(2)}, allowed 0.6-1.4`);
  }

  // Hotspot DOM order follows region order: top to bottom, then left to right.
  const ordered = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);

  built.push({
    product, source,
    value: { version: 1, source: fileOf(source.image.url), regions: ordered },
  });
}

if (ONLY) {
  for (const h of ONLY) if (!REGIONS[h]) errors.push(`${h}: --only names a handle with no regions defined`);
}

for (const w of warnings) console.warn(`  ! ${w}`);
if (errors.length) {
  console.error(`${errors.length} problem(s); nothing written:`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}

// Batches of 25, matching build-product-specs.mjs and metafieldsSet's limit.
const BATCH = 25;
let files = 0;
for (let i = 0; i < built.length; i += BATCH) {
  const metafields = built.slice(i, i + BATCH).map(({ product, value }) => ({
    ownerId: product.id,
    namespace: 'detail',
    key: 'regions',
    type: 'json',
    value: JSON.stringify(value),
  }));
  files++;
  writeFileSync(`${OUT}/v_detail_${files}.json`, JSON.stringify({ metafields }, null, 1));
}

writeFileSync(`${OUT}/contact-sheet.html`, contactSheet(built));

const regionCount = built.reduce((n, b) => n + b.value.regions.length, 0);
console.log(`${built.length} products, ${regionCount} regions -> ${files} batch file(s) in ${OUT}`);
console.log(`Review ${OUT}/contact-sheet.html, then:`);
console.log(`  node scripts/apply-product-specs.mjs ${OUT} v_detail`);

function fileOf(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').pop());
}

// The same URL shape Liquid's image_url filter produces, so the sheet shows the
// exact crop the storefront will serve.
function cropUrl(url, g, iw, ih, width) {
  const u = new URL(url);
  u.searchParams.set('crop', 'region');
  u.searchParams.set('crop_left', Math.round((iw * g.x) / 100));
  u.searchParams.set('crop_top', Math.round((ih * g.y) / 100));
  u.searchParams.set('crop_width', Math.round((iw * g.w) / 100));
  u.searchParams.set('crop_height', Math.round((ih * g.h) / 100));
  u.searchParams.set('width', width);
  return u.toString();
}

function contactSheet(items) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cards = items.map(({ product, source, value }) => {
    const { url, width: iw, height: ih } = source.image;
    const photo = new URL(url); photo.searchParams.set('width', '480');
    const boxes = value.regions.map((g) =>
      `<div class="box" style="left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%">` +
      `<span>${esc(g.label)}</span><i style="left:50%;top:50%"></i></div>`).join('');
    const crops = value.regions.map((g) =>
      `<figure><img src="${esc(cropUrl(url, g, iw, ih, 420))}" alt=""><figcaption>${esc(g.label)} ` +
      `<small>${Math.round((iw * g.w) / 100)}x${Math.round((ih * g.h) / 100)}px</small></figcaption></figure>`).join('');
    return `<section><h2>${esc(product.title)} <small>${esc(product.handle)}</small></h2>` +
      `<div class="row"><div class="photo"><img src="${esc(photo.toString())}" alt="">${boxes}</div>` +
      `<div class="crops">${crops}</div></div></section>`;
  }).join('\n');

  return `<!doctype html><meta charset="utf-8"><title>Detail explorer regions</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#fdfbf7;color:#221e1a}
  h1{font-weight:600} h2{font-size:16px;margin:32px 0 8px} small{color:#6b5a45;font-weight:400}
  .note{max-width:70ch}
  .row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  .photo{position:relative;width:300px;flex:none}
  .photo img{width:100%;display:block}
  .box{position:absolute;outline:2px dashed #fff;box-shadow:0 0 0 1px #000 inset}
  .box span{position:absolute;left:0;top:-1.4em;background:#221e1a;color:#fdfbf7;padding:0 4px;font-size:12px}
  .box i{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fdfbf7;box-shadow:0 0 0 2px #221e1a}
  .crops{display:flex;gap:12px;flex-wrap:wrap}
  figure{margin:0;width:210px} figure img{width:100%;display:block;background:#eee}
</style>
<h1>Detail explorer regions</h1>
<p class="note">Left: the product photo with each region outlined. The dot is where the hotspot marker
sits, so it must be on saree fabric. Right: the exact close-up the page will show, cropped from the
same photo by Shopify's CDN. Check each one shows only the saree, not the blouse or jewellery.</p>
${cards}`;
}
