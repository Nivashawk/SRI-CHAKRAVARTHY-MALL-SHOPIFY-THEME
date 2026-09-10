// Dumps the store's products in the shape build-product-specs.mjs expects as its
// <outdir>/products.json input: id, handle and tags per product.
//
//   node scripts/dump-products.mjs [outdir]
//
// Nothing produced this file before, so the spec-table step could not be run on
// a fresh store. build-product-specs.mjs keys colour off the handle and reads
// weave/occasion off the tags, so all three fields are load-bearing.
import { writeFileSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

const nodes = [];
let cursor = null;
for (;;) {
  const d = await gql(`
    query($after: String) {
      products(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id handle tags }
      }
    }`, { after: cursor });
  nodes.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

writeFileSync(`${OUT}/products.json`, JSON.stringify({ products: { nodes } }, null, 1));
console.log(`${nodes.length} products -> ${OUT}/products.json`);
