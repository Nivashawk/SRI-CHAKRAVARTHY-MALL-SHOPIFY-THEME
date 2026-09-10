// Creates the footer's two content pages and fills the two shop policies from
// `scripts/footer-content/*.html`. Like menus and metafield definitions, none
// of this travels with `theme push` -- on a fresh store the footer links 404
// until this has run.
//
//   node scripts/build-pages.mjs
//
// Idempotent: an existing page is left alone rather than overwritten, so a
// re-run never clobbers copy the client has since edited in Admin. Policies are
// the exception -- they have no create/skip, only update -- so they are written
// only when currently empty.
import { readFileSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const html = (f) => readFileSync(new URL(`./footer-content/${f}`, import.meta.url), 'utf8').trim();

// Handles are load-bearing: scripts/build-footer-menus.mjs links to
// /pages/about, /pages/faq and /pages/contact by exactly these strings.
const PAGES = [
  { handle: 'about', title: 'Our story', body: html('about.html') },
  { handle: 'faq',   title: 'Frequently asked questions', body: html('faq.html') },
  // Contact has no source HTML -- the form comes from templates/page.contact.json,
  // so the body is just the line above it. templateSuffix must stay 'contact'
  // or the page renders without the form.
  {
    handle: 'contact', title: 'Contact us', templateSuffix: 'contact',
    body: '<p>Questions about a saree, an order, or a delivery? Send us a message '
        + 'and we will reply within one working day.</p>',
  },
];

// Shipping and returns are shop policies rather than pages, so checkout links to
// them too. README: change these and the homepage faq/promise sections together.
const POLICIES = [
  { type: 'SHIPPING_POLICY', file: 'shipping-policy.html' },
  { type: 'REFUND_POLICY',   file: 'refund-policy.html' },
];

/* ------------------------------------------------------------------ pages */

for (const p of PAGES) {
  const found = await gql(`query($q:String!){ pages(first:1, query:$q){ nodes{ id handle } } }`,
    { q: `handle:${p.handle}` });
  if (found.pages.nodes[0]) { console.log(`  = /pages/${p.handle} (exists)`); continue; }

  await gql(`
    mutation($page: PageCreateInput!) {
      pageCreate(page: $page) { page { id handle } userErrors { field message } }
    }`, {
    page: {
      handle: p.handle, title: p.title, body: p.body,
      ...(p.templateSuffix ? { templateSuffix: p.templateSuffix } : {}),
      isPublished: true,
    },
  });
  console.log(`  + /pages/${p.handle}`);
}

/* --------------------------------------------------------------- policies */

// shopPolicies returns ONLY policies that already exist -- a fresh store has
// just PRIVACY_POLICY -- so there is no id to look up for shipping or refund.
// ShopPolicyInput takes { type, body } and upserts by type, which is what makes
// creating them possible at all. There is no shopPolicyCreate.
const shop = await gql(`query { shop { shopPolicies { type body } } }`);
const current = new Map(shop.shop.shopPolicies.map((s) => [s.type, s.body]));

for (const { type, file } of POLICIES) {
  // Only write into a policy that is absent or empty. Blindly updating would
  // overwrite whatever the client has since written themselves.
  const body = current.get(type);
  if (body && body.trim()) {
    console.log(`  = ${type} (already has content, left alone)`);
    continue;
  }
  await gql(`
    mutation($shopPolicy: ShopPolicyInput!) {
      shopPolicyUpdate(shopPolicy: $shopPolicy) {
        shopPolicy { type } userErrors { field message }
      }
    }`, { shopPolicy: { type, body: html(file) } });
  console.log(`  + ${type}`);
}

console.log('\nStill manual: privacy-policy and terms-of-service (Shopify can generate');
console.log('templates for both), and /apps/track123 needs the Track123 app installed.');
