// Thin Admin GraphQL client. Token comes from the environment and is never
// written to disk or logged.
const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// Deliberately no default. This used to fall back to the original development
// store, so an unset variable pointed every script at the wrong shop and did it
// silently -- the worst possible failure once that shop is someone else's, or
// deleted.
if (!SHOP) {
  console.error('SHOPIFY_STORE is not set.\n' +
    'Set it to the store handle, the part before .myshopify.com:\n' +
    '  export SHOPIFY_STORE=my-store');
  process.exit(1);
}

if (!TOKEN) {
  console.error('SHOPIFY_ADMIN_TOKEN is not set.\n' +
    'Create one in Admin > Settings > Apps and sales channels > Develop apps,\n' +
    'with scopes: write_products, write_online_store_navigation, write_files.\n' +
    'Then:  export SHOPIFY_ADMIN_TOKEN=shpat_...');
  process.exit(1);
}

// Shopify retires API versions after ~12 months, so resolve the newest stable
// one at runtime rather than pinning a version that will silently 404 later.
let cachedVersion;
export async function apiVersion() {
  if (cachedVersion) return cachedVersion;
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/api_versions.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  });
  if (!res.ok) throw new Error(`api_versions failed: ${res.status} ${await res.text()}`);
  const { api_versions } = await res.json();
  const stable = api_versions.filter(v => v.supported && /^\d{4}-\d{2}$/.test(v.handle));
  cachedVersion = stable.map(v => v.handle).sort().pop();
  return cachedVersion;
}

export async function gql(query, variables = {}) {
  const v = await apiVersion();
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/${v}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error('GraphQL: ' + JSON.stringify(body.errors, null, 2));
  // Every mutation returns its own userErrors; surface them rather than
  // reporting success on a call that quietly did nothing.
  for (const key of Object.keys(body.data ?? {})) {
    const ue = body.data[key]?.userErrors;
    if (ue?.length) throw new Error(`${key} userErrors: ` + JSON.stringify(ue, null, 2));
  }
  return body.data;
}

export { SHOP };
