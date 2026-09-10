// Emits the collection handle -> {id, title} map that build-menu.mjs and
// build-footer-menus.mjs both read.
//
//   node scripts/build-gidmap.mjs [outdir]
//
// Nothing in this repo produced this file before: it was built by hand against
// the original store, which quietly made both menu scripts unrunnable anywhere
// else. Menu items reference collections by resourceId rather than by URL, so
// the ids have to be resolved per store.
import { writeFileSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

const map = {};
let cursor = null;
for (;;) {
  const d = await gql(`
    query($after: String) {
      collections(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id handle title }
      }
    }`, { after: cursor });
  for (const n of d.collections.nodes) map[n.handle] = { id: n.id, title: n.title };
  if (!d.collections.pageInfo.hasNextPage) break;
  cursor = d.collections.pageInfo.endCursor;
}

writeFileSync(`${OUT}/gidmap.json`, JSON.stringify(map, null, 1));
console.log(`${Object.keys(map).length} collections -> ${OUT}/gidmap.json`);
