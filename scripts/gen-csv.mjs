// Builds a Shopify product-import CSV for the mock sarees.
// Images are referenced from the theme's own CDN path, which is public even on a
// password-protected store. Shopify copies them into product media at import
// time, so the theme URL only has to resolve during the import itself.
import { writeFileSync } from 'node:fs';
import { PRODUCTS, WEAVES } from './catalog.mjs';

const CDN = 'https://sri-chakravarty-mall.myshopify.com/cdn/shop/t/4/assets/';

const COLS = ['Handle','Title','Body (HTML)','Vendor','Type','Tags','Published',
  'Option1 Name','Option1 Value','Variant SKU','Variant Inventory Policy',
  'Variant Fulfillment Service','Variant Price','Variant Requires Shipping',
  'Variant Taxable','Image Src','Image Position','Image Alt Text','Status'];

const esc = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [COLS];
for (const p of PRODUCTS) {
  const body = `<p>A ${WEAVES[p.weave].toLowerCase()} saree, handwoven with a contrast zari ` +
    `border and pallu. Comes with an unstitched blouse piece.</p>` +
    `<p><em>Placeholder copy and imagery for layout review.</em></p>`;
  // First row carries the product; subsequent rows attach extra images by handle.
  rows.push([p.h, p.t, body, 'Sri Chakravarthy', 'Saree',
    `saree, ${p.weave}, ${p.occasion}`, 'TRUE',
    'Title', 'Default Title', p.h.toUpperCase(), 'continue',
    'manual', p.price, 'TRUE', 'TRUE',
    `${CDN}${p.h}-1.jpg`, 1, p.t, 'active']);
  rows.push([p.h, '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    `${CDN}${p.h}-2.jpg`, 2, `${p.t} — border detail`, '']);
}

const csv = rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
writeFileSync(new URL('./sarees-import.csv', import.meta.url).pathname, csv);
console.log(`wrote scripts/sarees-import.csv — ${PRODUCTS.length} products, ${rows.length - 1} rows`);
