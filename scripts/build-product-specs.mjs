// Emits metafieldsSet variable files for the product spec table (specs.*).
//
// Only fields that can be traced to something the store already asserts are
// filled in:
//   colour   - hand-read from each product title, not regex-guessed, because it
//              is customer-facing and the titles vary in shape
//   weave    - the product's weave tag, which is what the storefront already
//              sorts and filters by
//   occasion - the product's occasion tag, same reasoning
//   blouse   - every description says an unstitched blouse piece is included,
//              and the homepage FAQ states it as policy
//
// Deliberately left blank for the client: `length`, `zari` and `weight`. Nobody
// has supplied those, and the homepage FAQ promises zari is described honestly
// per product -- inventing "pure zari" would turn that promise into a lie. The
// spec block skips empty fields, so blanks simply do not render.
//
// Usage: node scripts/build-product-specs.mjs <outdir>
//   reads  <outdir>/products.json   (from the products query)
//   writes <outdir>/v_specs_N.json  (batches of 25 for metafieldsSet)
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp';
const products = JSON.parse(readFileSync(`${OUT}/products.json`, 'utf8')).products.nodes;

const COLOUR = {
  'rose-pink-green-border': 'Rose pink with green border',
  'violet-gold-zari': 'Violet with gold zari border',
  'chocolate-brown-pallu': 'Chocolate brown with woven pallu',
  'deep-brown-zari': 'Deep brown with zari border',
  'sky-blue-floral': 'Sky blue with floral border',
  'maroon-contrast-border': 'Maroon with contrast border',
  'red-blue-striped': 'Red and blue stripes',
  'bronze-teal-border': 'Bronze with teal border',
  'mustard-navy-border': 'Mustard with navy border',
  'orange-silk': 'Orange',
  'mauve-silver-zari': 'Mauve with silver zari',
  'powder-blue-striped': 'Powder blue stripes',
  'teal-striped-printed': 'Teal stripes with printed pallu',
  'turquoise-contrast': 'Turquoise with contrast border',
  'ivory-violet-border': 'Ivory with violet border',
  'ivory-blue-border': 'Ivory with blue border',
  'purple-checked-silk': 'Deep purple checks',
  'peach-gold-zari': 'Peach with gold zari border',
  'parrot-green-maroon': 'Parrot green with maroon border',
};

const WEAVE = {
  kanchipuram: 'Kanchipuram silk', banarasi: 'Banarasi silk',
  'soft-silk': 'Soft silk', chanderi: 'Chanderi', tussar: 'Tussar silk',
  organza: 'Organza', ikat: 'Ikat', gadwal: 'Gadwal',
  'silk-cotton': 'Silk cotton', georgette: 'Georgette',
};
const OCCASION = { wedding: 'Wedding', festive: 'Festive', everyday: 'Everyday' };
const BLOUSE = 'Unstitched blouse piece included';

const metafields = [];
const missing = [];

for (const p of products) {
  const colour = COLOUR[p.handle];
  const weave = WEAVE[p.tags.find((t) => WEAVE[t])];
  const occasion = OCCASION[p.tags.find((t) => OCCASION[t])];
  if (!colour || !weave || !occasion) {
    missing.push(`${p.handle} (colour=${!!colour} weave=${!!weave} occasion=${!!occasion})`);
    continue;
  }
  for (const [key, value] of [['colour', colour], ['weave', weave],
                              ['occasion', occasion], ['blouse', BLOUSE]]) {
    metafields.push({
      ownerId: p.id, namespace: 'specs', key,
      type: 'single_line_text_field', value,
    });
  }
}

if (missing.length) {
  // Fail loudly: a silently skipped product ships a half-empty spec table.
  console.error('Could not derive specs for:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const BATCH = 25;
let n = 0;
for (let i = 0; i < metafields.length; i += BATCH) {
  writeFileSync(`${OUT}/v_specs_${n}.json`,
    JSON.stringify({ metafields: metafields.slice(i, i + BATCH) }, null, 1));
  n++;
}
console.log(`${products.length} products -> ${metafields.length} metafields in ${n} batches`);
