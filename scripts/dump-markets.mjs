// Dumps the store's current markets in the shape build-markets.mjs expects as
// its <markets.json> argument.
//
//   node scripts/dump-markets.mjs [outdir]
//
// build-markets.mjs reads this to decide create-vs-update per handle, which is
// what keeps it idempotent. Nothing produced the file before; it was dumped by
// hand, so the markets step could not be run on a fresh store.
import { writeFileSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

// MarketRegion became an INTERFACE in API 2026-07, exposing only id and name;
// the country code moved onto the MarketRegionCountry implementation, so it needs
// an inline fragment. build-markets.mjs reads n.code off each region node, so the
// selection below has to keep producing that shape.
const d = await gql(`
  query {
    markets(first: 50) {
      nodes {
        id handle name
        conditions {
          regionsCondition {
            regions(first: 250) { nodes { id ... on MarketRegionCountry { code } } }
          }
        }
      }
    }
  }`);

writeFileSync(`${OUT}/markets.json`, JSON.stringify(d, null, 1));
console.log(`${d.markets.nodes.length} markets -> ${OUT}/markets.json`);
for (const m of d.markets.nodes) {
  const n = m.conditions?.regionsCondition?.regions?.nodes?.length ?? 0;
  console.log(`  ${m.handle} (${n} countries)`);
}
