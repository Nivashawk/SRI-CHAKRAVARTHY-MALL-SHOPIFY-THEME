// Thin Admin GraphQL client. Token comes from the environment and is never
// written to disk or logged.
const SHOP = process.env.SHOPIFY_STORE || 'sri-chakravarty-mall';
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

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
