// Dumps the store's products as <outdir>/products.json, the input for the build
// scripts: id, handle and tags per product, plus each product's images.
//
//   node scripts/dump-products.mjs [outdir]
//
// build-product-specs.mjs keys colour off the handle and reads weave/occasion off
// the tags. build-detail-regions.mjs needs each image's URL and pixel size, to
// match a region's source filename and convert percentages to crop pixels.
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
        nodes {
          id handle title tags
          media(first: 10) {
            nodes { ... on MediaImage { id alt image { url width height } } }
          }
        }
      }
    }`, { after: cursor });
  nodes.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

writeFileSync(`${OUT}/products.json`, JSON.stringify({ products: { nodes } }, null, 1));
console.log(`${nodes.length} products -> ${OUT}/products.json`);
