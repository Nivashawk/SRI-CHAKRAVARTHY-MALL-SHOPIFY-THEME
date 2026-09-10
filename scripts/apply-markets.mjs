// Applies the market variable files emitted by build-markets.mjs.
//
//   node scripts/dump-markets.mjs  /tmp
//   node scripts/build-markets.mjs /tmp /tmp/markets.json
//   node scripts/apply-markets.mjs /tmp
//
// Handles all three file kinds build-markets emits: mkt_create_*, mkt_update_*
// and mkt_currency_* (phase two, which needs Shopify Payments active first --
// see README).
import { readFileSync, readdirSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

const files = readdirSync(OUT).filter((f) => /^mkt_(create|update|currency)_.*\.json$/.test(f));
if (!files.length) {
  console.error(`No market files in ${OUT}. Run build-markets.mjs first.`);
  process.exit(1);
}

for (const f of files.sort()) {
  const v = JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8'));
  const handle = f.replace(/^mkt_(create|update|currency)_/, '').replace(/\.json$/, '');

  if (f.startsWith('mkt_create_')) {
    const d = await gql(`
      mutation($input: MarketCreateInput!) {
        marketCreate(input: $input) { market { id handle } userErrors { field message } }
      }`, v);
    console.log(`  + ${d.marketCreate.market.handle} created`);
  } else {
    const d = await gql(`
      mutation($id: ID!, $input: MarketUpdateInput!) {
        marketUpdate(id: $id, input: $input) { market { id handle } userErrors { field message } }
      }`, v);
    const verb = f.startsWith('mkt_currency_') ? 'currency set' : 'updated';
    console.log(`  ~ ${d.marketUpdate.market.handle} ${verb}`);
  }
}
console.log(`${files.length} market operations applied`);
