// Builds the three navigation menus the footer columns render.
//
// Run this, then apply each emitted variable file with `menuCreate` (see
// README). Collection links are COLLECTION-type items carrying the collection's
// resourceId rather than HTTP links, matching build-menu.mjs — an HTTP link
// still works, but a resource link keeps following the collection if its handle
// is ever renamed in the admin.
//
// Every non-collection URL here was probed against the live storefront (behind
// the storefront password, which otherwise answers 200 for everything). Do not
// add a link without probing it first — a footer whose links 404 is worse than
// a short footer.
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp';
const gids = JSON.parse(readFileSync(`${OUT}/gidmap.json`, 'utf8'));

const col = (handle, title) => {
  const c = gids[handle];
  if (!c) throw new Error(`collection not found: ${handle}`);
  return { title: title ?? c.title, type: 'COLLECTION', resourceId: c.id };
};
const url = (title, u) => ({ title, type: 'HTTP', url: u });

const menus = {
  'footer-shop': {
    title: 'Footer — Shop',
    items: [
      url('All sarees', '/collections/all'),
      col('kanchipuram', 'Kanchipuram'),
      col('banarasi', 'Banarasi'),
      col('soft-silk', 'Soft silk'),
      col('wedding', 'Wedding sarees'),
      col('festive', 'Festive sarees'),
      url('New arrivals', '/collections/all?sort_by=created-descending'),
    ],
  },
  'footer-help': {
    title: 'Footer — Help',
    items: [
      // Track123 is an app the client installed; /apps/track123 is its proxy.
      url('Track your order', '/apps/track123'),
      url('Shipping', '/policies/shipping-policy'),
      url('Returns & refunds', '/policies/refund-policy'),
      url('Frequently asked questions', '/pages/faq'),
      url('Contact us', '/pages/contact'),
    ],
  },
  'footer-about': {
    title: 'Footer — The house',
    items: [
      url('Our story', '/pages/about'),
      url('Privacy policy', '/policies/privacy-policy'),
      url('Terms of service', '/policies/terms-of-service'),
      // Shopify generates this page and expects it to be reachable. It sat in
      // the unrendered `footer` menu, so until now nothing linked to it.
      url('Your privacy choices', '/pages/data-sharing-opt-out'),
    ],
  },
};

for (const [handle, { title, items }] of Object.entries(menus)) {
  writeFileSync(`${OUT}/menu_${handle}.json`,
    JSON.stringify({ title, handle, items }, null, 1));
  console.log(`${handle}: ${items.length} items`);
}
