// Applies the metafieldsSet batches emitted by build-product-specs.mjs.
//
//   node scripts/dump-products.mjs      /tmp
//   node scripts/build-product-specs.mjs /tmp
//   node scripts/apply-product-specs.mjs /tmp
//
// metafieldsSet is an upsert keyed on owner + namespace + key, so re-running is
// safe and simply rewrites the same values.
import { readFileSync, readdirSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

const files = readdirSync(OUT).filter((f) => /^v_specs_\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
if (!files.length) {
  console.error(`No v_specs_*.json in ${OUT}. Run build-product-specs.mjs first.`);
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const vars = JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8'));
  const d = await gql(`
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key }
        userErrors { field message }
      }
    }`, vars);
  const n = d.metafieldsSet.metafields.length;
  total += n;
  console.log(`  ${f}: ${n} metafields set`);
}
console.log(`${total} metafields across ${files.length} batches`);
