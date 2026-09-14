// Applies metafieldsSet batches emitted by a build script.
//
//   node scripts/dump-products.mjs       /tmp
//   node scripts/build-product-specs.mjs  /tmp
//   node scripts/apply-product-specs.mjs  /tmp              # v_specs_*.json
//
//   node scripts/build-detail-regions.mjs /tmp
//   node scripts/apply-product-specs.mjs  /tmp v_detail     # v_detail_*.json
//
// The optional second argument picks which batch files to apply, so every build
// script shares this one apply step rather than each growing a copy of it.
//
// metafieldsSet is an upsert keyed on owner + namespace + key, so re-running is
// safe and simply rewrites the same values.
import { readFileSync, readdirSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';
const PREFIX = process.argv[3] ?? 'v_specs';
if (!/^[a-z_]+$/.test(PREFIX)) {
  console.error(`Batch prefix must be lowercase letters and underscores, got "${PREFIX}".`);
  process.exit(1);
}

const pattern = new RegExp(`^${PREFIX}_(\\d+)\\.json$`);
const files = readdirSync(OUT).filter((f) => pattern.test(f))
  .sort((a, b) => Number(a.match(pattern)[1]) - Number(b.match(pattern)[1]));
if (!files.length) {
  console.error(`No ${PREFIX}_*.json in ${OUT}. Run the matching build script first.`);
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
