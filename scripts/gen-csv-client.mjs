// Product-import CSV built from the client's own photography.
// Images are served from the theme's public CDN path; Shopify copies them into
// product media during import, so the theme URL only has to resolve then.
import { writeFileSync } from 'node:fs';
import { CLIENT_PRODUCTS } from './client-catalog.mjs';
import { WEAVES } from './catalog.mjs';

// The shop SERVING these images, which during a migration is the OLD store the
// assets still sit on -- not SHOPIFY_STORE, which is the import target. Shopify
// copies them into product media at import, so this only has to resolve for the
// duration of the import. SHOPIFY_ASSET_THEME is the theme sequence in the CDN
// path (/t/<n>/assets/), which changes per theme, not per store.
const ASSET_SHOP = process.env.SHOPIFY_ASSET_STORE || process.env.SHOPIFY_STORE;
const ASSET_THEME = process.env.SHOPIFY_ASSET_THEME || '4';
if (!ASSET_SHOP) {
  console.error('Set SHOPIFY_ASSET_STORE (or SHOPIFY_STORE) to the shop serving\n' +
    'the images, and SHOPIFY_ASSET_THEME to its theme sequence number.');
  process.exit(1);
}
const CDN = `https://${ASSET_SHOP}.myshopify.com/cdn/shop/t/${ASSET_THEME}/assets/`;

const COLS = ['Handle','Title','Body (HTML)','Vendor','Type','Tags','Published',
  'Option1 Name','Option1 Value','Variant SKU','Variant Inventory Policy',
  'Variant Fulfillment Service','Variant Price','Variant Requires Shipping',
  'Variant Taxable','Image Src','Image Position','Image Alt Text','Status'];

const esc = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [COLS];
for (const p of CLIENT_PRODUCTS) {
  const body = `<p>${p.t}. Handwoven ${WEAVES[p.weave].toLowerCase()} with a contrast ` +
    `border and pallu, finished with an unstitched blouse piece.</p>` +
    `<p><em>Description, weave and price are placeholders pending the client's own copy.</em></p>`;
  p.img.forEach((_, i) => {
    const first = i === 0;
    rows.push([
      p.h,
      first ? p.t : '',
      first ? body : '',
      first ? 'Sri Chakravarthy' : '',
      first ? 'Saree' : '',
      first ? `saree, ${p.weave}, ${p.occasion}` : '',
      first ? 'TRUE' : '',
      first ? 'Title' : '', first ? 'Default Title' : '',
      first ? p.h.toUpperCase().replace(/-/g, '') : '',
      first ? 'continue' : '', first ? 'manual' : '',
      first ? p.price : '',
      first ? 'TRUE' : '', first ? 'TRUE' : '',
      `${CDN}saree-${p.h}-${i + 1}.jpg`,
      i + 1,
      i === 0 ? p.t : `${p.t} — alternate view`,
      first ? 'active' : '',
    ]);
  });
}

const csv = rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
writeFileSync(new URL('./sarees-client-import.csv', import.meta.url).pathname, csv);
console.log(`wrote scripts/sarees-client-import.csv — ${CLIENT_PRODUCTS.length} products, ${rows.length - 1} rows`);
