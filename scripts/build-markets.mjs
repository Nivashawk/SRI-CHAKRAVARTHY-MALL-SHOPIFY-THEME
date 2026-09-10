// Emits marketCreate / marketUpdate variable files for the store's markets.
//
// Why this exists: the storefront currency switcher is already built into the
// theme -- snippets/localization-form.liquid reveals currency labels as soon as
// localization.available_countries spans more than one currency. Nothing showed
// because the store offered only Canada and the United States, both resolving
// to INR, and India -- the home market -- was not a country at all.
//
// Existing markets are UPDATED, never deleted. marketDelete would discard the
// delivery and catalog configuration hanging off a market, which is tedious to
// rebuild by hand. US and Canada are also left as separate markets rather than
// merged: a country belongs to exactly one market, so merging would mean moving
// CA between markets mid-flight, and separate markets are what you want anyway
// once shipping rates differ between the two.
//
// localCurrencies is the flag that makes a visitor see their own currency, and
// Shopify only honours it once Shopify Payments is activated. Expect a
// userError on that field until then -- the regions still apply, which is the
// half that works today.
//
// Two phases, because Shopify rejects currencySettings outright until Shopify
// Payments is activated -- literally "The shop's payment gateway does not
// support enabling more than one currency."
//
//   node scripts/build-markets.mjs <outdir> <markets.json>
//       regions only. Safe today. Creates/updates the markets themselves.
//
//   node scripts/build-markets.mjs <outdir> <markets.json> --currency
//       currency settings only, for AFTER Shopify Payments is switched on.
//       Re-dump markets.json first so the new markets have ids.
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp';
const EXISTING = process.argv[3];
const CURRENCY_PHASE = process.argv.includes('--currency');

const MARKETS = [
  // India's local currency IS the shop currency, so conversion is a no-op.
  { handle: 'india', name: 'India', countries: ['IN'], localCurrencies: false },
  { handle: 'us', name: 'United States', countries: ['US'], localCurrencies: true },
  { handle: 'canada', name: 'Canada', countries: ['CA'], localCurrencies: true },
  {
    handle: 'uk-europe-australia',
    name: 'UK, Europe & Australia',
    countries: [
      'GB', 'IE', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT',
      'PT', 'SE', 'DK', 'FI', 'PL', 'GR', 'CZ', 'AU',
    ],
    localCurrencies: true,
  },
  {
    handle: 'singapore-malaysia-uae',
    name: 'Singapore, Malaysia & UAE',
    countries: ['SG', 'MY', 'AE'],
    localCurrencies: true,
  },
];

const regions = (countries) => ({
  regionsCondition: { regions: countries.map((c) => ({ countryCode: c })) },
});

// handle -> { id, countries } for what already exists, so a re-run updates in
// place instead of failing on a duplicate handle.
const existing = new Map();
if (EXISTING) {
  for (const m of JSON.parse(readFileSync(EXISTING, 'utf8')).markets.nodes) {
    const nodes = m.conditions?.regionsCondition?.regions?.nodes ?? [];
    existing.set(m.handle, {
      id: m.id, name: m.name,
      countries: nodes.map((n) => n.code).filter(Boolean),
    });
  }
}

// A store's home market is created by Shopify under its own handle -- an Indian
// store gets "in", not "india" -- so matching on handle alone tries to create a
// SECOND India market and fails with "Name has already been taken". Index the
// existing markets by their country set as well, and treat an exact country
// match as the same market. Nothing outside this script references a market
// handle, so keeping Shopify's is harmless.
const key = (cs) => cs.slice().sort().join(',');
const byCountry = new Map();
for (const [handle, v] of existing) byCountry.set(key(v.countries), { handle, ...v });

const plan = [];

for (const m of MARKETS) {
  const cur = existing.get(m.handle) ?? byCountry.get(key(m.countries));
  const currencySettings = { localCurrencies: m.localCurrencies };

  if (CURRENCY_PHASE) {
    // Phase two: nothing but the currency flag, on markets that already exist.
    if (!cur) {
      console.error(`market ${m.handle} does not exist yet -- run phase one first`);
      process.exit(1);
    }
    writeFileSync(`${OUT}/mkt_currency_${m.handle}.json`,
      JSON.stringify({ id: cur.id, input: { currencySettings } }, null, 1));
    plan.push(`currency ${m.handle} (localCurrencies=${m.localCurrencies})`);
    continue;
  }

  if (!cur) {
    writeFileSync(`${OUT}/mkt_create_${m.handle}.json`, JSON.stringify({
      input: {
        name: m.name, handle: m.handle, status: 'ACTIVE',
        conditions: regions(m.countries),
      },
    }, null, 1));
    plan.push(`create ${m.handle} (${m.countries.length} countries)`);
    continue;
  }

  // Only add countries that are not already on the market -- re-adding one is
  // a userError, and this keeps a re-run idempotent.
  const toAdd = m.countries.filter((c) => !cur.countries.includes(c));
  if (!toAdd.length && cur.name === m.name) {
    plan.push(`skip   ${m.handle} (already correct)`);
    continue;
  }
  const input = { name: m.name, status: 'ACTIVE' };
  if (toAdd.length) input.conditions = { conditionsToAdd: regions(toAdd) };

  writeFileSync(`${OUT}/mkt_update_${m.handle}.json`,
    JSON.stringify({ id: cur.id, input }, null, 1));
  plan.push(`update ${m.handle} (+${toAdd.length} countries)`);
}

const total = MARKETS.reduce((n, m) => n + m.countries.length, 0);
console.log(plan.map((l) => '  ' + l).join('\n'));
console.log(`${MARKETS.length} markets, ${total} countries total`);
