// Creates or updates every collection in taxonomy.mjs.
//
//   node scripts/build-collections.mjs [--dry-run] [--only <handle>[,<handle>...]]
//
// Two differences from seed.mjs, both deliberate:
//
// 1. IT UPDATES. seed.mjs returns early when a handle already exists, so editing a
//    rule and re-running is a silent no-op and the only way to fix 40 collections is
//    by hand in the admin. This compares the live ruleSet and title against the
//    taxonomy and issues collectionUpdate when they differ, so the file stays the
//    source of truth.
//
// 2. IT BATCHES. Every gql() call spawns a `shopify` CLI subprocess with temp-file
//    I/O (shopify-api.mjs:41-63). One request per collection would be ~90 spawns and
//    several minutes; existing collections are read in one paginated query and writes
//    go out in batches of 10 using GraphQL aliases.
//
// collectionCreate does NOT publish. Run scripts/publish-collections.mjs afterwards
// or the collections are invisible to Liquid -- a collection card then renders
// Horizon's "Collection title" placeholder with no error anywhere.
import { gql } from './shopify-api.mjs';
import { collections } from './taxonomy.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? new Set((args[onlyArg + 1] ?? '').split(',').filter(Boolean)) : null;
const BATCH = 10;

// Rules come back from the API in an arbitrary order, so compare them as a sorted
// set. Conditions are strings on both sides; String() guards against a number
// slipping into the taxonomy.
const norm = (rules) =>
  JSON.stringify(
    [...rules]
      .map((r) => [r.column, r.relation, String(r.condition ?? '')])
      .sort((a, b) => a.join().localeCompare(b.join()))
  );

async function fetchExisting() {
  const byHandle = new Map();
  let after = null;
  for (;;) {
    const d = await gql(
      `query($after: String) {
         collections(first: 250, after: $after) {
           nodes { id handle title ruleSet { appliedDisjunctively rules { column relation condition } } }
           pageInfo { hasNextPage endCursor }
         }
       }`,
      { after }
    );
    for (const c of d.collections.nodes) byHandle.set(c.handle, c);
    if (!d.collections.pageInfo.hasNextPage) break;
    after = d.collections.pageInfo.endCursor;
  }
  return byHandle;
}

// One request per batch. Each alias is its own top-level key in the response, which
// is exactly what shopify-api.mjs:74-77 scans for userErrors -- so a failure in any
// entry throws with the offending field named.
async function run(kind, entries) {
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const decls = slice.map((_, n) => `$i${n}: CollectionInput!`).join(', ');
    const body = slice
      .map((_, n) => `c${n}: ${kind}(input: $i${n}) { collection { id handle } userErrors { field message } }`)
      .join('\n  ');
    const vars = Object.fromEntries(slice.map((e, n) => [`i${n}`, e.input]));
    await gql(`mutation(${decls}) {\n  ${body}\n}`, vars);
    for (const e of slice) console.log(`  ${e.mark} ${e.h}`);
  }
}

const wanted = collections().filter((c) => !ONLY || ONLY.has(c.h));
if (ONLY && wanted.length === 0) {
  console.error(`--only matched nothing. Known handles:\n  ${collections().map((c) => c.h).join('\n  ')}`);
  process.exit(1);
}

const existing = await fetchExisting();
const toCreate = [];
const toUpdate = [];
let same = 0;

for (const c of wanted) {
  const live = existing.get(c.h);
  const ruleSet = { appliedDisjunctively: false, rules: c.rules };
  if (!live) {
    toCreate.push({ h: c.h, mark: '+', input: { handle: c.h, title: c.title, ruleSet } });
    continue;
  }
  // A manual collection has no ruleSet and cannot be given one; flag rather than
  // fail the whole batch.
  if (!live.ruleSet) {
    console.log(`  ! ${c.h} exists as a MANUAL collection -- skipped, convert it in the admin`);
    continue;
  }
  const rulesDiffer = norm(live.ruleSet.rules) !== norm(c.rules) || live.ruleSet.appliedDisjunctively;
  const titleDiffers = live.title !== c.title;
  if (rulesDiffer || titleDiffers) {
    toUpdate.push({ h: c.h, mark: '~', input: { id: live.id, title: c.title, ruleSet } });
  } else {
    same++;
  }
}

console.log(
  `${wanted.length} collections in taxonomy: ${toCreate.length} to create, ` +
    `${toUpdate.length} to update, ${same} already correct.`
);

if (DRY) {
  for (const e of [...toCreate, ...toUpdate]) console.log(`  ${e.mark} ${e.h}`);
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

if (toCreate.length) { console.log('Creating:'); await run('collectionCreate', toCreate); }
if (toUpdate.length) { console.log('Updating:'); await run('collectionUpdate', toUpdate); }

if (toCreate.length || toUpdate.length) {
  console.log('\nNow run: node scripts/publish-collections.mjs');
} else {
  console.log('\nNothing to do.');
}
