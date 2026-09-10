// Thin Admin GraphQL client, routed through the Shopify CLI's stored session.
//
// There is deliberately no Admin API access token here any more. Shopify removed
// legacy custom apps from the store admin -- Settings > Apps > "Develop apps" now
// offers only the Dev Dashboard, which issues OAuth credentials (an API key and a
// shpss_ secret) rather than a shpat_ token. So the token this file used to read
// from the environment cannot be obtained for this store at all.
//
// `shopify store auth` is the replacement. Authenticate once:
//
//   shopify store auth --store <shop>.myshopify.com \
//     --scopes write_products,write_content,write_online_store_navigation,\
// write_files,write_markets,write_publications,read_themes
//
// It stores an ONLINE access token, which expires after roughly a day. If calls
// start failing with an auth error, re-run that command -- nothing here needs
// changing.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOP = process.env.SHOPIFY_STORE;

// Deliberately no default. This used to fall back to the original development
// store, so an unset variable pointed every script at the wrong shop and did it
// silently -- the worst possible failure once that shop is someone else's, or
// deleted.
if (!SHOP) {
  console.error('SHOPIFY_STORE is not set.\n' +
    'Set it to the store handle, the part before .myshopify.com:\n' +
    '  export SHOPIFY_STORE=my-store\n\n' +
    'Use the CANONICAL handle, not the storefront domain. They differ, and the\n' +
    'wrong one returns 401 "Invalid API key or access token" -- indistinguishable\n' +
    'from a bad credential. See the header of shopify.theme.toml.');
  process.exit(1);
}

const DOMAIN = SHOP.includes('.') ? SHOP : `${SHOP}.myshopify.com`;

export async function gql(query, variables = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shopify-gql-'));
  try {
    const qFile = join(dir, 'query.graphql');
    const vFile = join(dir, 'variables.json');
    const oFile = join(dir, 'out.json');
    writeFileSync(qFile, query);
    writeFileSync(vFile, JSON.stringify(variables));

    const args = ['store', 'execute', '-s', DOMAIN,
      '--query-file', qFile, '--variable-file', vFile,
      '--json', '--output-file', oFile];

    // Only mutations get --allow-mutations, so a query can never quietly write.
    if (/^\s*mutation\b/.test(query)) args.push('--allow-mutations');

    try {
      execFileSync('shopify', args,
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error('shopify store execute failed:\n' +
        (e.stderr || e.stdout || e.message));
    }

    // --output-file gets the response body on its own, rather than making us pick
    // JSON out of progress spinners and ANSI escapes on stdout.
    const body = JSON.parse(readFileSync(oFile, 'utf8'));
    const data = body.data ?? body;

    if (body.errors) throw new Error('GraphQL: ' + JSON.stringify(body.errors, null, 2));

    // Every mutation returns its own userErrors; surface them rather than
    // reporting success on a call that quietly did nothing.
    for (const key of Object.keys(data ?? {})) {
      const ue = data[key]?.userErrors;
      if (ue?.length) throw new Error(`${key} userErrors: ` + JSON.stringify(ue, null, 2));
    }
    return data;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Shopify retires API versions after ~12 months. The CLI picks a version itself,
// so this is now only used for reporting.
let cachedVersion;
export async function apiVersion() {
  if (cachedVersion) return cachedVersion;
  const d = await gql(`query { publicApiVersions { handle supported } }`);
  const stable = d.publicApiVersions
    .filter((v) => v.supported && /^\d{4}-\d{2}$/.test(v.handle));
  cachedVersion = stable.map((v) => v.handle).sort().pop();
  return cachedVersion;
}

export { SHOP, DOMAIN };
